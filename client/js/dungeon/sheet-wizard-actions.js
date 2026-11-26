/**
 * @file Ações do assistente de criar ficha: leem o formulário do passo para o rascunho em memória (o que foi digitado
 * nunca se perde), navegam, pedem confirmação de descarte e gravam só no resumo. Carregado sob demanda (`import()`).
 *
 * @module dungeon/sheet-wizard-actions
 */
import { checkVoxchar, VOXCHAR_MAX_BYTES } from "./voxchar-check.js";
import { buildImportedSheet } from "./voxchar.js";
import { dispatchCampaignOp } from "./dungeon-sync-bridge.js";
import { createWizard, finishGuided, finishQuick, validateStep, WIZARD_STEPS } from "./sheet-wizard.js";
import { renderWizard } from "./sheet-wizard-view.js";

const val = (values, name) => String(values[name] ?? "");
const checked = (values, name) => [].concat(values[name] ?? []);
const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];

const READERS = {
  1: (f, d) => { d.name = val(f, "sheetName"); d.class_name = val(f, "className"); d.ancestry = val(f, "ancestry"); },
  2: (f, d) => { for (const id of ABILITIES) d.abilities[id] = val(f, id); },
  3: (f, d) => { d.proficientSkills = checked(f, "skill"); d.expertSkills = checked(f, "expertSkill").filter((id) => d.proficientSkills.includes(id)); },
  4: (f, d) => { d.proficientSaves = checked(f, "saveProf"); },
  5: (f, d) => { d.armor_class = val(f, "armorClass"); d.speed_ft = val(f, "speedFt"); d.hitDie = val(f, "hitDie"); },
};

/** Copia os campos do passo atual (foto do formulário) para o rascunho: o que foi digitado fica, mesmo com erro. */
function collect(values, wz) {
  if (wz.mode === "quick") { wz.draft.name = val(values, "sheetName"); return; }
  READERS[wz.step]?.(values, wz.draft);
}

/**
 * Abre o assistente (sem escolher modo ainda); a tela é montada pelo módulo de visão carregado sob demanda.
 * @param {object} state Estado da sessão.
 * @returns {Promise<void>} Conclui com `state.sheetWizard` e o renderizador prontos.
 */
export async function openWizard(state) {
  state.sheetWizard = createWizard();
  state.sheetWizardView = renderWizard;
}

/**
 * Escolhe a entrada: Rápido, Guiado ou Importar.
 * @param {object} state Estado da sessão.
 * @param {{dataset: {mode?: string}}} el Botão do cartão.
 * @returns {Promise<void>} Conclui após trocar o modo.
 */
export async function chooseMode(state, el) {
  if (!state.sheetWizard) return;
  state.sheetWizard.mode = el.dataset.mode || "";
  state.sheetWizard.issues = [];
}

function close(state) {
  state.sheetWizard = null;
  state.sheetWizardView = null;
}

async function finish(state, wz, opts) {
  const out = wz.mode === "quick" ? await finishQuick(state, wz.draft.name, opts) : await finishGuided(state, wz.draft, opts);
  if (out.ok) { close(state); return; }
  wz.issues = out.issues;
  if (out.step) wz.step = Math.min(out.step, WIZARD_STEPS.length);
}

/**
 * Avança, volta ou grava, conforme `data-dir` do botão. Avançar com aviso não muda de passo.
 * @param {object} state Estado da sessão.
 * @param {{dataset: {dir?: string}}} el Botão de navegação.
 * @param {Object<string, string|string[]>} values Foto do formulário do passo (`snapshotWizardForm`).
 * @param {{store?: object}} [opts] Opções (`store`).
 * @returns {Promise<void>} Conclui após navegar ou gravar.
 */
export async function stepWizard(state, el, values, opts = {}) {
  const wz = state.sheetWizard;
  if (!wz) return;
  collect(values, wz);
  const dir = el.dataset.dir;
  if (dir === "finish") return finish(state, wz, opts);
  if (dir === "back") { wz.step = Math.max(1, wz.step - 1); wz.issues = []; return; }
  wz.issues = validateStep(wz.step, wz.draft);
  if (!wz.issues.length) wz.step += 1;
}

/**
 * Lê o formulário do item e o acrescenta ao rascunho; o item só é gravado no resumo.
 * @param {object} state Estado da sessão.
 * @param {unknown} _el Botão (não usado).
 * @param {Object<string, string|string[]>} values Foto do formulário do passo.
 * @returns {Promise<void>} Conclui após acrescentar ou mostrar o aviso.
 */
export async function addItem(state, _el, values) {
  const wz = state.sheetWizard;
  if (!wz) return;
  const item = { label: val(values, "itemLabel"), qty: val(values, "itemQty"), weightLb: val(values, "itemWeight"), armorKind: val(values, "itemArmorKind"), armorAc: val(values, "itemArmorAc") };
  const trial = { ...wz.draft, items: [...wz.draft.items, item] };
  wz.issues = validateStep(6, trial);
  if (!wz.issues.length) wz.draft.items.push(item);
}

/**
 * Tira um item do rascunho.
 * @param {object} state Estado da sessão.
 * @param {{dataset: {index?: string}}} el Botão Remover.
 * @returns {Promise<void>} Conclui após remover.
 */
export async function removeItem(state, el) {
  state.sheetWizard?.draft.items.splice(Number(el.dataset.index), 1);
}

/**
 * Cancelar e Esc pedem confirmação; descartar apaga o rascunho (nada foi gravado).
 * @param {object} state Estado da sessão.
 * @param {unknown} _el Botão (não usado).
 * @param {Object<string, string|string[]>} values Foto do formulário do passo.
 * @param {{confirm?: boolean, discard?: boolean}} [how] `confirm: false` mantém; `discard: true` descarta.
 * @returns {Promise<void>} Conclui após marcar a confirmação ou descartar.
 */
export async function cancelWizard(state, _el, values, how = {}) {
  const wz = state.sheetWizard;
  if (!wz) return;
  if (how.discard) return close(state);
  if (how.confirm === false) { wz.confirmCancel = false; return; }
  collect(values, wz);
  wz.confirmCancel = true;
}

/**
 * Importa um `.voxchar` pelo assistente: mesmas defesas do painel Editar; inválido mostra os motivos e não grava.
 * @param {object} state Estado da sessão.
 * @param {{size: number, bytes?: Uint8Array, arrayBuffer?: Function}} file Arquivo escolhido.
 * @param {{store?: object}} [opts] Opções (`store`).
 * @returns {Promise<void>} Conclui com a ficha criada (assistente fechado) ou os motivos no assistente.
 */
export async function importInWizard(state, file, opts = {}) {
  const wz = state.sheetWizard;
  if (!wz) return;
  const fail = (messages) => { wz.issues = messages.map((message) => ({ field: "voxchar", message })); };
  if (file.size > VOXCHAR_MAX_BYTES) return fail([`Arquivo grande demais (${file.size} bytes; o limite é ${VOXCHAR_MAX_BYTES}).`]);
  const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(await file.arrayBuffer());
  const out = checkVoxchar(bytes);
  if (!out.ok) return fail(out.issues);
  const sheet = buildImportedSheet(state, out.doc, out.pack);
  await dispatchCampaignOp(state, "SHEET_UPSERT", { sheet, setActive: true }, { store: opts.store });
  state.campaignNotice = `Ficha "${sheet.attributes_lww.name}" criada do arquivo .voxchar.`;
  close(state);
}
