/**
 * @file Derivados do pacote de sistema na ficha: faixa "Números do personagem" da aba Jogar e o seletor de
 * sistema do painel Editar. Só desenha o que `system-derive.js` calcula; nada é gravado na ficha, e o texto de
 * cada número vem do pacote (spec brainstorm v0, §4: "uma palavra por conceito, a do sistema").
 *
 * @module dungeon/screen-sheet-derived
 * @see docs/specs/ficha-personagem-brainstorm-v0.md (§4 e §5)
 */
import { deriveSheet } from "./system-derive.js";
import { getSystemPack, listSystemPackIds } from "./system-pack.js";
import { migrateLegacySheet } from "./system-migrate.js";
import { escapeHtml } from "../shared/html.js";

/** Soma com sinal explícito ("+3", "-1", "+0"). */
function signed(n) {
  return n >= 0 ? `+${n}` : `−${Math.abs(n)}`;
}

/**
 * Pacote e derivados da ficha. Ficha legada (sem `system`) é migrada só para exibição; nada é gravado aqui.
 * Nível e atributos vêm sempre dos campos vivos da ficha (`attributes_lww`), para a edição e o Subir de Nível valerem na hora.
 * @param {object|null|undefined} sheet Ficha ativa.
 * @returns {{pack: object, derived: object}|null} `null` se o pacote da ficha não está registrado.
 */
export function resolveSheetSystem(sheet) {
  if (!sheet || typeof sheet !== "object") return null;
  const migrated = migrateLegacySheet(sheet);
  const pack = getSystemPack(migrated.system?.id);
  if (!pack) return null;
  const attrs = migrated.attributes_lww || {};
  const choices = { ...migrated.system_choices, level: attrs.level ?? migrated.system_choices?.level, abilities: attrs.abilities ?? migrated.system_choices?.abilities };
  return { pack, derived: deriveSheet(pack, choices) };
}

function stat(label, value) {
  return `<div class="dungeon-derived-stat"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd></div>`;
}

/**
 * Faixa de números derivados: proficiência, CA base, iniciativa e percepção passiva, com os rótulos do pacote.
 * @param {object|null|undefined} sheet Ficha ativa.
 * @returns {string} HTML (vazio se o pacote não existe).
 */
export function renderDerivedStrip(sheet) {
  const sys = resolveSheetSystem(sheet);
  if (!sys) return "";
  const { pack, derived } = sys;
  const l = pack.labels;
  return `
    <section class="dungeon-derived" aria-label="Números do personagem (${escapeHtml(pack.name)})">
      <h3 class="dungeon-eyebrow">Números do personagem · ${escapeHtml(pack.name)}</h3>
      <dl class="dungeon-derived-list">
        ${stat(l.proficiency, signed(derived.proficiency))}
        ${stat(`${l.armorClass} base`, derived.armorClass)}
        ${stat(l.initiative, signed(derived.initiative))}
        ${stat(l.passivePerception, derived.passivePerception)}
      </dl>
    </section>`;
}

/**
 * Seletor de sistema do painel Editar, com um campo para cada pacote registrado.
 * @param {object|null|undefined} sheet Ficha ativa.
 * @returns {string} HTML do campo `sheetSystem`.
 */
export function renderSystemSelect(sheet) {
  const current = migrateLegacySheet(sheet || {})?.system?.id || "";
  const options = listSystemPackIds().map((id) => {
    const pack = getSystemPack(id);
    return `<option value="${escapeHtml(id)}"${id === current ? " selected" : ""}>${escapeHtml(pack.name)}</option>`;
  }).join("");
  return `<label class="dungeon-field-mini dungeon-field-wide"><span>Sistema</span><select class="dungeon-input" name="sheetSystem">${options}</select></label>`;
}
