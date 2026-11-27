/**
 * @file Núcleo do assistente de criar ficha (docs/specs/assistente-ficha-v0.md): estado do rascunho em memória,
 * validação por passo e gravação num único `SHEET_UPSERT`. Nada é gravado antes do resumo. Reaproveita as
 * validações do painel Editar e o mesmo caminho do import `.voxchar` (`checkVoxchar` + `buildImportedSheet`).
 * Carregado sob demanda (`import()`), fora do precache.
 *
 * @module dungeon/sheet-wizard
 */
import { validateSheetEdit } from "./sheet-edit-validate.js";
import { checkVoxchar, VOXCHAR_FORMAT, VOXCHAR_LIMITS } from "./voxchar-check.js";
import { buildImportedSheet, freshSheet } from "./voxchar.js";
import { dispatchCampaignOp } from "./dungeon-sync-bridge.js";
import { DEFAULT_HIT_DIE, validHitDie } from "./system-rest.js";
import { getSystemPack } from "./system-pack.js";
import { ensureSheetMeta } from "./vtt-schema.js";
import { getDefaultVttStore } from "./vtt-store.js";

/** Sistema da ficha criada pelo assistente. */
export const WIZARD_SYSTEM_ID = "5e";
/** Passos do Guiado, na ordem. */
export const WIZARD_STEPS = Object.freeze(["Quem é", "Atributos", "Perícias", "Salvaguardas", "Defesa e movimento", "Equipamento", "Resumo"]);
/** Limite de texto de nome, classe e ancestralidade. */
export const WIZARD_TEXT_MAX = 60;

const ENC = new TextEncoder();
const STEP_FIELDS = {
  1: ["sheetName", "className", "ancestry"],
  2: ["str", "dex", "con", "int", "wis", "cha"],
  3: ["skill", "expertSkill"],
  4: ["saveProf"],
  5: ["armorClass", "speedFt", "hitDie"],
  6: ["item"],
};

/**
 * Rascunho novo do Guiado, com os padrões do sistema.
 * @returns {object} Rascunho (`name`, `abilities`, `items`…), só em memória.
 */
export function createDraft() {
  return {
    name: "", class_name: "", ancestry: "",
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    proficientSkills: [], expertSkills: [], proficientSaves: [],
    armor_class: 10, speed_ft: 30, hitDie: String(DEFAULT_HIT_DIE), items: [],
  };
}

/**
 * Estado inicial do assistente (`state.sheetWizard`).
 * @returns {{mode: string, step: number, draft: object, issues: Array, confirmCancel: boolean}} Estado, sem modo escolhido.
 */
export function createWizard() {
  return { mode: "", step: 1, draft: createDraft(), issues: [], confirmCancel: false };
}

function textIssues(draft) {
  const too = (field, label, v) => (String(v ?? "").length > WIZARD_TEXT_MAX ? { field, message: `${label}: no máximo ${WIZARD_TEXT_MAX} caracteres (tem ${String(v).length}).` } : null);
  return [too("sheetName", "Nome", draft.name), too("className", "Classe / Título", draft.class_name), too("ancestry", "Ancestralidade", draft.ancestry)].filter(Boolean);
}

function itemIssues(items, pack) {
  const kinds = pack.formulas.armor?.kinds || {};
  return items.flatMap((it, i) => {
    const at = `Item ${i + 1}`;
    const qty = Number(it.qty);
    const w = Number(it.weightLb);
    return [
      !String(it.label ?? "").trim() || String(it.label).length > 80 ? `${at}: o nome é obrigatório e vai até 80 caracteres.` : null,
      !Number.isInteger(qty) || qty < 1 || qty > VOXCHAR_LIMITS.qty ? `${at}: quantidade deve ser um inteiro de 1 a ${VOXCHAR_LIMITS.qty}.` : null,
      !Number.isFinite(w) || w < 0 || w > VOXCHAR_LIMITS.weight ? `${at}: peso deve ficar entre 0 e ${VOXCHAR_LIMITS.weight} lb.` : null,
      it.armorKind && !kinds[it.armorKind] ? `${at}: tipo de armadura desconhecido neste sistema.` : null,
    ].filter(Boolean).map((message) => ({ field: "item", message }));
  });
}

function listIssues(draft, pack) {
  const skills = new Set(pack.skills.map((s) => s.id));
  return draft.proficientSkills.filter((id) => !skills.has(id)).map((id) => ({ field: "skill", message: `Perícia: "${id}" não existe neste sistema.` }));
}

function newRuleIssues(draft) {
  const hitDie = validHitDie(draft.hitDie) === null ? [{ field: "hitDie", message: "Dado de Vida: use d4, d6, d8, d10 ou d12." }] : [];
  return [...textIssues(draft), ...hitDie];
}

function editPatch(draft) {
  return { name: draft.name, armor_class: draft.armor_class, speedFt: draft.speed_ft, proficientSaves: draft.proficientSaves, expertSkills: draft.expertSkills, ...draft.abilities };
}

/**
 * Valida os campos de um passo: as regras do painel Editar mais as regras novas do assistente.
 * @param {number} step Passo de 1 a 6.
 * @param {object} draft Rascunho.
 * @returns {Array<{field: string, message: string}>} Avisos do passo (vazio = pode avançar).
 */
export function validateStep(step, draft) {
  const pack = getSystemPack(WIZARD_SYSTEM_ID);
  const fields = STEP_FIELDS[step] || [];
  const base = validateSheetEdit(editPatch(draft), { pack, trainedSkills: draft.proficientSkills }).issues;
  const extra = [...newRuleIssues(draft), ...listIssues(draft, pack), ...itemIssues(draft.items, pack)];
  return [...base, ...extra].filter((i) => fields.includes(i.field));
}

/**
 * Primeiro passo (1 a 6) com aviso, para voltar a ele quando o resumo revalida.
 * @param {object} draft Rascunho.
 * @returns {{step: number, issues: Array}|null} Passo e avisos, ou `null` se o rascunho está válido.
 */
export function firstInvalidStep(draft) {
  for (let step = 1; step <= 6; step += 1) {
    const issues = validateStep(step, draft);
    if (issues.length) return { step, issues };
  }
  return null;
}

function itemsToOrset(items) {
  return Object.fromEntries(items.map((it, i) => [`w${i}`, {
    id: `w${i}`, label: String(it.label).trim(), qty: Number(it.qty), weightLb: Number(it.weightLb),
    ...(it.armorKind ? { armor: { kind: it.armorKind, ac: Math.trunc(Number(it.armorAc) || 0) } } : {}),
  }]));
}

/**
 * Converte o rascunho num documento no formato `.voxchar`, para passar pelo mesmo `checkVoxchar` do import.
 * @param {object} draft Rascunho validado.
 * @param {object} pack Pacote de sistema.
 * @returns {object} Documento `.voxchar` (sem identidade, sem estado de jogo).
 */
export function draftToDoc(draft, pack) {
  const attrs = { name: draft.name.trim(), ancestry: draft.ancestry.trim(), class_name: draft.class_name.trim(), level: 1, armor_class: Number(draft.armor_class), speed_ft: Number(draft.speed_ft), abilities: { ...draft.abilities } };
  const choices = { level: 1, abilities: { ...draft.abilities }, proficientSkills: draft.proficientSkills, expertSkills: draft.expertSkills, proficientSaves: draft.proficientSaves, speedFt: attrs.speed_ft, hitDie: validHitDie(draft.hitDie) };
  return {
    kind: "voxchar", format: VOXCHAR_FORMAT, system: { id: pack.id, version: pack.version }, exportedAt: new Date().toISOString(),
    sheet: { attributes_lww: attrs, system_choices: choices, inventory_orset: itemsToOrset(draft.items), sheet_meta: {} },
  };
}

async function upsert(state, sheet, opts) {
  await dispatchCampaignOp(state, "SHEET_UPSERT", { sheet, setActive: true }, { store: opts.store || getDefaultVttStore() });
  state.campaignNotice = `Ficha "${sheet.attributes_lww.name}" criada. Ajuste o resto em Editar Dados da Ficha.`;
}

/**
 * Grava a ficha do Guiado num único `SHEET_UPSERT`, depois de revalidar tudo com o mesmo `checkVoxchar` do import.
 * @param {object} state Estado da sessão.
 * @param {object} draft Rascunho.
 * @param {{store?: object}} [opts] Opções (`store`).
 * @returns {Promise<{ok: boolean, step?: number, issues?: Array}>} Resultado; em recusa, o passo e os avisos.
 */
export async function finishGuided(state, draft, opts = {}) {
  const bad = firstInvalidStep(draft);
  if (bad) return { ok: false, ...bad };
  const pack = getSystemPack(WIZARD_SYSTEM_ID);
  const checked = checkVoxchar(ENC.encode(JSON.stringify(draftToDoc(draft, pack))));
  if (!checked.ok) return { ok: false, step: 7, issues: checked.issues.map((message) => ({ field: "resumo", message })) };
  await upsert(state, buildImportedSheet(state, checked.doc, checked.pack), opts);
  return { ok: true };
}

/**
 * Grava a ficha do Rápido: só o nome; o resto vem dos padrões da ficha nova (`createCharacterSheetDoc`).
 * @param {object} state Estado da sessão.
 * @param {string} name Nome digitado.
 * @param {{store?: object}} [opts] Opções (`store`).
 * @returns {Promise<{ok: boolean, issues?: Array}>} Resultado; nome inválido não grava nada.
 */
export async function finishQuick(state, name, opts = {}) {
  const draft = { ...createDraft(), name };
  const issues = [...validateSheetEdit({ name }).issues.filter((i) => i.field === "sheetName"), ...textIssues(draft).filter((i) => i.field === "sheetName")];
  if (issues.length) return { ok: false, issues };
  const pack = getSystemPack(WIZARD_SYSTEM_ID);
  const fresh = freshSheet(state);
  const sheet = ensureSheetMeta({ ...fresh, attributes_lww: { ...fresh.attributes_lww, name: name.trim() }, system: { id: pack.id, version: pack.version } });
  await upsert(state, sheet, opts);
  return { ok: true };
}
