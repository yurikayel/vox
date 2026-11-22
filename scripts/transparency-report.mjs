#!/usr/bin/env node
/**
 * @file Gerador de relatório anual de transparência de moderação (REV-20).
 * Lê um log JSON local, valida e descarta qualquer identificador ou PII,
 * agrega estatísticas anuais e emite Markdown determinístico sem dados pessoais.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Versão canônica do esquema do relatório de transparência (REV-20). */
export const SCHEMA_VERSION = "1.0.0";

const VALID_SOURCES = new Set(["user", "non-user", "judicial"]);
const VALID_ACTIONS = new Set(["hidden", "rejected", "escalated", "pending"]);
const VALID_APPEAL_OUTCOMES = new Set(["overturned", "upheld", "pending"]);
const CATEGORY_SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/i;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/;

function parseYearFromDate(rawDate, index) {
  if (typeof rawDate !== "string") {
    throw new TypeError(`Registro[${index}]: 'date' deve ser string ISO YYYY-MM-DD.`);
  }
  const match = ISO_DATE_RE.exec(rawDate.trim());
  if (!match) {
    throw new RangeError(`Registro[${index}]: 'date' inválido (${rawDate}).`);
  }
  const [, yStr, mStr, dStr] = match;
  const [y, m, d] = [Number(yStr), Number(mStr), Number(dStr)];
  const dt = new Date(Date.UTC(y, m - 1, d));
  const valid = dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  if (!valid) throw new RangeError(`Registro[${index}]: data inexistente (${rawDate}).`);
  return y;
}

function validateEnum(value, allowed, field, index) {
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new RangeError(`Registro[${index}]: '${field}' inválido.`);
  }
  return value;
}

function validateCategory(rawCategory, index) {
  if (typeof rawCategory !== "string" || !CATEGORY_SLUG_RE.test(rawCategory.trim())) {
    throw new RangeError(`Registro[${index}]: 'category' inválido (use slug ASCII seguro).`);
  }
  return rawCategory.trim().toLowerCase();
}

function validateAppeal(raw, index) {
  const appealed = raw.appealed === undefined ? false : raw.appealed;
  if (typeof appealed !== "boolean") {
    throw new TypeError(`Registro[${index}]: 'appealed' deve ser booleano.`);
  }
  if (!appealed) {
    if (raw.appealOutcome != null) {
      throw new RangeError(`Registro[${index}]: 'appealOutcome' exige appealed=true.`);
    }
    return { appealed: false, appealOutcome: null };
  }
  const outcome = raw.appealOutcome == null ? "pending" : raw.appealOutcome;
  return { appealed: true, appealOutcome: validateEnum(outcome, VALID_APPEAL_OUTCOMES, "appealOutcome", index) };
}

function validateResponseHours(value, index) {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`Registro[${index}]: 'responseHours' deve ser número >= 0 ou nulo.`);
  }
  return value;
}

/**
 * Valida um registro bruto e remove qualquer identificador, campo extra ou PII.
 * @param {object} raw Registro bruto do log de moderação.
 * @param {number} index Índice do registro na lista de entrada.
 * @returns {{year: number, category: string, source: string, action: string, appealed: boolean, appealOutcome: string|null, responseHours: number|null}} Registro sanitizado sem PII.
 */
export function sanitizeEntry(raw, index) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError(`Registro[${index}]: deve ser um objeto JSON.`);
  }
  if (raw.id !== undefined && (typeof raw.id !== "string" || !raw.id.trim())) {
    throw new TypeError(`Registro[${index}]: 'id' deve ser string não vazia quando informado.`);
  }
  const appeal = validateAppeal(raw, index);
  return {
    year: parseYearFromDate(raw.date, index),
    category: validateCategory(raw.category, index),
    source: validateEnum(raw.source, VALID_SOURCES, "source", index),
    action: validateEnum(raw.action, VALID_ACTIONS, "action", index),
    appealed: appeal.appealed,
    appealOutcome: appeal.appealOutcome,
    responseHours: validateResponseHours(raw.responseHours, index),
  };
}

function assertValidYear(year) {
  if (!Number.isInteger(year) || year < 1970 || year > 2100) {
    throw new RangeError(`Ano inválido: ${year}. Esperado inteiro entre 1970 e 2100.`);
  }
  return year;
}

function computeLatencyStats(hoursList) {
  if (hoursList.length === 0) return { sampleSize: 0, median: null, p95: null };
  const sorted = [...hoursList].sort((a, b) => a - b);
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  const median = n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const p95Index = Math.max(0, Math.ceil(0.95 * n) - 1);
  return { sampleSize: n, median, p95: sorted[p95Index] };
}

function initCounts(keys) {
  return Object.fromEntries([...keys].map((k) => [k, 0]));
}

function accumulateAppeals(appeals, entry) {
  if (!entry.appealed) return;
  appeals.total += 1;
  appeals[entry.appealOutcome] += 1;
  if (entry.appealOutcome === "overturned" || entry.appealOutcome === "upheld") {
    appeals.resolved += 1;
  }
}

function sortObjectKeys(obj) {
  return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]]));
}

/**
 * Valida e agrega entradas de moderação para um ano civil, preservando invariante zero-PII.
 * @param {object[]} entries Lista de registros brutos do log de moderação.
 * @param {number} year Ano civil alvo (ex.: 2026).
 * @returns {{schemaVersion: string, year: number, total: number, byCategory: Record<string, number>, bySource: Record<string, number>, byAction: Record<string, number>, appeals: {total: number, overturned: number, upheld: number, pending: number, resolved: number, overturnRate: number|null}, responseTimeHours: {sampleSize: number, median: number|null, p95: number|null}}} Sumário agregado sem PII.
 */
export function aggregateModerationLog(entries, year) {
  if (!Array.isArray(entries)) throw new TypeError("Entrada deve ser um array JSON.");
  const targetYear = assertValidYear(year);
  const sanitized = entries.map((entry, idx) => sanitizeEntry(entry, idx));
  const filtered = sanitized.filter((entry) => entry.year === targetYear);

  const byCategory = {};
  const bySource = initCounts(VALID_SOURCES);
  const byAction = initCounts(VALID_ACTIONS);
  const appeals = { total: 0, overturned: 0, upheld: 0, pending: 0, resolved: 0, overturnRate: null };
  const hours = [];

  for (const item of filtered) {
    byCategory[item.category] = (byCategory[item.category] || 0) + 1;
    bySource[item.source] += 1;
    byAction[item.action] += 1;
    accumulateAppeals(appeals, item);
    if (item.responseHours !== null) hours.push(item.responseHours);
  }
  appeals.overturnRate = appeals.resolved > 0 ? appeals.overturned / appeals.resolved : null;

  return {
    schemaVersion: SCHEMA_VERSION,
    year: targetYear,
    total: filtered.length,
    byCategory: sortObjectKeys(byCategory),
    bySource,
    byAction,
    appeals,
    responseTimeHours: computeLatencyStats(hours),
  };
}

function formatTable(headerLeft, headerRight, rows) {
  const lines = [`| ${headerLeft} | ${headerRight} |`, "|---|---|"];
  for (const [label, value] of rows) lines.push(`| ${label} | ${value} |`);
  return lines.join("\n");
}

function formatHours(value) {
  return value === null ? "N/A" : `${value.toFixed(2)} h`;
}

function formatRate(rate, resolved) {
  if (rate === null || resolved === 0) return "N/A";
  return `${(rate * 100).toFixed(1)}%`;
}

function formatAppealsSection(a) {
  return formatTable("Indicador", "Valor", [
    ["Total de recursos", String(a.total)],
    ["Revertidos (overturned)", String(a.overturned)],
    ["Mantidos (upheld)", String(a.upheld)],
    ["Pendentes", String(a.pending)],
    ["Taxa de reversão (sobre resolvidos)", formatRate(a.overturnRate, a.resolved)],
  ]);
}

function formatLatencySection(rt) {
  return formatTable("Métrica", "Valor", [
    ["Amostras válidas", String(rt.sampleSize)],
    ["Mediana", formatHours(rt.median)],
    ["Percentil 95 (p95)", formatHours(rt.p95)],
  ]);
}

function formatMethodologySection() {
  return [
    "- **Zero PII:** Todos os identificadores (`id`), dados de denunciantes/autores, endereços IP e notas textuais livres são descartados antes da agregação.",
    "- **Escopo:** Refere-se exclusivamente às decisões aplicadas à lista oficial de ocultação (`hide-list`) da instância PWA oficial (software local-first/P2P).",
    "- **Cálculo de latência:** Mediana padrão e p95 pelo método *nearest-rank* sobre registros com `responseHours` numérico não negativo.",
  ].join("\n");
}

/**
 * Formata o sumário agregado como relatório Markdown anual de transparência.
 * @param {ReturnType<typeof aggregateModerationLog>} summary Objeto agregado sem PII.
 * @returns {string} Documento Markdown pronto para publicação.
 */
export function formatTransparencyMarkdown(summary) {
  const catEntries = Object.entries(summary.byCategory);
  const catSection = catEntries.length
    ? formatTable("Categoria", "Quantidade", catEntries)
    : "_Nenhum registro para o ano selecionado._";
  return [
    `# Relatório Anual de Transparência de Moderação — ${summary.year}`,
    "",
    `**Versão do esquema:** ${summary.schemaVersion} · **Ano de referência:** ${summary.year} · **Total de registros:** ${summary.total}`,
    "",
    "## 1. Totais por origem", "", formatTable("Origem", "Quantidade", Object.entries(summary.bySource)), "",
    "## 2. Totais por ação", "", formatTable("Ação", "Quantidade", Object.entries(summary.byAction)), "",
    "## 3. Totais por categoria", "", catSection, "",
    "## 4. Recursos e revisões", "", formatAppealsSection(summary.appeals), "",
    "## 5. Tempo de resposta", "", formatLatencySection(summary.responseTimeHours), "",
    "## 6. Nota metodológica e invariante zero-PII", "", formatMethodologySection(), "",
  ].join("\n");
}

/**
 * Executa validação, agregação anual e geração do relatório Markdown.
 * @param {object[]} entries Lista de registros brutos do log de moderação.
 * @param {number} year Ano civil alvo.
 * @returns {{summary: ReturnType<typeof aggregateModerationLog>, markdown: string}} Sumário agregado e Markdown gerado.
 */
export function generateTransparencyReport(entries, year) {
  const summary = aggregateModerationLog(entries, year);
  return { summary, markdown: formatTransparencyMarkdown(summary) };
}

function readNextArg(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Argumento ausente após ${flag}.`);
  }
  return value;
}

/**
 * Interpreta argumentos de linha de comando (`--input`, `--year`, `--output`).
 * @param {string[]} argv Argumentos após o nome do script.
 * @returns {{input: string, year: number, output: string|null}} Configuração validada da CLI.
 */
export function parseCliArgs(argv) {
  let input = "";
  let yearRaw = "";
  let output = null;
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    if (flag === "--input") input = readNextArg(argv, i, flag);
    else if (flag === "--year") yearRaw = readNextArg(argv, i, flag);
    else if (flag === "--output") output = readNextArg(argv, i, flag);
    else throw new Error(`Flag desconhecida: ${flag}`);
  }
  if (!input || !/^\d{4}$/.test(yearRaw)) {
    throw new Error("Uso: node scripts/transparency-report.mjs --input <json> --year <YYYY> [--output <md>]");
  }
  return { input, year: assertValidYear(Number(yearRaw)), output };
}

/**
 * Executa a CLI lendo o arquivo JSON de entrada e gravando ou imprimindo o relatório Markdown.
 * @param {string[]} argv Argumentos da linha de comando.
 * @returns {{summary: ReturnType<typeof aggregateModerationLog>, markdown: string}} Resultado da geração do relatório.
 */
export function runCli(argv) {
  const opts = parseCliArgs(argv);
  const rawText = readFileSync(resolve(opts.input), "utf8");
  const parsed = JSON.parse(rawText);
  const result = generateTransparencyReport(parsed, opts.year);
  if (opts.output) writeFileSync(resolve(opts.output), result.markdown, "utf8");
  else process.stdout.write(result.markdown);
  return result;
}

const isDirectRun = Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  try {
    runCli(process.argv.slice(2));
  } catch (err) {
    console.error(`Erro: ${err.message}`);
    process.exitCode = 1;
  }
}
