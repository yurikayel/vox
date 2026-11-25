/**
 * @file Painéis de grupo, espólios e salvaguardas do Subversus: só renderização, com os dados de
 * `party-view-model.js`. Sem botões nem ações (elas pedem tratadores novos, fora deste módulo).
 * @module dungeon/screen-party-panels
 */
import { escapeHtml } from "../shared/html.js";
import { buildLootView, buildPartyView, buildSavesView } from "./party-view-model.js";

function partyRow(member) {
  return `<li><strong>${escapeHtml(member.name)}</strong><span class="dungeon-muted">${escapeHtml(member.role)} · nível ${escapeHtml(member.level)} · ${escapeHtml(member.hp)}</span></li>`;
}

/**
 * Painel "Grupo" do Acampamento: quem está na campanha, com classe, nível e PV.
 * @param {object} state Estado da sessão.
 * @returns {string} HTML do painel, ou vazio sem fichas.
 */
export function renderPartyPanel(state) {
  const party = buildPartyView(state);
  if (!party.length) return "";
  return `
    <section class="dungeon-panel" aria-label="Grupo da campanha">
      <div class="dungeon-section-head"><div><span class="dungeon-eyebrow">Quem está na campanha</span><h2>Grupo</h2></div><span class="dungeon-code-tag">${party.length} ${party.length === 1 ? "personagem" : "personagens"}</span></div>
      <ul class="dungeon-clean-list">${party.map(partyRow).join("")}</ul>
    </section>`;
}

function lootHolder(holder) {
  const items = holder.items.map((it) => `${escapeHtml(it.label)} ×${it.qty}${it.equipped ? " (equipado)" : ""}`).join(", ");
  return `<li><strong>${escapeHtml(holder.name)}</strong><span class="dungeon-muted">${items}</span></li>`;
}

/**
 * Painel "Espólios" do Acampamento: o que cada personagem carrega na mochila.
 * @param {object} state Estado da sessão.
 * @returns {string} HTML do painel; sem itens, uma frase dizendo que a mochila do grupo está vazia.
 */
export function renderLootPanel(state) {
  const loot = buildLootView(state);
  const body = loot.holders.length
    ? `<ul class="dungeon-clean-list">${loot.holders.map(lootHolder).join("")}</ul>`
    : `<p class="dungeon-muted">Ninguém do grupo carrega itens ainda.</p>`;
  return `
    <section class="dungeon-panel" aria-label="Espólios do grupo">
      <div class="dungeon-section-head"><div><span class="dungeon-eyebrow">O que o grupo carrega</span><h2>Espólios</h2></div><span class="dungeon-code-tag">${loot.totalItems} ${loot.totalItems === 1 ? "item" : "itens"}</span></div>
      ${body}
    </section>`;
}

function savesRow(row) {
  const cells = row.saves.map((s) => `<td>${escapeHtml(s.text)}</td>`).join("");
  return `<tr><th scope="row">${escapeHtml(row.name)}</th>${cells}</tr>`;
}

/**
 * Painel "Salvaguardas em lote" do Escudo do Mestre: o modificador de cada atributo, por personagem.
 * @param {object} state Estado da sessão.
 * @returns {string} HTML do painel, ou vazio sem fichas.
 */
export function renderSavesPanel(state) {
  const view = buildSavesView(state);
  if (!view.rows.length) return "";
  const head = view.abilities.map((a) => `<th scope="col" title="${escapeHtml(a.label)}">${escapeHtml(a.short)}</th>`).join("");
  return `
    <section class="dungeon-panel" aria-label="Salvaguardas em lote">
      <div class="dungeon-section-head"><div><span class="dungeon-eyebrow">Só neste aparelho</span><h2>Salvaguardas do grupo</h2></div></div>
      <table class="dungeon-saves-table"><thead><tr><th scope="col">Personagem</th>${head}</tr></thead><tbody>${view.rows.map(savesRow).join("")}</tbody></table>
      <p class="dungeon-muted">Mostra só o modificador de cada atributo: a ficha ainda não guarda salvaguardas treinadas.</p>
    </section>`;
}
