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
const DEFAULT_SPEED_FT = 30;

/**
 * Inteiro limitado a `min`..`max`; valor ausente (`null`, `undefined`, texto vazio) vira o padrão, e não o mínimo: `Number(null)` seria 0.
 * @param {unknown} value Valor cru.
 * @param {number} min Mínimo.
 * @param {number} max Máximo.
 * @param {number} fallback Valor quando ausente ou inválido.
 * @returns {number} Inteiro seguro.
 */
export function clampInt(value, min, max, fallback) {
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
 * @returns {{level: number, abilities: Object<string, number>, proficientSkills: string[], expertSkills: string[], proficientSaves: string[], speedFt: number, deathSaves: {successes: number, failures: number}}} Escolhas seguras (deslocamento em pés, padrão 30).
 */
export function normalizeChoices(pack, choices = {}) {
  const abilityIds = pack.abilities.map((a) => a.id);
  const skillIds = new Set(pack.skills.map((s) => s.id));
  const pick = (list, allowed) => [...new Set((Array.isArray(list) ? list : []).filter((id) => allowed.has(id)))];
  const abilities = Object.fromEntries(abilityIds.map((id) => [id, clampInt(choices.abilities?.[id], SCORE_MIN, SCORE_MAX, DEFAULT_SCORE)]));
  const proficientSkills = pick(choices.proficientSkills, skillIds);
  const expertSkills = pick(choices.expertSkills, new Set(proficientSkills));
  return {
    level: clampInt(choices.level, LEVEL_MIN, LEVEL_MAX, LEVEL_MIN),
    abilities,
    proficientSkills,
    expertSkills,
    proficientSaves: pick(choices.proficientSaves, new Set(abilityIds)),
    speedFt: clampInt(choices.speedFt, 0, pack.formulas.speed?.maxFt ?? DEFAULT_SPEED_FT, DEFAULT_SPEED_FT),
    deathSaves: normalizeDeathSaves(pack, choices.deathSaves),
  };
}

function normalizeDeathSaves(pack, raw) {
  const needed = pack.formulas.deathSaves?.needed ?? 3;
  return { successes: clampInt(raw?.successes, 0, needed, 0), failures: clampInt(raw?.failures, 0, needed, 0) };
}

/**
 * Situação nos testes contra a morte: `dead` com as falhas completas, `stable` com os sucessos completos, senão `dying`.
 * @param {object} pack Pacote de sistema.
 * @param {{successes?: number, failures?: number}} [saves] Marcas atuais.
 * @returns {{successes: number, failures: number, status: "dying"|"stable"|"dead"}} Marcas normalizadas e a situação.
 */
export function deathSaveStatus(pack, saves) {
  const marks = normalizeDeathSaves(pack, saves);
  const needed = pack.formulas.deathSaves?.needed ?? 3;
  const status = marks.failures >= needed ? "dead" : marks.successes >= needed ? "stable" : "dying";
  return { ...marks, status };
}

/**
 * Soma uma marca de sucesso ou de falha nos testes contra a morte (sem passar do máximo); `reset` zera.
 * @param {object} pack Pacote de sistema.
 * @param {object} saves Marcas atuais.
 * @param {"success"|"failure"|"reset"} kind Que marca registrar.
 * @returns {{successes: number, failures: number}} Novas marcas.
 */
export function markDeathSave(pack, saves, kind) {
  const cur = normalizeDeathSaves(pack, saves);
  if (kind === "reset") return { successes: 0, failures: 0 };
  return normalizeDeathSaves(pack, kind === "success" ? { ...cur, successes: cur.successes + 1 } : { ...cur, failures: cur.failures + 1 });
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

/** Item equipado com `armor` válido para o pacote (tipo conhecido, CA inteira 0..maxAc), senão `null`. */
function wornArmor(pack, item) {
  const cfg = pack.formulas.armor;
  const kind = cfg?.kinds?.[item?.armor?.kind];
  if (!item?.equipped || !kind) return null;
  return { slot: kind.slot, dexCap: kind.dexCap, ac: clampInt(item.armor.ac, 0, cfg.maxAc, 0) };
}

/** Parte do DES na CA: `dexCap` nulo = inteiro; 0 = ignora (pesada); outro = limitado a esse valor. */
function bodyDex(body, dexMod) {
  if (!body || body.dexCap === null) return dexMod;
  return body.dexCap === 0 ? 0 : Math.min(dexMod, body.dexCap);
}

/**
 * CA com a armadura equipada: uma armadura de corpo (a de maior CA) e um escudo. `leve` = CA + mod. de DES;
 * `media` = CA + DES limitado a 2; `pesada` = CA; `escudo` soma a CA. Sem armadura de corpo, vale a base (10 + DES).
 * Item sem `armor` não conta, então fichas antigas mantêm a CA.
 * @param {object} pack Pacote de sistema.
 * @param {object[]} items Itens do inventário.
 * @param {number} dexMod Modificador do atributo de CA.
 * @returns {{armorClass: number, worn: boolean}} CA e se há armadura/escudo equipados.
 */
export function armorClassFromItems(pack, items, dexMod) {
  const worn = (Array.isArray(items) ? items : []).map((it) => wornArmor(pack, it)).filter(Boolean);
  const body = worn.filter((w) => w.slot === "body").sort((a, b) => b.ac - a.ac)[0];
  const shield = worn.find((w) => w.slot === "shield");
  const dex = bodyDex(body, dexMod);
  const base = body ? body.ac + dex : pack.formulas.armorClass.base + dexMod;
  return { armorClass: base + (shield ? shield.ac : 0), worn: worn.length > 0 };
}

function speedView(pack, ft) {
  const per = pack.formulas.speed?.metersPerFt ?? 0.3;
  return { ft, meters: Math.round(ft * per * 10) / 10 };
}

/** Iniciativa: bônus da perícia quando o pacote declara `skill`; senão o modificador do atributo. */
function initiativeOf(init, skills, modOf) {
  const bySkill = init.skill ? skills.find((s) => s.id === init.skill) : null;
  return bySkill ? bySkill.bonus : modOf(init.ability);
}

/**
 * Calcula todos os derivados da ficha para um pacote. A CA devolvida é a base sem armadura: armadura e escudo
 * entram quando o inventário os informar, fora deste módulo.
 * @param {object} pack Pacote de sistema.
 * @param {object} [choices] Escolhas do jogador (veja `normalizeChoices`).
 * @param {object[]} [items] Itens do inventário; os equipados com `armor` alteram a CA (`armorClassFromItems`).
 * @returns {{armored: boolean, level: number, proficiency: number, abilities: object[], saves: object[], skills: object[], armorClass: number, initiative: number, passivePerception: number, speed: {ft: number, meters: number}, deathSaves: {successes: number, failures: number, status: string}}} Derivados, nunca gravados.
 */
export function deriveSheet(pack, choices = {}, items = []) {
  const c = normalizeChoices(pack, choices);
  const proficiency = proficiencyBonus(pack, c.level);
  const abilities = deriveAbilities(pack, c);
  const skills = deriveSkills(pack, abilities, c, proficiency);
  const { armorClass: ac, initiative: init, passivePerception: pp } = pack.formulas;
  const modOf = (id) => abilities.find((a) => a.id === id)?.modifier ?? 0;
  const armor = armorClassFromItems(pack, items, modOf(ac.ability));
  const skillBonus = skills.find((s) => s.id === pp.skill)?.bonus ?? 0;
  return {
    level: c.level,
    proficiency,
    abilities,
    saves: deriveSaves(abilities, c, proficiency),
    skills,
    armorClass: armor.armorClass,
    armored: armor.worn,
    initiative: initiativeOf(init, skills, modOf),
    passivePerception: pp.base + skillBonus,
    speed: speedView(pack, c.speedFt),
    deathSaves: deathSaveStatus(pack, c.deathSaves),
  };
}
