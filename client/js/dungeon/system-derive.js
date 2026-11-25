/**
 * @file Derivados da ficha multi-sistema: funções puras que leem o pacote de sistema e as escolhas do jogador
 * (nível, atributos, perícias e salvaguardas treinadas) e devolvem modificadores, bônus, CA base, iniciativa e
 * percepção passiva. Nada daqui é gravado na ficha (spec brainstorm v0, §4): muda a escolha, o derivado muda junto.
 *
 * @module dungeon/system-derive
 * @see docs/specs/ficha-personagem-brainstorm-v0.md (§4)
 */

const LEVEL_MIN = 1;
const LEVEL_MAX = 20;
const SCORE_MIN = 1;
const SCORE_MAX = 30;
const DEFAULT_SCORE = 10;

/** Valor ausente (`null`, `undefined`, texto vazio) vira o padrão, e não o mínimo: `Number(null)` seria 0. */
function clampInt(value, min, max, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/**
 * Modificador de um atributo: `floor((valor - base) / passo)` com os parâmetros do pacote.
 * @param {object} pack Pacote de sistema.
 * @param {number} score Valor do atributo.
 * @returns {number} Modificador (pode ser negativo).
 */
export function abilityModifier(pack, score) {
  const { base, step } = pack.formulas.modifier;
  return Math.floor((clampInt(score, SCORE_MIN, SCORE_MAX, DEFAULT_SCORE) - base) / step);
}

/**
 * Bônus de proficiência pelo nível: `base + floor((nível - 1) / every)`.
 * @param {object} pack Pacote de sistema.
 * @param {number} level Nível do personagem (limitado a 1–20).
 * @returns {number} Bônus de proficiência.
 */
export function proficiencyBonus(pack, level) {
  const { base, every } = pack.formulas.proficiency;
  return base + Math.floor((clampInt(level, LEVEL_MIN, LEVEL_MAX, LEVEL_MIN) - 1) / every);
}

/**
 * Normaliza as escolhas do jogador para o pacote: ids desconhecidos saem, atributo ausente vira 10, nível fica em 1–20.
 * @param {object} pack Pacote de sistema.
 * @param {object} [choices] Escolhas cruas da ficha.
 * @returns {{level: number, abilities: Object<string, number>, proficientSkills: string[], expertSkills: string[], proficientSaves: string[]}} Escolhas seguras.
 */
export function normalizeChoices(pack, choices = {}) {
  const abilityIds = pack.abilities.map((a) => a.id);
  const skillIds = new Set(pack.skills.map((s) => s.id));
  const pick = (list, allowed) => [...new Set((Array.isArray(list) ? list : []).filter((id) => allowed.has(id)))];
  const abilities = Object.fromEntries(abilityIds.map((id) => [id, clampInt(choices.abilities?.[id], SCORE_MIN, SCORE_MAX, DEFAULT_SCORE)]));
  const proficientSkills = pick(choices.proficientSkills, skillIds);
  const expertSkills = pick(choices.expertSkills, new Set(proficientSkills));
  return { level: clampInt(choices.level, LEVEL_MIN, LEVEL_MAX, LEVEL_MIN), abilities, proficientSkills, expertSkills, proficientSaves: pick(choices.proficientSaves, new Set(abilityIds)) };
}

function deriveAbilities(pack, c) {
  return pack.abilities.map((a) => ({ id: a.id, label: a.label, short: a.short, score: c.abilities[a.id], modifier: abilityModifier(pack, c.abilities[a.id]) }));
}

function deriveSaves(abilities, c, prof) {
  return abilities.map((a) => {
    const proficient = c.proficientSaves.includes(a.id);
    return { id: a.id, label: a.label, proficient, bonus: a.modifier + (proficient ? prof : 0) };
  });
}

function deriveSkills(pack, abilities, c, prof) {
  const mod = Object.fromEntries(abilities.map((a) => [a.id, a.modifier]));
  return pack.skills.map((s) => {
    const proficient = c.proficientSkills.includes(s.id);
    const expert = c.expertSkills.includes(s.id);
    return { id: s.id, label: s.label, ability: s.ability, proficient, expert, bonus: mod[s.ability] + (proficient ? prof : 0) + (expert ? prof : 0) };
  });
}

/**
 * Calcula todos os derivados da ficha para um pacote. A CA devolvida é a base sem armadura: armadura e escudo
 * entram quando o inventário os informar, fora deste módulo.
 * @param {object} pack Pacote de sistema.
 * @param {object} [choices] Escolhas do jogador (veja `normalizeChoices`).
 * @returns {{level: number, proficiency: number, abilities: object[], saves: object[], skills: object[], armorClass: number, initiative: number, passivePerception: number}} Derivados, nunca gravados.
 */
export function deriveSheet(pack, choices = {}) {
  const c = normalizeChoices(pack, choices);
  const proficiency = proficiencyBonus(pack, c.level);
  const abilities = deriveAbilities(pack, c);
  const skills = deriveSkills(pack, abilities, c, proficiency);
  const { armorClass: ac, initiative: init, passivePerception: pp } = pack.formulas;
  const modOf = (id) => abilities.find((a) => a.id === id)?.modifier ?? 0;
  const skillBonus = skills.find((s) => s.id === pp.skill)?.bonus ?? 0;
  return {
    level: c.level,
    proficiency,
    abilities,
    saves: deriveSaves(abilities, c, proficiency),
    skills,
    armorClass: ac.base + modOf(ac.ability),
    initiative: modOf(init.ability),
    passivePerception: pp.base + skillBonus,
  };
}
