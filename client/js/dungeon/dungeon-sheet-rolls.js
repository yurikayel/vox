/**
 * @file Testes clicáveis da ficha (atributo e perícia): o bônus vem sempre dos derivados do pacote de sistema
 * (`resolveSheetSystem`), como número literal na fórmula, nunca de `@var` — assim o dado soma o mesmo número que a
 * ficha mostra, em qualquer sistema. A rolagem e o registro na crônica seguem por `recordFormulaRoll`.
 * @module dungeon/dungeon-sheet-rolls
 */
import { rollableRequest } from "./check-roll-ui.js";
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
 * (`state.rollSecret`); `recordFormulaRoll` desliga o chip (vale uma vez só). Atributo ou perícia que a ficha não tem
 * falha antes e deixa o chip como estava. No painel do HUD o chip é ignorado (e desligado).
 * @param {object} state Estado da sessão.
 * @param {number} bonus Bônus do teste.
 * @param {string} label Texto da rolagem.
 * @param {object} opts Opções de `recordFormulaRoll` mais `secret`.
 * @returns {Promise<object>} Resultado da rolagem.
 */
async function rollSheetTest(state, bonus, label, opts) {
  const { secret = Boolean(state.rollSecret), ...rest } = opts;
  return recordFormulaRoll(state, d20Formula(bonus, label, secret), rest);
}

/** Opções do clique: no painel do HUD o chip não aparece, então ali a rolagem nunca é secreta por ele. */
function clickOpts(el, opts) {
  return { store: opts.store, secret: el.closest?.("[data-hud-panel]") ? false : undefined };
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

/**
 * Rola a perícia ligada a um pedido de teste (`data-request-id`), com o `requestId` gravado na rolagem. O pedido pode
 * pedir rolagem do Mestre (`rollVisibility: "gm"`): então a rolagem sai `gm`. Pedido já revelado, ou que não é do leitor, não rola.
 * O chip "Só para o Mestre" do jogador não é consumido: a rolagem do pedido não o lê, então ele continua como estava,
 * inclusive se a gravação falhar (o chip é devolvido logo depois de lançar, sem esperar a gravação).
 */
async function rollCheckRequest(state, el, opts) {
  const request = rollableRequest(state, el.dataset.requestId);
  if (!request) return failRoll(state, "Este pedido de teste não está mais aberto para você.");
  const chip = state.rollSecret;
  const job = recordSkillRoll(state, request.skillId, { store: opts.store, secret: request.rollVisibility === "gm", requestId: request.requestId });
  // A rolagem desliga o chip de forma síncrona, antes de gravar: restaurar já, sem esperar a gravação, mantém o chip
  // armado mesmo se a gravação falhar, se o jogador mexer nele durante a espera ou se vierem dois pedidos seguidos.
  state.rollSecret = chip;
  return job;
}

/** Tratadores de clique do controlador: `roll-ability` (`data-ability`), `roll-skill` (`data-skill`), `check-roll` (`data-request-id`) e `roll-secret` (liga/desliga o chip "Só para o Mestre"). */
export const SHEET_ROLL_HANDLERS = Object.freeze({
  "check-roll": (state, el, _c, opts) => rollCheckRequest(state, el, opts),
  "roll-secret": (state) => { state.rollSecret = !state.rollSecret; },
  "roll-ability": (state, el, _c, opts) => recordAbilityRoll(state, el.dataset.ability, clickOpts(el, opts)),
  "roll-skill": (state, el, _c, opts) => recordSkillRoll(state, el.dataset.skill, clickOpts(el, opts)),
});
