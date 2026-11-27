/**
 * @file Painel "Rolagens" do Escudo do Mestre (SUB-23): quem rolou, o quê, o total, o modo e o cadeado, com os filtros
 * Todas e Secretas. Só vista: lê `state.rolls` (o que o SUB-22 grava em `visibility`) e não escreve nada. Os filtros são
 * abas de rádio (o navegador opera pelo teclado e o redesenho preserva a escolhida, como na ficha); os estados vazio e
 * "Reconectando…" usam o cartão de estado compartilhado.
 * @module dungeon/dm-roll-panel
 */
import { escapeHtml } from "../shared/html.js";
import { renderStateCard } from "../shared/state-card.js";

/** Filtros do painel, na ordem em que aparecem. */
export const ROLL_FILTERS = Object.freeze([
  Object.freeze({ id: "todas", label: "Todas", empty: "Nenhuma rolagem ainda." }),
  Object.freeze({ id: "secretas", label: "Secretas", empty: "Nenhuma rolagem secreta ainda." }),
]);

const MODE_LABELS = Object.freeze({ public: "Pública", gm: "Só para o Mestre", blind: "Cega" });
const MAX_ROWS = 50;

/**
 * Filtra o registro de rolagens. "Secretas" são as que os jogadores não veem (`gm` e `blind`); qualquer outro filtro
 * devolve todas.
 * @param {object[]} [entries] Rolagens (`state.rolls`).
 * @param {string} [filter] Id do filtro (`todas` ou `secretas`).
 * @returns {object[]} Rolagens que passam no filtro, na mesma ordem.
 */
export function filterRollLog(entries = [], filter = "todas") {
  const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
  return filter === "secretas" ? list.filter((r) => (r.visibility || "public") !== "public") : list;
}

function rollRow(r) {
  const visibility = r.visibility || "public";
  const lock = visibility === "public" ? "" : `<span aria-hidden="true">🔒</span> `;
  return `<tr><th scope="row">${escapeHtml(r.speaker || "Aventureiro")}</th><td>${escapeHtml(r.label || r.formula || "")}</td><td>${escapeHtml(String(r.total ?? ""))}</td><td>${lock}${escapeHtml(MODE_LABELS[visibility] || MODE_LABELS.public)}</td></tr>`;
}

function renderRollTable(rolls, filter) {
  const rows = filterRollLog(rolls, filter.id).slice(-MAX_ROWS).reverse();
  if (!rows.length) return renderStateCard({ kind: "empty", text: filter.empty });
  return `<table class="sv-rolls-table"><thead><tr><th scope="col">Quem</th><th scope="col">O quê</th><th scope="col">Total</th><th scope="col">Modo</th></tr></thead><tbody>${rows.map(rollRow).join("")}</tbody></table>`;
}

function renderFilterTabs(rolls) {
  const radios = ROLL_FILTERS.map((f, i) => `<input type="radio" class="sv-rolls-input" name="dm-rolls-filter" id="dm-rolls-${f.id}" data-dungeon-tab="dm-rolls-${f.id}"${i === 0 ? " checked" : ""} />`).join("");
  const labels = ROLL_FILTERS.map((f) => `<label class="sv-rolls-label" for="dm-rolls-${f.id}">${f.label}</label>`).join("");
  const panels = ROLL_FILTERS.map((f) => `<div class="sv-rolls-panel is-${f.id}">${renderRollTable(rolls, f)}</div>`).join("");
  return `<div class="sv-rolls-tabs">${radios}<div class="sv-rolls-list" role="group" aria-label="Filtro de rolagens">${labels}</div><div class="sv-rolls-panels">${panels}</div></div>`;
}

/**
 * Painel de rolagens do Escudo do Mestre. Com `state.syncOffline`, mostra só "Reconectando…" (a lista pode estar
 * defasada); sem rolagens, o cartão de vazio do filtro.
 * @param {{rolls?: object[], syncOffline?: boolean}} state Estado da sessão.
 * @returns {string} HTML da seção.
 */
export function renderDmRollPanel(state) {
  const body = state?.syncOffline ? renderStateCard({ kind: "offline", text: "Reconectando…" }) : renderFilterTabs(state?.rolls);
  return `<section class="dungeon-panel sv-rolls" aria-label="Rolagens do Mestre"><span class="dungeon-eyebrow">Só vista</span><h2>Rolagens</h2>${body}</section>`;
}
