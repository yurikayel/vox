/**
 * @file Tela do assistente de criar ficha (docs/specs/assistente-ficha-v0.md §6): três entradas, sete passos do Guiado,
 * avisos em `role="alert"` com o foco no primeiro campo com erro e confirmação de descarte. Todo texto é escapado.
 * Carregado sob demanda (`import()`), fora do precache.
 *
 * @module dungeon/sheet-wizard-view
 */
import { escapeHtml } from "../shared/html.js";
import { fieldErrorAttrs, issueId } from "./field-issues.js";
import { getSystemPack } from "./system-pack.js";
import { deriveSheet } from "./system-derive.js";
import { HIT_DIE_SIDES } from "./system-rest.js";
import { WIZARD_STEPS, WIZARD_SYSTEM_ID, WIZARD_TEXT_MAX } from "./sheet-wizard.js";

const esc = (v) => escapeHtml(String(v ?? ""));
const btn = (action, label, extra = "") => `<button type="button" class="dungeon-btn dungeon-btn-secondary" data-dungeon="${action}"${extra}>${label}</button>`;

/** Marca o alvo do foco depois de redesenhar: o primeiro campo com erro ou, sem erro, o título do passo. */
function focusAttr(wz, field) {
  return wz.issues[0]?.field === field ? " data-wizard-focus" : "";
}

const ISSUE_PREFIX = "wizard-issue";

function alertHtml(issues) {
  if (!issues.length) return `<div role="alert" class="dungeon-alert-warn" hidden></div>`;
  const items = issues.map((i, n) => `<li id="${issueId(ISSUE_PREFIX, n)}">${esc(i.message)}</li>`).join("");
  return `<div role="alert" class="dungeon-alert-warn"><strong>Corrija para continuar:</strong><ul>${items}</ul></div>`;
}

function textField(wz, name, label, value, max = WIZARD_TEXT_MAX) {
  return `<label class="dungeon-field-mini dungeon-field-wide"><span>${label}</span><input class="dungeon-input" name="${name}" type="text" value="${esc(value)}"${focusAttr(wz, name)}${fieldErrorAttrs(wz.issues, name, ISSUE_PREFIX)} /><small>até ${max} caracteres</small></label>`;
}

function numberField(wz, name, label, value, { min, max }) {
  return `<label class="dungeon-field-mini"><span>${label}</span><input class="dungeon-input" name="${name}" type="number" min="${min}" max="${max}" value="${esc(value)}"${focusAttr(wz, name)}${fieldErrorAttrs(wz.issues, name, ISSUE_PREFIX)} /></label>`;
}

function checkGroup(wz, name, legend, options, chosen) {
  const boxes = options.map((o) => `<label><input type="checkbox" name="${name}" value="${esc(o.id)}"${chosen.includes(o.id) ? " checked" : ""} /> ${esc(o.label)}</label>`).join(" ");
  return `<fieldset class="dungeon-fieldset"${focusAttr(wz, name)}${fieldErrorAttrs(wz.issues, name, ISSUE_PREFIX)} tabindex="-1"><legend>${legend}</legend>${boxes}</fieldset>`;
}

function stepBody(wz, pack) {
  const d = wz.draft;
  const bodies = {
    1: () => `${textField(wz, "sheetName", "Nome", d.name)}${textField(wz, "className", "Classe / Título", d.class_name)}${textField(wz, "ancestry", "Ancestralidade", d.ancestry)}`,
    2: () => pack.abilities.map((a) => numberField(wz, a.id, esc(a.label || a.id), d.abilities[a.id], { min: 1, max: 30 })).join(""),
    3: () => `${checkGroup(wz, "skill", "Perícias treinadas", pack.skills, d.proficientSkills)}${checkGroup(wz, "expertSkill", "Especialização (só em perícia treinada)", pack.skills.filter((s) => d.proficientSkills.includes(s.id)), d.expertSkills)}`,
    4: () => checkGroup(wz, "saveProf", "Salvaguardas treinadas", pack.abilities.map((a) => ({ id: a.id, label: a.label || a.id })), d.proficientSaves),
    5: () => `${numberField(wz, "armorClass", "CA", d.armor_class, { min: 1, max: 40 })}${numberField(wz, "speedFt", "Deslocamento (pés)", d.speed_ft, { min: 0, max: 200 })}${pack.formulas.hitDice ? hitDieField(wz, d) : ""}`,
    6: () => itemsBody(wz, pack),
    7: () => summaryBody(wz, pack),
  };
  return bodies[wz.step]();
}

function hitDieField(wz, d) {
  const opts = HIT_DIE_SIDES.map((s) => `<option value="${s}"${String(d.hitDie) === String(s) ? " selected" : ""}>d${s}</option>`).join("");
  return `<label class="dungeon-field-mini"><span>Dado de Vida</span><select class="dungeon-input" name="hitDie"${focusAttr(wz, "hitDie")}${fieldErrorAttrs(wz.issues, "hitDie", ISSUE_PREFIX)}>${opts}</select></label>`;
}

function itemsBody(wz, pack) {
  const kinds = Object.entries(pack.formulas.armor?.kinds || {}).map(([id, k]) => `<option value="${esc(id)}">${esc(k.label)}</option>`).join("");
  const list = wz.draft.items.map((it, i) => `<li>${esc(it.label)} ×${esc(it.qty)} · ${esc(it.weightLb)} lb ${btn("wizard-remove-item", "Remover", ` data-index="${i}" aria-label="Remover ${esc(it.label)}"`)}</li>`).join("");
  return `<ul>${list}</ul>
    <fieldset class="dungeon-fieldset"${focusAttr(wz, "item")} tabindex="-1"><legend>Novo item (opcional)</legend>
      <label>Nome <input class="dungeon-input" name="itemLabel" maxlength="80" /></label>
      <label>Quantidade <input class="dungeon-input" name="itemQty" type="number" min="1" value="1" /></label>
      <label>Peso (lb) <input class="dungeon-input" name="itemWeight" type="number" min="0" step="0.5" value="0.5" /></label>
      <label>Armadura <select class="dungeon-input" name="itemArmorKind"><option value="">Sem armadura</option>${kinds}</select></label>
      <label>CA da armadura <input class="dungeon-input" name="itemArmorAc" type="number" min="0" max="30" /></label>
      ${btn("wizard-add-item", "Adicionar item")}
    </fieldset>`;
}

function summaryBody(wz, pack) {
  const d = wz.draft;
  const view = deriveSheet(pack, { level: 1, abilities: d.abilities, proficientSkills: d.proficientSkills, expertSkills: d.expertSkills, proficientSaves: d.proficientSaves }, {});
  const mods = pack.abilities.map((a) => `<li>${esc(a.label || a.id)} ${esc(d.abilities[a.id])} (mod. ${esc(view.abilities.find((x) => x.id === a.id)?.modifier ?? "")})</li>`).join("");
  return `<p><strong>${esc(d.name)}</strong> · ${esc(d.class_name)} ${esc(d.ancestry)} · nível 1</p>
    <p>CA ${esc(d.armor_class)} · Deslocamento ${esc(d.speed_ft)} pés${pack.formulas.hitDice ? ` · Dado de Vida d${esc(d.hitDie)}` : ""} · ${d.items.length} item(ns)</p><ul>${mods}</ul>
    <p>Bônus de proficiência +${esc(view.proficiency)} · Iniciativa ${esc(view.initiative)} · Percepção passiva ${esc(view.passivePerception)}</p>
    <p class="dungeon-muted">Nada foi salvo ainda. "Criar ficha" grava tudo de uma vez.</p>`;
}

function navHtml(wz) {
  const last = wz.step === WIZARD_STEPS.length;
  const back = wz.step > 1 ? btn("wizard-step", "Voltar", ' data-dir="back"') : "";
  const next = btn("wizard-step", last ? "Criar ficha" : "Avançar", ` data-dir="${last ? "finish" : "next"}"`);
  return `<div class="dungeon-input-row">${back}${next}${btn("wizard-cancel", "Cancelar")}</div>`;
}

function guidedHtml(wz) {
  const pack = getSystemPack(wz.systemId || WIZARD_SYSTEM_ID);
  const title = `Passo ${wz.step} de ${WIZARD_STEPS.length}: ${WIZARD_STEPS[wz.step - 1]}`;
  const focus = wz.issues.length ? "" : " data-wizard-focus";
  return `<h3 tabindex="-1"${focus}>${title}</h3>${alertHtml(wz.issues)}<div data-wizard-form>${stepBody(wz, pack)}</div>${navHtml(wz)}`;
}

function quickHtml(wz) {
  return `<h3 tabindex="-1"${wz.issues.length ? "" : " data-wizard-focus"}>Rápido: só o nome</h3>${alertHtml(wz.issues)}
    <div data-wizard-form>${textField(wz, "sheetName", "Nome", wz.draft.name)}</div>
    <div class="dungeon-input-row">${btn("wizard-step", "Criar ficha", ' data-dir="finish"')}${btn("wizard-cancel", "Cancelar")}</div>`;
}

function importHtml(wz) {
  return `<h3 tabindex="-1"${wz.issues.length ? "" : " data-wizard-focus"}>Importar ficha</h3>${alertHtml(wz.issues)}
    <label for="dungeon-wizard-import" class="dungeon-btn dungeon-btn-ghost dungeon-file-trigger">Escolher arquivo .voxchar</label>
    <input id="dungeon-wizard-import" class="sr-only" type="file" accept=".voxchar,application/json" data-dungeon="wizard-import" />
    ${btn("wizard-cancel", "Cancelar")}`;
}

function modesHtml(wz) {
  const card = (mode, title, text) => `<button type="button" class="dungeon-btn dungeon-btn-ghost" data-dungeon="wizard-mode" data-mode="${mode}"><strong>${title}</strong><br />${text}</button>`;
  return `<h3 tabindex="-1" data-wizard-focus>Nova ficha</h3>${alertHtml(wz.issues)}<div class="dungeon-input-row">
    ${card("quick", "Rápido", "só o nome; o resto vem dos padrões")}${card("guided", "Guiado", "7 passos")}${card("import", "Importar", "de um arquivo .voxchar")}</div>${btn("wizard-cancel", "Cancelar")}`;
}

function discardHtml() {
  return `<div role="alertdialog" aria-label="Descartar o rascunho?" class="dungeon-alert-warn"><p><strong>Descartar o rascunho?</strong> O que foi digitado será perdido; nada foi salvo.</p>
    ${btn("wizard-discard", "Descartar")}${btn("wizard-keep", "Continuar editando", " data-wizard-focus")}</div>`;
}

/**
 * HTML do assistente conforme o modo e o passo. Texto sempre escapado; o painel inteiro sai se não há assistente aberto.
 * @param {{mode: string, step: number, draft: object, issues: Array, confirmCancel: boolean}|null} wz Estado (`state.sheetWizard`).
 * @returns {string} HTML do painel.
 */
export function renderWizard(wz) {
  if (!wz) return "";
  const body = wz.confirmCancel ? discardHtml() : { quick: quickHtml, guided: guidedHtml, import: importHtml }[wz.mode]?.(wz) ?? modesHtml(wz);
  return `<section class="dungeon-panel" data-dungeon-wizard aria-label="Assistente de criar ficha">${body}</section>`;
}
