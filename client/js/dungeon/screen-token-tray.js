/**
 * @file Bandeja de tokens do Mestre (SUB-26): lista das fichas da mesa e "Token simples", cada um com "Adicionar ao
 * mapa". Bottom sheet no celular e gaveta à esquerda no desktop (CSS em `dungeon-layout.css`). Só o Mestre vê.
 * Só renderização: o clique é tratado por `tray-add` em `token-tray-actions.js`.
 * @module dungeon/screen-token-tray
 */
import { escapeHtml } from "../shared/html.js";
import { listPartySheets } from "./party-view-model.js";

function sheetName(sheet) {
  return String(sheet.attributes_lww?.name || sheet.name || "Ficha").slice(0, 48) || "Ficha";
}

function renderSheetRow(sheet, onMap) {
  const id = escapeHtml(sheet.character_id);
  const name = escapeHtml(sheetName(sheet));
  const done = onMap.has(sheet.character_id);
  const button = done
    ? `<button type="button" class="dungeon-chip-btn" disabled>No mapa</button>`
    : `<button type="button" class="dungeon-chip-btn" data-dungeon="tray-add" data-tray-kind="sheet" data-sheet-id="${id}" aria-label="Adicionar ${name} ao mapa">Adicionar ao mapa</button>`;
  return `<li class="dungeon-token-tray-row"><span>${name}</span>${button}</li>`;
}

function renderSimpleRow() {
  return `<li class="dungeon-token-tray-row dungeon-token-tray-simple">
      <label for="dungeon-tray-name">Token simples</label>
      <input id="dungeon-tray-name" class="dungeon-input" type="text" maxlength="48" placeholder="Nome (ex.: Goblin)" autocomplete="off" />
      <label class="dungeon-token-tray-check"><input id="dungeon-tray-hidden" type="checkbox" /> Oculto até revelar</label>
      <button type="button" class="dungeon-chip-btn" data-dungeon="tray-add" data-tray-kind="simple">Adicionar ao mapa</button>
    </li>`;
}

/**
 * Bandeja de tokens da Mesa. Vazia para quem não é o Mestre.
 * @param {{viewerRole?: string, campaign?: object, sheet?: object}} state Estado da sessão.
 * @param {{tokens?: object[]}} scene Cena ativa.
 * @returns {string} HTML da bandeja, ou texto vazio para o jogador.
 */
export function renderTokenTray(state, scene) {
  if (state.viewerRole !== "gm") return "";
  const onMap = new Set((scene.tokens || []).map((t) => t.sheetId).filter(Boolean));
  const sheets = listPartySheets(state).filter((s) => s.character_id);
  const rows = sheets.map((s) => renderSheetRow(s, onMap)).join("");
  return `
    <details class="dungeon-token-tray" data-dungeon-details="token-tray" data-token-tray>
      <summary>Tokens</summary>
      <ul class="dungeon-clean-list" aria-label="Bandeja de tokens (só o Mestre)">${rows}${renderSimpleRow()}</ul>
    </details>`;
}
