/**
 * @file PM-23 — Renderização do painel de Modo Assembleia (v0) na aba Governança.
 * Só gera HTML; todo texto de usuário passa por `escapeHtml`. Eventos ficam em `app/assembly-ui.js`.
 *
 * @module render/assembly-panel
 * @see docs/specs/modo-assembleia-v0.md
 * @see client/js/app/assembly-ui.js
 */
import { escapeHtml } from "./util.js";
import { formatPtBrDateTimeFull, parseInstant } from "../shared/date-format.js";
import { nextRitualOccurrence, parseAgendaLines, POST_DECISION_STATUSES } from "../assembly-minutes.js";

const RSVP_CHOICES = [
  ["ciente", "✅ Ciente"],
  ["vou", "🙋 Vou"],
  ["talvez", "🤔 Talvez"],
  ["nao-vou", "❌ Não vou"],
];

const POST_STATUS_LABELS = {
  em_andamento: "Em andamento",
  cumprida: "Cumprida",
  arquivada: "Arquivada",
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
        <p class="desc" style="margin:0.25rem 0 0; font-size:0.875rem;">Pauta assinada, presença via RSVP e ata exportável em Markdown/JSON.</p>
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
 * Renderiza lista de itens da pauta de uma convocação.
 * @param {object} convocacao Post de convocação.
 * @returns {string}
 */
function renderAgendaList(convocacao) {
  const items = parseAgendaLines(convocacao.assemblyAgenda);
  if (!items.length) return "";
  const lis = items.map((item) => `<li>${escapeHtml(item.title)}</li>`).join("");
  return `<ol class="assembly-agenda-list" style="margin:0.5rem 0 0.5rem 1.25rem;">${lis}</ol>`;
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
 * Renderiza cartão individual de uma assembleia.
 * @param {object} item Item montado por `assembly-ui.js`.
 * @param {{isMod?: boolean, canRespond?: boolean, now?: number}} options Permissões.
 * @returns {string}
 */
export function renderAssemblyCard(item, { isMod = false, canRespond = false, now = Date.now() } = {}) {
  const conv = item.convocacao;
  const id = escapeHtml(conv.id);
  const when = parseInstant(conv.eventAt) != null ? formatPtBrDateTimeFull(conv.eventAt) : "";
  const place = conv.eventPlace ? ` · ${escapeHtml(conv.eventPlace)}` : "";
  const ritual = nextRitualOccurrence(conv.eventAt, conv.ritualRule, now);
  const statusLabel = item.decisionStatus ? POST_STATUS_LABELS[item.decisionStatus] || item.decisionStatus : "";
  return `<article class="card assembly-card" data-assembly-card="${id}" style="padding:0.85rem; margin-top:0.75rem;">
    <h4 style="margin:0 0 0.25rem;">${escapeHtml(conv.title)}</h4>
    ${when ? `<p class="desc" style="margin:0;">Quando: ${escapeHtml(when)}${place}</p>` : ""}
    ${ritual ? `<p class="desc" style="margin:0.2rem 0 0;">🔁 ${escapeHtml(ritual.label)}</p>` : ""}
    ${statusLabel ? `<p class="desc" style="margin:0.2rem 0 0;"><strong>Andamento:</strong> ${escapeHtml(statusLabel)}</p>` : ""}
    ${renderAgendaList(conv)}
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
    : `<p class="desc" style="margin:0.5rem 0 0;">Nenhuma assembleia convocada nesta comunidade ainda.</p>`;
  return `<div class="assembly-panel" data-community-id="${escapeHtml(communityId)}">
    <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap;">
      <strong>🏛️ Modo Assembleia (v0)</strong>
      <span class="desc">Pauta assinada · RSVP · Ata offline</span>
    </div>
    ${isMod ? renderAssemblyComposer(communityId) : ""}
    <div class="assembly-list">${listHtml}</div>
  </div>`;
}
