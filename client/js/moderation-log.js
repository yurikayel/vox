/**
 * @file Registro público e agregado de decisões de moderação (PM-31) — base do relatório de transparência.
 *
 * Normaliza ações `mod-action` descartando qualquer campo privado de denúncia (como `reporter` ou `detail` de DM),
 * sumariza totais por tipo de decisão e comunidade em uma janela temporal, e formata o relatório em Markdown
 * legível com contagens locais agregadas e anonimizadas.
 */

import { shortId } from "./short-id.js";
import { findReason } from "./report.js";

/**
 * Limpa o valor para caber numa célula de tabela Markdown.
 * @param {*} value Valor
 * @returns {string} Texto seguro.
 */
function sanitizeCell(value) {
  return String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .trim();
}

/**
 * Dá o rótulo legível do motivo.
 * @param {string} reason Motivo
 * @returns {string} Rótulo.
 */
function formatReasonLabel(reason) {
  const clean = String(reason || "").trim();
  if (!clean) return "—";
  const known = findReason(clean);
  return known ? `${clean} (${known.label})` : clean;
}

/**
 * Extrai o id curto do moderador da ação.
 * @param {object} action Ação
 * @returns {string} Id curto, ou texto vazio.
 */
function extractModeratorShort(action) {
  const raw = String(action.moderator || action.owner || action.author || "").trim();
  return raw ? shortId(raw) : "";
}

/**
 * Normaliza um horário para número positivo.
 * @param {*} rawTs Horário bruto
 * @param {number} [fallback=0] Valor de reserva
 * @returns {number} Horário válido ou o de reserva.
 */
function normalizePositiveTs(rawTs, fallback = 0) {
  const num = Number(rawTs);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

/**
 * Extrai apenas os campos públicos e seguros de uma decisão de moderação (`mod-action`),
 * preservando o moderador em formato curto e descartando `reporter`, `detail` ou textos de DM.
 *
 * @param {object} action Objeto bruto da ação de moderação.
 * @returns {{id: string, action: string, targetId: string, communityId: string, moderator: string, reason: string, ts: number}|null} Entrada normalizada, ou `null` se inválida.
 */
export function normalizeModLogEntry(action) {
  if (!action || typeof action !== "object") return null;
  const actType = String(action.action ?? "").trim();
  const targetId = String(action.targetId || action.target || "").trim();
  if (!actType || !targetId) return null;

  const communityId = String(action.communityId ?? "").trim();
  const moderator = extractModeratorShort(action);
  const reason = String(action.reason || action.rule || "").trim();
  const ts = normalizePositiveTs(action.ts, 0);
  const id = String(action.id || `${actType}:${communityId}:${targetId}:${ts}`).trim();

  return { id, action: actType, targetId, communityId, moderator, reason, ts };
}

/**
 * Diz se a entrada passa nos filtros de comunidade e período.
 * @param {object} entry Entrada
 * @param {string} communityFilter Comunidade
 * @param {number} sinceTs Início (ms)
 * @param {number} untilTs Fim (ms)
 * @returns {boolean} `true` se passa.
 */
function isWithinFilter(entry, communityFilter, sinceTs, untilTs) {
  if (communityFilter && entry.communityId !== communityFilter) return false;
  return entry.ts >= sinceTs && entry.ts <= untilTs;
}

/**
 * Conta as decisões por ação e por comunidade.
 * @param {object[]} entries Entradas
 * @returns {object} Contagens por ação e por comunidade.
 */
function aggregateDecisionCounts(entries) {
  const byAction = {};
  const byCommunity = {};
  for (const entry of entries) {
    byAction[entry.action] = (byAction[entry.action] || 0) + 1;
    const commKey = entry.communityId || "geral";
    byCommunity[commKey] = (byCommunity[commKey] || 0) + 1;
  }
  return { byAction, byCommunity };
}

/**
 * Filtra decisões de moderação por comunidade e janela temporal, deduplica por `id`,
 * ordena da mais recente para a mais antiga e agrega contagens por ação e por comunidade.
 *
 * @param {object[]} [actions=[]] Lista de ações `mod-action`.
 * @param {{communityId?: string, sinceTs?: number, untilTs?: number}} [options={}] Filtros de comunidade e tempo.
 * @returns {{total: number, byAction: Record<string, number>, byCommunity: Record<string, number>, entries: object[]}} Resumo agregado.
 */
export function summarizeModerationDecisions(
  actions = [],
  { communityId = "", sinceTs = 0, untilTs = Infinity } = {},
) {
  const list = Array.isArray(actions) ? actions : [];
  const communityFilter = String(communityId ?? "").trim();
  const seen = new Set();
  const entries = [];

  for (const raw of list) {
    const entry = normalizeModLogEntry(raw);
    if (!entry || seen.has(entry.id)) continue;
    if (!isWithinFilter(entry, communityFilter, sinceTs, untilTs)) continue;
    seen.add(entry.id);
    entries.push(entry);
  }

  entries.sort((a, b) => b.ts - a.ts || a.id.localeCompare(b.id));
  const { byAction, byCommunity } = aggregateDecisionCounts(entries);

  return { total: entries.length, byAction, byCommunity, entries };
}

/**
 * Monta as linhas da tabela de resumo por ação.
 * @param {Object<string, number>} byAction Contagem por ação
 * @returns {string[]} Linhas Markdown.
 */
function renderActionSummaryRows(byAction) {
  const pairs = Object.entries(byAction || {});
  if (!pairs.length) return ["| Nenhuma decisão | 0 |"];
  return pairs.map(([act, count]) => `| ${sanitizeCell(act)} | ${Number(count) || 0} |`);
}

/**
 * Monta as linhas da tabela da trilha de decisões.
 * @param {object[]} entries Entradas
 * @returns {string[]} Linhas Markdown.
 */
function renderDecisionTrailRows(entries) {
  if (!Array.isArray(entries) || !entries.length) {
    return ["| — | — | Nenhuma decisão registrada | — | — | — |"];
  }
  return entries.map((e) => {
    const dateStr = e.ts > 0 ? new Date(e.ts).toISOString() : "—";
    const comm = sanitizeCell(e.communityId || "—");
    const act = sanitizeCell(e.action || "—");
    const target = sanitizeCell(e.targetId || "—");
    const reason = sanitizeCell(formatReasonLabel(e.reason));
    const mod = sanitizeCell(e.moderator || "—");
    return `| ${dateStr} | ${comm} | ${act} | ${target} | ${reason} | ${mod} |`;
  });
}

/**
 * Monta o cabeçalho do relatório de transparência.
 * @param {object} safe Dados do relatório
 * @param {number} generatedAt Geração (ms)
 * @returns {string[]} Linhas Markdown.
 */
function buildReportHeaderLines(safe, generatedAt) {
  const total = Number(safe.total) || 0;
  const lines = [
    "# Relatório de Transparência de Moderação — Vox",
    "",
    `- **Gerado em:** ${sanitizeCell(generatedAt)}`,
    `- **Total de decisões registradas:** ${total}`,
  ];
  if (typeof safe.blockedCount === "number" || typeof safe.mutedCount === "number") {
    const blocked = Number(safe.blockedCount) || 0;
    const muted = Number(safe.mutedCount) || 0;
    lines.push(`- **Filtros locais neste aparelho (contagem anônima):** ${blocked} bloqueado(s), ${muted} silenciado(s)`);
  }
  return lines;
}

/**
 * Formata o resumo de decisões de moderação em um relatório de transparência em Markdown
 * com tabela agregada por ação e trilha datada auditável.
 *
 * @param {object} summary Resumo gerado por `summarizeModerationDecisions` ou `buildLocalModerationTransparencyExport`.
 * @param {{generatedAt?: string}} [options={}] Opções de formatação (`generatedAt` em ISO 8601).
 * @returns {string} Relatório em Markdown.
 */
export function formatModerationLogMarkdown(
  summary,
  { generatedAt = summary?.generatedAt || new Date().toISOString() } = {},
) {
  const safe = summary && typeof summary === "object" ? summary : { total: 0, byAction: {}, entries: [] };
  const lines = [
    ...buildReportHeaderLines(safe, generatedAt),
    "",
    "## Resumo por Ação",
    "",
    "| Ação | Total |",
    "| :--- | ---: |",
    ...renderActionSummaryRows(safe.byAction),
    "",
    "## Trilha de Decisões",
    "",
    "| Data (UTC) | Comunidade | Ação | Alvo | Motivo / Regra | Moderador |",
    "| :--- | :--- | :--- | :--- | :--- | :--- |",
    ...renderDecisionTrailRows(safe.entries),
    "",
  ];
  return lines.join("\n");
}

/**
 * Monta o pacote unificado de transparência de moderação local combinando ações `mod-action`
 * e apenas a contagem agregada/anonimizada das listas pessoais de bloqueio e silenciamento.
 *
 * @param {{localActions?: object[], blockedUsers?: unknown[], mutedUsers?: unknown[], now?: number}} [input={}] Dados locais.
 * @returns {{total: number, byAction: Record<string, number>, byCommunity: Record<string, number>, entries: object[], blockedCount: number, mutedCount: number, generatedAt: string}} Dados consolidados para exportação.
 */
export function buildLocalModerationTransparencyExport({
  localActions = [],
  blockedUsers = [],
  mutedUsers = [],
  now = Date.now(),
} = {}) {
  const summary = summarizeModerationDecisions(localActions);
  const blockedCount = Array.isArray(blockedUsers) ? blockedUsers.length : 0;
  const mutedCount = Array.isArray(mutedUsers) ? mutedUsers.length : 0;
  const ts = normalizePositiveTs(now, Date.now());
  return {
    ...summary,
    blockedCount,
    mutedCount,
    generatedAt: new Date(ts).toISOString(),
  };
}
