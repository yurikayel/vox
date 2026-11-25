/**
 * @file Token ligado à ficha (puro): PV vindos da ficha, indicador "Sua vez" pela iniciativa e
 * alcance/caminho do deslocamento (`speed_ft`) na grade. Não lê nem altera `screen-sheet.js`.
 * @module dungeon/token-ficha
 */
import { projectCharacterPools } from "../rpg-sheet-and-lore.js";

const FEET_TO_METERS = 0.3048;

/**
 * Deslocamento da ficha em pés (`attributes_lww.speed_ft`); `0` sem ficha.
 *
 * @param {object|null|undefined} sheet Ficha do personagem.
 * @returns {number} Deslocamento em pés.
 */
export function sheetSpeedFt(sheet) {
  return Math.max(0, Number(sheet?.attributes_lww?.speed_ft) || 0);
}

/**
 * Converte o deslocamento da ficha em células da grade do piso (`unitMeters` por célula).
 *
 * @param {object|null|undefined} sheet Ficha do personagem.
 * @param {{unitMeters?: number}} [grid={}] Grade do piso.
 * @returns {number} Células que o personagem anda numa ação de movimento.
 */
export function speedInCells(sheet, grid = {}) {
  const unit = Number(grid.unitMeters) > 0 ? Number(grid.unitMeters) : 1.5;
  return Math.floor((sheetSpeedFt(sheet) * FEET_TO_METERS) / unit);
}

/**
 * PV atuais e máximos de um token ligado a uma ficha; sem ficha, devolve os PV do próprio token.
 *
 * @param {object} token Token da cena.
 * @param {object|null|undefined} sheet Ficha ligada (`token.sheetId`).
 * @returns {{hpCurrent: number|null, hpMax: number|null}} PV exibíveis.
 */
export function tokenHp(token, sheet) {
  if (!sheet?.pools_base) return { hpCurrent: token.hpCurrent, hpMax: token.hpMax };
  const pools = projectCharacterPools(sheet.pools_base, sheet.delta_ledger).pools;
  return { hpCurrent: Number(pools.hp_current) || 0, hpMax: Math.max(1, Number(sheet.pools_base.hp_max) || 1) };
}

/**
 * Identificador do token da vez, ou `""` quando não há combate ativo.
 *
 * @param {{active?: boolean, turnIndex?: number, entries?: Array<{tokenId?: string}>}|null|undefined} initiative Iniciativa da campanha.
 * @returns {string} `tokenId` do combatente da vez.
 */
export function activeTurnTokenId(initiative) {
  if (!initiative?.active) return "";
  return String(initiative.entries?.[initiative.turnIndex]?.tokenId || "");
}

/**
 * Caminho em células do token até `target`, andando na diagonal e depois em linha reta (distância de
 * Chebyshev), cortado no alcance. Não considera paredes nem portas.
 *
 * @param {{x: number, y: number}} from Célula de partida.
 * @param {{x: number, y: number}} target Célula escolhida.
 * @param {number} maxCells Alcance em células.
 * @returns {Array<{x: number, y: number}>} Células do caminho, sem a de partida.
 */
export function movementPath(from, target, maxCells) {
  const path = [];
  let { x, y } = from;
  while ((x !== target.x || y !== target.y) && path.length < maxCells) {
    x += Math.sign(target.x - x);
    y += Math.sign(target.y - y);
    path.push({ x, y });
  }
  return path;
}

/**
 * Células alcançáveis (quadrado de raio `maxCells`, dentro do piso, sem a de partida).
 *
 * @param {{x: number, y: number}} from Célula de partida.
 * @param {number} maxCells Alcance em células.
 * @param {{cols: number, rows: number}} bounds Tamanho do piso em células.
 * @returns {Array<{x: number, y: number}>} Células dentro do alcance.
 */
export function reachableCells(from, maxCells, bounds) {
  const out = [];
  for (let y = Math.max(0, from.y - maxCells); y <= Math.min(bounds.rows - 1, from.y + maxCells); y++) {
    for (let x = Math.max(0, from.x - maxCells); x <= Math.min(bounds.cols - 1, from.x + maxCells); x++) {
      if (x !== from.x || y !== from.y) out.push({ x, y });
    }
  }
  return out;
}
