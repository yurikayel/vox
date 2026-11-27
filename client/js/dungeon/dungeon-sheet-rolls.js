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
 * @returns {string} Fórmula pronta para `recordFormulaRoll`.
 */
export function d20Formula(bonus, label) {
  const n = Math.trunc(Number(bonus)) || 0;
  const sign = n > 0 ? `+${n}` : n < 0 ? String(n) : "";
  return `1d20${sign} # ${label}`;
}

function failRoll(state, message) {
  state.rollError = message;
  return { ok: false, error: message };
}

/**
 * Rola o teste de um atributo da ficha com o modificador derivado do pacote (não o `@atr` de 5e).
 * @param {object} state Estado da sessão.
 * @param {string} abilityKey Id do atributo do pacote (`str`, `dex`, …).
 * @param {object} [opts={}] Opções (`mode`, `randomBytesFn`, `store`).
 * @returns {Promise<object>} Resultado da rolagem, ou `{ ok: false, error }` quando o atributo não existe na ficha.
 */
export async function recordAbilityRoll(state, abilityKey, opts = {}) {
  const key = String(abilityKey || "").toLowerCase();
  const ability = resolveSheetSystem(state.sheet)?.derived.abilities.find((a) => a.id === key);
  if (!ability) return failRoll(state, "Atributo não encontrado nesta ficha.");
  return recordFormulaRoll(state, d20Formula(ability.modifier, `Teste de ${ability.label}`), opts);
}

/**
 * Rola uma perícia do pacote de sistema da ficha, com o bônus derivado (atributo + proficiência + especialização).
 * @param {object} state Estado da sessão.
 * @param {string} skillId Id da perícia no pacote (`acrobacia`, `furtividade`, …).
 * @param {object} [opts={}] Opções (`mode`, `randomBytesFn`, `store`).
 * @returns {Promise<object>} Resultado da rolagem, ou `{ ok: false, error }` quando a perícia não existe na ficha.
 */
export async function recordSkillRoll(state, skillId, opts = {}) {
  const skill = resolveSheetSystem(state.sheet)?.derived.skills.find((s) => s.id === String(skillId || ""));
  if (!skill) return failRoll(state, "Perícia não encontrada nesta ficha.");
  return recordFormulaRoll(state, d20Formula(skill.bonus, `Perícia: ${skill.label}`), opts);
}

/** Tratadores de clique do controlador: `roll-ability` (`data-ability`) e `roll-skill` (`data-skill`). */
export const SHEET_ROLL_HANDLERS = Object.freeze({
  "roll-ability": (state, el, _c, opts) => recordAbilityRoll(state, el.dataset.ability, { store: opts.store }),
  "roll-skill": (state, el, _c, opts) => recordSkillRoll(state, el.dataset.skill, { store: opts.store }),
});
