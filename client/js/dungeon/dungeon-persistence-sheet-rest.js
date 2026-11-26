/**
 * @file Persistência de condições, Exaustão, Dados de Vida e descansos na ficha. Cada ação monta a ficha nova
 * (`system_choices` e, nos descansos, os deltas de PV e espaços de magia no `delta_ledger`) e a grava de uma vez
 * por `SHEET_UPSERT`, para o efeito ser atômico. A matemática está em `system-rest.js`.
 *
 * @module dungeon/dungeon-persistence-sheet-rest
 */
import { projectCharacterPools } from "../rpg-sheet-and-lore.js";
import { rollDiceFormula } from "./dice-engine.js";
import { applySheetResourceDelta } from "./dungeon-state.js";
import { dispatchCampaignOp } from "./dungeon-sync-bridge.js";
import { migrateLegacySheet } from "./system-migrate.js";
import { getSystemPack } from "./system-pack.js";
import { longRestPlan, normalizeRestChoices, shortRestPlan, spendHitDie, toggleCondition } from "./system-rest.js";
import { ensureSheetMeta } from "./vtt-schema.js";
import { getDefaultVttStore } from "./vtt-store.js";

function currentSheet(state) {
  if (!state.sheet) return null;
  const base = migrateLegacySheet(ensureSheetMeta(state.sheet));
  const pack = getSystemPack(base.system?.id);
  return pack ? { base, pack } : null;
}

/** Escolhas com o nível e os atributos vivos da ficha (a fonte única, como em `resolveSheetSystem`). */
function liveChoices(base) {
  const attrs = base.attributes_lww || {};
  return { ...base.system_choices, level: attrs.level ?? base.system_choices?.level, abilities: attrs.abilities ?? base.system_choices?.abilities };
}

function withChoices(base, patch) {
  return { ...base, system_choices: { ...base.system_choices, ...patch } };
}

async function commit(state, sheet, opts) {
  const updated = ensureSheetMeta(sheet);
  return dispatchCampaignOp(state, "SHEET_UPSERT", { sheet: updated, setActive: true }, { store: opts.store || getDefaultVttStore() });
}

/** Acrescenta os deltas ao `delta_ledger` da ficha dada, pelo mesmo caminho dos botões de PV. */
function withLedger(base, deltas, reason) {
  const holder = { sheet: base };
  for (const d of deltas) applySheetResourceDelta(holder, d.pool, d.delta, reason);
  return holder.sheet;
}

/**
 * Liga ou desliga uma condição da ficha.
 * @param {object} state Estado da sessão.
 * @param {string} conditionId Id da condição do pacote.
 * @param {{store?: object}} [opts] Opções.
 * @returns {Promise<object|undefined>} Campanha atualizada (nada sem ficha ou pacote).
 */
export async function toggleSheetCondition(state, conditionId, opts = {}) {
  const cur = currentSheet(state);
  if (!cur) return undefined;
  return commit(state, withChoices(cur.base, { conditions: toggleCondition(cur.pack, cur.base.system_choices, conditionId) }), opts);
}

/**
 * Sobe ou desce a Exaustão em `step` níveis (limitada a 0..máximo do pacote).
 * @param {object} state Estado da sessão.
 * @param {number} step Passo (+1 ou −1).
 * @param {{store?: object}} [opts] Opções.
 * @returns {Promise<object|undefined>} Campanha atualizada.
 */
export async function stepSheetExhaustion(state, step, opts = {}) {
  const cur = currentSheet(state);
  if (!cur) return undefined;
  const { exhaustion } = normalizeRestChoices(cur.pack, cur.base.system_choices);
  const max = cur.pack.formulas.exhaustion.max;
  return commit(state, withChoices(cur.base, { exhaustion: Math.max(0, Math.min(max, exhaustion + Math.trunc(Number(step) || 0))) }), opts);
}

/**
 * Gasta um Dado de Vida: rola o dado digitado pelo jogador, soma o modificador de CON e cura (PV nunca passam do máximo).
 * @param {object} state Estado da sessão.
 * @param {{store?: object, roll?: number}} [opts] Opções; `roll` fixa o resultado do dado (testes).
 * @returns {Promise<object|undefined>} Campanha atualizada; sem Dado de Vida, avisa em `state.rollError` e não grava.
 */
export async function spendSheetHitDie(state, opts = {}) {
  const cur = currentSheet(state);
  if (!cur) return undefined;
  const choices = liveChoices(cur.base);
  const roll = opts.roll ?? rollDiceFormula(`1d${normalizeRestChoices(cur.pack, choices).hitDie}`).total;
  const out = spendHitDie(cur.pack, choices, roll);
  if (!out.ok) { state.rollError = out.error; return undefined; }
  state.rollError = "";
  state.campaignNotice = `Dado de Vida: +${out.heal} PV.`;
  const sheet = out.heal > 0 ? withLedger(cur.base, [{ pool: "hp_current", delta: out.heal }], "Dado de Vida") : cur.base;
  return commit(state, withChoices(sheet, { hitDiceSpent: out.hitDiceSpent }), opts);
}

/**
 * Descanso longo: PV e espaços de magia ao máximo, Dados de Vida de volta, Exaustão −1 e testes contra a morte zerados.
 * @param {object} state Estado da sessão.
 * @param {{store?: object}} [opts] Opções.
 * @returns {Promise<object|undefined>} Campanha atualizada.
 */
export async function longRestSheet(state, opts = {}) {
  const cur = currentSheet(state);
  if (!cur) return undefined;
  const pools = projectCharacterPools(cur.base.pools_base, cur.base.delta_ledger).pools;
  const plan = longRestPlan(cur.pack, liveChoices(cur.base), { pools, base: cur.base.pools_base });
  state.campaignNotice = "Descanso longo concluído.";
  const { hitDiceSpent, exhaustion, deathSaves } = plan.choices;
  return commit(state, withChoices(withLedger(cur.base, plan.deltas, "Descanso longo"), { hitDiceSpent, exhaustion, deathSaves }), opts);
}

/**
 * Descanso curto: os testes contra a morte zeram só se os PV estão acima de 0 (a cura vem de `spendSheetHitDie`).
 * @param {object} state Estado da sessão.
 * @param {{store?: object}} [opts] Opções.
 * @returns {Promise<object|undefined>} Campanha atualizada.
 */
export async function shortRestSheet(state, opts = {}) {
  const cur = currentSheet(state);
  if (!cur) return undefined;
  const hp = projectCharacterPools(cur.base.pools_base, cur.base.delta_ledger).pools.hp_current;
  state.campaignNotice = "Descanso curto concluído.";
  return commit(state, withChoices(cur.base, { deathSaves: shortRestPlan(liveChoices(cur.base), hp).deathSaves }), opts);
}
