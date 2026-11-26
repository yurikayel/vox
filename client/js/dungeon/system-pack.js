/**
 * @file Formato do pacote de sistema da ficha multi-sistema (spec brainstorm v0, §4): dados, não telas.
 * Um pacote define atributos, testes, recursos e os parâmetros das fórmulas; as funções puras de
 * `system-derive.js` calculam os derivados a partir dele e das escolhas do jogador. A ficha nunca grava derivado.
 * Este módulo valida o formato e guarda o registro dos pacotes conhecidos (hoje: `dnd5e-2024`, `t20` e `gurps4e`).
 *
 * @module dungeon/system-pack
 * @see docs/specs/ficha-personagem-brainstorm-v0.md (§4 e §9)
 */
import { DND5E_2024_PACK } from "./system-pack-dnd5e-2024.js";
import { T20_PACK } from "./system-pack-t20.js";
import { GURPS4E_PACK } from "./system-pack-gurps4e.js";

/** Tipos de resolução de teste aceitos pelo formato (a spec §4 lista também `3d6_sob_nh`, ainda sem pacote). @type {readonly string[]} */
export const TEST_KINDS = Object.freeze(["d20_vs_cd", "3d6_sob_nh"]);

/** Tipos de recurso aceitos: reserva com máximo e atual, espaços por nível, usos por descanso e marcador sim/não. @type {readonly string[]} */
export const RESOURCE_KINDS = Object.freeze(["pool", "slots", "uses", "flag"]);

const ID = /^[a-z][a-z0-9_-]{0,31}$/;
const isId = (v) => typeof v === "string" && ID.test(v);
const nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;
const unique = (list) => new Set(list).size === list.length;

function checkLicense(license, errors) {
  const ok = license && nonEmpty(license.spdx) && nonEmpty(license.attribution) && nonEmpty(license.source);
  if (!ok) errors.push("licença: `spdx`, `attribution` e `source` são obrigatórios");
}

function checkAbilities(abilities, errors) {
  if (!Array.isArray(abilities) || abilities.length === 0) return void errors.push("atributos: lista vazia");
  const bad = abilities.some((a) => !isId(a?.id) || !nonEmpty(a?.label) || !nonEmpty(a?.short));
  if (bad) errors.push("atributos: cada um precisa de `id`, `label` e `short`");
  if (!unique(abilities.map((a) => a?.id))) errors.push("atributos: ids repetidos");
}

function checkTests(pack, errors) {
  if (!TEST_KINDS.includes(pack.testKind)) errors.push(`testKind inválido: ${pack.testKind}`);
  const ability = new Set((pack.abilities || []).map((a) => a?.id));
  const skills = Array.isArray(pack.skills) ? pack.skills : [];
  if (skills.some((s) => !isId(s?.id) || !nonEmpty(s?.label) || !ability.has(s?.ability))) errors.push("perícias: `id`, `label` e `ability` conhecido são obrigatórios");
  if (!unique(skills.map((s) => s?.id))) errors.push("perícias: ids repetidos");
}

function checkResources(resources, errors) {
  const list = Array.isArray(resources) ? resources : [];
  if (list.some((r) => !isId(r?.id) || !nonEmpty(r?.label) || !RESOURCE_KINDS.includes(r?.kind))) errors.push("recursos: `id`, `label` e `kind` válido são obrigatórios");
  if (!unique(list.map((r) => r?.id))) errors.push("recursos: ids repetidos");
}

function checkFormulas(formulas, errors) {
  const f = formulas || {};
  if (!Number.isFinite(f.modifier?.base) || !(f.modifier?.step > 0)) errors.push("fórmulas: `modifier` precisa de `base` e `step` > 0");
  if (!Number.isFinite(f.proficiency?.base) || !(f.proficiency?.every > 0)) errors.push("fórmulas: `proficiency` precisa de `base` e `every` > 0");
}

/**
 * Confere o formato de um pacote de sistema.
 * @param {unknown} pack Pacote candidato.
 * @returns {{ok: boolean, errors: string[]}} `ok` só quando não há erro; `errors` diz o que falta, em português.
 */
export function validateSystemPack(pack) {
  const errors = [];
  if (!pack || typeof pack !== "object") return { ok: false, errors: ["pacote ausente"] };
  if (!isId(pack.id)) errors.push("id inválido");
  if (!Number.isInteger(pack.version) || pack.version < 1) errors.push("version inválida");
  if (!nonEmpty(pack.name)) errors.push("name ausente");
  checkLicense(pack.license, errors);
  checkAbilities(pack.abilities, errors);
  checkTests(pack, errors);
  checkResources(pack.resources, errors);
  checkFormulas(pack.formulas, errors);
  return { ok: errors.length === 0, errors };
}

const REGISTRY = new Map();

/**
 * Registra um pacote depois de validá-lo.
 * @param {object} pack Pacote no formato deste módulo.
 * @returns {object} O próprio pacote.
 * @throws {Error} Se o formato for inválido ou o id já existir.
 */
export function registerSystemPack(pack) {
  const verdict = validateSystemPack(pack);
  if (!verdict.ok) throw new Error(`pacote de sistema inválido: ${verdict.errors.join("; ")}`);
  if (REGISTRY.has(pack.id)) throw new Error(`pacote de sistema repetido: ${pack.id}`);
  REGISTRY.set(pack.id, pack);
  return pack;
}

/**
 * Busca um pacote registrado.
 * @param {string} id Id do pacote (ex.: `dnd5e-2024`).
 * @returns {object|null} Pacote, ou `null` se não existir.
 */
export function getSystemPack(id) {
  return REGISTRY.get(String(id)) || null;
}

/**
 * Lista os ids dos pacotes registrados.
 * @returns {string[]} Ids em ordem de registro.
 */
export function listSystemPackIds() {
  return [...REGISTRY.keys()];
}

registerSystemPack(DND5E_2024_PACK);
registerSystemPack(T20_PACK);
registerSystemPack(GURPS4E_PACK);
