/**
 * @file Número da defesa no HUD quando o pacote aponta `display.hud.defense` para uma entrada calculada (GURPS:
 * Esquiva, que depende do peso do inventário). Pacote com defesa por fórmula (5e, T20) segue pelo `armor_class` da ficha.
 *
 * @module dungeon/hud-defense
 * @see docs/specs/derivados-por-sistema-v0.md
 */
import { derivedStats } from "./system-display.js";
import { deriveSheet } from "./system-derive.js";
import { liveTrainedSkills, migrateLegacySheet } from "./system-migrate.js";
import { totalCarriedWeight } from "./vtt-inventory.js";

function sheetItems(sheet) {
  return Array.isArray(sheet.inventoryItems) ? sheet.inventoryItems : Object.values(sheet.inventory_orset || {});
}

function liveChoices(pack, sheet) {
  const attrs = sheet.attributes_lww || {};
  return { ...sheet.system_choices, level: attrs.level ?? sheet.system_choices?.level, abilities: attrs.abilities ?? sheet.system_choices?.abilities, proficientSkills: liveTrainedSkills(pack, sheet), speedFt: attrs.speed_ft ?? sheet.system_choices?.speedFt };
}

/**
 * Valor numérico da defesa calculada do pacote para a ficha; `null` quando a defesa não é `computed` ou não é número.
 * @param {object|null|undefined} sheet Ficha própria.
 * @param {object|null|undefined} pack Pacote de sistema da ficha.
 * @returns {number|null} Defesa (ex.: Esquiva 8), ou null para seguir com `armor_class`.
 */
export function computedDefense(sheet, pack) {
  const entry = pack?.display?.derived?.find?.((e) => e?.id === pack.display.hud?.defense);
  if (!sheet || typeof entry?.source?.computed !== "string") return null;
  const migrated = migrateLegacySheet(sheet);
  const derived = deriveSheet(pack, liveChoices(pack, migrated), sheetItems(migrated));
  const [stat] = derivedStats({ display: { derived: [entry] } }, derived, undefined, { weightLb: totalCarriedWeight(sheet.inventory_orset) });
  const n = Number(stat?.value);
  return stat && Number.isFinite(n) ? n : null;
}
