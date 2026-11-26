/**
 * @file Controles das reservas PM/PF na aba Jogar (spec derivados-por-sistema-v0, D8): atual/máximo, botões de gastar
 * e recuperar, e o campo do máximo. Pacote sem reservas (D&D) não desenha nada. Texto do pacote sempre escapado.
 *
 * @module dungeon/screen-sheet-reserves
 * @see docs/specs/derivados-por-sistema-v0.md
 */
import { escapeHtml } from "../shared/html.js";
import { RESERVE_CAP, projectReserves, reserveIds, reserveMax } from "./sheet-reserves.js";

function spendButton(id, label, delta) {
  const word = delta < 0 ? "Gastar" : "Recuperar";
  return `<button type="button" class="dungeon-chip-btn" data-dungeon="hud-op" data-hud-op="reserve-spend" data-reserve-id="${escapeHtml(id)}" data-delta="${delta}" aria-label="${word} 1 de ${escapeHtml(label)}">${delta < 0 ? "−1" : "+1"}</button>`;
}

function renderReserve(sheet, pack, id) {
  const label = pack.resources.find((r) => r.id === id)?.label || id;
  const now = projectReserves(sheet, pack)[id];
  const max = reserveMax(sheet.pools_base, id);
  const value = now ? `${now.cur}/${now.max}` : "sem máximo";
  const buttons = now ? `${spendButton(id, label, -1)}${spendButton(id, label, 1)}` : "";
  return `<li class="dungeon-reserve" data-reserve="${escapeHtml(id)}"><strong>${escapeHtml(label)}</strong> <span role="status">${value}</span> ${buttons}
    <label class="dungeon-field-mini"><span>Máximo</span><input class="dungeon-input" type="number" inputmode="numeric" min="0" max="${RESERVE_CAP}" step="1" value="${max}" aria-label="Máximo de ${escapeHtml(label)}"></label>
    <button type="button" class="dungeon-chip-btn" data-dungeon="hud-op" data-hud-op="reserve-max" data-reserve-id="${escapeHtml(id)}" aria-label="Definir máximo de ${escapeHtml(label)}">Definir máximo</button></li>`;
}

/**
 * Bloco de reservas da faixa de derivados; vazio quando o pacote não tem reservas.
 * @param {object} sheet Ficha ativa.
 * @param {object} pack Pacote de sistema da ficha.
 * @returns {string} HTML do bloco, ou texto vazio.
 */
export function renderReserveControls(sheet, pack) {
  const ids = reserveIds(pack);
  if (!ids.length) return "";
  return `<h4 class="dungeon-eyebrow">Reservas</h4><ul class="dungeon-clean-list dungeon-reserves">${ids.map((id) => renderReserve(sheet, pack, id)).join("")}</ul>`;
}
