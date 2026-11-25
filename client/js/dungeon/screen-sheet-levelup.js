/**
 * @file Assistente de subida de nível com confirmação/preset e editor rápido da ficha no Grimório.
 * @module dungeon/screen-sheet-levelup
 */
import { escapeHtml } from "../shared/html.js";
import { buildLevelUpPlan } from "./vtt-levelup.js";
import { renderSystemSelect } from "./screen-sheet-derived.js";

const LEVELUP_PRESETS = [
  { id: "d20_fantasy", label: "d20 Fantasia (+8 PV + CON, +1 slot)" },
  { id: "tormenta20", label: "Tormenta20 (+6 PV, +1 slot)" },
  { id: "libre", label: "Livre (+5 PV)" },
  { id: "investigacao", label: "Investigação (+3 PV)" },
];

const ABILITY_FIELDS = [
  { key: "str", label: "FOR" },
  { key: "dex", label: "DES" },
  { key: "con", label: "CON" },
  { key: "int", label: "INT" },
  { key: "wis", label: "SAB" },
  { key: "cha", label: "CAR" },
];

function renderSlotPreview(slotsDelta) {
  const entries = Object.entries(slotsDelta || {}).filter(([, v]) => Number(v) > 0);
  if (!entries.length) return "Sem novos espaços de magia neste preset";
  return entries.map(([k, v]) => `+${v} espaço (${k.toUpperCase()})`).join(", ");
}

function renderLevelUpPlanSummary(built) {
  if (!built.plan) {
    return `<p class="dungeon-alert-warn" role="alert">${escapeHtml(built.error || "Não foi possível montar o plano de nível.")}</p>`;
  }
  const { plan } = built;
  return `<ul class="dungeon-clean-list">
    <li><strong>Nível:</strong> ${plan.fromLevel} → ${plan.toLevel}</li>
    <li><strong>Vitalidade máxima:</strong> +${plan.hpGain} PV</li>
    <li><strong>Bônus de proficiência:</strong> +${plan.proficiencyBonus}</li>
    <li><strong>Magia:</strong> ${escapeHtml(renderSlotPreview(plan.slotsDelta))}</li>
  </ul>`;
}

/**
 * Renderiza o Assistente de Nível (prévia de ganhos + escolha de preset + confirmação irreversível).
 * @param {object} state Estado da sessão.
 * @returns {string} HTML do assistente quando `state.levelUpOpen` está ativo, ou vazio.
 */
export function renderLevelUpWizard(state) {
  if (!state.levelUpOpen) return "";
  const curLevel = Number(state.sheet?.attributes_lww?.level) || 1;
  const nextLevel = curLevel + 1;
  const preset = state.levelUpPreset || state.campaignDoc?.dungeonPrefs?.preset || state.campaignDoc?.system || "d20_fantasy";
  const built = buildLevelUpPlan(state.sheet, nextLevel, preset);
  const presetBtns = LEVELUP_PRESETS.map((p) => {
    const sel = p.id === preset;
    return `<button type="button" class="dungeon-chip-btn${sel ? " is-selected" : ""}" data-dungeon="select-levelup-preset" data-preset="${p.id}" aria-pressed="${sel}">${escapeHtml(p.label)}</button>`;
  }).join("");
  return `
    <section class="dungeon-panel dungeon-levelup-wizard" aria-label="Assistente de nível">
      <div class="dungeon-section-head">
        <div><span class="dungeon-eyebrow">Evolução Guiada · Marco Imutável</span><h2>Subir de Nível (${curLevel} → ${nextLevel})</h2></div>
      </div>
      <div class="dungeon-chips-row" role="group" aria-label="Preset de regras">${presetBtns}</div>
      ${renderLevelUpPlanSummary(built)}
      <div class="dungeon-card-actions">
        <button type="button" class="dungeon-btn dungeon-btn-primary" data-dungeon="level-up"${built.plan ? "" : " disabled"}>Confirmar Nível ${nextLevel}</button>
        <button type="button" class="dungeon-btn dungeon-btn-ghost" data-dungeon="level-up-cancel">Cancelar</button>
      </div>
    </section>`;
}

/**
 * Renderiza o painel retrátil de edição básica da ficha (nome, classe, CA e atributos FOR–CAR).
 * @param {object} sheet Ficha ativa.
 * @returns {string} HTML do formulário de edição.
 */
export function renderSheetEditPanel(sheet) {
  const attrs = sheet?.attributes_lww || {};
  const ab = attrs.abilities || {};
  const abInputs = ABILITY_FIELDS.map((f) => {
    const val = Number(ab[f.key]) || 10;
    return `<label class="dungeon-field-mini"><span>${f.label}</span><input class="dungeon-input" name="${f.key}" type="number" min="1" max="30" value="${val}" /></label>`;
  }).join("");
  return `
    <details class="dungeon-audit" data-dungeon-details="sheet-edit">
      <summary>Editar Dados da Ficha (Nome, Classe, CA e Atributos)</summary>
      <form class="dungeon-token-edit-form" data-dungeon="edit-sheet-form">
        <label class="dungeon-field-mini dungeon-field-wide"><span>Nome</span><input class="dungeon-input" name="sheetName" type="text" maxlength="60" value="${escapeHtml(sheet?.name || "")}" /></label>
        <label class="dungeon-field-mini dungeon-field-wide"><span>Classe / Título</span><input class="dungeon-input" name="sheetClass" type="text" maxlength="60" value="${escapeHtml(sheet?.role_title || attrs.class_name || "")}" /></label>
        ${renderSystemSelect(sheet)}
        <label class="dungeon-field-mini"><span>CA</span><input class="dungeon-input" name="armorClass" type="number" min="1" max="40" value="${Number(attrs.armor_class) || 10}" /></label>
        ${abInputs}
        <button type="submit" class="dungeon-btn dungeon-btn-secondary">Salvar Ficha</button>
      </form>
    </details>`;
}
