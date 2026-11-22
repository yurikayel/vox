#!/usr/bin/env node
/**
 * @file REV-11 & PM-74 — Simulador offline de replicação por grau de amizade e cota efêmera.
 * Alinhado a `docs/specs/replicacao-por-grau-v0.md` e ADR-019: modela graus por salto
 * (0 = próprios posts, 1 = seguidos/amigos, 2 = comunidade/2º salto, >= 3 = distante),
 * subcota de vídeo, expiração efêmera por TTL (REV-11) e despejo determinístico sem grafo social.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DAY_MS = 86_400 * 1000;
const VALID_MEDIA_TYPES = new Set(["text", "image", "audio", "video"]);
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Política padrão de cota e expiração efêmera (500 MiB total, 150 MiB vídeo, grau <= 2, TTL 30d). */
export const DEFAULT_QUOTA_POLICY = Object.freeze({
  maxBytes: 500 * 1024 * 1024,
  videoMaxBytes: 150 * 1024 * 1024,
  maxDegree: 2,
  defaultTtlMs: 30 * DAY_MS,
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireSafeId(raw, fieldName) {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new TypeError(`${fieldName} deve ser string não vazia.`);
  }
  const clean = raw.trim();
  if (FORBIDDEN_KEYS.has(clean)) {
    throw new RangeError(`${fieldName} contém chave reservada proibida: ${clean}.`);
  }
  return clean;
}

function parseNonNegativeNumber(raw, fieldName, integerOnly = false) {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    throw new TypeError(`${fieldName} deve ser um número finito.`);
  }
  if (raw < 0) {
    throw new RangeError(`${fieldName} não pode ser negativo.`);
  }
  if (integerOnly && !Number.isInteger(raw)) {
    throw new RangeError(`${fieldName} deve ser um inteiro não negativo.`);
  }
  return raw;
}

function parseTimestampMs(raw, fieldName) {
  if (typeof raw === "number") {
    return parseNonNegativeNumber(raw, fieldName);
  }
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Date.parse(raw.trim());
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  throw new TypeError(`${fieldName} deve ser timestamp em ms >= 0 ou string ISO válida.`);
}

function parseOptionalBoolean(raw, fieldName, fallback) {
  if (raw === undefined) return fallback;
  if (typeof raw !== "boolean") {
    throw new TypeError(`${fieldName} deve ser booleano quando informado.`);
  }
  return raw;
}

function parsePositiveTtlMs(raw, fieldName) {
  const value = parseNonNegativeNumber(raw, fieldName);
  if (value === 0) {
    throw new RangeError(`${fieldName} deve ser maior que zero (TTL 0 expiraria o item na hora).`);
  }
  return value;
}

function parseOptionalTtlMs(raw, fieldName) {
  if (raw === undefined || raw === null) return null;
  return parsePositiveTtlMs(raw, fieldName);
}

/**
 * Valida e normaliza um item replicado sem reter arestas de grafo social de terceiros.
 * `pinned` protege só contra expiração por TTL e contra `degree_exceeded`; NÃO isenta de despejo por cota
 * (`video_quota`/`global_quota`), onde apenas rebaixa a prioridade de despejo. `ttlMs`, se informado, deve ser > 0.
 * @param {object} raw Registro bruto com `{ id, degree, mediaType, bytes, createdAt, pinned?, ttlMs? }`.
 * @returns {{ id: string, degree: number, mediaType: "text"|"image"|"audio"|"video", bytes: number, createdAt: number, pinned: boolean, ttlMs: number|null }} Item normalizado.
 */
export function normalizeReplicaItem(raw) {
  if (!isPlainObject(raw)) {
    throw new TypeError("Item de replicação deve ser um objeto.");
  }
  const id = requireSafeId(raw.id, "item.id");
  const degree = parseNonNegativeNumber(raw.degree, "item.degree", true);
  if (typeof raw.mediaType !== "string" || !VALID_MEDIA_TYPES.has(raw.mediaType)) {
    throw new RangeError(`item.mediaType inválido: ${String(raw.mediaType)}.`);
  }
  const bytes = parseNonNegativeNumber(raw.bytes, "item.bytes");
  const createdAt = parseTimestampMs(raw.createdAt, "item.createdAt");
  const pinned = parseOptionalBoolean(raw.pinned, "item.pinned", false);
  const ttlMs = parseOptionalTtlMs(raw.ttlMs, "item.ttlMs");
  return { id, degree, mediaType: raw.mediaType, bytes, createdAt, pinned, ttlMs };
}

function normalizePolicy(policy = {}) {
  if (!isPlainObject(policy)) {
    throw new TypeError("Política de cota deve ser um objeto.");
  }
  return {
    maxBytes: policy.maxBytes === undefined ? DEFAULT_QUOTA_POLICY.maxBytes : parseNonNegativeNumber(policy.maxBytes, "policy.maxBytes"),
    videoMaxBytes: policy.videoMaxBytes === undefined ? DEFAULT_QUOTA_POLICY.videoMaxBytes : parseNonNegativeNumber(policy.videoMaxBytes, "policy.videoMaxBytes"),
    maxDegree: policy.maxDegree === undefined ? DEFAULT_QUOTA_POLICY.maxDegree : parseNonNegativeNumber(policy.maxDegree, "policy.maxDegree", true),
    defaultTtlMs: policy.defaultTtlMs === undefined ? DEFAULT_QUOTA_POLICY.defaultTtlMs : parsePositiveTtlMs(policy.defaultTtlMs, "policy.defaultTtlMs"),
    now: policy.now === undefined ? Date.now() : parseTimestampMs(policy.now, "policy.now"),
  };
}

function normalizeItemsUnique(items) {
  if (!Array.isArray(items)) {
    throw new TypeError("items deve ser um array.");
  }
  const seenIds = new Set();
  return items.map((raw) => {
    const item = normalizeReplicaItem(raw);
    if (seenIds.has(item.id)) {
      throw new RangeError(`ID duplicado em items: ${item.id}.`);
    }
    seenIds.add(item.id);
    return item;
  });
}

function protectionRank(item) {
  if (item.degree === 0) return item.pinned ? 3 : 2;
  return item.pinned ? 1 : 0;
}

function compareEvictionPriority(a, b) {
  const tierDiff = protectionRank(a) - protectionRank(b);
  if (tierDiff !== 0) return tierDiff;
  if (b.degree !== a.degree) return b.degree - a.degree;
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function partitionInitialEvictions(items, policy) {
  const survivors = [];
  const evicted = [];
  for (const item of items) {
    const ttlMs = item.ttlMs ?? policy.defaultTtlMs;
    const isExpired = item.degree !== 0 && !item.pinned && item.createdAt + ttlMs <= policy.now;
    if (isExpired) {
      evicted.push({ ...item, reason: "expired" });
    } else if (item.degree > policy.maxDegree && !item.pinned) {
      evicted.push({ ...item, reason: "degree_exceeded" });
    } else {
      survivors.push(item);
    }
  }
  return { survivors, evicted };
}

function evictOverBudget(survivors, limitBytes, reason, predicate) {
  const candidates = survivors.filter(predicate);
  let usedBytes = candidates.reduce((sum, item) => sum + item.bytes, 0);
  if (usedBytes <= limitBytes) {
    return { kept: survivors, newlyEvicted: [] };
  }
  const ordered = [...candidates].sort(compareEvictionPriority);
  const evictedIds = new Set();
  const newlyEvicted = [];
  for (const item of ordered) {
    if (usedBytes <= limitBytes) break;
    usedBytes -= item.bytes;
    evictedIds.add(item.id);
    newlyEvicted.push({ ...item, reason });
  }
  return {
    kept: survivors.filter((item) => !evictedIds.has(item.id)),
    newlyEvicted,
  };
}

function roundTwoDecimals(value) {
  return Math.round(value * 100) / 100;
}

function computeUtilizationPct(usedBytes, capBytes) {
  if (capBytes <= 0) return 0;
  return roundTwoDecimals((usedBytes / capBytes) * 100);
}

function buildQuotaStats(kept, evicted, policy) {
  let totalBytes = 0;
  let videoBytes = 0;
  const byDegree = {};
  for (const item of kept) {
    totalBytes += item.bytes;
    const isVideo = item.mediaType === "video";
    if (isVideo) videoBytes += item.bytes;
    const bucket = byDegree[item.degree] || { count: 0, bytes: 0, videoBytes: 0 };
    bucket.count += 1;
    bucket.bytes += item.bytes;
    if (isVideo) bucket.videoBytes += item.bytes;
    byDegree[item.degree] = bucket;
  }
  return {
    totalBytes,
    videoBytes,
    keptCount: kept.length,
    evictedCount: evicted.length,
    byDegree,
    utilizationPct: computeUtilizationPct(totalBytes, policy.maxBytes),
    videoUtilizationPct: computeUtilizationPct(videoBytes, policy.videoMaxBytes),
  };
}

/**
 * Simula expiração efêmera (REV-11), filtro de grau e despejo por subcota de vídeo e cota global.
 * Itens `pinned` escapam de expiração e de grau, mas podem ser despejados por cota se o teto exigir.
 * @param {Array<object>} items Lista de itens replicados locais.
 * @param {object} [policy={}] Política opcional (`maxBytes`, `videoMaxBytes`, `maxDegree`, `defaultTtlMs`, `now`).
 * @returns {{ ok: boolean, kept: Array<object>, evicted: Array<object>, stats: { totalBytes: number, videoBytes: number, keptCount: number, evictedCount: number, byDegree: object, utilizationPct: number, videoUtilizationPct: number } }} Resultado determinístico da simulação.
 */
export function simulateQuotaEviction(items, policy = {}) {
  const effectivePolicy = normalizePolicy(policy);
  const normalized = normalizeItemsUnique(items);
  const initial = partitionInitialEvictions(normalized, effectivePolicy);
  const afterVideo = evictOverBudget(
    initial.survivors,
    effectivePolicy.videoMaxBytes,
    "video_quota",
    (item) => item.mediaType === "video",
  );
  const afterGlobal = evictOverBudget(
    afterVideo.kept,
    effectivePolicy.maxBytes,
    "global_quota",
    () => true,
  );
  const evicted = [...initial.evicted, ...afterVideo.newlyEvicted, ...afterGlobal.newlyEvicted];
  const stats = buildQuotaStats(afterGlobal.kept, evicted, effectivePolicy);
  const ok = stats.totalBytes <= effectivePolicy.maxBytes && stats.videoBytes <= effectivePolicy.videoMaxBytes;
  return { ok, kept: afterGlobal.kept, evicted, stats };
}

function formatDegreeRows(byDegree) {
  const degrees = Object.keys(byDegree).sort((a, b) => Number(a) - Number(b));
  if (degrees.length === 0) return ["| — | 0 | 0 | 0 |"];
  return degrees.map((deg) => {
    const b = byDegree[deg];
    return `| Grau ${deg} | ${b.count} | ${b.bytes} | ${b.videoBytes} |`;
  });
}

/**
 * Formata o resultado da simulação de cota e replicação por grau em Markdown auditável.
 * @param {ReturnType<typeof simulateQuotaEviction>} result Saída de `simulateQuotaEviction`.
 * @returns {string} Relatório Markdown.
 */
export function formatQuotaReportMarkdown(result) {
  if (!isPlainObject(result) || !Array.isArray(result.kept) || !Array.isArray(result.evicted) || !isPlainObject(result.stats)) {
    throw new TypeError("Resultado de simulação inválido para formatação Markdown.");
  }
  const { stats } = result;
  return [
    "# Relatório de Cota e Replicação por Grau (REV-11 / PM-74)",
    "",
    `- **Conformidade da cota:** ${result.ok ? "OK" : "EXCEDIDA"}`,
    `- **Itens mantidos:** ${stats.keptCount} · **Itens removidos:** ${stats.evictedCount}`,
    `- **Armazenamento total:** ${stats.totalBytes} bytes (${stats.utilizationPct.toFixed(2)}%)`,
    `- **Subcota de vídeo:** ${stats.videoBytes} bytes (${stats.videoUtilizationPct.toFixed(2)}%)`,
    "",
    "## Distribuição por grau mantido",
    "",
    "| Grau | Itens | Bytes totais | Bytes de vídeo |",
    "|---|---:|---:|---:|",
    ...formatDegreeRows(stats.byDegree),
    "",
    "## Nota de privacidade (local-first)",
    "",
    "- Simulação executada localmente sem armazenar nem expor arestas do grafo social.",
    "",
  ].join("\n");
}

function readNextArg(argv, index, flag) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("-")) {
    throw new Error(`Falta valor para ${flag}.`);
  }
  return value;
}

function parseCliNow(raw) {
  const num = Number(raw);
  return parseTimestampMs(Number.isFinite(num) ? num : raw, "--now");
}

const VALUE_FLAG_HANDLERS = {
  "--input": (opts, v) => { opts.input = v; },
  "-i": (opts, v) => { opts.input = v; },
  "--max-bytes": (opts, v) => { opts.policy.maxBytes = parseNonNegativeNumber(Number(v), "--max-bytes"); },
  "--video-max-bytes": (opts, v) => { opts.policy.videoMaxBytes = parseNonNegativeNumber(Number(v), "--video-max-bytes"); },
  "--max-degree": (opts, v) => { opts.policy.maxDegree = parseNonNegativeNumber(Number(v), "--max-degree", true); },
  "--now": (opts, v) => { opts.policy.now = parseCliNow(v); },
  "--out": (opts, v) => { opts.out = v; },
  "-o": (opts, v) => { opts.out = v; },
};

function parseCliArgs(argv) {
  const opts = { input: "", out: "", json: false, help: false, policy: {} };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") { opts.help = true; continue; }
    if (arg === "--json") { opts.json = true; continue; }
    const eqIdx = arg.indexOf("=");
    const flag = eqIdx >= 0 ? arg.slice(0, eqIdx) : arg;
    const handler = VALUE_FLAG_HANDLERS[flag];
    if (!handler) throw new Error(`Argumento desconhecido: ${arg}`);
    const val = eqIdx >= 0 ? arg.slice(eqIdx + 1) : readNextArg(argv, i++, flag);
    handler(opts, val);
  }
  return opts;
}

function readJsonInput(filePath) {
  let rawText;
  try {
    rawText = fs.readFileSync(path.resolve(filePath), "utf8");
  } catch (err) {
    throw new Error(`Não foi possível ler "${filePath}": ${err.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(rawText.replace(/^\uFEFF/, ""));
  } catch (err) {
    throw new Error(`JSON inválido em "${filePath}": ${err.message}`);
  }
  if (Array.isArray(parsed)) return { items: parsed, filePolicy: {} };
  if (isPlainObject(parsed) && Array.isArray(parsed.items)) {
    return { items: parsed.items, filePolicy: isPlainObject(parsed.policy) ? parsed.policy : {} };
  }
  throw new TypeError("Entrada JSON deve ser um array de itens ou objeto { items, policy? }.");
}

/**
 * Executa o fluxo CLI do simulador REV-11 / PM-74.
 * @param {string[]} [argv] Argumentos da linha de comando (sem `node` e caminho do script).
 * @returns {{ result: ReturnType<typeof simulateQuotaEviction>|null, output: string, format: "json"|"md", outputPath: string|null }} Resultado da execução CLI.
 */
export function runCli(argv = process.argv.slice(2)) {
  const opts = parseCliArgs(argv);
  if (opts.help) {
    console.log("Uso: node scripts/replication-quota-sim.mjs --input <items.json> [--max-bytes 524288000] [--video-max-bytes 157286400] [--now <ms>] [--json]");
    return { result: null, output: "", format: opts.json ? "json" : "md", outputPath: null };
  }
  if (!opts.input) {
    throw new Error("Parâmetro obrigatório ausente: --input <items.json>.");
  }
  const { items, filePolicy } = readJsonInput(opts.input);
  const result = simulateQuotaEviction(items, { ...filePolicy, ...opts.policy });
  const output = opts.json ? `${JSON.stringify(result, null, 2)}\n` : formatQuotaReportMarkdown(result);
  const outputPath = opts.out ? path.resolve(opts.out) : null;
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, output, "utf8");
  } else {
    process.stdout.write(output);
  }
  return { result, output, format: opts.json ? "json" : "md", outputPath };
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
