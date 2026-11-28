#!/usr/bin/env node
/**
 * @file Gate de orçamento de tamanho do shell PWA e tempo de boot em Slow 3G (LAN-23).
 *
 * Analisa `SHELL_ASSETS` em `client/sw.js` e os recursos críticos referenciados em
 * `client/index.html` sem usar `eval`, medindo bytes brutos e comprimidos via `zlib.gzipSync`.
 *
 * Modelo Slow 3G (`750 kbps` downlink, `400 ms` RTT):
 * - Boot crítico: `2` RTTs (`1` RTT HTML + `1` RTT paralelo de CSS/JS = `800 ms`) + `(gzipBytes * 8 / 750_000) * 1000` ms.
 * - Precache completo: `1` RTT de lote (`400 ms`) + `(gzipBytes * 8 / 750_000) * 1000` ms.
 *
 * Uso:
 *   node scripts/shell-budget-check.mjs
 *   node scripts/shell-budget-check.mjs --json
 *   node scripts/shell-budget-check.mjs --max-raw-bytes 2800000 --max-gzip-bytes 900000 --max-boot-ms 3000
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Orçamentos padrão derivados da linha de base real + margem segura contra regressões.
 * Corte v7.175: o teto subiu ao medido (raw 3 077 170 B, gzip 988 464 B). Os 45 arquivos que entraram
 * (41 módulos que o shell já importava por import estático, entre eles `availability-metrics`, `render/ajuda-teste`,
 * `render/voxpedia`, `app/home-bsky-manager` e `app/lazy-module`; o `boot-frame-guard.js` que o index.html carrega;
 * e 3 folhas de estilo do index.html) já existiam e eram pedidos à rede sob demanda; só faltavam no precache, então
 * a tela falhava offline. Sem código novo; o teto segue o medido, não é meta.
 */
export const DEFAULT_BUDGETS = Object.freeze({
  maxRawBytes: 3_085_000,
  maxGzipBytes: 992_000,
  maxBootMs: 3_000,
});

/** Parâmetros do perfil simulado Slow 3G (LAN-23). */
export const SLOW_3G_PROFILE = Object.freeze({
  name: "Slow 3G",
  downlinkBps: 750_000,
  rttMs: 400,
});

const CATEGORY_ORDER = ["js", "css", "html", "vendor", "icons/media", "other"];
const MEDIA_EXTENSIONS = new Set([
  ".png", ".svg", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".ico",
  ".woff", ".woff2", ".ttf", ".otf", ".mp3", ".ogg", ".wav", ".mp4", ".webm",
]);

/**
 * Localiza o índice do `]` que fecha o literal de array iniciado em `openIdx`.
 * Ignora conteúdo dentro de strings e comentários JS para evitar `eval`.
 * @param {string} src Código-fonte JavaScript.
 * @param {number} openIdx Índice do `[` de abertura.
 * @returns {number} Índice do `]` de fechamento, ou `-1` se não encontrado.
 */
function findArrayEnd(src, openIdx) {
  let quote = "";
  for (let i = openIdx + 1; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") quote = ch;
    else if (ch === "/" && src[i + 1] === "/") i = jumpLineComment(src, i);
    else if (ch === "/" && src[i + 1] === "*") i = jumpBlockComment(src, i);
    else if (ch === "]") return i;
  }
  return -1;
}

/** Avança até o fim de um comentário de linha. */
function jumpLineComment(src, start) {
  const nl = src.indexOf("\n", start + 2);
  return nl === -1 ? src.length : nl;
}

/** Avança até o fim de um comentário em bloco. */
function jumpBlockComment(src, start) {
  const end = src.indexOf("*/", start + 2);
  return end === -1 ? src.length : end + 1;
}

/** Remove comentários fora de literais de string dentro do corpo de um array. */
function stripComments(body) {
  return body.replace(
    /(['"])(?:\\.|(?!\1)[^\\])*\1|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (match, quote) => (quote ? match : ""),
  );
}

/**
 * Extrai com segurança os caminhos literais de `SHELL_ASSETS` de `sw.js` (sem `eval`).
 * @param {string} swSource Conteúdo textual do Service Worker.
 * @returns {string[]} Lista bruta de entradas declaradas em `SHELL_ASSETS`.
 */
export function extractShellAssets(swSource) {
  const cleanSrc = stripComments(swSource);
  const match = /\b(?:const|let|var)\s+SHELL_ASSETS\s*=\s*\[/.exec(cleanSrc);
  if (!match) throw new Error("SHELL_ASSETS array not found in Service Worker");
  const openIdx = match.index + match[0].length - 1;
  const closeIdx = findArrayEnd(cleanSrc, openIdx);
  if (closeIdx === -1) throw new Error("Unterminated SHELL_ASSETS array in Service Worker");
  const arrayBody = cleanSrc.slice(openIdx + 1, closeIdx);
  const items = [];
  for (const m of arrayBody.matchAll(/(['"])((?:\\.|(?!\1)[^\\])*)\1/g)) {
    items.push(m[2]);
  }
  return items;
}

/**
 * Normaliza uma referência de asset relativo ao diretório `client/`.
 * @param {string} rawEntry Entrada vinda do `sw.js` ou `index.html`.
 * @returns {string} Caminho relativo normalizado com `/` (ex.: `"index.html"`).
 */
export function normalizeAssetPath(rawEntry) {
  const posix = rawEntry.trim().replaceAll("\\", "/").split(/[?#]/)[0];
  if (posix === "" || posix === "./" || posix === "/") return "index.html";
  return posix.replace(/^\.\//, "").replace(/^\/+/, "") || "index.html";
}

/**
 * Classifica um asset nas categorias de orçamento do shell PWA.
 * @param {string} relPath Caminho relativo ao diretório do cliente.
 * @returns {"js" | "css" | "html" | "vendor" | "icons/media" | "other"} Categoria do asset.
 */
export function classifyAssetCategory(relPath) {
  if (/(?:^|\/)vendor(?:\/|$)/i.test(relPath)) return "vendor";
  const ext = path.extname(relPath).toLowerCase();
  if (ext === ".js" || ext === ".mjs") return "js";
  if (ext === ".css") return "css";
  if (ext === ".html" || ext === ".htm") return "html";
  if (MEDIA_EXTENSIONS.has(ext)) return "icons/media";
  return "other";
}

/** Extrai o valor de um atributo HTML de uma tag. */
function readHtmlAttr(tag, attrName) {
  const re = new RegExp(`\\b${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i");
  const match = re.exec(tag);
  return match ? (match[1] ?? match[2] ?? "") : "";
}

/** Verifica se uma URL de tag HTML é externa ou inline (não local). */
function isExternalRef(ref) {
  return /^(?:https?:|\/\/|data:|blob:)/i.test(ref.trim());
}

/** Remove comentários HTML de forma iterativa sem regex multi-caractere. */
function stripHtmlComments(html) {
  let out = html;
  let start = out.indexOf("<!--");
  while (start !== -1) {
    const end = out.indexOf("-->", start + 4);
    out = end === -1 ? out.slice(0, start) : out.slice(0, start) + out.slice(end + 3);
    start = out.indexOf("<!--");
  }
  return out;
}

/**
 * Extrai os assets críticos do boot inicial a partir de `index.html`:
 * `index.html`, `<link rel="stylesheet">` e `<script src="...">` locais.
 * @param {string} indexHtml Conteúdo de `client/index.html`.
 * @returns {string[]} Lista única e ordenada de caminhos relativos ao cliente.
 */
export function extractCriticalBootPaths(indexHtml) {
  const html = stripHtmlComments(indexHtml);
  const refs = ["index.html"];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = readHtmlAttr(m[0], "rel").toLowerCase().split(/\s+/);
    const href = readHtmlAttr(m[0], "href");
    if (rel.includes("stylesheet") && href && !isExternalRef(href)) {
      refs.push(normalizeAssetPath(href));
    }
  }
  for (const m of html.matchAll(/<script\b[^>]*>/gi)) {
    const src = readHtmlAttr(m[0], "src");
    if (src && !isExternalRef(src)) refs.push(normalizeAssetPath(src));
  }
  return [...new Set(refs)];
}

/**
 * Mede bytes brutos e comprimidos (gzip) de um arquivo relativo a `clientDir`.
 * @param {string} clientDir Diretório raiz do cliente.
 * @param {string} relPath Caminho relativo normalizado do asset.
 * @returns {{ path: string, category: string, rawBytes: number, gzipBytes: number, missing: boolean }} Métrica do asset.
 */
export function measureAsset(clientDir, relPath) {
  const category = classifyAssetCategory(relPath);
  const rootAbs = path.resolve(clientDir);
  const fullAbs = path.resolve(rootAbs, relPath);
  if (fullAbs !== rootAbs && !fullAbs.startsWith(`${rootAbs}${path.sep}`)) {
    return { path: relPath, category, rawBytes: 0, gzipBytes: 0, missing: true };
  }
  try {
    const buf = fs.readFileSync(fullAbs);
    return {
      path: relPath,
      category,
      rawBytes: buf.length,
      gzipBytes: zlib.gzipSync(buf).length,
      missing: false,
    };
  } catch (err) {
    if (err?.code === "ENOENT" || err?.code === "EISDIR" || err?.code === "ENOTDIR") {
      return { path: relPath, category, rawBytes: 0, gzipBytes: 0, missing: true };
    }
    throw err;
  }
}

/**
 * Estima o tempo de transferência em Slow 3G (`750 kbps`, `400 ms` RTT).
 * Fórmula: `totalMs = rtts * rttMs + round((gzipBytes * 8 / downlinkBps) * 1000)`.
 * @param {number} gzipBytes Total de bytes comprimidos em gzip.
 * @param {{ rtts?: number, downlinkBps?: number, rttMs?: number }} [options] Parâmetros de rede opcionais.
 * @returns {{ profile: string, downlinkBps: number, rttMs: number, rtts: number, latencyMs: number, transferMs: number, totalMs: number }} Estimativa em ms.
 */
export function estimateSlow3gTransfer(gzipBytes, options = {}) {
  const downlinkBps = options.downlinkBps ?? SLOW_3G_PROFILE.downlinkBps;
  const rttMs = options.rttMs ?? SLOW_3G_PROFILE.rttMs;
  const rtts = options.rtts ?? 1;
  const latencyMs = rtts * rttMs;
  const transferMs = Math.round(((gzipBytes * 8) / downlinkBps) * 1000);
  return {
    profile: SLOW_3G_PROFILE.name,
    downlinkBps,
    rttMs,
    rtts,
    latencyMs,
    transferMs,
    totalMs: latencyMs + transferMs,
  };
}

/** Agrupa os assets presentes por categoria de orçamento. */
function summarizeCategories(assets) {
  const categories = Object.fromEntries(
    CATEGORY_ORDER.map((cat) => [cat, { count: 0, rawBytes: 0, gzipBytes: 0 }]),
  );
  for (const asset of assets) {
    if (asset.missing) continue;
    const bucket = categories[asset.category];
    bucket.count += 1;
    bucket.rawBytes += asset.rawBytes;
    bucket.gzipBytes += asset.gzipBytes;
  }
  return categories;
}

/** Soma bytes brutos/gzip e separa caminhos faltantes de uma lista medida. */
function sumMeasured(measured) {
  let rawBytes = 0;
  let gzipBytes = 0;
  const missingAssets = [];
  for (const item of measured) {
    if (item.missing) missingAssets.push(item.path);
    else {
      rawBytes += item.rawBytes;
      gzipBytes += item.gzipBytes;
    }
  }
  return { rawBytes, gzipBytes, missingAssets };
}

/** Avalia todas as regras de orçamento e retorna a lista de violações. */
function evaluateBudgets(state, budgets) {
  const breaches = [];
  if (state.missingAssets.length > 0) {
    breaches.push(`Missing precache assets (${state.missingAssets.length}): ${state.missingAssets.join(", ")}`);
  }
  if (state.criticalBoot.missingAssets.length > 0) {
    breaches.push(`Missing critical boot assets (${state.criticalBoot.missingAssets.length}): ${state.criticalBoot.missingAssets.join(", ")}`);
  }
  if (state.totals.rawBytes > budgets.maxRawBytes) {
    breaches.push(`Raw precache ${state.totals.rawBytes} B exceeds budget ${budgets.maxRawBytes} B`);
  }
  if (state.totals.gzipBytes > budgets.maxGzipBytes) {
    breaches.push(`Gzip precache ${state.totals.gzipBytes} B exceeds budget ${budgets.maxGzipBytes} B`);
  }
  if (state.criticalBoot.slow3g.totalMs > budgets.maxBootMs) {
    breaches.push(`Critical boot Slow 3G ${state.criticalBoot.slow3g.totalMs} ms exceeds budget ${budgets.maxBootMs} ms`);
  }
  return breaches;
}

/** Seleciona os N assets mais pesados (por bytes brutos, desempate alfabético). */
function selectTopAssets(measured, limit = 10) {
  return [...measured]
    .filter((a) => !a.missing)
    .sort((a, b) => b.rawBytes - a.rawBytes || a.path.localeCompare(b.path))
    .slice(0, limit)
    .map(({ path: p, category, rawBytes, gzipBytes }) => ({ path: p, category, rawBytes, gzipBytes }));
}

/** Constrói a seção de boot crítico a partir de `index.html`. */
function buildCriticalBootReport(clientDir, indexPath) {
  const criticalPaths = extractCriticalBootPaths(fs.readFileSync(indexPath, "utf8"));
  const assets = criticalPaths.map((rel) => measureAsset(clientDir, rel));
  const summary = sumMeasured(assets);
  const rtts = assets.length > 1 ? 2 : 1;
  return {
    assetCount: assets.length,
    assets,
    missingAssets: summary.missingAssets,
    rawBytes: summary.rawBytes,
    gzipBytes: summary.gzipBytes,
    slow3g: estimateSlow3gTransfer(summary.gzipBytes, { rtts }),
  };
}

/** Resolve caminhos e limites padrão da análise. */
function resolveAnalysisConfig(options) {
  const clientDir = path.resolve(options.clientDir ?? path.join(ROOT, "client"));
  return {
    clientDir,
    swPath: path.resolve(options.swPath ?? path.join(clientDir, "sw.js")),
    indexPath: path.resolve(options.indexPath ?? path.join(clientDir, "index.html")),
    topN: options.topN ?? 10,
    budgets: {
      maxRawBytes: options.maxRawBytes ?? DEFAULT_BUDGETS.maxRawBytes,
      maxGzipBytes: options.maxGzipBytes ?? DEFAULT_BUDGETS.maxGzipBytes,
      maxBootMs: options.maxBootMs ?? DEFAULT_BUDGETS.maxBootMs,
    },
  };
}

/**
 * Executa a análise completa do orçamento do shell PWA e boot crítico.
 * @param {{ clientDir?: string, swPath?: string, indexPath?: string, maxRawBytes?: number, maxGzipBytes?: number, maxBootMs?: number, topN?: number }} [options] Configuração da análise.
 * @returns {object} Relatório completo com métricas, categorias, top assets e veredito `ok`.
 */
export function analyzeShellBudget(options = {}) {
  const { clientDir, swPath, indexPath, topN, budgets } = resolveAnalysisConfig(options);
  const rawEntries = extractShellAssets(fs.readFileSync(swPath, "utf8"));
  const uniquePaths = [...new Set(rawEntries.map(normalizeAssetPath))];
  const measured = uniquePaths.map((rel) => measureAsset(clientDir, rel));
  const totals = sumMeasured(measured);
  const report = {
    ok: true,
    clientDir,
    swPath,
    indexPath,
    entryCount: rawEntries.length,
    assetCount: uniquePaths.length,
    missingAssets: totals.missingAssets,
    totals: { rawBytes: totals.rawBytes, gzipBytes: totals.gzipBytes },
    categories: summarizeCategories(measured),
    topAssets: selectTopAssets(measured, topN),
    criticalBoot: buildCriticalBootReport(clientDir, indexPath),
    precacheTransfer: { slow3g: estimateSlow3gTransfer(totals.gzipBytes, { rtts: 1 }) },
    budgets,
    breaches: [],
  };
  report.breaches = evaluateBudgets(report, budgets);
  report.ok = report.breaches.length === 0;
  return report;
}

/** Formata bytes em string legível com KiB/MiB. */
function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${bytes.toLocaleString("en-US")} B (${(bytes / (1024 * 1024)).toFixed(2)} MiB)`;
  return `${bytes.toLocaleString("en-US")} B (${(bytes / 1024).toFixed(1)} KiB)`;
}

/**
 * Formata o relatório do orçamento do shell para saída humana em terminal.
 * @param {object} report Resultado retornado por `analyzeShellBudget`.
 * @returns {string} Texto formatado pronto para `console.log`.
 */
export function formatReport(report) {
  const lines = [
    `PWA Shell Budget Gate (LAN-23): ${report.ok ? "PASS" : "FAIL"}`,
    `Precache: ${report.assetCount} unique assets (${report.entryCount} entries) | Raw: ${formatBytes(report.totals.rawBytes)} (budget ${formatBytes(report.budgets.maxRawBytes)}) | Gzip: ${formatBytes(report.totals.gzipBytes)} (budget ${formatBytes(report.budgets.maxGzipBytes)})`,
    `Critical boot: ${report.criticalBoot.assetCount} assets | Raw: ${formatBytes(report.criticalBoot.rawBytes)} | Gzip: ${formatBytes(report.criticalBoot.gzipBytes)}`,
    `Slow 3G (750 kbps, 400 ms RTT): Critical boot ${report.criticalBoot.slow3g.totalMs} ms (${report.criticalBoot.slow3g.latencyMs} ms RTT + ${report.criticalBoot.slow3g.transferMs} ms xfer, budget ${report.budgets.maxBootMs} ms) | Full precache ${report.precacheTransfer.slow3g.totalMs} ms`,
    "Categories:",
    ...CATEGORY_ORDER.map((cat) => {
      const c = report.categories[cat];
      return `  - ${cat.padEnd(11)} ${String(c.count).padStart(3)} files | Raw: ${formatBytes(c.rawBytes)} | Gzip: ${formatBytes(c.gzipBytes)}`;
    }),
    `Top ${report.topAssets.length} heaviest assets:`,
    ...report.topAssets.map(
      (a, idx) => `  ${String(idx + 1).padStart(2)}. ${a.path} [${a.category}] — ${formatBytes(a.rawBytes)} | Gzip: ${formatBytes(a.gzipBytes)}`,
    ),
  ];
  if (report.breaches.length > 0) {
    lines.push("Breaches:", ...report.breaches.map((b) => `  ! ${b}`));
  }
  return lines.join("\n");
}

/** Lê um argumento numérico inteiro positivo da linha de comando. */
function readPositiveIntArg(argv, index, flag) {
  const raw = argv[index + 1];
  const parsed = Number(raw);
  if (!raw || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Flag ${flag} requires a positive integer value`);
  }
  return parsed;
}

/** Lê um argumento textual não vazio da linha de comando. */
function readStringArg(argv, index, flag) {
  const raw = argv[index + 1];
  if (!raw || raw.startsWith("--")) {
    throw new Error(`Flag ${flag} requires a value`);
  }
  return raw;
}

/**
 * Interpreta os argumentos da CLI do verificador de orçamento do shell.
 * @param {string[]} argv Lista de argumentos sem `node` e sem o caminho do script.
 * @returns {{ json: boolean, maxRawBytes?: number, maxGzipBytes?: number, maxBootMs?: number, clientDir?: string, swPath?: string, indexPath?: string }} Opções interpretadas.
 */
export function parseCliArgs(argv) {
  const opts = { json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") opts.json = true;
    else if (arg === "--max-raw-bytes") opts.maxRawBytes = readPositiveIntArg(argv, i++, arg);
    else if (arg === "--max-gzip-bytes") opts.maxGzipBytes = readPositiveIntArg(argv, i++, arg);
    else if (arg === "--max-boot-ms") opts.maxBootMs = readPositiveIntArg(argv, i++, arg);
    else if (arg === "--client-dir") opts.clientDir = readStringArg(argv, i++, arg);
    else if (arg === "--sw") opts.swPath = readStringArg(argv, i++, arg);
    else if (arg === "--index") opts.indexPath = readStringArg(argv, i++, arg);
    else throw new Error(`Unknown CLI argument: ${arg}`);
  }
  return opts;
}

/**
 * Ponto de entrada da CLI: executa a análise e imprime JSON ou resumo legível.
 * @param {string[]} [argv] Argumentos da linha de comando.
 * @returns {number} Código de saída (`0` se aprovado, `1` se reprovado).
 */
export function main(argv = process.argv.slice(2)) {
  const opts = parseCliArgs(argv);
  const report = analyzeShellBudget(opts);
  console.log(opts.json ? JSON.stringify(report, null, 2) : formatReport(report));
  return report.ok ? 0 : 1;
}

const isEntry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  process.exitCode = main();
}
