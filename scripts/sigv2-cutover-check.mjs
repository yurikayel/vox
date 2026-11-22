#!/usr/bin/env node
/**
 * PM-102 + PM-100 — Portão de virada `SIGV2_FROM` (24/11/2026) e auditor de vazamento do modo ensaio.
 *
 * - PM-102: verifica se itens criados a partir de `SIGV2_FROM` (+ margem opcional) usam `sigv: 2`,
 *   mantendo `v1` apenas para legado anterior ao corte e recusando versões desconhecidas (fail-closed).
 * - PM-100: detecta itens de modo ensaio (`rehearsal: true`, `mode: "rehearsal"`, `TEST_ROUTE_IDS`,
 *   prefixo `rehearsal_`) que jamais podem aparecer em filas de saída de rede (gossip, memória central, POSSE).
 *
 * Uso: node scripts/sigv2-cutover-check.mjs --input <itens.json> [--grace-ms 0] [--check-rehearsal] [--json]
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { SIGV2_FROM, isKnownSigv } from "../client/js/sig-format.js";
import { TEST_ROUTE_IDS } from "../client/js/data/test-route-ids.js";

const TEST_ID_SET = new Set(TEST_ROUTE_IDS);
const CREATED_FIELDS = Object.freeze(["ts", "timestamp", "createdAt"]);

function extractCreatedMs(item) {
  for (const field of CREATED_FIELDS) {
    const val = item[field];
    if (typeof val === "number" && Number.isFinite(val) && val > 0) return Math.trunc(val);
  }
  return 0;
}

/**
 * Avalia um item assinado contra a regra de virada `PM-102` (`SIGV2_FROM` + margem opcional).
 * @param {object} item Payload de post, cartão ou retratação.
 * @param {{ cutoverMs?: number, graceMs?: number }} [opts] Parâmetros da janela de corte.
 * @returns {{ ok: boolean, status?: string, code?: string, createdMs: number }} Veredito da política.
 */
export function evaluateSigv2Policy(item, opts = {}) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return { ok: false, code: "invalid_item", createdMs: 0 };
  }
  const createdMs = extractCreatedMs(item);
  if (!isKnownSigv(item)) {
    return { ok: false, code: "unknown_sigv", createdMs };
  }
  if (item.sigv === 2) {
    return { ok: true, status: "v2_valid", createdMs };
  }
  if (createdMs <= 0) {
    return { ok: false, code: "v1_missing_timestamp", createdMs };
  }
  const cutoverMs = Number.isFinite(opts.cutoverMs) ? opts.cutoverMs : SIGV2_FROM;
  const graceMs = Number.isFinite(opts.graceMs) && opts.graceMs >= 0 ? opts.graceMs : 0;
  if (createdMs < cutoverMs + graceMs) {
    return { ok: true, status: "v1_legacy_allowed", createdMs };
  }
  return { ok: false, code: "v1_rejected_post_cutover", createdMs };
}

/**
 * Verifica se um item destinado à rede externa pertence ao modo ensaio ou a conta de teste (PM-100).
 * @param {object} item Payload em fila de gossip, memória central, Arweave ou POSSE.
 * @returns {{ leaked: boolean, reasons: string[] }} Resultado da auditoria anti-vazamento.
 */
export function checkOutboundRehearsalLeak(item) {
  const reasons = [];
  if (!item || typeof item !== "object") return { leaked: false, reasons };
  if (item.rehearsal === true) reasons.push("rehearsal_flag");
  if (item.mode === "rehearsal") reasons.push("rehearsal_mode");
  if (item.channel === "rehearsal") reasons.push("rehearsal_channel");
  const author = String(item.author || item.owner || item.routeId || "").trim();
  if (author && TEST_ID_SET.has(author)) reasons.push("test_route_id");
  if (author.startsWith("rehearsal_")) reasons.push("rehearsal_author_prefix");
  return { leaked: reasons.length > 0, reasons };
}

function recordBatchItem(acc, item, index, opts) {
  const id = item && typeof item === "object" && item.id ? String(item.id) : `#${index}`;
  const verdict = evaluateSigv2Policy(item, opts);
  if (verdict.status === "v2_valid") acc.summary.v2Valid += 1;
  else if (verdict.status === "v1_legacy_allowed") acc.summary.v1LegacyAllowed += 1;
  else {
    acc.summary.rejected += 1;
    acc.violations.push({ index, id, code: verdict.code, createdMs: verdict.createdMs });
  }
  if (!opts.checkRehearsal) return;
  const leak = checkOutboundRehearsalLeak(item);
  if (leak.leaked) {
    acc.summary.rehearsalLeaks += 1;
    acc.violations.push({ index, id, code: "rehearsal_leak", reasons: leak.reasons });
  }
}

/**
 * Audita um lote de itens quanto à política `PM-102` e, opcionalmente, vazamento de ensaio `PM-100`.
 * @param {object[]} items Lista de itens assinados ou de saída de rede.
 * @param {{ cutoverMs?: number, graceMs?: number, checkRehearsal?: boolean }} [opts] Opções de auditoria.
 * @returns {object} Relatório consolidado com contadores e lista de violações.
 */
export function auditCutoverBatch(items, opts = {}) {
  if (!Array.isArray(items)) {
    throw new Error("Entrada inválida: esperado array JSON de itens.");
  }
  const acc = {
    summary: { v2Valid: 0, v1LegacyAllowed: 0, rejected: 0, rehearsalLeaks: 0 },
    violations: [],
  };
  for (let i = 0; i < items.length; i++) recordBatchItem(acc, items[i], i, opts);
  const cutoverMs = Number.isFinite(opts.cutoverMs) ? opts.cutoverMs : SIGV2_FROM;
  const graceMs = Number.isFinite(opts.graceMs) && opts.graceMs >= 0 ? opts.graceMs : 0;
  return {
    ok: acc.violations.length === 0,
    cutoverMs,
    graceMs,
    total: items.length,
    summary: acc.summary,
    violations: acc.violations,
  };
}

function parseArgs(argv) {
  const opts = { input: "", graceMs: 0, checkRehearsal: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--input") opts.input = argv[++i] || "";
    else if (arg === "--grace-ms") opts.graceMs = Number(argv[++i]) || 0;
    else if (arg === "--check-rehearsal") opts.checkRehearsal = true;
    else if (arg === "--json") opts.json = true;
  }
  return opts;
}

/**
 * Executa a CLI de auditoria `PM-102` + `PM-100` sobre um arquivo JSON local.
 * @param {string[]} argv Argumentos de linha de comando.
 * @returns {{ code: number, output: string, report?: object }} Código de saída (`0` ok, `1` falha) e texto.
 */
export function runCli(argv) {
  const opts = parseArgs(argv);
  if (!opts.input) {
    return { code: 1, output: "Uso: --input <itens.json> [--grace-ms <ms>] [--check-rehearsal] [--json]" };
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(opts.input, "utf8"));
  } catch (err) {
    return { code: 1, output: `Falha ao ler entrada: ${err.message}` };
  }
  const report = auditCutoverBatch(parsed, opts);
  const output = opts.json
    ? `${JSON.stringify(report, null, 2)}\n`
    : `PM-102/PM-100: ${report.ok ? "PASS" : "FAIL"} | total=${report.total} v2=${report.summary.v2Valid} v1_legado=${report.summary.v1LegacyAllowed} rejeitados=${report.summary.rejected} vazamentos_ensaio=${report.summary.rehearsalLeaks}\n`;
  return { code: report.ok ? 0 : 1, output, report };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const res = runCli(process.argv.slice(2));
  process.stdout.write(res.output);
  process.exit(res.code);
}
