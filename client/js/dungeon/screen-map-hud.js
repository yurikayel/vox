/**
 * @file HUD rápido da aba Mapa (spec Subversus VTT v0, §3.1): até 6 atalhos derivados da ficha ativa
 * (`sheet-view-model`), que disparam as mesmas ações do restante da Mesa por `data-dungeon`
 * (tratadas por `ACTION_HANDLERS` em `dungeon-controller-actions.js`). Sem estado próprio.
 * @module dungeon/screen-map-hud
 */
import { escapeHtml } from "../shared/html.js";
import { buildHudShortcuts } from "./sheet-view-model.js";
import { renderHudStatus } from "./screen-hud-status.js";

function renderShortcut(item) {
  if (item.kind === "link") {
    return `<a class="dungeon-chip-btn" data-hud-shortcut="${escapeHtml(item.id)}" href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`;
  }
  const attrs = Object.entries(item.attrs || {}).map(([k, v]) => ` ${k}="${escapeHtml(v)}"`).join("");
  return `<button type="button" class="dungeon-chip-btn" data-hud-shortcut="${escapeHtml(item.id)}" data-dungeon="${escapeHtml(item.action)}"${attrs}>${escapeHtml(item.label)}</button>`;
}

/**
 * Renderiza o HUD rápido (≤ 6 atalhos). Sem ficha ativa, devolve vazio.
 *
 * @param {object} state Estado da sessão (`sheet`).
 * @param {{tokens?: Array<{tokenId: string, sheetId?: string}>}} scene Cena ativa, para achar o token da ficha.
 * @returns {string} HTML do HUD ou string vazia.
 */
export function renderMapHud(state, scene) {
  if (!state?.sheet) return "";
  const own = (scene?.tokens || []).find((t) => t.sheetId && t.sheetId === state.sheet.character_id);
  const items = buildHudShortcuts(state.sheet, { ownTokenId: own?.tokenId });
  const status = renderHudStatus(state, scene);
  if (!items.length) return status;
  return `${status}<nav class="dungeon-hud dungeon-chips-row" aria-label="Atalhos rápidos" data-dungeon-zone="mapHud">${items.map(renderShortcut).join("")}</nav>`;
}
