/**
 * @file Reservas genéricas da ficha (spec derivados-por-sistema-v0, D8): um recurso do pacote que não é PV (PM do
 * Tormenta20, PF do GURPS) guarda o máximo em `pools_base.<id>_max` e o atual vira a soma das operações do
 * `delta_ledger` com `target_pool` `<id>_current`, limitada entre 0 e o máximo, como o PV. Lógica pura, sem DOM.
 * Fichas antigas, sem o campo, continuam válidas: a reserva simplesmente não existe (máximo 0).
 *
 * @module dungeon/sheet-reserves
 * @see docs/specs/derivados-por-sistema-v0.md
 */
import { projectCharacterPools } from "../rpg-sheet-and-lore.js";

/** Teto do máximo de uma reserva (mesmo teto de quantidade do `.voxchar`). @type {number} */
export const RESERVE_CAP = 9999;

/**
 * Máximo de uma reserva como inteiro de 0 a `RESERVE_CAP`; ausente, negativo ou inválido vale 0.
 * @param {object|null|undefined} poolsBase `pools_base` da ficha.
 * @param {string} id Id do recurso do pacote.
 * @returns {number} Máximo seguro.
 */
export function reserveMax(poolsBase, id) {
  const n = Math.trunc(Number(poolsBase?.[`${id}_max`]));
  return Number.isFinite(n) && n > 0 ? Math.min(n, RESERVE_CAP) : 0;
}

/**
 * Atual de uma reserva: máximo mais a soma dos deltas válidos do livro-razão, entre 0 e o máximo.
 * Delta infinito ou inválido conta como zero; o `min_bound` e o `max_bound_ref` das operações são ignorados.
 * @param {object[]|undefined} ledger `delta_ledger` da ficha.
 * @param {string} id Id do recurso do pacote.
 * @param {number} max Máximo já validado.
 * @returns {number} Valor atual inteiro.
 */
function reserveCurrent(ledger, id, max) {
  const pool = `${id}_current`;
  const sum = (Array.isArray(ledger) ? ledger : []).reduce((acc, op) => {
    const d = Math.trunc(Number(op?.delta));
    return op?.target_pool === pool && Number.isFinite(d) ? acc + d : acc;
  }, 0);
  return Math.max(0, Math.min(max, max + sum));
}

/**
 * Ids das reservas de um pacote: recursos de tipo `pool` que não são PV.
 * @param {object|null|undefined} pack Pacote de sistema.
 * @returns {string[]} Ids (ex.: `mp`, `fp`).
 */
export function reserveIds(pack) {
  return (pack?.resources || []).filter((r) => r.kind === "pool" && r.id !== "hp").map((r) => r.id);
}

/**
 * Valores atuais e máximos dos recursos que a ficha realmente tem: PV (com `hp_max` gravado) e as reservas com máximo
 * acima de zero. Recurso sem máximo não aparece.
 * @param {object|null|undefined} sheet Ficha.
 * @param {object|null|undefined} pack Pacote de sistema da ficha.
 * @returns {Object<string, {cur: number, max: number}>} Mapa por id de recurso.
 */
export function projectReserves(sheet, pack) {
  const out = {};
  const hpMax = Number(sheet?.pools_base?.hp_max);
  const hasHp = (pack?.resources || []).some((r) => r.id === "hp");
  if (hasHp && Number.isFinite(hpMax) && hpMax > 0) {
    const cur = Number(projectCharacterPools(sheet.pools_base, sheet.delta_ledger || []).pools?.hp_current);
    if (Number.isFinite(cur)) out.hp = { cur, max: hpMax };
  }
  for (const id of reserveIds(pack)) {
    const max = reserveMax(sheet?.pools_base, id);
    if (max > 0) out[id] = { cur: reserveCurrent(sheet?.delta_ledger, id, max), max };
  }
  return out;
}

/**
 * Cópia da ficha com o máximo de uma reserva gravado (inteiro de 0 a `RESERVE_CAP`).
 * @param {object} sheet Ficha.
 * @param {string} id Id do recurso do pacote.
 * @param {number} max Máximo desejado.
 * @returns {object} Nova ficha; a original não muda.
 */
export function withReserveMax(sheet, id, max) {
  return { ...sheet, pools_base: { ...sheet.pools_base, [`${id}_max`]: reserveMax({ [`${id}_max`]: max }, id) } };
}
