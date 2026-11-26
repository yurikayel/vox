/**
 * @file O que a faixa de derivados e o HUD mostram por sistema (spec derivados-por-sistema-v0, fatia 1). O pacote
 * declara `display` como dado puro; este módulo valida o formato e resolve cada entrada por nome em registros
 * fechados em código (`formula` e `computed`). Nada vindo do pacote é executado, e texto nenhum entra como HTML:
 * quem desenha escapa os rótulos. Sem `display`, vale a lista de hoje (os cinco números do D&D).
 *
 * @module dungeon/system-display
 * @see docs/specs/derivados-por-sistema-v0.md
 */

import { GURPS_COMPUTED } from "./system-display-gurps.js";

/** Teto de caracteres de um rótulo de derivado. @type {number} */
export const DISPLAY_LABEL_MAX = 24;
/** Teto de entradas em `display.derived`. @type {number} */
export const DISPLAY_ENTRIES_MAX = 16;
/** Rótulo da defesa no HUD quando o pacote não declara outro. @type {string} */
export const DEFAULT_DEFENSE_LABEL = "CA";

/** Blocos opcionais da faixa que `display.blocks` pode ligar (ids fora da lista são ignorados). @type {readonly string[]} */
export const DISPLAY_BLOCKS = Object.freeze(["saves", "deathSaves", "conditions"]);

/** Teto de itens em `display.blocks`. @type {number} */
export const DISPLAY_BLOCKS_MAX = 8;

const ID = /^[a-z][A-Za-z0-9_-]{0,31}$/;
const plus = (n) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

/** Registro fechado das fórmulas do motor que a faixa sabe mostrar: nome → (derivados, rótulo) → `{label, value}`. */
const FORMULA_STATS = Object.freeze({
  proficiency: (d, label) => ({ label, value: plus(d.proficiency) }),
  /** O sufixo "sem armadura" só existe em pacote que calcula armadura (`formulas.armor`); sem ela o número é sempre a base. */
  armorClass: (d, label, pack) => ({ label: d.armored || !pack?.formulas?.armor ? label : `${label} sem armadura`, value: String(d.armorClass) }),
  initiative: (d, label) => ({ label, value: plus(d.initiative) }),
  passivePerception: (d, label) => ({ label, value: String(d.passivePerception) }),
  speed: (d, label) => ({ label, value: `${d.speed.meters.toString().replace(".", ",")} m` }),
});

/** Registro fechado das funções puras nomeadas (`computed`): hoje só as do GURPS. @type {Readonly<Object<string, Function>>} */
export const COMPUTED_STATS = Object.freeze({ ...GURPS_COMPUTED });

const LEGACY_ORDER = ["proficiency", "armorClass", "initiative", "passivePerception", "speed"];

function entryErrors(entry, seen) {
  if (!entry || typeof entry !== "object") return ["entrada não é objeto"];
  const errors = [];
  if (typeof entry.id !== "string" || !ID.test(entry.id)) errors.push("id inválido");
  else if (seen.has(entry.id)) errors.push(`id repetido: ${entry.id}`);
  const label = typeof entry.label === "string" ? entry.label.trim() : "";
  if (!label || label.length > DISPLAY_LABEL_MAX) errors.push(`rótulo vazio ou acima de ${DISPLAY_LABEL_MAX} caracteres`);
  if (!entry.source || typeof entry.source !== "object") errors.push("`source` ausente");
  return errors;
}

/**
 * Confere a forma de `display`. Fonte desconhecida não é erro (é ignorada na hora de desenhar); forma quebrada é.
 * @param {unknown} display Campo `display` do pacote (ausente é válido).
 * @returns {string[]} Erros em português; vazio quando válido.
 */
export function validateDisplay(display) {
  if (display === undefined) return [];
  if (!display || typeof display !== "object") return ["display: precisa ser um objeto"];
  return [...blocksErrors(display.blocks), ...derivedErrors(display.derived)];
}

function blocksErrors(blocks) {
  if (blocks === undefined) return [];
  if (!Array.isArray(blocks) || blocks.length > DISPLAY_BLOCKS_MAX) return [`display.blocks: lista de até ${DISPLAY_BLOCKS_MAX} textos`];
  return blocks.every((b) => typeof b === "string") ? [] : ["display.blocks: só textos"];
}

function derivedErrors(list) {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length > DISPLAY_ENTRIES_MAX) return [`display.derived: lista de até ${DISPLAY_ENTRIES_MAX} entradas`];
  const seen = new Set();
  return list.flatMap((entry, i) => {
    const errors = entryErrors(entry, seen).map((e) => `display.derived[${i}]: ${e}`);
    if (entry && typeof entry.id === "string") seen.add(entry.id);
    return errors;
  });
}

function resolveEntry(pack, entry, derived, registry, ctx) {
  const { formula, computed } = entry.source || {};
  const label = String(entry.label).trim();
  if (typeof formula === "string" && Object.hasOwn(FORMULA_STATS, formula)) return FORMULA_STATS[formula](derived, label, pack);
  if (typeof computed !== "string" || !Object.hasOwn(registry, computed)) return null;
  try {
    const out = registry[computed](derived, label, ctx);
    return out && typeof out.label === "string" && typeof out.value === "string" ? out : null;
  } catch {
    return null;
  }
}

function legacyStats(pack, derived) {
  return LEGACY_ORDER.map((name) => FORMULA_STATS[name](derived, pack.labels[name], pack));
}

/**
 * Números da faixa de derivados, na ordem do pacote. Entrada desconhecida ou que falha some; o resto aparece.
 * Pacote sem `display.derived` usa os cinco números de hoje, com os rótulos de `pack.labels`.
 * @param {object} pack Pacote de sistema.
 * @param {object} derived Derivados calculados por `deriveSheet`.
 * @param {Readonly<Object<string, Function>>} [registry] Registro de `computed` (só os testes trocam).
 * @param {{weightLb?: number, unweighed?: number}} [ctx] Contexto de carga para os `computed` que dependem do inventário.
 * @returns {{label: string, value: string}[]} Pares rótulo e valor, em texto puro (quem desenha escapa).
 */
export function derivedStats(pack, derived, registry = COMPUTED_STATS, ctx = undefined) {
  const list = pack?.display?.derived;
  if (!Array.isArray(list)) return legacyStats(pack, derived);
  return list.slice(0, DISPLAY_ENTRIES_MAX).map((entry) => (entry ? resolveEntry(pack, entry, derived, registry, ctx) : null)).filter(Boolean);
}

/**
 * Rótulo da defesa no HUD: o da entrada que `display.hud.defense` aponta, ou "CA" sem declaração.
 * @param {object|null|undefined} pack Pacote de sistema da ficha.
 * @returns {string} Rótulo curto, em texto puro.
 */
export function defenseLabel(pack) {
  const id = pack?.display?.hud?.defense;
  const entry = Array.isArray(pack?.display?.derived) ? pack.display.derived.find((e) => e?.id === id) : null;
  const label = typeof entry?.label === "string" ? entry.label.trim() : "";
  return label && label.length <= DISPLAY_LABEL_MAX ? label : DEFAULT_DEFENSE_LABEL;
}

/**
 * Se um bloco opcional da faixa aparece. Sem `display.blocks` valem todos (o conjunto de hoje, do D&D).
 * @param {object|null|undefined} pack Pacote de sistema.
 * @param {string} id Um de `DISPLAY_BLOCKS`.
 * @returns {boolean} `true` quando o bloco deve ser desenhado.
 */
export function showBlock(pack, id) {
  const blocks = pack?.display?.blocks;
  return Array.isArray(blocks) ? blocks.includes(id) : true;
}
