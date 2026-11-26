/**
 * @file Condições, Exaustão, Dados de Vida e descansos do pacote de sistema: funções puras sobre as escolhas da
 * ficha (`system_choices`). Condição é marca sem efeito automático nos números; Exaustão é um nível (0 a `max`) cujo
 * efeito é só mostrado. Os números (máximo, penalidades) e os nomes vêm do pacote; o dado de vida é o que o jogador
 * digitou (sem tabela de classes). Nada aqui grava: quem chama persiste.
 *
 * @module dungeon/system-rest
 * @see docs/specs/ficha-personagem-brainstorm-v0.md (§4)
 */
import { abilityModifier, clampInt } from "./system-derive.js";

/** Lados de dado aceitos como Dado de Vida. @type {readonly number[]} */
export const HIT_DIE_SIDES = Object.freeze([4, 6, 8, 10, 12]);
/** Dado de Vida enquanto o jogador não define o seu. @type {number} */
export const DEFAULT_HIT_DIE = 8;

/**
 * Dado de Vida válido (d4, d6, d8, d10 ou d12) ou `null`.
 * @param {unknown} value Valor cru (número ou texto do formulário).
 * @returns {number|null} Lados do dado, ou `null` se inválido ou vazio.
 */
export function validHitDie(value) {
  const die = Number(value);
  return value !== "" && value !== null && value !== undefined && HIT_DIE_SIDES.includes(die) ? die : null;
}
const SLOT_POOLS = Object.freeze(["l1", "l2", "l3"]);

function exhaustionMax(pack) {
  return pack.formulas.exhaustion?.max ?? 0;
}

/**
 * Normaliza condições, Exaustão e Dados de Vida das escolhas da ficha.
 * @param {object} pack Pacote de sistema.
 * @param {object} [choices] Escolhas cruas (`level`, `conditions`, `exhaustion`, `hitDie`, `hitDiceSpent`).
 * @returns {{conditions: string[], exhaustion: number, hitDie: number, hitDieSet: boolean, hitDiceTotal: number, hitDiceSpent: number}} Valores seguros.
 */
export function normalizeRestChoices(pack, choices = {}) {
  const known = new Set((pack.conditions || []).map((c) => c.id));
  const marks = (Array.isArray(choices.conditions) ? choices.conditions : []).filter((id) => known.has(id));
  const total = clampInt(choices.level, 1, 20, 1);
  const die = validHitDie(choices.hitDie);
  return {
    conditions: [...new Set(marks)],
    exhaustion: clampInt(choices.exhaustion, 0, exhaustionMax(pack), 0),
    hitDie: die ?? DEFAULT_HIT_DIE,
    hitDieSet: die !== null,
    hitDiceTotal: total,
    hitDiceSpent: clampInt(choices.hitDiceSpent, 0, total, 0),
  };
}

/**
 * Liga ou desliga uma condição (id desconhecido não muda nada).
 * @param {object} pack Pacote de sistema.
 * @param {object} choices Escolhas da ficha.
 * @param {string} id Id da condição.
 * @returns {string[]} Nova lista de condições marcadas.
 */
export function toggleCondition(pack, choices, id) {
  const { conditions } = normalizeRestChoices(pack, choices);
  if (!(pack.conditions || []).some((c) => c.id === id)) return conditions;
  return conditions.includes(id) ? conditions.filter((c) => c !== id) : [...conditions, id];
}

/**
 * Efeito da Exaustão para exibir (nada é aplicado aos números): penalidade nos testes de d20, no Deslocamento e se é fatal.
 * @param {object} pack Pacote de sistema.
 * @param {number} level Nível de Exaustão.
 * @returns {{level: number, d20Penalty: number, speedPenaltyFt: number, fatal: boolean}} Efeito.
 */
export function exhaustionEffect(pack, level) {
  const cfg = pack.formulas.exhaustion || {};
  const lv = clampInt(level, 0, exhaustionMax(pack), 0);
  return { level: lv, d20Penalty: lv * (cfg.d20PenaltyPerLevel ?? 0), speedPenaltyFt: lv * (cfg.speedPenaltyFtPerLevel ?? 0), fatal: lv > 0 && lv >= exhaustionMax(pack) };
}

/**
 * Gasta um Dado de Vida: cura = rolagem + modificador do atributo de cura (nunca menos que 0).
 * @param {object} pack Pacote de sistema.
 * @param {object} choices Escolhas da ficha (nível, atributos, dado e gastos).
 * @param {number} roll Resultado do dado (1 a lados).
 * @returns {{ok: boolean, heal?: number, hitDiceSpent?: number, error?: string}} Cura e novo total gasto, ou o motivo da recusa.
 */
export function spendHitDie(pack, choices, roll) {
  if (!pack.formulas.hitDice) return { ok: false, error: "Este sistema não usa Dado de Vida." };
  const rest = normalizeRestChoices(pack, choices);
  if (rest.hitDiceSpent >= rest.hitDiceTotal) return { ok: false, error: "Sem Dados de Vida disponíveis; só um descanso longo os devolve." };
  const mod = abilityModifier(pack, choices.abilities?.[pack.formulas.hitDice.healAbility]);
  const faces = clampInt(roll, 1, rest.hitDie, 1);
  return { ok: true, heal: Math.max(0, faces + mod), hitDiceSpent: rest.hitDiceSpent + 1 };
}

/**
 * Plano do descanso longo: PV e espaços de magia voltam ao máximo, todos os Dados de Vida gastos voltam,
 * a Exaustão cai 1 e os testes contra a morte zeram.
 * @param {object} pack Pacote de sistema.
 * @param {object} choices Escolhas da ficha.
 * @param {{pools: object, base: object}} state PV/espaços atuais (`pools`) e máximos (`base`, `pools_base`).
 * @returns {{choices: object, deltas: Array<{pool: string, delta: number}>}} Escolhas novas e os deltas de recurso (só os > 0).
 */
export function longRestPlan(pack, choices, { pools, base }) {
  if (!pack.formulas.hitDice) return { choices, deltas: [] };
  const rest = normalizeRestChoices(pack, choices);
  const deltas = [{ pool: "hp_current", delta: (base.hp_max ?? 0) - (pools.hp_current ?? 0) }];
  for (const l of SLOT_POOLS) deltas.push({ pool: `spell_slot_${l}`, delta: (base.spell_slots_max?.[l] ?? 0) - (pools[`spell_slot_${l}`] ?? 0) });
  return {
    choices: { ...choices, hitDiceSpent: 0, exhaustion: Math.max(0, rest.exhaustion - 1), deathSaves: { successes: 0, failures: 0 } },
    deltas: deltas.filter((d) => d.delta > 0),
  };
}

/**
 * Plano do descanso curto: os testes contra a morte só zeram se os PV estão acima de 0 (a cura vem dos Dados de Vida gastos).
 * @param {object} choices Escolhas da ficha.
 * @param {number} hpCurrent PV atuais.
 * @returns {object} Escolhas novas.
 */
export function shortRestPlan(choices, hpCurrent) {
  return hpCurrent > 0 ? { ...choices, deathSaves: { successes: 0, failures: 0 } } : choices;
}
