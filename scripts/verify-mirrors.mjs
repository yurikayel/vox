#!/usr/bin/env node
/**
 * PM-19 — Registro de espelhos que se confere sozinho.
 * Lê o sw.js dos espelhos A e B e compara CACHE_NAME com o repositório.
 *
 * Uso:
 *   node scripts/verify-mirrors.mjs [--offline] [--strict] [--json <path>] [--timeout <ms>]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Extrai o valor de CACHE_NAME do código do Service Worker.
 * @param {string} swSource - Código-fonte do sw.js.
 * @returns {string|null} CACHE_NAME extraído ou null se não encontrado.
 */
export function extractCacheName(swSource) {
  if (typeof swSource !== "string") return null;
  const match = swSource.match(/const\s+CACHE_NAME\s*=\s*["']([^"']+)["']/);
  return match ? match[1] : null;
}

/**
 * Remove crases, asteriscos e espaços extras de células Markdown.
 * @param {string} cell - Texto da célula.
 * @returns {string} Texto limpo.
 */
function cleanCell(cell) {
  return cell.replace(/[`*]/g, "").trim();
}

/**
 * Extrai linhas live da tabela de espelhos em ops-shell-mirrors.md.
 * @param {string} markdown - Conteúdo em markdown contendo a tabela.
 * @returns {Array<{ mirrorId: string, role: string, baseUrl: string, expectedSha: string, expectedCacheName: string, status: string }>}
 */
export function parseMirrorsTable(markdown) {
  if (typeof markdown !== "string") return [];
  const section = markdown.includes("### Tabela de espelhos")
    ? markdown.split("### Tabela de espelhos")[1].split(/\n#{1,3}\s/)[0]
    : markdown;
  const rows = [];
  for (const line of section.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const cols = trimmed.split("|").map(cleanCell);
    if (cols.length < 10) continue;
    const status = cols[8].toLowerCase();
    if (status !== "live") continue;
    rows.push({
      mirrorId: cols[1],
      role: cols[2],
      baseUrl: cols[3],
      expectedSha: cols[4],
      expectedCacheName: cols[5],
      status,
    });
  }
  return rows;
}

/**
 * Compara o estado retornado por um espelho com o CACHE_NAME esperado.
 * @param {object} params
 * @param {string} params.expectedCacheName - Nome do cache esperado.
 * @param {{ mirrorId: string, baseUrl: string }} params.mirror - Metadados do espelho.
 * @param {string|null} [params.remoteSwText] - Código-fonte retornado pelo espelho.
 * @param {number|null} [params.httpStatus] - Status HTTP da resposta.
 * @param {string} [params.reason] - Motivo de erro prévio se houver.
 * @returns {{ mirrorId: string, baseUrl: string, ok: boolean, remoteCacheName: string|null, httpStatus: number|null, reason: string }}
 */
export function compareMirrorState({ expectedCacheName, mirror, remoteSwText, httpStatus, reason }) {
  const base = { mirrorId: mirror.mirrorId, baseUrl: mirror.baseUrl, httpStatus: httpStatus ?? null };
  if (httpStatus !== 200) {
    return { ...base, ok: false, remoteCacheName: null, reason: reason || `HTTP ${httpStatus ?? "erro"}` };
  }
  const remoteCacheName = extractCacheName(remoteSwText || "");
  if (!remoteCacheName) {
    return { ...base, ok: false, remoteCacheName: null, reason: "CACHE_NAME não encontrado no sw.js remoto" };
  }
  if (remoteCacheName !== expectedCacheName) {
    return {
      ...base,
      ok: false,
      remoteCacheName,
      reason: `CACHE_NAME divergente: esperado "${expectedCacheName}", obtido "${remoteCacheName}"`,
    };
  }
  return { ...base, ok: true, remoteCacheName, reason: "ok" };
}

/**
 * Normaliza base_url para garantir sufixo sw.js.
 * @param {string} baseUrl - URL base do espelho.
 * @returns {string} URL completa para sw.js.
 */
function normalizeSwUrl(baseUrl) {
  return baseUrl.endsWith("/") ? `${baseUrl}sw.js` : `${baseUrl}/sw.js`;
}

/**
 * Verifica cada espelho live buscando {baseUrl}sw.js.
 * @param {object} params
 * @param {Array<{ mirrorId: string, baseUrl: string }>} params.mirrors - Lista de espelhos live.
 * @param {string} params.expectedCacheName - Nome de cache esperado.
 * @param {Function} [params.fetchImpl] - Implementação de fetch.
 * @param {number} [params.timeoutMs] - Timeout por requisição em ms.
 * @returns {Promise<{ ok: boolean, expectedCacheName: string, checkedAt: string, results: Array<object> }>}
 */
export async function verifyMirrors({ mirrors, expectedCacheName, fetchImpl = globalThis.fetch, timeoutMs = 8000 }) {
  const results = [];
  for (const mirror of mirrors) {
    const url = normalizeSwUrl(mirror.baseUrl);
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
      const text = await res.text();
      results.push(compareMirrorState({ expectedCacheName, mirror, remoteSwText: text, httpStatus: res.status }));
    } catch (err) {
      results.push(compareMirrorState({ expectedCacheName, mirror, httpStatus: null, reason: err.message || "Falha na requisição" }));
    }
  }
  const ok = results.length > 0 && results.every((r) => r.ok);
  return { ok, expectedCacheName, checkedAt: new Date().toISOString(), results };
}

/**
 * Formata o resumo da verificação remota em Markdown.
 * @param {object} summary - Resumo da verificação.
 * @returns {string} Resumo formatado.
 */
export function formatMarkdownSummary(summary) {
  const total = summary.results.length;
  const passed = summary.results.filter((r) => r.ok).length;
  const lines = [
    "### Verificação de espelhos (PM-19)",
    `**Resultado:** ${summary.ok ? "✓ OK" : "⚠ Divergência detectada"} (${passed}/${total} espelhos conformes)`,
    `**CACHE_NAME esperado:** \`${summary.expectedCacheName}\``,
    "",
    "| mirror_id | base_url | status | remote CACHE_NAME | motivo |",
    "|---|---|---|---|---|",
    ...summary.results.map(
      (r) => `| ${r.mirrorId} | ${r.baseUrl} | ${r.ok ? "ok" : "falha"} | \`${r.remoteCacheName || "—"}\` | ${r.reason} |`
    ),
  ];
  return lines.join("\n");
}

/**
 * Formata o relatório de verificação offline em Markdown.
 * @param {object} report - Resultado de verifyOffline.
 * @returns {string} Relatório formatado.
 */
export function formatOfflineSummary(report) {
  return [
    "### Verificação offline de espelhos (PM-19)",
    `- sw.js CACHE_NAME: \`${report.swCacheName}\``,
    `- release-metadata.json: \`${report.metaCacheName}\` (${report.swMatchesMeta ? "OK" : "DIVERGENTE"})`,
    `- Tabela ops-shell-mirrors.md: ${report.mirrors.length} espelhos live`,
    `- Paridade da tabela com sw.js: ${report.tableInSync ? "OK (em sincronia)" : "Aviso: tabela documenta release anterior"}`,
  ].join("\n");
}

/**
 * Executa conferência offline entre client/sw.js, release-metadata.json e tabela de espelhos.
 * @param {object} [paths]
 * @param {string|URL} [paths.swPath]
 * @param {string|URL} [paths.metaPath]
 * @param {string|URL} [paths.mirrorsPath]
 * @returns {{ ok: boolean, swMatchesMeta: boolean, tableInSync: boolean, swCacheName: string|null, metaCacheName: string|null, mirrors: Array<object>, results: Array<object> }}
 */
export function verifyOffline({ swPath, metaPath, mirrorsPath } = {}) {
  const swUrl = swPath || new URL("../client/sw.js", import.meta.url);
  const metaUrl = metaPath || new URL("../docs/release-metadata.json", import.meta.url);
  const mirrorsUrl = mirrorsPath || new URL("../docs/operations/ops-shell-mirrors.md", import.meta.url);

  const swText = readFileSync(swUrl, "utf8");
  const meta = JSON.parse(readFileSync(metaUrl, "utf8"));
  const mirrorsText = readFileSync(mirrorsUrl, "utf8");

  const swCacheName = extractCacheName(swText);
  const metaCacheName = meta.cache_name || null;
  const mirrors = parseMirrorsTable(mirrorsText);

  const results = mirrors.map((m) =>
    compareMirrorState({
      expectedCacheName: swCacheName,
      mirror: m,
      remoteSwText: `const CACHE_NAME = "${m.expectedCacheName}";`,
      httpStatus: 200,
    })
  );

  const swMatchesMeta = Boolean(swCacheName && swCacheName === metaCacheName);
  const tableInSync = results.length > 0 && results.every((r) => r.ok);
  const ok = swMatchesMeta && mirrors.length > 0;

  return { ok, swMatchesMeta, tableInSync, swCacheName, metaCacheName, mirrors, results };
}

/**
 * Analisa os argumentos da linha de comando.
 * @param {string[]} argv - Vetor de argumentos.
 * @returns {{ offline: boolean, strict: boolean, json: string, timeout: number }}
 */
export function parseArgs(argv) {
  const opts = { offline: false, strict: false, json: "", timeout: 8000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--offline") opts.offline = true;
    else if (a === "--strict") opts.strict = true;
    else if (a === "--json") opts.json = argv[++i] || "";
    else if (a === "--timeout") opts.timeout = Number(argv[++i]) || opts.timeout;
  }
  return opts;
}

/**
 * Executa o CLI do verificador.
 * @param {string[]} [argv] - Argumentos.
 * @returns {Promise<number>} Código de saída.
 */
export async function runCli(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.offline) {
    const report = verifyOffline();
    console.log(formatOfflineSummary(report));
    if (opts.json) writeFileSync(opts.json, JSON.stringify(report, null, 2));
    const code = report.ok && (!opts.strict || report.tableInSync) ? 0 : 1;
    process.exitCode = code;
    return code;
  }

  const sw = readFileSync(new URL("../client/sw.js", import.meta.url), "utf8");
  const expected = extractCacheName(sw);
  const mdText = readFileSync(new URL("../docs/operations/ops-shell-mirrors.md", import.meta.url), "utf8");
  const mirrors = parseMirrorsTable(mdText);
  const summary = await verifyMirrors({ mirrors, expectedCacheName: expected, timeoutMs: opts.timeout });
  const md = formatMarkdownSummary(summary);
  console.log(md);
  if (opts.json) writeFileSync(opts.json, JSON.stringify(summary, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`, { flag: "a" });
  const code = summary.ok ? 0 : 1;
  process.exitCode = code;
  return code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runCli();
}
