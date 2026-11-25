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
import { liveTrainedSkills, migrateLegacySheet } from "./system-migrate.js";
import { normalizeChoices } from "./system-derive.js";
import { renderDeathSaves, renderSavesList, renderSystemChoiceFields, signed } from "./screen-sheet-system-extras.js";
import { escapeHtml } from "../shared/html.js";

/** Itens do inventário da ficha (já normalizados na sessão ou o mapa bruto `inventory_orset`). */
function sheetItems(sheet) {
  return Array.isArray(sheet.inventoryItems) ? sheet.inventoryItems : Object.values(sheet.inventory_orset || {});
}

/**
 * Pacote e derivados da ficha. Ficha legada (sem `system`) é migrada só para exibição; nada é gravado aqui.
 * Nível, atributos e perícias treinadas vêm sempre dos campos vivos da ficha (`attributes_lww` e as ações de perícia), para a edição, o Subir de Nível e a remoção de ações valerem na hora.
 * @param {object|null|undefined} sheet Ficha ativa.
 * @returns {{pack: object, derived: object, choices: object}|null} `null` se o pacote da ficha não está registrado.
 */
export function resolveSheetSystem(sheet) {
  if (!sheet || typeof sheet !== "object") return null;
  const migrated = migrateLegacySheet(sheet);
  const pack = getSystemPack(migrated.system?.id);
  if (!pack) return null;
  const attrs = migrated.attributes_lww || {};
  const choices = { ...migrated.system_choices, level: attrs.level ?? migrated.system_choices?.level, abilities: attrs.abilities ?? migrated.system_choices?.abilities, proficientSkills: liveTrainedSkills(pack, migrated), speedFt: attrs.speed_ft ?? migrated.system_choices?.speedFt };
  return { pack, derived: deriveSheet(pack, choices, sheetItems(migrated)), choices: normalizeChoices(pack, choices) };
}

function stat(label, value) {
  return `<div class="dungeon-derived-stat"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd></div>`;
}

/** Créditos da licença do conteúdo do pacote (CC-BY-4.0 exige a atribuição visível). */
function renderCredits(pack) {
  const lic = pack.license;
  return `<details class="dungeon-derived-credits"><summary>Sobre este conteúdo</summary><p class="dungeon-muted">${escapeHtml(lic.attribution)} <a href="${escapeHtml(lic.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(lic.spdx)}</a></p></details>`;
}

/**
 * Faixa de números derivados: proficiência, CA base, iniciativa e percepção passiva, com os rótulos do pacote.
 * @param {object|null|undefined} sheet Ficha ativa.
 * @param {number|null} [hpCurrent] PV atuais, para mostrar os testes contra a morte com 0 PV.
 * @returns {string} HTML (vazio se o pacote não existe).
 */
export function renderDerivedStrip(sheet, hpCurrent = null) {
  const sys = resolveSheetSystem(sheet);
  if (!sys) return "";
  const { pack, derived } = sys;
  const l = pack.labels;
  return `
    <section class="dungeon-derived" aria-label="Números do personagem (${escapeHtml(pack.name)})">
      <h3 class="dungeon-eyebrow">Números do personagem · ${escapeHtml(pack.name)}</h3>
      <dl class="dungeon-derived-list">
        ${stat(l.proficiency, signed(derived.proficiency))}
        ${stat(derived.armored ? l.armorClass : `${l.armorClass} sem armadura`, derived.armorClass)}
        ${stat(l.initiative, signed(derived.initiative))}
        ${stat(l.passivePerception, derived.passivePerception)}
        ${stat(l.speed, `${derived.speed.meters.toString().replace(".", ",")} m`)}
      </dl>
      ${renderSavesList(pack, derived)}
      ${renderDeathSaves(pack, derived, hpCurrent)}
      ${renderCredits(pack)}
    </section>`;
}

/** Escolhas com o que o jogador digitou num Salvar recusado por cima das gravadas. */
function withDraft(choices, draft) {
  return {
    ...choices,
    speedFt: draft.speedFt ?? choices.speedFt,
    proficientSaves: draft.proficientSaves ?? choices.proficientSaves,
    expertSkills: draft.expertSkills ?? choices.expertSkills,
  };
}

/**
 * Campos do pacote no painel Editar (salvaguardas, especialização, Deslocamento); vazio sem pacote.
 * @param {object|null|undefined} sheet Ficha ativa.
 * @param {object} [draft] Valores digitados num Salvar recusado (`speedFt`, `proficientSaves`, `expertSkills`).
 * @returns {string} HTML dos campos.
 */
export function renderSystemEditFields(sheet, draft = {}) {
  const sys = resolveSheetSystem(sheet);
  return sys ? renderSystemChoiceFields(sys.pack, withDraft(sys.choices, draft)) : "";
}

/**
 * Seletor de sistema do painel Editar, com um campo para cada pacote registrado.
 * @param {object|null|undefined} sheet Ficha ativa.
 * @param {string} [chosen] Sistema digitado num Salvar recusado; vence o da ficha quando existe na lista.
 * @returns {string} HTML do campo `sheetSystem`.
 */
export function renderSystemSelect(sheet, chosen = "") {
  const current = chosen || migrateLegacySheet(sheet || {})?.system?.id || "";
  const options = listSystemPackIds().map((id) => {
    const pack = getSystemPack(id);
    return `<option value="${escapeHtml(id)}"${id === current ? " selected" : ""}>${escapeHtml(pack.name)}</option>`;
  }).join("");
  return `<label class="dungeon-field-mini dungeon-field-wide"><span>Sistema</span><select class="dungeon-input" name="sheetSystem">${options}</select></label>`;
}
