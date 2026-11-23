#!/usr/bin/env node
/**
 * PM-73 + CODE-02 — Agregador local de testes de campo no celular (5 min) e origens de leitura (`read_origin`).
 *
 * Opera 100% offline sem telemetria central. Só valores de listas fechadas chegam à saída:
 * SO/navegador viram "Família + versão principal", o aparelho vira classe (celular/tablet/desktop),
 * ids de passo são os do roteiro e redes/origens são fixas; texto livre digitado nunca é emitido.
 * Produz resumo em JSON ou Markdown para a retrospectiva do piloto/beta.
 *
 * Uso: node scripts/mobile-field-report.mjs --input <relatos.json> [--format md|json] [--out <arquivo>]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const READ_ORIGIN_KEYS = Object.freeze(["cache", "p2p", "relay", "gateway", "unknown"]);
const ALLOWED_NETWORKS = new Set(["wifi", "5g", "4g", "3g", "2g", "offline", "unknown"]);
const KNOWN_STEP_IDS = new Set([
  "open_pwa", "install_a2hs", "create_identity", "backup_check",
  "publish_post", "offline_reload", "reconnect_status", "export_diag",
]);
const OS_FAMILIES = Object.freeze({
  android: "Android", ipados: "iPadOS", ios: "iOS", windows: "Windows",
  macos: "macOS", linux: "Linux", chromeos: "ChromeOS",
});
const BROWSER_FAMILIES = Object.freeze({
  chrome: "Chrome", safari: "Safari", firefox: "Firefox", edge: "Edge",
  opera: "Opera", samsung: "Samsung Internet",
});

/**
 * Converte em inteiro não negativo, ou 0 se inválido.
 * @param {unknown} value Valor bruto.
 * @returns {number}
 */
function nonNegInt(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Limpa um rótulo (sem quebras de linha, com tamanho máximo), ou usa o valor de reserva.
 * @param {unknown} value Valor bruto.
 * @param {string} [fallback="desconhecido"] Valor de reserva quando o rótulo é inválido ou vazio.
 * @param {number} [maxLen=48] Tamanho máximo, em caracteres.
 * @returns {string}
 */
function cleanLabel(value, fallback = "desconhecido", maxLen = 48) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.replace(/[\r\n\t]+/g, " ").trim().slice(0, maxLen);
  return trimmed || fallback;
}

/**
 * Reduz texto livre a "Família Maior" de uma lista fechada; qualquer outro texto vira o fallback.
 * Só a família conhecida e o número de versão principal sobrevivem (nunca o texto digitado).
 */
function normalizeFamily(value, families) {
  const text = cleanLabel(value, "", 48).toLowerCase();
  const key = Object.keys(families).find((name) => text.startsWith(name));
  if (!key) return "desconhecido";
  const major = /^\D*?(\d{1,3})/.exec(text.slice(key.length));
  return major ? `${families[key]} ${major[1]}` : families[key];
}

/** Classifica o aparelho só por classe (celular/tablet/desktop); o modelo digitado é descartado. */
function normalizeDeviceClass(value) {
  const text = cleanLabel(value, "", 48).toLowerCase();
  if (/^(tablet|ipad)\b/.test(text)) return "tablet";
  if (/^(desktop|notebook|laptop)\b/.test(text)) return "desktop";
  if (/^(phone|celular|smartphone|iphone)\b/.test(text)) return "celular";
  return "desconhecido";
}

/**
 * Calcula a mediana, ou `null` se a lista é vazia.
 * @param {number[]} values Valores.
 * @returns {number|null}
 */
function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Calcula o percentual com uma casa decimal, ou `null` se o total é zero.
 * @param {number} part Parte.
 * @param {number} total Total.
 * @returns {number|null}
 */
function pct(part, total) {
  if (!total) return null;
  return Math.round((part / total) * 1000) / 10;
}

/**
 * Sanitiza a lista de passos do relatório de campo.
 * @param {unknown} rawSteps Lista bruta de passos.
 * @returns {object[]}
 */
function sanitizeSteps(rawSteps) {
  if (!Array.isArray(rawSteps)) return [];
  const out = [];
  for (const step of rawSteps) {
    if (!step || typeof step !== "object") continue;
    const id = cleanLabel(step.id, "", 32);
    if (!KNOWN_STEP_IDS.has(id)) continue;
    const dur = step.durationMs === undefined || step.durationMs === null
      ? null
      : nonNegInt(step.durationMs);
    out.push({ id, ok: step.ok === true, durationMs: dur });
  }
  return out;
}

/**
 * Sanitiza os dados de sinalização do relatório de campo.
 * @param {unknown} raw Objeto bruto.
 * @returns {object}
 */
function sanitizeSignaling(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const connectMs = src.connectMs === undefined || src.connectMs === null
    ? null
    : nonNegInt(src.connectMs);
  return {
    wsAttempts: nonNegInt(src.wsAttempts),
    wsSuccess: nonNegInt(src.wsSuccess),
    nostrAttempts: nonNegInt(src.nostrAttempts),
    nostrSuccess: nonNegInt(src.nostrSuccess),
    connectMs,
  };
}

/**
 * Sanitiza a contagem de origens de leitura, mantendo só as chaves conhecidas.
 * @param {unknown} raw Objeto bruto.
 * @returns {Object<string, number>}
 */
function sanitizeReadOrigins(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const key of READ_ORIGIN_KEYS) out[key] = nonNegInt(src[key]);
  return out;
}

/**
 * Valida e sanitiza um único relato de campo móvel removendo qualquer campo fora da lista segura (zero PII).
 * @param {object} entry Relato bruto exportado localmente.
 * @returns {object} Registro normalizado e livre de PII.
 */
export function sanitizeFieldReport(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error("Relato de campo inválido: esperado objeto.");
  }
  const rawNet = cleanLabel(entry.networkType, "unknown", 16).toLowerCase();
  const networkType = ALLOWED_NETWORKS.has(rawNet) ? rawNet : "unknown";
  const ram = Number(entry.ramGb);
  return {
    deviceClass: normalizeDeviceClass(entry.deviceModel),
    os: normalizeFamily(entry.os, OS_FAMILIES),
    browser: normalizeFamily(entry.browser, BROWSER_FAMILIES),
    ramGb: Number.isFinite(ram) && ram > 0 ? Math.round(ram * 10) / 10 : null,
    networkType,
    steps: sanitizeSteps(entry.steps),
    signaling: sanitizeSignaling(entry.signaling),
    readOrigins: sanitizeReadOrigins(entry.readOrigins),
  };
}

/**
 * Acumula os passos de um relatório no mapa de estatísticas por passo.
 * @param {Map<string, object>} stepMap Mapa por passo (é alterado).
 * @param {object[]} steps Passos sanitizados.
 */
function accumulateSteps(stepMap, steps) {
  for (const step of steps) {
    if (!stepMap.has(step.id)) {
      stepMap.set(step.id, { id: step.id, total: 0, passed: 0, durations: [] });
    }
    const bucket = stepMap.get(step.id);
    bucket.total += 1;
    if (step.ok) bucket.passed += 1;
    if (step.durationMs !== null) bucket.durations.push(step.durationMs);
  }
}

/**
 * Fecha as estatísticas por passo (taxa de sucesso e mediana de duração).
 * @param {Map<string, object>} stepMap Mapa por passo.
 * @returns {object[]}
 */
function finalizeStepStats(stepMap) {
  const out = [];
  for (const item of stepMap.values()) {
    out.push({
      id: item.id,
      passed: item.passed,
      total: item.total,
      passRatePct: pct(item.passed, item.total),
      medianDurationMs: median(item.durations),
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Fecha a contagem de origens de leitura, com o percentual de cada uma.
 * @param {Object<string, number>} counts Contagem por origem.
 * @returns {object}
 */
function finalizeReadOrigins(counts) {
  let totalReads = 0;
  for (const key of READ_ORIGIN_KEYS) totalReads += counts[key];
  const breakdown = {};
  for (const key of READ_ORIGIN_KEYS) {
    breakdown[key] = { count: counts[key], pct: pct(counts[key], totalReads) };
  }
  return { totalReads, breakdown };
}

/**
 * Incrementa o contador de uma chave no objeto.
 * @param {Object<string, number>} map Contadores (é alterado).
 * @param {string} key Chave a incrementar.
 */
function incCount(map, key) {
  map[key] = (map[key] || 0) + 1;
}

/**
 * Acumula um relatório sanitizado nos totais gerais.
 * @param {object} acc Acumulador (é alterado).
 * @param {object} report Relatório sanitizado.
 */
function accumulateReport(acc, report) {
  incCount(acc.byOs, report.os);
  incCount(acc.byBrowser, report.browser);
  incCount(acc.byNetwork, report.networkType);
  accumulateSteps(acc.stepMap, report.steps);
  acc.sig.wsAttempts += report.signaling.wsAttempts;
  acc.sig.wsSuccess += report.signaling.wsSuccess;
  acc.sig.nostrAttempts += report.signaling.nostrAttempts;
  acc.sig.nostrSuccess += report.signaling.nostrSuccess;
  if (report.signaling.connectMs !== null) acc.sig.connectSamples.push(report.signaling.connectMs);
  for (const key of READ_ORIGIN_KEYS) acc.originCounts[key] += report.readOrigins[key];
}

/**
 * Fecha os totais de sinalização (tentativas, sucessos e taxas).
 * @param {object} sig Totais de sinalização acumulados.
 * @returns {object}
 */
function finalizeSignaling(sig) {
  return {
    wsAttempts: sig.wsAttempts,
    wsSuccess: sig.wsSuccess,
    wsSuccessPct: pct(sig.wsSuccess, sig.wsAttempts),
    nostrAttempts: sig.nostrAttempts,
    nostrSuccess: sig.nostrSuccess,
    nostrSuccessPct: pct(sig.nostrSuccess, sig.nostrAttempts),
    medianConnectMs: median(sig.connectSamples),
  };
}

/**
 * Consolida relatos de campo (PM-73), taxas de sinalização (PM-18) e origens de leitura (CODE-02) sem PII.
 * @param {object[]} entries Lista de relatos de campo.
 * @returns {object} Resumo agregado de saúde em dispositivos reais.
 */
export function aggregateFieldReports(entries) {
  if (!Array.isArray(entries)) {
    throw new Error("Entrada inválida: esperado array JSON de relatos.");
  }
  const clean = entries.map(sanitizeFieldReport);
  const acc = {
    stepMap: new Map(),
    byOs: {},
    byBrowser: {},
    byNetwork: {},
    originCounts: { cache: 0, p2p: 0, relay: 0, gateway: 0, unknown: 0 },
    sig: { wsAttempts: 0, wsSuccess: 0, nostrAttempts: 0, nostrSuccess: 0, connectSamples: [] },
  };
  for (const report of clean) accumulateReport(acc, report);
  return {
    totalReports: clean.length,
    byOs: acc.byOs,
    byBrowser: acc.byBrowser,
    byNetwork: acc.byNetwork,
    steps: finalizeStepStats(acc.stepMap),
    signaling: finalizeSignaling(acc.sig),
    readOrigins: finalizeReadOrigins(acc.originCounts),
  };
}

/**
 * Formata percentual, ou `n/d` quando nulo.
 * @param {number|null} value Percentual.
 * @returns {string}
 */
function fmtPct(value) {
  return value === null ? "n/d" : `${value}%`;
}

/**
 * Renderiza o resumo consolidado em Markdown enxuto para retrospectiva do piloto/beta (zero PII).
 * @param {object} summary Resultado de `aggregateFieldReports`.
 * @returns {string} Relatório formatado em Markdown.
 */
export function renderFieldReportMarkdown(summary) {
  const lines = [
    "# Relatório Consolidado — Testes no Celular (PM-73) e Origens de Leitura (CODE-02)",
    "",
    `- **Relatos agregados:** ${summary.totalReports} (zero PII)`,
    `- **Sinalização WebSocket:** ${summary.signaling.wsSuccess}/${summary.signaling.wsAttempts} (${fmtPct(summary.signaling.wsSuccessPct)})`,
    `- **Sinalização Nostr:** ${summary.signaling.nostrSuccess}/${summary.signaling.nostrAttempts} (${fmtPct(summary.signaling.nostrSuccessPct)})`,
    `- **Mediana até conectar:** ${summary.signaling.medianConnectMs === null ? "n/d" : `${summary.signaling.medianConnectMs} ms`}`,
    "",
    "## Passos do roteiro (PM-73)",
    "",
    "| Passo | Aprovados | Taxa | Mediana (ms) |",
    "| :--- | :---: | :---: | :---: |",
  ];
  for (const s of summary.steps) {
    lines.push(`| \`${s.id}\` | ${s.passed}/${s.total} | ${fmtPct(s.passRatePct)} | ${s.medianDurationMs ?? "n/d"} |`);
  }
  lines.push("", `## Origens de leitura (CODE-02 — total: ${summary.readOrigins.totalReads})`, "");
  lines.push("| Origem | Leituras | Participação |", "| :--- | :---: | :---: |");
  for (const key of READ_ORIGIN_KEYS) {
    const item = summary.readOrigins.breakdown[key];
    lines.push(`| \`${key}\` | ${item.count} | ${fmtPct(item.pct)} |`);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Interpreta os argumentos da linha de comando.
 * @param {string[]} argv Argumentos sem `node` e o script.
 * @returns {object}
 */
function parseArgs(argv) {
  const opts = { input: "", format: "md", out: "" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--input") opts.input = argv[++i] || "";
    else if (arg === "--format") opts.format = argv[++i] || "md";
    else if (arg === "--out") opts.out = argv[++i] || "";
  }
  return opts;
}

/**
 * Executa a CLI de agregação local de relatos de campo (PM-73 + CODE-02).
 * @param {string[]} argv Argumentos de linha de comando (sem `node` e caminho do script).
 * @returns {{ code: number, output: string, summary?: object }} Resultado da execução.
 */
export function runCli(argv) {
  const opts = parseArgs(argv);
  if (!opts.input) return { code: 1, output: "Uso: --input <relatos.json> [--format md|json] [--out <arquivo>]" };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(opts.input, "utf8"));
  } catch (err) {
    return { code: 1, output: `Falha ao ler entrada: ${err.message}` };
  }
  try {
    const summary = aggregateFieldReports(parsed);
    const output = opts.format === "json"
      ? `${JSON.stringify(summary, null, 2)}\n`
      : renderFieldReportMarkdown(summary);
    if (opts.out) writeFileSync(opts.out, output, "utf8");
    return { code: 0, output, summary };
  } catch (err) {
    return { code: 1, output: `Falha ao agregar relatos: ${err.message}` };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const res = runCli(process.argv.slice(2));
  process.stdout.write(res.output.endsWith("\n") ? res.output : `${res.output}\n`);
  process.exit(res.code);
}
