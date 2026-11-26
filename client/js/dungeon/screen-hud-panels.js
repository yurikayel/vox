/**
 * @file Painéis em meia tela do HUD (spec hud-jogo-v0, §2 e §3): a barra de botões e o painel aberto sobre a metade do
 * tabuleiro. Não é modal (sem `aria-modal`, o mapa segue visível e usável); Esc e o botão Fechar recolhem; no celular o
 * painel vira folha de tela cheia (CSS). O conteúdo reaproveita as telas da ficha e da crônica.
 * @module dungeon/screen-hud-panels
 */
import { escapeHtml } from "../shared/html.js";
import { projectCharacterPools } from "../rpg-sheet-and-lore.js";
import { HUD_PANELS, isHudPanelEnabled } from "./hud-panels.js";
import { renderAbilitiesPanel, renderSheetHero } from "./screen-sheet.js";
import { renderDerivedStrip } from "./screen-sheet-derived.js";
import { renderInventoryPanel } from "./screen-sheet-inventory.js";
import { renderPlayTab } from "./screen-sheet-tabs.js";
import { canViewChronicleEntry, renderChronicleEntry } from "./screen-table-layout.js";

/** Quantas entradas recentes da crônica o painel mostra. */
export const CHRONICLE_LIMIT = 20;

function sheetBody(state) {
  const hp = projectCharacterPools(state.sheet.pools_base, state.sheet.delta_ledger).pools?.hp_current ?? null;
  return `${renderSheetHero(state.sheet)}${renderDerivedStrip(state.sheet, hp)}${renderAbilitiesPanel(state)}`;
}

function mapBody(state, scene) {
  const isGm = state.viewerRole === "gm";
  const floor = (scene?.floors || []).find((f) => f.z === scene.activeFloorZ) || scene?.floors?.[0];
  const tokens = (scene?.tokens || []).filter((t) => (!floor || t.floorZ === floor.z) && (isGm || t.layer === "player"));
  const rows = tokens.map((t) => `<li>${escapeHtml(t.name)} (${escapeHtml(t.x)}, ${escapeHtml(t.y)})</li>`).join("");
  return `<p>${escapeHtml(scene?.name || "Cena")}</p><ul class="dungeon-clean-list">${rows}</ul>`;
}

function chronicleBody(state) {
  const turns = (state.chronicle || []).filter((e) => canViewChronicleEntry(e, state)).slice(-CHRONICLE_LIMIT);
  return `<div class="dungeon-chronicle-list">${turns.map((e) => renderChronicleEntry(e, state)).join("")}</div>`;
}

const BODIES = {
  sheet: (state) => sheetBody(state),
  items: (state) => renderInventoryPanel(state),
  abilities: (state) => renderPlayTab(state.sheet?.sheet_meta?.clickable_actions || []),
  map: (state, scene) => mapBody(state, scene),
  chronicle: (state) => chronicleBody(state),
};

/**
 * Botões da barra de painéis: um por painel, com o estado em `aria-expanded` (e `aria-controls` só com o painel aberto); sem ficha, os que mostram a ficha ficam com `aria-disabled`.
 * @param {object} state Estado da sessão (`hudPanel`).
 * @returns {string} HTML da barra.
 */
export function renderHudPanelButtons(state) {
  const buttons = HUD_PANELS.map((p) => {
    if (!isHudPanelEnabled(state, p.id)) return `<button type="button" class="dungeon-chip-btn" aria-disabled="true" data-panel-id="${p.id}">${p.label}</button>`;
    const open = state.hudPanel === p.id;
    const controls = open ? ` aria-controls="dungeon-hud-panel"` : "";
    return `<button type="button" class="dungeon-chip-btn${open ? " is-selected" : ""}" data-dungeon="hud-op" data-hud-op="panel-open" data-panel-id="${p.id}" aria-expanded="${open}"${controls} aria-keyshortcuts="${p.key.toUpperCase()}">${p.label} <kbd>${p.key.toUpperCase()}</kbd></button>`;
  });
  return `<nav class="dungeon-hud-panel-bar dungeon-chips-row" aria-label="Painéis">${buttons.join("")}</nav>`;
}

/**
 * Painel aberto (meia tela sobre o tabuleiro). Sem painel aberto ou com painel que precisa da ficha e não há, devolve vazio. Os rótulos vêm de constante e não são escapados.
 * @param {object} state Estado da sessão (`hudPanel`, `sheet`).
 * @param {object} [scene] Cena ativa (usada pelo painel Mapa).
 * @returns {string} HTML do painel, ou vazio.
 */
export function renderHudPanel(state, scene) {
  const panel = HUD_PANELS.find((p) => p.id === state?.hudPanel);
  if (!panel || !isHudPanelEnabled(state, panel.id)) return "";
  return `<section id="dungeon-hud-panel" class="dungeon-hud-panel" aria-label="${panel.label}" data-hud-panel="${panel.id}">
    <header class="dungeon-hud-panel-head"><h3 tabindex="-1" data-hud-panel-body>${panel.label}</h3><button type="button" class="dungeon-chip-btn" data-dungeon="hud-op" data-hud-op="panel-close" aria-label="Fechar painel ${panel.label}">Fechar</button></header>
    <div class="dungeon-hud-panel-content">${BODIES[panel.id](state, scene)}</div>
  </section>`;
}
