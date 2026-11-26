/**
 * @file Ações das reservas PM/PF da ficha própria (spec derivados-por-sistema-v0, D8): gastar ou recuperar pelo
 * `delta_ledger` (relativo, como o PV) e definir o máximo. A autorização de dono é a de sempre: a op passa pelo
 * redutor da campanha (`SHEET_DELTA` e `SHEET_UPSERT`), que só aceita o dono da ficha. Carregado por `import()`.
 *
 * @module dungeon/dungeon-reserve-actions
 * @see docs/specs/derivados-por-sistema-v0.md
 */
import { applySheetResourceDelta } from "./dungeon-state.js";
import { persistSheetDeltaIfActive } from "./dungeon-persistence.js";
import { dispatchCampaignOp } from "./dungeon-sync-bridge.js";
import { projectReserves, reserveIds, withReserveMax } from "./sheet-reserves.js";
import { getSystemPack } from "./system-pack.js";
import { getDefaultVttStore } from "./vtt-store.js";

/** Maior passo de uma ação de gastar ou recuperar, em pontos. @type {number} */
export const RESERVE_STEP_MAX = 99;

function reserveContext(state, id) {
  const pack = getSystemPack(state.sheet?.system?.id);
  if (!pack || !reserveIds(pack).includes(id)) return null;
  const current = projectReserves(state.sheet, pack)[id];
  return current ? { pack, current } : null;
}

/**
 * Gasta (delta negativo) ou recupera (positivo) pontos de uma reserva da ficha própria. O passo é limitado a
 * `RESERVE_STEP_MAX` e ao que cabe entre 0 e o máximo, para o livro-razão não acumular gasto que o atual já não mostra.
 * @param {object} state Estado da sessão.
 * @param {string} id Id do recurso do pacote (`mp`, `fp`).
 * @param {number} delta Variação pedida (inteiro).
 * @param {{store?: object}} [opts] Opções.
 * @returns {Promise<object|null|undefined>} Resultado da persistência; nada se não há reserva, passo ou efeito.
 */
export async function spendReserve(state, id, delta, opts = {}) {
  const ctx = reserveContext(state, id);
  const asked = Math.trunc(Number(delta));
  if (!ctx || !Number.isFinite(asked) || asked === 0) return undefined;
  const step = Math.max(-RESERVE_STEP_MAX, Math.min(RESERVE_STEP_MAX, asked));
  const { cur, max } = ctx.current;
  const applied = Math.max(0, Math.min(max, cur + step)) - cur;
  if (applied === 0) return undefined;
  const label = ctx.pack.resources.find((r) => r.id === id)?.label || id;
  const reason = `${label} ${applied > 0 ? "+" : ""}${applied}`;
  applySheetResourceDelta(state, `${id}_current`, applied, reason);
  return persistSheetDeltaIfActive(state, `${id}_current`, applied, reason, opts.store);
}

/**
 * Define o máximo de uma reserva da ficha própria (inteiro de 0 a 9999) gravando a ficha por `SHEET_UPSERT`.
 * @param {object} state Estado da sessão.
 * @param {string} id Id do recurso do pacote.
 * @param {number|string} value Máximo digitado.
 * @param {{store?: object}} [opts] Opções.
 * @returns {Promise<object|undefined>} Campanha atualizada; nada se o pacote não tem essa reserva.
 */
export async function setReserveMaxFor(state, id, value, opts = {}) {
  const pack = getSystemPack(state.sheet?.system?.id);
  const n = typeof value === "string" ? Number(value.trim() === "" ? NaN : value) : Number(value);
  if (!pack || !reserveIds(pack).includes(id) || !Number.isFinite(n) || n < 0) return undefined;
  const sheet = withReserveMax(state.sheet, id, n);
  return dispatchCampaignOp(state, "SHEET_UPSERT", { sheet, setActive: true }, { store: opts.store || getDefaultVttStore() });
}
