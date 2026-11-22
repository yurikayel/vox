#!/usr/bin/env node
/**
 * @file PM-105 — Construtor, validador e auditor CLI de links canônicos de retorno do POSSE.
 * Garante URLs `#/t/<topicId>` e `#/c/<communityId>/t/<topicId>` sem credenciais nem rastreadores.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TOKEN_RE = /^[A-Za-z0-9_-]{3,96}$/;
const FORBIDDEN_TOKENS = new Set(["__proto__", "constructor", "prototype"]);
const LOCAL_HTTP_HOSTS = new Set(["127.0.0.1", "localhost"]);
const TRACKING_EXACT = new Set(["fbclid", "gclid", "si", "ref"]);

function isTrackingKey(key) {
  const lower = String(key || "").toLowerCase();
  return lower.startsWith("utm_") || TRACKING_EXACT.has(lower);
}

function isValidToken(value) {
  return typeof value === "string" && TOKEN_RE.test(value) && !FORBIDDEN_TOKENS.has(value);
}

function requireToken(raw, label) {
  if (typeof raw !== "string") {
    throw new TypeError(`${label} deve ser uma string.`);
  }
  const token = raw.trim();
  if (!isValidToken(token)) {
    throw new RangeError(`${label} inválido: esperado padrão ^[A-Za-z0-9_-]{3,96}$.`);
  }
  return token;
}

function parseAndCheckOrigin(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    return { ok: false, reason: "URL ausente ou vazia." };
  }
  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { ok: false, reason: "URL malformada." };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "URL com credenciais embutidas não é permitida." };
  }
  const proto = parsed.protocol.toLowerCase();
  const host = parsed.hostname.toLowerCase();
  const allowedProto = proto === "https:" || (proto === "http:" && LOCAL_HTTP_HOSTS.has(host));
  if (!allowedProto) {
    return { ok: false, reason: `Protocolo não permitido: ${proto}` };
  }
  return { ok: true, parsed };
}

function formatCanonicalBasePath(pathname) {
  const clean = pathname || "/";
  return clean.endsWith("/") ? clean : `${clean}/`;
}

function normalizeAllowedHosts(allowedHosts) {
  if (!allowedHosts) return null;
  const list = [...allowedHosts].map((h) => String(h || "").trim().toLowerCase()).filter(Boolean);
  return list.length > 0 ? new Set(list) : null;
}

function matchesAllowedHost(parsed, hostSet) {
  if (!hostSet) return true;
  return hostSet.has(parsed.hostname.toLowerCase()) || hostSet.has(parsed.host.toLowerCase());
}

function findTrackingKeys(searchParams) {
  return [...searchParams.keys()].filter(isTrackingKey);
}

function splitHashRoute(hash) {
  if (!hash.startsWith("#/")) {
    return { error: "Rota hash canônica deve iniciar com '#/'." };
  }
  const route = hash.slice(1);
  const qIdx = route.indexOf("?");
  if (qIdx === -1) return { pathPart: route, hashQuery: "" };
  return { pathPart: route.slice(0, qIdx), hashQuery: route.slice(qIdx + 1) };
}

function parseCanonicalHashPath(pathPart) {
  const segments = pathPart.slice(1).split("/");
  if (segments.length === 2 && segments[0] === "t" && isValidToken(segments[1])) {
    return { topicId: segments[1], communityId: "" };
  }
  if (segments.length === 4 && segments[0] === "c" && segments[2] === "t") {
    if (isValidToken(segments[1]) && isValidToken(segments[3])) {
      return { communityId: segments[1], topicId: segments[3] };
    }
  }
  return { error: "Rota canônica inválida: esperado '#/t/<topicId>' ou '#/c/<communityId>/t/<topicId>'." };
}

function deleteTrackingKeys(params) {
  for (const key of [...params.keys()]) {
    if (isTrackingKey(key)) params.delete(key);
  }
}

/**
 * Constrói uma URL canônica de retorno POSSE (`#/t/<topicId>` ou `#/c/<communityId>/t/<topicId>`).
 * @param {object} [options={}] Parâmetros de construção da URL.
 * @param {string} options.baseUrl URL base HTTPS (ou HTTP local em `127.0.0.1` / `localhost`).
 * @param {string} options.topicId Identificador seguro do tópico.
 * @param {string} [options.communityId] Identificador seguro opcional da comunidade.
 * @returns {string} URL canônica limpa e sem parâmetros de rastreamento.
 */
export function buildCanonicalReturnUrl(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Opções inválidas para buildCanonicalReturnUrl.");
  }
  const originCheck = parseAndCheckOrigin(options.baseUrl);
  if (!originCheck.ok) {
    throw new TypeError(originCheck.reason);
  }
  const topicId = requireToken(options.topicId, "topicId");
  const hasCommunity = options.communityId !== undefined && options.communityId !== null && String(options.communityId).trim() !== "";
  const communityId = hasCommunity ? requireToken(String(options.communityId), "communityId") : "";
  const basePath = formatCanonicalBasePath(originCheck.parsed.pathname);
  const hash = communityId ? `#/c/${communityId}/t/${topicId}` : `#/t/${topicId}`;
  return `${originCheck.parsed.origin}${basePath}${hash}`;
}

/**
 * Remove parâmetros conhecidos de rastreamento (`utm_*`, `fbclid`, `gclid`, `si`, `ref`) via `URLSearchParams`.
 * @param {string} rawUrl URL de entrada para limpeza.
 * @returns {string} URL com parâmetros de rastreamento removidos.
 */
export function stripTrackingParams(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    throw new TypeError("URL deve ser uma string não vazia.");
  }
  const parsed = new URL(rawUrl.trim());
  deleteTrackingKeys(parsed.searchParams);
  const qIdx = parsed.hash.indexOf("?");
  if (qIdx !== -1) {
    const prefix = parsed.hash.slice(0, qIdx);
    const hashParams = new URLSearchParams(parsed.hash.slice(qIdx + 1));
    deleteTrackingKeys(hashParams);
    const remaining = hashParams.toString();
    parsed.hash = remaining ? `${prefix}?${remaining}` : prefix;
  }
  return parsed.toString();
}

function checkTrackingInUrl(parsed, hashQuery) {
  const trackers = findTrackingKeys(parsed.searchParams);
  if (hashQuery) {
    trackers.push(...findTrackingKeys(new URLSearchParams(hashQuery)));
  }
  if (trackers.length > 0) {
    return `Parâmetros de rastreamento proibidos: ${trackers.join(", ")}`;
  }
  return "";
}

/**
 * Valida uma URL de retorno POSSE quanto a esquema, credenciais, host permitido, rastreadores e rota.
 * @param {string} rawUrl URL candidata para abertura direta no Vox.
 * @param {Iterable<string>} [allowedHosts] Lista opcional de hosts permitidos.
 * @returns {{ ok: boolean, topicId?: string, communityId?: string, normalizedUrl?: string, reason?: string }} Resultado da validação.
 */
export function validateReturnUrl(rawUrl, allowedHosts) {
  const originCheck = parseAndCheckOrigin(rawUrl);
  if (!originCheck.ok) return { ok: false, reason: originCheck.reason };
  const { parsed } = originCheck;
  if (!matchesAllowedHost(parsed, normalizeAllowedHosts(allowedHosts))) {
    return { ok: false, reason: `Host não autorizado: ${parsed.hostname}` };
  }
  const split = splitHashRoute(parsed.hash);
  if (split.error) return { ok: false, reason: split.error };
  const trackingErr = checkTrackingInUrl(parsed, split.hashQuery);
  if (trackingErr) return { ok: false, reason: trackingErr };
  const route = parseCanonicalHashPath(split.pathPart);
  if (route.error) return { ok: false, reason: route.error };
  const basePath = formatCanonicalBasePath(parsed.pathname);
  const hash = route.communityId ? `#/c/${route.communityId}/t/${route.topicId}` : `#/t/${route.topicId}`;
  const out = { ok: true, topicId: route.topicId, normalizedUrl: `${parsed.origin}${basePath}${hash}` };
  if (route.communityId) out.communityId = route.communityId;
  return out;
}

function tryStrip(rawUrl) {
  try {
    return stripTrackingParams(rawUrl);
  } catch {
    return rawUrl;
  }
}

/**
 * Audita um lote de URLs compartilhadas segundo as regras canônicas do PM-105.
 * @param {string[]} urls Lista de URLs a validar.
 * @param {object} [opts={}] Opções da auditoria.
 * @param {Iterable<string>} [opts.allowedHosts] Hosts permitidos.
 * @param {boolean} [opts.stripTracking=false] Se `true`, remove trackers antes de validar.
 * @returns {{ total: number, validCount: number, invalidCount: number, allValid: boolean, results: Array<object> }} Resumo e itens auditados.
 */
export function auditShareBatch(urls, opts = {}) {
  if (!Array.isArray(urls)) {
    throw new TypeError("urls deve ser um array.");
  }
  const allowedHosts = opts?.allowedHosts;
  const shouldStrip = Boolean(opts?.stripTracking);
  const results = urls.map((input) => {
    const candidate = shouldStrip ? tryStrip(input) : input;
    return { input, ...validateReturnUrl(candidate, allowedHosts) };
  });
  const validCount = results.filter((item) => item.ok).length;
  const invalidCount = results.length - validCount;
  return { total: results.length, validCount, invalidCount, allValid: invalidCount === 0, results };
}

function readNextValue(argv, index, flag) {
  const val = argv[index + 1];
  if (!val || val.startsWith("-")) {
    throw new Error(`Falta valor para ${flag}.`);
  }
  return val;
}

function splitHostsList(raw) {
  return String(raw || "").split(",").map((s) => s.trim()).filter(Boolean);
}

function applyArgPair(opts, arg, argv, index) {
  if (arg === "--help" || arg === "-h") return { next: index, key: "help", val: true };
  if (arg === "--json") return { next: index, key: "json", val: true };
  if (arg === "--strip-tracking") return { next: index, key: "stripTracking", val: true };
  if (arg === "--input" || arg === "-i") return { next: index + 1, key: "input", val: readNextValue(argv, index, arg) };
  if (arg.startsWith("--input=")) return { next: index, key: "input", val: arg.slice(8) };
  if (arg === "--out" || arg === "-o") return { next: index + 1, key: "out", val: readNextValue(argv, index, arg) };
  if (arg.startsWith("--out=")) return { next: index, key: "out", val: arg.slice(6) };
  if (arg === "--allowed-hosts") return { next: index + 1, key: "allowedHosts", val: splitHostsList(readNextValue(argv, index, arg)) };
  if (arg.startsWith("--allowed-hosts=")) return { next: index, key: "allowedHosts", val: splitHostsList(arg.slice(16)) };
  throw new Error(`Argumento desconhecido: ${arg}`);
}

function parseCliArgs(argv) {
  const opts = { input: "", out: "", json: false, stripTracking: false, help: false, allowedHosts: null };
  for (let i = 0; i < argv.length; i++) {
    const step = applyArgPair(opts, argv[i], argv, i);
    opts[step.key] = step.val;
    i = step.next;
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
  if (Array.isArray(parsed)) return { urls: parsed, allowedHosts: null };
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.urls)) {
    return { urls: parsed.urls, allowedHosts: parsed.allowedHosts || null };
  }
  throw new TypeError("JSON de entrada deve ser um array de URLs ou objeto { urls: [...] }.");
}

function formatTextReport(report) {
  const lines = [`PM-105 audit: ${report.validCount}/${report.total} válidos (${report.invalidCount} inválidos)`];
  for (const item of report.results) {
    if (!item.ok) lines.push(`FAIL ${String(item.input)} -> ${item.reason}`);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Executa a CLI de auditoria de links de retorno POSSE sobre um arquivo JSON.
 * @param {string[]} [argv=process.argv.slice(2)] Argumentos da linha de comando.
 * @returns {{ report: object|null, output: string, outputPath: string|null }} Resultado da execução.
 */
export function runCli(argv = process.argv.slice(2)) {
  const opts = parseCliArgs(argv);
  if (opts.help) {
    const usage = "Uso: node scripts/posse-return-check.mjs --input <links.json> [--allowed-hosts h1,h2] [--strip-tracking] [--json] [--out <file>]\n";
    process.stdout.write(usage);
    return { report: null, output: usage, outputPath: null };
  }
  if (!opts.input) {
    throw new Error("Parâmetro obrigatório ausente: --input <links.json>.");
  }
  const data = readJsonInput(opts.input);
  const allowedHosts = opts.allowedHosts || data.allowedHosts;
  const report = auditShareBatch(data.urls, { allowedHosts, stripTracking: opts.stripTracking });
  const output = opts.json ? `${JSON.stringify(report, null, 2)}\n` : formatTextReport(report);
  const outputPath = opts.out ? path.resolve(opts.out) : null;
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, output, "utf8");
  } else {
    process.stdout.write(output);
  }
  return { report, output, outputPath };
}

function isMainModule() {
  if (!process.argv[1]) return false;
  const entry = path.resolve(process.argv[1]);
  const self = path.resolve(fileURLToPath(import.meta.url));
  return process.platform === "win32" ? entry.toLowerCase() === self.toLowerCase() : entry === self;
}

if (isMainModule()) {
  try {
    const result = runCli();
    if (result.report && !result.report.allValid) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(`Erro: ${err.message}`);
    process.exitCode = 1;
  }
}
