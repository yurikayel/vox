/**
 * @file PM-23 — Renderização do painel de Modo Assembleia (v0) na aba Governança.
 * Só gera HTML; todo texto de usuário passa por `escapeHtml`. Eventos ficam em `app/assembly-ui.js`.
 *
 * @module render/assembly-panel
 * @see docs/specs/modo-assembleia-v0.md
 * @see client/js/app/assembly-ui.js
 */
import { escapeHtml } from "./util.js";
import { renderStateCard } from "../shared/state-card.js";
import { formatPtBrDateTimeFull, parseInstant } from "../shared/date-format.js";
import {
  MAX_BLOCK_REASON_LEN,
  nextRitualOccurrence,
  parseAgendaLines,
  POST_DECISION_STATUSES,
} from "../assembly-minutes.js";
import { isAssemblyVotingOpen } from "../assembly-presence.js";

const RSVP_CHOICES = [
  ["ciente", "✅ Ciente"],
  ["vou", "🙋 Vou"],
  ["talvez", "🤔 Talvez"],
  ["nao-vou", "❌ Não vou"],
];

const VOTE_CHOICES = [
  ["yes", "👍 Sim"],
  ["no", "👎 Não"],
  ["abstain", "⚪ Abstenção"],
  ["block", "🛑 Bloqueio (exige justificativa)"],
];

const POST_STATUS_LABELS = {
  em_andamento: "Em andamento",
  cumprida: "Cumprida",
  arquivada: "Arquivada",
};

const OUTCOME_LABELS = {
  approved: "Aprovada",
  rejected: "Rejeitada",
  blocked: "Bloqueada",
  no_quorum: "Sem quórum",
};

/**
 * Slot inicial inserido na aba Governança da comunidade para o Modo Assembleia (v0).
 * @param {string} communityId Identificador da comunidade.
 * @returns {string} HTML do slot.
 */
export function renderAssemblyEntrySlot(communityId) {
  const id = escapeHtml(communityId);
  return `<section class="card assembly-entry-slot" data-assembly-slot data-community-id="${id}" style="padding:1rem; margin-bottom:1rem;">
    <div style="display:flex; justify-content:space-between; align-items:center; gap:0.75rem; flex-wrap:wrap;">
      <div>
        <strong>🏛️ Modo Assembleia (v0)</strong>
        <p class="desc" style="margin:0.25rem 0 0; font-size:0.875rem;">Pauta assinada, presença assinável, voto com prazo e ata exportável em Markdown/JSON.</p>
      </div>
      <button type="button" class="btn btn-outline btn-sm" data-assembly-action="open" data-community-id="${id}">Abrir painel da assembleia</button>
    </div>
  </section>`;
}

/**
 * Formulário recolhível para moderação publicar convocação + pauta de assembleia.
 * @param {string} communityId Identificador da comunidade.
 * @returns {string} HTML do formulário.
 */
function renderAssemblyComposer(communityId) {
  return `<details class="assembly-composer" style="margin:0.75rem 0;">
    <summary class="btn btn-primary btn-sm">+ Nova convocação com pauta</summary>
    <form class="assembly-form" data-assembly-form="publish" data-community-id="${escapeHtml(communityId)}" style="margin-top:0.75rem; display:grid; gap:0.5rem;">
      <label for="assembly-title">Título da assembleia (8–80 caracteres)</label>
      <input id="assembly-title" name="title" type="text" required minlength="8" maxlength="80" placeholder="Ex.: Assembleia ordinária de novembro" />
      <label for="assembly-agenda">Pauta (um item por linha)</label>
      <textarea id="assembly-agenda" name="assemblyAgenda" rows="3" required placeholder="1. Reforma da quadra&#10;2. Calendário da feira"></textarea>
      <label for="assembly-event-at">Data e hora</label>
      <input id="assembly-event-at" name="eventAt" type="datetime-local" required />
      <label for="assembly-closes-at">Prazo de votação (opcional)</label>
      <input id="assembly-closes-at" name="assemblyClosesAt" type="datetime-local" />
      <label for="assembly-place">Local (opcional)</label>
      <input id="assembly-place" name="eventPlace" type="text" maxlength="80" placeholder="Ex.: Associação de moradores ou link" />
      <label for="assembly-quorum">Quórum mínimo</label>
      <input id="assembly-quorum" name="quorumMin" type="number" min="0" max="9999" value="2" />
      <label><input type="checkbox" name="ritualRule" value="monthly" /> Encontro recorrente mensal</label>
      <p class="error" data-assembly-error hidden></p>
      <button type="submit" class="btn btn-primary btn-sm">Assinar e publicar pauta</button>
    </form>
  </details>`;
}

/**
 * Renderiza seção de presença assinável (`assembly-presence`) com check-in e export.
 * @param {string} assemblyId ID da convocação.
 * @param {{uniqueCount?: number}} presence Resumo de presença.
 * @param {{canRespond?: boolean, myPresence?: boolean}} opts Estado do usuário.
 * @returns {string}
 */
function renderSignedPresenceSection(assemblyId, presence, { canRespond = false, myPresence = false } = {}) {
  const id = escapeHtml(assemblyId);
  const count = Number(presence?.uniqueCount || 0);
  const label = count === 1 ? "1 presente único assinado" : `${count} presentes únicos assinados`;
  const active = myPresence ? " is-active" : "";
  const checkinText = myPresence ? "✓ Presença assinada" : "✍️ Assinar presença";
  const checkinBtn = canRespond
    ? `<button type="button" class="btn btn-outline btn-sm${active}" data-assembly-action="checkin" data-assembly-id="${id}">${checkinText}</button>`
    : "";
  return `<div class="assembly-presence-box" style="margin:0.45rem 0; display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
    <span><strong>Lista de presença:</strong> ${escapeHtml(label)}</span>
    ${checkinBtn}
    <button type="button" class="btn btn-outline btn-sm" data-assembly-action="export-presence-md" data-assembly-id="${id}">📋 Presença (.md)</button>
    <button type="button" class="btn btn-outline btn-sm" data-assembly-action="export-presence-json" data-assembly-id="${id}">📋 Presença (.json)</button>
  </div>`;
}

/**
 * Renderiza formulário de voto de um item de pauta quando o prazo está aberto.
 * @param {string} assemblyId ID da convocação.
 * @param {object} agendaItem Item da pauta apurado.
 * @returns {string}
 */
function renderAgendaVoteForm(assemblyId, agendaItem) {
  const aId = escapeHtml(assemblyId);
  const pId = escapeHtml(agendaItem.id);
  const myChoice = agendaItem.myVote?.choice || "yes";
  const myReason = agendaItem.myVote?.blockReason || "";
  const options = VOTE_CHOICES.map(([val, lbl]) => {
    const selected = myChoice === val ? " selected" : "";
    return `<option value="${val}"${selected}>${lbl}</option>`;
  }).join("");
  return `<form class="assembly-vote-form" data-assembly-form="vote" data-assembly-id="${aId}" data-agenda-id="${pId}" style="margin:0.35rem 0; display:flex; gap:0.35rem; flex-wrap:wrap; align-items:center;">
    <select name="choice" aria-label="Escolha de voto">${options}</select>
    <input name="blockReason" type="text" maxlength="${MAX_BLOCK_REASON_LEN}" value="${escapeHtml(myReason)}" placeholder="Motivo obrigatório se Bloqueio (até 280 chars)" style="flex:1; min-width:12rem;" />
    <button type="submit" class="btn btn-outline btn-sm">Assinar voto</button>
    <p class="error" data-vote-error hidden style="width:100%; margin:0.15rem 0 0;"></p>
  </form>`;
}

/**
 * Renderiza lista de motivos de bloqueio (`blockReason`) de um item da pauta.
 * @param {Array<{voterPubkey: string, reason: string}>} blockReasons Motivos registrados.
 * @returns {string}
 */
function renderBlockReasons(blockReasons = []) {
  if (!blockReasons.length) return "";
  const items = blockReasons.map((br) => `<li><code>${escapeHtml(br.voterPubkey)}</code>: ${escapeHtml(br.reason)}</li>`).join("");
  return `<ul class="assembly-block-reasons" style="margin:0.25rem 0 0.25rem 1.25rem; font-size:0.85rem;">${items}</ul>`;
}

/**
 * Renderiza lista de itens da pauta com contagem de votos e controle de votação.
 * @param {object} convocacao Post de convocação.
 * @param {{agendaItems?: object[], canRespond?: boolean, votingOpen?: boolean}} opts Estado da votação.
 * @returns {string}
 */
function renderAgendaList(convocacao, { agendaItems = [], canRespond = false, votingOpen = false } = {}) {
  const items = agendaItems.length
    ? agendaItems
    : parseAgendaLines(convocacao.assemblyAgenda).map((i) => ({ ...i, counts: null, blockReasons: [] }));
  if (!items.length) return "";
  const lis = items.map((item) => {
    const c = item.counts;
    const countsHtml = c
      ? `<div class="desc" style="font-size:0.85rem;">Votos: Sim ${c.yes} · Não ${c.no} · Abstenção ${c.abstain} · Bloqueio ${c.block}</div>`
      : "";
    const voteHtml = canRespond && votingOpen ? renderAgendaVoteForm(convocacao.id, item) : "";
    return `<li><strong>${escapeHtml(item.title)}</strong>${countsHtml}${renderBlockReasons(item.blockReasons)}${voteHtml}</li>`;
  }).join("");
  const closedNote = !votingOpen ? `<p class="desc" style="margin:0.25rem 0;">⏳ Prazo de votação encerrado.</p>` : "";
  return `<ol class="assembly-agenda-list" style="margin:0.5rem 0 0.5rem 1.25rem;">${lis}</ol>${closedNote}`;
}

/**
 * Renderiza linha de resumo das respostas RSVP (`aviso-resposta`).
 * @param {object|null} tally Contagem retornada por `tallyAvisoResponses`.
 * @returns {string}
 */
function renderRsvpCounts(tally) {
  const counts = tally?.members || {};
  const parts = RSVP_CHOICES
    .filter(([key]) => Number(counts[key] || 0) > 0)
    .map(([key, label]) => `${label} ${Number(counts[key])}`);
  return parts.length
    ? `<p class="assembly-rsvp-counts" style="margin:0.25rem 0;"><strong>Presença / RSVP:</strong> ${parts.join(" · ")}</p>`
    : `<p class="assembly-rsvp-counts desc" style="margin:0.25rem 0;">Sem confirmações assinadas ainda.</p>`;
}

/**
 * Renderiza botões de RSVP reutilizando `aviso-resposta`.
 * @param {string} assemblyId ID da convocação.
 * @param {string} myChoice Escolha atual do usuário.
 * @returns {string}
 */
function renderRsvpButtons(assemblyId, myChoice) {
  const id = escapeHtml(assemblyId);
  const buttons = RSVP_CHOICES.map(([choice, label]) => {
    const active = myChoice === choice ? " is-active" : "";
    return `<button type="button" class="btn btn-outline btn-sm${active}" data-assembly-action="rsvp" data-assembly-id="${id}" data-choice="${choice}">${label}</button>`;
  }).join("");
  return `<div class="assembly-rsvp-actions" role="group" aria-label="Confirmar presença" style="display:flex; gap:0.35rem; flex-wrap:wrap; margin:0.5rem 0;">${buttons}</div>`;
}

/**
 * Renderiza controles de status pós-decisão para moderação.
 * @param {string} assemblyId ID da convocação.
 * @param {string} currentStatus Status atual.
 * @returns {string}
 */
function renderStatusControls(assemblyId, currentStatus) {
  const id = escapeHtml(assemblyId);
  const buttons = POST_DECISION_STATUSES.map((status) => {
    const active = currentStatus === status ? " is-active" : "";
    return `<button type="button" class="btn btn-outline btn-sm${active}" data-assembly-action="status" data-assembly-id="${id}" data-status="${status}">${escapeHtml(POST_STATUS_LABELS[status])}</button>`;
  }).join("");
  return `<div class="assembly-status-controls" style="display:flex; gap:0.35rem; flex-wrap:wrap; margin:0.5rem 0;">
    <span class="desc">Status pós-decisão:</span>${buttons}
  </div>`;
}

/**
 * Renderiza linha de prazo e resultado da deliberação.
 * @param {object} conv Convocação.
 * @param {boolean} votingOpen Se a votação está aberta.
 * @param {object|null} voteSummary Apuração de votos.
 * @returns {string}
 */
function renderDeadlineAndOutcome(conv, votingOpen, voteSummary) {
  const closes = parseInstant(conv.assemblyClosesAt) != null ? formatPtBrDateTimeFull(conv.assemblyClosesAt) : "";
  const deadlineHtml = closes
    ? `<p class="desc" style="margin:0.2rem 0 0;"><strong>Votação:</strong> ${votingOpen ? "Aberta até" : "Encerrada em"} ${escapeHtml(closes)}</p>`
    : "";
  const outcomeKey = voteSummary?.overallDecisionStatus || "";
  const showOutcome = outcomeKey && (!votingOpen || Number(voteSummary?.totalVotes || 0) > 0);
  const outcomeHtml = showOutcome
    ? `<p class="desc" style="margin:0.2rem 0 0;"><strong>Deliberação:</strong> ${escapeHtml(OUTCOME_LABELS[outcomeKey] || outcomeKey)}</p>`
    : "";
  return `${deadlineHtml}${outcomeHtml}`;
}

/**
 * Renderiza cabeçalho do cartão com data, local, prazo, ritual e status pós-decisão.
 * @param {object} conv Post de convocação.
 * @param {object} item Item de visão da assembleia.
 * @param {boolean} votingOpen Se a votação está aberta.
 * @param {number} now Instante de referência em ms.
 * @returns {string}
 */
function renderCardHeader(conv, item, votingOpen, now) {
  const when = parseInstant(conv.eventAt) != null ? formatPtBrDateTimeFull(conv.eventAt) : "";
  const place = conv.eventPlace ? ` · ${escapeHtml(conv.eventPlace)}` : "";
  const ritual = nextRitualOccurrence(conv.eventAt, conv.ritualRule, now);
  const statusLabel = item.decisionStatus ? POST_STATUS_LABELS[item.decisionStatus] || item.decisionStatus : "";
  return `<h4 style="margin:0 0 0.25rem;">${escapeHtml(conv.title)}</h4>
    ${when ? `<p class="desc" style="margin:0;">Quando: ${escapeHtml(when)}${place}</p>` : ""}
    ${renderDeadlineAndOutcome(conv, votingOpen, item.voteSummary)}
    ${ritual ? `<p class="desc" style="margin:0.2rem 0 0;">🔁 ${escapeHtml(ritual.label)}</p>` : ""}
    ${statusLabel ? `<p class="desc" style="margin:0.2rem 0 0;"><strong>Andamento (decisionStatus):</strong> ${escapeHtml(statusLabel)}</p>` : ""}`;
}

/**
 * Renderiza cartão individual de uma assembleia.
 * @param {object} item Item montado por `assembly-ui.js`.
 * @param {{isMod?: boolean, canRespond?: boolean, now?: number}} options Permissões.
 * @returns {string}
 */
export function renderAssemblyCard(item, { isMod = false, canRespond = false, now = Date.now() } = {}) {
  const conv = item.convocacao;
  const id = escapeHtml(conv.id);
  const votingOpen = item.votingOpen ?? isAssemblyVotingOpen(conv, now);
  return `<article class="card assembly-card" data-assembly-card="${id}" style="padding:0.85rem; margin-top:0.75rem;">
    ${renderCardHeader(conv, item, votingOpen, now)}
    ${renderAgendaList(conv, { agendaItems: item.voteSummary?.items || [], canRespond, votingOpen })}
    ${renderSignedPresenceSection(conv.id, item.presence, { canRespond, myPresence: item.myPresence })}
    ${renderRsvpCounts(item.tally)}
    ${canRespond ? renderRsvpButtons(conv.id, item.myChoice) : ""}
    ${isMod ? renderStatusControls(conv.id, item.decisionStatus) : ""}
    <div class="assembly-export-actions" style="display:flex; gap:0.4rem; flex-wrap:wrap; margin-top:0.5rem;">
      <button type="button" class="btn btn-outline btn-sm" data-assembly-action="export-md" data-assembly-id="${id}">📄 Exportar ata (.md)</button>
      <button type="button" class="btn btn-outline btn-sm" data-assembly-action="export-json" data-assembly-id="${id}">💾 Exportar ata (.json)</button>
    </div>
  </article>`;
}

/**
 * Renderiza o painel completo do Modo Assembleia (v0).
 * @param {{communityId: string, items: object[], isMod?: boolean, canRespond?: boolean, now?: number}} model Estado do painel.
 * @returns {string} HTML do painel.
 */
export function renderAssemblyPanel({ communityId, items = [], isMod = false, canRespond = false, now = Date.now() }) {
  const listHtml = items.length
    ? items.map((item) => renderAssemblyCard(item, { isMod, canRespond, now })).join("")
    : renderStateCard({ kind: "empty", text: "Nenhuma assembleia convocada nesta comunidade ainda." });
  return `<div class="assembly-panel" data-community-id="${escapeHtml(communityId)}">
    <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap;">
      <strong>🏛️ Modo Assembleia (v0)</strong>
      <span class="desc">Pauta assinada · Presença · Voto · Ata offline</span>
    </div>
    ${isMod ? renderAssemblyComposer(communityId) : ""}
    <div class="assembly-list">${listHtml}</div>
  </div>`;
}
