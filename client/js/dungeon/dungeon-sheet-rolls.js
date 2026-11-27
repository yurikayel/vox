/**
 * @file Testes clicáveis da ficha (atributo e perícia): o bônus vem sempre dos derivados do pacote de sistema
 * (`resolveSheetSystem`), como número literal na fórmula, nunca de `@var` — assim o dado soma o mesmo número que a
 * ficha mostra, em qualquer sistema. A rolagem e o registro na crônica seguem por `recordFormulaRoll`.
 * @module dungeon/dungeon-sheet-rolls
 */
import { recordFormulaRoll } from "./dungeon-persistence.js";
import { resolveSheetSystem } from "./screen-sheet-derived.js";

/**
 * Monta a fórmula de um teste d20 com bônus literal, por exemplo `1d20+4 # Teste de Destreza`.
 * @param {number} bonus Bônus inteiro (pode ser negativo ou zero).
 * @param {string} label Texto da rolagem, mostrado na crônica.
 * @param {boolean} [secret] Rolagem só para o Mestre (prefixo `/gmroll`: só o autor e o Mestre veem).
 * @returns {string} Fórmula pronta para `recordFormulaRoll`.
 */
export function d20Formula(bonus, label, secret = false) {
  const n = Math.trunc(Number(bonus)) || 0;
  const sign = n > 0 ? `+${n}` : n < 0 ? String(n) : "";
  return `${secret ? "/gmroll " : ""}1d20${sign} # ${label}`;
}

/**
 * Rola o teste da ficha, secreto se pedido (`opts.secret`) ou se o chip "Só para o Mestre" está ligado
 * (`state.rollSecret`); o chip desliga depois da rolagem (vale uma vez só). Atributo ou perícia que a ficha não tem
 * falha antes e deixa o chip como estava.
 * @param {object} state Estado da sessão.
 * @param {number} bonus Bônus do teste.
 * @param {string} label Texto da rolagem.
 * @param {object} opts Opções de `recordFormulaRoll` mais `secret`.
 * @returns {Promise<object>} Resultado da rolagem.
 */
async function rollSheetTest(state, bonus, label, opts) {
  const { secret = Boolean(state.rollSecret), ...rest } = opts;
  const result = await recordFormulaRoll(state, d20Formula(bonus, label, secret), rest);
  state.rollSecret = false;
  return result;
}

function failRoll(state, message) {
  state.rollError = message;
  return { ok: false, error: message };
}

/**
 * Rola o teste de um atributo da ficha com o modificador derivado do pacote (não o `@atr` de 5e).
 * @param {object} state Estado da sessão.
 * @param {string} abilityKey Id do atributo do pacote (`str`, `dex`, …).
 * @param {object} [opts={}] Opções (`mode`, `randomBytesFn`, `store`, `secret`).
 * @returns {Promise<object>} Resultado da rolagem, ou `{ ok: false, error }` quando o atributo não existe na ficha.
 */
export async function recordAbilityRoll(state, abilityKey, opts = {}) {
  const key = String(abilityKey || "").toLowerCase();
  const ability = resolveSheetSystem(state.sheet)?.derived.abilities.find((a) => a.id === key);
  if (!ability) return failRoll(state, "Atributo não encontrado nesta ficha.");
  return rollSheetTest(state, ability.modifier, `Teste de ${ability.label}`, opts);
}

/**
 * Rola uma perícia do pacote de sistema da ficha, com o bônus derivado (atributo + proficiência + especialização).
 * @param {object} state Estado da sessão.
 * @param {string} skillId Id da perícia no pacote (`acrobacia`, `furtividade`, …).
 * @param {object} [opts={}] Opções (`mode`, `randomBytesFn`, `store`, `secret`).
 * @returns {Promise<object>} Resultado da rolagem, ou `{ ok: false, error }` quando a perícia não existe na ficha.
 */
export async function recordSkillRoll(state, skillId, opts = {}) {
  const skill = resolveSheetSystem(state.sheet)?.derived.skills.find((s) => s.id === String(skillId || ""));
  if (!skill) return failRoll(state, "Perícia não encontrada nesta ficha.");
  return rollSheetTest(state, skill.bonus, `Perícia: ${skill.label}`, opts);
}

/** Tratadores de clique do controlador: `roll-ability` (`data-ability`), `roll-skill` (`data-skill`) e `roll-secret` (liga/desliga o chip "Só para o Mestre"). */
export const SHEET_ROLL_HANDLERS = Object.freeze({
  "roll-secret": (state) => { state.rollSecret = !state.rollSecret; },
  "roll-ability": (state, el, _c, opts) => recordAbilityRoll(state, el.dataset.ability, { store: opts.store }),
  "roll-skill": (state, el, _c, opts) => recordSkillRoll(state, el.dataset.skill, { store: opts.store }),
});
