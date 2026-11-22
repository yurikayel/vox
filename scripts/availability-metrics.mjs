#!/usr/bin/env node
/**
 * @file PM-75 — Calculadora offline de métricas de disponibilidade de posts (1h / 6h / 24h).
 * Processa logs locais de inventário/sondas P2P (zero telemetria central) para medir a
 * porcentagem de posts ainda acessíveis após o autor ficar offline por 1h, 6h e 24h.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Versão canônica do esquema de saída do relatório PM-75. */
export const SCHEMA_VERSION = "1.0.0";

/** Janelas padrão em horas alinhadas ao marco M2 do NLnet e à spec de replicação. */
export const DEFAULT_WINDOWS_HOURS = [1, 6, 24];

const MS_PER_HOUR = 3_600_000;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const VALID_FORMATS = new Set(["md", "json"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseTimestampMs(raw, fieldName) {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw < 0) {
      throw new RangeError(`${fieldName} deve ser um timestamp numérico finito >= 0.`);
    }
    return raw;
  }
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Date.parse(raw.trim());
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  throw new TypeError(`${fieldName} deve ser timestamp em ms ou string ISO válida.`);
}

function requireNonEmptyId(raw, fieldName) {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new TypeError(`${fieldName} deve ser string não vazia.`);
  }
  const clean = raw.trim();
  if (FORBIDDEN_KEYS.has(clean)) {
    throw new RangeError(`${fieldName} contém chave reservada proibida: ${clean}.`);
  }
  return clean;
}

function validatePost(raw, index, seenIds) {
  if (!isPlainObject(raw)) {
    throw new TypeError(`posts[${index}] deve ser um objeto.`);
  }
  const id = requireNonEmptyId(raw.id, `posts[${index}].id`);
  if (seenIds.has(id)) {
    throw new RangeError(`posts[${index}].id duplicado: ${id}.`);
  }
  seenIds.add(id);
  const authorOfflineAt = parseTimestampMs(raw.authorOfflineAt, `posts[${index}].authorOfflineAt`);
  return { id, authorOfflineAt };
}

function validateReplicaCount(raw, available, index) {
  if (raw === undefined) return available ? 1 : 0;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
    throw new RangeError(`probes[${index}].replicaCount deve ser número finito >= 0.`);
  }
  return raw;
}

function validateProbe(raw, index) {
  if (!isPlainObject(raw)) {
    throw new TypeError(`probes[${index}] deve ser um objeto.`);
  }
  const postId = requireNonEmptyId(raw.postId, `probes[${index}].postId`);
  const observedAt = parseTimestampMs(raw.observedAt, `probes[${index}].observedAt`);
  if (typeof raw.available !== "boolean") {
    throw new TypeError(`probes[${index}].available deve ser booleano.`);
  }
  const replicaCount = validateReplicaCount(raw.replicaCount, raw.available, index);
  return { postId, observedAt, available: raw.available, replicaCount };
}

/**
 * Valida e normaliza o payload local de observações de disponibilidade pós-offline.
 * @param {object} data Objeto `{ posts, probes }` com logs locais de disponibilidade P2P.
 * @returns {{ posts: Array<{id: string, authorOfflineAt: number}>, probes: Array<{postId: string, observedAt: number, available: boolean, replicaCount: number}> }} Dados normalizados.
 */
export function validateAvailabilityInput(data) {
  if (!isPlainObject(data)) {
    throw new TypeError("Entrada deve ser um objeto JSON com 'posts' e 'probes'.");
  }
  if (!Array.isArray(data.posts)) {
    throw new TypeError("Campo obrigatório 'posts' deve ser um array.");
  }
  if (!Array.isArray(data.probes)) {
    throw new TypeError("Campo obrigatório 'probes' deve ser um array.");
  }
  const seenIds = new Set();
  const posts = data.posts.map((post, idx) => validatePost(post, idx, seenIds));
  const probes = data.probes.map((probe, idx) => validateProbe(probe, idx));
  return { posts, probes };
}

function normalizeWindows(windowsHours) {
  if (!Array.isArray(windowsHours) || windowsHours.length === 0) {
    throw new TypeError("windowsHours deve ser um array não vazio de horas positivas.");
  }
  return windowsHours.map((w, idx) => {
    if (typeof w !== "number" || !Number.isFinite(w) || w <= 0) {
      throw new RangeError(`windowsHours[${idx}] deve ser número finito > 0.`);
    }
    return w;
  });
}

function groupProbesByPost(posts, probes) {
  const knownIds = new Set(posts.map((p) => p.id));
  const byPost = new Map(posts.map((p) => [p.id, []]));
  let unmatchedProbes = 0;
  for (const probe of probes) {
    if (!knownIds.has(probe.postId)) {
      unmatchedProbes += 1;
      continue;
    }
    byPost.get(probe.postId).push(probe);
  }
  for (const list of byPost.values()) {
    list.sort((a, b) => a.observedAt - b.observedAt);
  }
  return { byPost, unmatchedProbes };
}

function roundTwoDecimals(value) {
  return Math.round(value * 100) / 100;
}

function evaluateWindow(posts, byPost, windowHours) {
  const thresholdMs = windowHours * MS_PER_HOUR;
  let eligiblePosts = 0;
  let availablePosts = 0;
  let replicaSum = 0;

  for (const post of posts) {
    const minObservedAt = post.authorOfflineAt + thresholdMs;
    const list = byPost.get(post.id) || [];
    const probe = list.find((item) => item.observedAt >= minObservedAt);
    if (!probe) continue;
    eligiblePosts += 1;
    if (probe.available) availablePosts += 1;
    replicaSum += probe.replicaCount;
  }

  return {
    windowHours,
    eligiblePosts,
    availablePosts,
    availabilityPct: eligiblePosts > 0 ? roundTwoDecimals((availablePosts / eligiblePosts) * 100) : null,
    avgReplicas: eligiblePosts > 0 ? roundTwoDecimals(replicaSum / eligiblePosts) : null,
    _replicaSum: replicaSum,
  };
}

function buildSummary(totalPosts, totalProbes, unmatchedProbes, rawWindows) {
  let totalEligibleEvaluations = 0;
  let totalAvailableEvaluations = 0;
  let totalReplicaSum = 0;
  for (const w of rawWindows) {
    totalEligibleEvaluations += w.eligiblePosts;
    totalAvailableEvaluations += w.availablePosts;
    totalReplicaSum += w._replicaSum;
  }
  const hasEligible = totalEligibleEvaluations > 0;
  return {
    totalPosts,
    totalProbes,
    unmatchedProbes,
    windowsEvaluated: rawWindows.length,
    totalEligibleEvaluations,
    totalAvailableEvaluations,
    overallAvailabilityPct: hasEligible ? roundTwoDecimals((totalAvailableEvaluations / totalEligibleEvaluations) * 100) : null,
    overallAvgReplicas: hasEligible ? roundTwoDecimals(totalReplicaSum / totalEligibleEvaluations) : null,
  };
}

/**
 * Calcula métricas de disponibilidade offline (PM-75) para cada janela em horas.
 * Para cada post e janela `W`, seleciona a primeira sonda observada em ou após `authorOfflineAt + W * 3600000`.
 * @param {object} data Objeto `{ posts, probes }` com registros de offline e sondas P2P.
 * @param {number[]} [windowsHours=[1, 6, 24]] Lista de janelas de avaliação em horas.
 * @returns {{ schemaVersion: string, totalPosts: number, totalProbes: number, unmatchedProbes: number, windows: Array<{windowHours: number, eligiblePosts: number, availablePosts: number, availabilityPct: number|null, avgReplicas: number|null}>, summary: object }} Relatório completo de métricas.
 */
export function computeAvailabilityMetrics(data, windowsHours = DEFAULT_WINDOWS_HOURS) {
  const normalized = validateAvailabilityInput(data);
  const windowsList = normalizeWindows(windowsHours);
  const { byPost, unmatchedProbes } = groupProbesByPost(normalized.posts, normalized.probes);
  const rawWindows = windowsList.map((w) => evaluateWindow(normalized.posts, byPost, w));
  const summary = buildSummary(normalized.posts.length, normalized.probes.length, unmatchedProbes, rawWindows);
  const windows = rawWindows.map(({ _replicaSum, ...publicFields }) => publicFields);

  return {
    schemaVersion: SCHEMA_VERSION,
    totalPosts: normalized.posts.length,
    totalProbes: normalized.probes.length,
    unmatchedProbes,
    windows,
    summary,
  };
}

function formatNullablePct(value) {
  return value === null ? "N/A" : `${value.toFixed(2)}%`;
}

function formatNullableNum(value) {
  return value === null ? "N/A" : value.toFixed(2);
}

/**
 * Formata o relatório PM-75 de disponibilidade offline em Markdown auditável.
 * @param {ReturnType<typeof computeAvailabilityMetrics>} report Relatório retornado por `computeAvailabilityMetrics`.
 * @returns {string} Documento Markdown pronto para leitura e arquivamento.
 */
export function formatAvailabilityMarkdown(report) {
  if (!isPlainObject(report) || !Array.isArray(report.windows) || !isPlainObject(report.summary)) {
    throw new TypeError("Relatório inválido para formatação Markdown.");
  }
  const rows = report.windows.map((w) => (
    `| ${w.windowHours}h | ${w.eligiblePosts} | ${w.availablePosts} | ${formatNullablePct(w.availabilityPct)} | ${formatNullableNum(w.avgReplicas)} |`
  ));
  return [
    "# Métricas de Disponibilidade Offline (PM-75)",
    "",
    `- **Esquema:** ${report.schemaVersion ?? SCHEMA_VERSION}`,
    `- **Posts analisados:** ${report.totalPosts} · **Sondas registradas:** ${report.totalProbes} · **Sondas sem post correspondente:** ${report.unmatchedProbes}`,
    `- **Disponibilidade agregada (avaliações elegíveis):** ${formatNullablePct(report.summary.overallAvailabilityPct)} (${report.summary.totalAvailableEvaluations}/${report.summary.totalEligibleEvaluations})`,
    `- **Média global de réplicas:** ${formatNullableNum(report.summary.overallAvgReplicas)}`,
    "",
    "## Disponibilidade por janela pós-offline",
    "",
    "| Janela | Posts elegíveis | Posts acessíveis | Disponibilidade | Média de réplicas |",
    "|---|---:|---:|---:|---:|",
    ...rows,
    "",
    "## Nota metodológica",
    "",
    "- **Zero telemetria central:** cálculo local sobre inventário/sondas P2P.",
    "- **Critério de elegibilidade:** considera posts cujo autor ficou offline há pelo menos `W` horas com sonda em `observedAt >= authorOfflineAt + W * 3600000` (primeira observação válida a partir do marco).",
    "",
  ].join("\n");
}

function readNextArg(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`Falta valor para ${flag}.`);
  }
  return value;
}

function parseFormat(raw) {
  const fmt = String(raw || "").trim().toLowerCase();
  if (!VALID_FORMATS.has(fmt)) {
    throw new Error(`Formato inválido '${raw}'. Use 'md' ou 'json'.`);
  }
  return fmt;
}

function parseCliArgs(argv) {
  const opts = { input: "", format: "md", out: "", help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--input" || arg === "-i") opts.input = readNextArg(argv, i++, arg);
    else if (arg.startsWith("--input=")) opts.input = arg.slice(8);
    else if (arg === "--format" || arg === "-f") opts.format = parseFormat(readNextArg(argv, i++, arg));
    else if (arg.startsWith("--format=")) opts.format = parseFormat(arg.slice(9));
    else if (arg === "--out" || arg === "--output" || arg === "-o") opts.out = readNextArg(argv, i++, arg);
    else if (arg.startsWith("--out=")) opts.out = arg.slice(6);
    else throw new Error(`Argumento desconhecido: ${arg}`);
  }
  return opts;
}

function readJsonFile(filePath) {
  let rawText;
  try {
    rawText = fs.readFileSync(path.resolve(filePath), "utf8");
  } catch (err) {
    throw new Error(`Não foi possível ler "${filePath}": ${err.message}`);
  }
  try {
    return JSON.parse(rawText.replace(/^\uFEFF/, ""));
  } catch (err) {
    throw new Error(`JSON inválido em "${filePath}": ${err.message}`);
  }
}

/**
 * Executa o fluxo CLI de leitura de observações P2P, cálculo PM-75 e saída em Markdown ou JSON.
 * @param {string[]} [argv] Argumentos de linha de comando (sem `node` e caminho do script).
 * @returns {{ report: ReturnType<typeof computeAvailabilityMetrics>|null, output: string, format: string, outputPath: string|null }} Resultado da execução.
 */
export function runCli(argv = process.argv.slice(2)) {
  const opts = parseCliArgs(argv);
  if (opts.help) {
    console.log("Uso: node scripts/availability-metrics.mjs --input <observations.json> [--format md|json] [--out <file>]");
    return { report: null, output: "", format: opts.format, outputPath: null };
  }
  if (!opts.input) {
    throw new Error("Parâmetro obrigatório ausente: --input <observations.json>.");
  }
  const data = readJsonFile(opts.input);
  const report = computeAvailabilityMetrics(data);
  const output = opts.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : formatAvailabilityMarkdown(report);
  const outputPath = opts.out ? path.resolve(opts.out) : null;
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, output, "utf8");
  } else {
    process.stdout.write(output);
  }
  return { report, output, format: opts.format, outputPath };
}

function isMainModule() {
  if (!process.argv[1]) return false;
  const entry = path.resolve(process.argv[1]);
  const self = path.resolve(fileURLToPath(import.meta.url));
  return process.platform === "win32" ? entry.toLowerCase() === self.toLowerCase() : entry === self;
}

if (isMainModule()) {
  try {
    runCli();
  } catch (err) {
    console.error(`Erro: ${err.message}`);
    process.exitCode = 1;
  }
}
