#!/usr/bin/env node
/**
 * @file Gerador estático e offline de página pública de status (LAN-07).
 * Consome snapshots JSON de sondas (signaling, nostr, gateway), mantém histórico
 * móvel de N dias (padrão 30) e gera HTML5 autônomo sem dependências externas.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DAY_MS = 86_400_000;
const DEFAULT_DAYS = 30;
const RECENT_DEGRADED_MS = DAY_MS;

const HTML_ENTITIES = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
});

const BANNER_LABELS = Object.freeze({
  operational: "Todos os sistemas operacionais",
  partial_outage: "Instabilidade parcial nos serviços",
  major_outage: "Indisponibilidade grave detectada",
});

const STATUS_LABELS = Object.freeze({
  operational: "Operacional",
  degraded: "Degradado",
  outage: "Indisponível",
});

const GROUP_ORDER = Object.freeze({ signaling: 0, nostr: 1, gateway: 2 });

/**
 * Escapa caracteres HTML especiais de forma determinística (`&`, `<`, `>`, `"`, `'`).
 * @param {*} value Valor a ser escapado antes da interpolação em HTML.
 * @returns {string} String segura para uso em texto e atributos HTML.
 */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => HTML_ENTITIES[ch]);
}

function parseTimestampMs(raw, fieldName) {
  const ms = Date.parse(String(raw ?? ""));
  if (!Number.isFinite(ms)) {
    throw new Error(`Timestamp inválido em ${fieldName}: ${String(raw)}`);
  }
  return ms;
}

function parseLatencyMs(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? Math.round(num) : null;
}

function resolveCheckGroup(item) {
  if (item.group) return String(item.group).trim().toLowerCase();
  return item.relay ? "nostr" : "unknown";
}

function normalizeCheck(raw, index) {
  const item = raw && typeof raw === "object" ? raw : {};
  const url = String(item.url || item.relay || "").trim();
  const id = String(item.id || url || item.name || `check-${index}`).trim();
  const ok = typeof item.ok === "boolean" ? item.ok : Boolean(item.accepted && item.relayed);
  return {
    id,
    name: String(item.name || id).trim(),
    group: resolveCheckGroup(item),
    url,
    ok,
    latencyMs: parseLatencyMs(item.latencyMs),
    detail: String(item.detail ?? item.reason ?? "").trim(),
  };
}

function normalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Snapshot inválido: objeto esperado.");
  }
  const rawTime = snapshot.generatedAt ?? snapshot.at;
  const ts = parseTimestampMs(rawTime, "generatedAt");
  let rawChecks = null;
  if (Array.isArray(snapshot.checks)) {
    rawChecks = snapshot.checks;
  } else if (Array.isArray(snapshot.results)) {
    rawChecks = snapshot.results;
  }
  if (!rawChecks) {
    throw new Error("Snapshot inválido: lista checks ausente.");
  }
  return {
    generatedAt: new Date(ts).toISOString(),
    checks: rawChecks.map((item, idx) => normalizeCheck(item, idx)),
  };
}

/**
 * Valida e incorpora um snapshot de sondas ao histórico, deduplica por timestamp,
 * ordena cronologicamente e remove entradas mais antigas que `maxDays`.
 * @param {Array<object>} history Histórico prévio de snapshots.
 * @param {object} snapshot Novo snapshot de sondas (`{ generatedAt, checks }`).
 * @param {number} [maxDays=30] Janela máxima em dias mantida no histórico.
 * @param {string} [now] Timestamp ISO de referência para o corte temporal.
 * @returns {Array<object>} Histórico consolidado, ordenado e podado.
 */
export function mergeHistorySnapshot(history, snapshot, maxDays = DEFAULT_DAYS, now = undefined) {
  const days = Number(maxDays);
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error(`Janela maxDays inválida: ${String(maxDays)}`);
  }
  const baseList = Array.isArray(history) ? history : [];
  const byTimestamp = new Map();
  for (const item of baseList) {
    const normalized = normalizeSnapshot(item);
    byTimestamp.set(Date.parse(normalized.generatedAt), normalized);
  }
  const incoming = normalizeSnapshot(snapshot);
  byTimestamp.set(Date.parse(incoming.generatedAt), incoming);
  const refMs = now !== undefined && now !== null && now !== ""
    ? parseTimestampMs(now, "now")
    : Math.max(...byTimestamp.keys());
  const cutoffMs = refMs - days * DAY_MS;
  return [...byTimestamp.entries()]
    .filter(([ts]) => ts >= cutoffMs)
    .sort(([a], [b]) => a - b)
    .map(([, entry]) => entry);
}

function percentile(sortedValues, p) {
  if (!sortedValues.length) return null;
  const idx = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil((p / 100) * sortedValues.length) - 1));
  return sortedValues[idx];
}

function classifyServiceStatus(entries, latestOk, newestMs) {
  if (!latestOk) return "outage";
  const recentCutoff = newestMs - RECENT_DEGRADED_MS;
  const hadRecentFailure = entries.some((entry) => !entry.ok && entry.ts >= recentCutoff);
  return hadRecentFailure ? "degraded" : "operational";
}

function summarizeService(entries, newestMs) {
  const latest = entries[entries.length - 1];
  const okEntries = entries.filter((item) => item.ok);
  const latencies = okEntries
    .map((item) => item.latencyMs)
    .filter((ms) => typeof ms === "number" && Number.isFinite(ms))
    .sort((a, b) => a - b);
  const totalChecks = entries.length;
  const okChecks = okEntries.length;
  const uptimePct = totalChecks > 0 ? Number(((okChecks / totalChecks) * 100).toFixed(2)) : 0;
  return {
    id: latest.id,
    name: latest.name,
    group: latest.group,
    url: latest.url,
    status: classifyServiceStatus(entries, latest.ok, newestMs),
    uptimePct,
    totalChecks,
    okChecks,
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
    latestLatencyMs: latest.latencyMs,
    latestDetail: latest.detail,
    lastCheckedAt: latest.generatedAt,
    history: entries.map(({ generatedAt, ok, latencyMs, detail }) => ({ generatedAt, ok, latencyMs, detail })),
  };
}

function determineOverallStatus(services) {
  if (!services.length) return "operational";
  const outages = services.filter((s) => s.status === "outage").length;
  const degraded = services.filter((s) => s.status === "degraded").length;
  if (outages > services.length / 2) return "major_outage";
  if (outages > 0 || degraded > 0) return "partial_outage";
  return "operational";
}

function collectServiceBuckets(snapshots) {
  const buckets = new Map();
  for (const snap of snapshots) {
    const ts = Date.parse(snap.generatedAt);
    for (const check of snap.checks) {
      const list = buckets.get(check.id) || [];
      list.push({ ...check, generatedAt: snap.generatedAt, ts });
      buckets.set(check.id, list);
    }
  }
  return buckets;
}

/**
 * Calcula estatísticas por serviço (uptime %, total/ok, status mais recente, latência p50/p95)
 * e o estado agregado do sistema a partir do histórico de snapshots.
 * @param {Array<object>} history Lista de snapshots cronológicos.
 * @returns {object} Resumo estruturado do sistema e métricas por serviço.
 */
export function computeServiceStats(history) {
  const list = Array.isArray(history) ? history.map((item) => normalizeSnapshot(item)) : [];
  list.sort((a, b) => Date.parse(a.generatedAt) - Date.parse(b.generatedAt));
  const newestIso = list.length ? list[list.length - 1].generatedAt : null;
  const windowStart = list.length ? list[0].generatedAt : null;
  const newestMs = newestIso ? Date.parse(newestIso) : 0;
  const buckets = collectServiceBuckets(list);
  const services = [...buckets.values()]
    .map((entries) => summarizeService(entries, newestMs))
    .sort((a, b) => (GROUP_ORDER[a.group] ?? 9) - (GROUP_ORDER[b.group] ?? 9) || a.name.localeCompare(b.name));
  const totalChecks = services.reduce((acc, s) => acc + s.totalChecks, 0);
  const okChecks = services.reduce((acc, s) => acc + s.okChecks, 0);
  return {
    generatedAt: newestIso,
    windowStart,
    snapshotCount: list.length,
    overallStatus: determineOverallStatus(services),
    summary: {
      totalServices: services.length,
      operational: services.filter((s) => s.status === "operational").length,
      degraded: services.filter((s) => s.status === "degraded").length,
      outage: services.filter((s) => s.status === "outage").length,
      uptimePct: totalChecks > 0 ? Number(((okChecks / totalChecks) * 100).toFixed(2)) : 100,
    },
    services,
  };
}

function aggregateDailyDots(points) {
  const byDay = new Map();
  for (const pt of points) {
    const day = pt.generatedAt.slice(0, 10);
    const bucket = byDay.get(day) || { label: day, ok: 0, total: 0 };
    bucket.total += 1;
    if (pt.ok) bucket.ok += 1;
    byDay.set(day, bucket);
  }
  return [...byDay.values()].slice(-30).map((b) => ({
    label: b.label,
    state: b.ok === b.total ? "ok" : b.ok === 0 ? "fail" : "warn",
    hint: `${b.label}: ${b.ok}/${b.total} OK`,
  }));
}

function renderDotBar(points) {
  const dots = points.length <= 30
    ? points.map((pt) => ({
      state: pt.ok ? "ok" : "fail",
      hint: `${pt.generatedAt} — ${pt.ok ? "OK" : "Falha"}${pt.latencyMs !== null ? ` (${pt.latencyMs} ms)` : ""}`,
    }))
    : aggregateDailyDots(points);
  const spans = dots
    .map((dot) => `<span class="dot dot-${dot.state}" title="${escapeHtml(dot.hint)}"></span>`)
    .join("");
  return `<div class="dot-bar" role="img" aria-label="${escapeHtml(`${dots.length} medições recentes`)}">${spans}</div>`;
}

function formatLatency(p50Ms, p95Ms) {
  const p50 = p50Ms !== null ? `${p50Ms} ms` : "—";
  const p95 = p95Ms !== null ? `${p95Ms} ms` : "—";
  return `${p50} / ${p95}`;
}

function renderServiceRow(svc) {
  const badgeLabel = STATUS_LABELS[svc.status] || svc.status;
  const detailText = svc.latestDetail ? ` · ${svc.latestDetail}` : "";
  return `<tr>
    <td><strong>${escapeHtml(svc.name)}</strong><div class="meta-url"><code>${escapeHtml(svc.url || svc.id)}</code>${escapeHtml(detailText)}</div></td>
    <td><span class="group-tag">${escapeHtml(svc.group)}</span></td>
    <td><span class="badge badge-${escapeHtml(svc.status)}">${escapeHtml(badgeLabel)}</span></td>
    <td>${escapeHtml(`${svc.uptimePct.toFixed(2)}%`)} <span class="muted">(${escapeHtml(`${svc.okChecks}/${svc.totalChecks}`)})</span></td>
    <td>${escapeHtml(formatLatency(svc.p50Ms, svc.p95Ms))}</td>
    <td>${renderDotBar(svc.history)}</td>
  </tr>`;
}

function renderSummaryCards(stats, days) {
  const { summary } = stats;
  const cards = [
    ["Uptime agregado", `${summary.uptimePct.toFixed(2)}%`],
    ["Serviços operacionais", `${summary.operational}/${summary.totalServices}`],
    ["Snapshots analisados", String(stats.snapshotCount)],
    ["Janela móvel", `${days} dias`],
  ];
  return cards
    .map(([label, val]) => `<div class="kpi"><span class="kpi-label">${escapeHtml(label)}</span><strong class="kpi-val">${escapeHtml(val)}</strong></div>`)
    .join("");
}

const STATUS_PAGE_CSS = `
:root{color-scheme:light;--bg:#f8fafc;--card:#ffffff;--ink:#0f172a;--muted:#475569;--border:#cbd5e1;--ok-bg:#dcfce7;--ok-fg:#14532d;--ok-dot:#15803d;--warn-bg:#fef9c3;--warn-fg:#713f12;--warn-dot:#ca8a04;--fail-bg:#fee2e2;--fail-fg:#7f1d1d;--fail-dot:#dc2626}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--ink);line-height:1.5}
.wrap{max-width:1040px;margin:0 auto;padding:24px 16px 48px}header,section{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:16px}
h1{margin:0 0 6px;font-size:1.5rem}h2{margin:0 0 12px;font-size:1.125rem}.sub{margin:0 0 14px;color:var(--muted);font-size:.95rem}
.banner{padding:12px 16px;border-radius:8px;font-weight:700;border:1px solid transparent}.banner-operational{background:var(--ok-bg);color:var(--ok-fg);border-color:#86efac}
.banner-partial_outage{background:var(--warn-bg);color:var(--warn-fg);border-color:#fde047}.banner-major_outage{background:var(--fail-bg);color:var(--fail-fg);border-color:#fca5a5}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}.kpi{padding:12px;border:1px solid var(--border);border-radius:8px;background:var(--bg)}
.kpi-label{display:block;font-size:.82rem;color:var(--muted)}.kpi-val{font-size:1.25rem}
.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:.92rem}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--border);vertical-align:top}
th{color:var(--muted);font-weight:600}.meta-url{font-size:.8rem;color:var(--muted);word-break:break-all;margin-top:2px}
.group-tag,.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:.78rem;font-weight:700}
.group-tag{background:#e2e8f0;color:#1e293b}.badge-operational{background:var(--ok-bg);color:var(--ok-fg)}.badge-degraded{background:var(--warn-bg);color:var(--warn-fg)}.badge-outage{background:var(--fail-bg);color:var(--fail-fg)}
.dot-bar{display:flex;gap:3px;align-items:center;flex-wrap:wrap;min-width:110px}.dot{width:8px;height:18px;border-radius:2px;display:inline-block}
.dot-ok{background:var(--ok-dot)}.dot-warn{background:var(--warn-dot)}.dot-fail{background:var(--fail-dot)}.muted{color:var(--muted);font-size:.82rem}
footer{text-align:center;color:var(--muted);font-size:.85rem;margin-top:16px}`;

function renderServicesTable(services) {
  const rowsHtml = services.length
    ? services.map((svc) => renderServiceRow(svc)).join("\n")
    : `<tr><td colspan="6" class="muted">Nenhum serviço registrado neste histórico.</td></tr>`;
  return [
    `<div class="table-wrap"><table>`,
    `<thead><tr><th>Serviço</th><th>Grupo</th><th>Status</th><th>Uptime</th><th>Latência p50 / p95</th><th>Histórico</th></tr></thead>`,
    `<tbody>${rowsHtml}</tbody>`,
    `</table></div>`,
  ].join("");
}

function renderStatusHeader(title, subtitle, overallStatus) {
  const bannerText = BANNER_LABELS[overallStatus] || overallStatus;
  return [
    `<header>`,
    `<h1>${escapeHtml(title)}</h1>`,
    `<p class="sub">${escapeHtml(subtitle)}</p>`,
    `<div class="banner banner-${escapeHtml(overallStatus)}" role="status">${escapeHtml(bannerText)}</div>`,
    `</header>`,
  ].join("");
}

/**
 * Renderiza uma página HTML5 estática, acessível (WCAG AA) e 100% autônoma
 * com resumo de disponibilidade, latências e barras históricas por serviço.
 * @param {object} stats Estatísticas computadas por `computeServiceStats`.
 * @param {object} [meta={}] Metadados de renderização (`title`, `days`, `subtitle`).
 * @returns {string} Documento HTML5 completo e sanitizado.
 */
export function renderStatusHtml(stats, meta = {}) {
  const title = meta.title || "Vox — Status dos Serviços";
  const subtitle = meta.subtitle || "Painel estático gerado offline a partir de sondas de conectividade (signaling, Nostr e gateways).";
  const days = Number.isFinite(Number(meta.days)) ? Number(meta.days) : DEFAULT_DAYS;
  const updatedText = stats.generatedAt || "Sem medições registradas";
  const mainBody = [
    `<section aria-labelledby="resumo-heading"><h2 id="resumo-heading">Resumo da janela (${escapeHtml(String(days))} dias)</h2><div class="kpis">${renderSummaryCards(stats, days)}</div></section>`,
    `<section aria-labelledby="servicos-heading"><h2 id="servicos-heading">Serviços monitorados</h2>${renderServicesTable(stats.services)}</section>`,
  ].join("");
  return [
    `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${escapeHtml(title)}</title><style>${STATUS_PAGE_CSS}</style></head>`,
    `<body><div class="wrap">${renderStatusHeader(title, subtitle, stats.overallStatus)}`,
    `<main>${mainBody}</main>`,
    `<footer>Último snapshot: ${escapeHtml(updatedText)} · Página estática offline (zero scripts externos)</footer>`,
    `</div></body></html>`,
    "",
  ].join("\n");
}

function parseCliArgs(argv) {
  const opts = { probes: "", history: "", out: "", days: DEFAULT_DAYS, now: "" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--probes") opts.probes = argv[++i] || "";
    else if (arg === "--history") opts.history = argv[++i] || "";
    else if (arg === "--out") opts.out = argv[++i] || "";
    else if (arg === "--days") opts.days = Number(argv[++i]);
    else if (arg === "--now") opts.now = argv[++i] || "";
  }
  if (!opts.probes || !opts.out) {
    throw new Error("Uso: node scripts/generate-status-page.mjs --probes <json> --out <html-path> [--history <json>] [--days 30] [--now <iso>]");
  }
  return opts;
}

function readOptionalHistory(filePath) {
  if (!filePath) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
}

function writeTextFile(filePath, content) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

/**
 * Executa a CLI de geração da página de status em modo 100% offline.
 * @param {Array<string>} [argv=process.argv.slice(2)] Argumentos de linha de comando.
 * @returns {object} Resultado da execução (`stats`, `history`, `outPath`, `historyPath`).
 */
export function runCli(argv = process.argv.slice(2)) {
  const opts = parseCliArgs(argv);
  const probes = JSON.parse(fs.readFileSync(opts.probes, "utf8"));
  const previousHistory = readOptionalHistory(opts.history);
  const history = mergeHistorySnapshot(previousHistory, probes, opts.days, opts.now || undefined);
  const stats = computeServiceStats(history);
  const html = renderStatusHtml(stats, { days: opts.days });
  if (opts.history) {
    writeTextFile(opts.history, `${JSON.stringify(history, null, 2)}\n`);
  }
  writeTextFile(opts.out, html);
  console.log(`Status: ${stats.overallStatus} | Serviços: ${stats.summary.operational}/${stats.summary.totalServices} | Snapshots: ${stats.snapshotCount} | HTML: ${opts.out}`);
  return { stats, history, outPath: opts.out, historyPath: opts.history || null };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli();
}
