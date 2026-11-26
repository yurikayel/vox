/**
 * @file Assistente de criar ficha (docs/specs/assistente-ficha-v0.md §8, testes 1 a 14): Rápido, Guiado e Importar,
 * validação por passo, nada gravado antes do resumo e abandono sem estado parcial. O F5 (teste 13, parte `reload`) vai no e2e.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { createAndSelectCampaign } from "../client/js/dungeon/dungeon-persistence.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";
import { deriveSheet } from "../client/js/dungeon/system-derive.js";
import { getSystemPack } from "../client/js/dungeon/system-pack.js";
import { exportVoxchar, importVoxchar } from "../client/js/dungeon/voxchar.js";
import { createDraft, createWizard, draftToDoc, finishGuided, finishQuick, validateStep, WIZARD_STEPS } from "../client/js/dungeon/sheet-wizard.js";
import { renderWizard } from "../client/js/dungeon/sheet-wizard-view.js";
import * as actions from "../client/js/dungeon/sheet-wizard-actions.js";
import { ACTION_HANDLERS, snapshotWizardForm } from "../client/js/dungeon/dungeon-controller-actions.js";
import { escapeWizardJob } from "../client/js/dungeon/dungeon-controller.js";
import { VOXCHAR_LIMITS } from "../client/js/dungeon/voxchar-check.js";

const fakeContainer = (vals) => vals;

async function ready() {
  const store = createVttStore(createMemoryVttBackend());
  const state = createDungeonSessionState();
  await createAndSelectCampaign(state, "Mesa", { store });
  const writes = [];
  const real = store.appendOp.bind(store);
  store.appendOp = (...a) => { writes.push(a[1].type); return real(...a); };
  return { state, store, writes };
}

const okDraft = () => ({ ...createDraft(), name: "Lyra", class_name: "Ladina", ancestry: "Elfa", proficientSkills: ["stealth"], expertSkills: ["stealth"], proficientSaves: ["dex"], armor_class: 14, items: [{ label: "Adaga", qty: 2, weightLb: 1, armorKind: "", armorAc: "" }] });

test("1. Rápido cria a ficha com o nome dado e os padrões do pacote, com id novo", async () => {
  const { state, store, writes } = await ready();
  const before = state.sheet.character_id;
  assert.equal((await finishQuick(state, "  Bram  ", { store })).ok, true);
  assert.equal(state.sheet.attributes_lww.name, "Bram");
  assert.equal(state.sheet.attributes_lww.armor_class, 10);
  assert.equal(state.sheet.system.id, "dnd5e-2024");
  assert.notEqual(state.sheet.character_id, before);
  assert.deepEqual(writes, ["SHEET_UPSERT"]);
});

test("2. Guiado: cada passo recusa valor fora do limite com o motivo do campo", () => {
  const d = okDraft();
  assert.match(validateStep(1, { ...d, name: "" })[0].message, /precisa de um nome/);
  assert.match(validateStep(2, { ...d, abilities: { ...d.abilities, str: 31 } })[0].message, /fora do intervalo 1–30/);
  assert.match(validateStep(3, { ...d, expertSkills: ["arcana"] })[0].message, /só vale em perícia treinada/);
  assert.match(validateStep(4, { ...d, proficientSaves: ["xyz"] })[0].message, /não existe neste sistema/);
  assert.match(validateStep(5, { ...d, armor_class: 99 })[0].message, /fora do intervalo 1–40/);
  assert.match(validateStep(5, { ...d, speed_ft: 500 })[0].message, /Deslocamento/);
  assert.match(validateStep(6, { ...d, items: [{ label: "", qty: 1, weightLb: 1 }] })[0].message, /Item 1/);
  assert.equal(validateStep(1, d).length + validateStep(2, d).length + validateStep(5, d).length, 0);
});

test("3. avançar com campo inválido não muda de passo; voltar mantém o que foi digitado", async () => {
  const { state } = await ready();
  await actions.openWizard(state);
  await actions.chooseMode(state, { dataset: { mode: "guided" } });
  await actions.stepWizard(state, { dataset: { dir: "next" } }, fakeContainer({ sheetName: "", className: "Bardo", ancestry: "" }));
  assert.equal(state.sheetWizard.step, 1);
  assert.equal(state.sheetWizard.draft.class_name, "Bardo");
  await actions.stepWizard(state, { dataset: { dir: "next" } }, fakeContainer({ sheetName: "Mira", className: "Bardo", ancestry: "" }));
  assert.equal(state.sheetWizard.step, 2);
  await actions.stepWizard(state, { dataset: { dir: "back" } }, fakeContainer({}));
  assert.equal(state.sheetWizard.step, 1);
  assert.equal(state.sheetWizard.draft.name, "Mira");
});

test("4 e 12. nada é gravado antes do resumo (inclusive o equipamento); o resumo grava ficha e inventário num único SHEET_UPSERT", async () => {
  const { state, store, writes } = await ready();
  const wz = createWizard();
  wz.draft = okDraft();
  assert.deepEqual(writes, []);
  const out = await finishGuided(state, wz.draft, { store });
  assert.equal(out.ok, true);
  assert.deepEqual(writes, ["SHEET_UPSERT"]);
  assert.equal(Object.values(state.sheet.inventory_orset)[0].label, "Adaga");
});

test("5. o resumo mostra os derivados iguais aos do system-derive para os mesmos valores", () => {
  const wz = { ...createWizard(), mode: "guided", step: 7, draft: okDraft() };
  const pack = getSystemPack("dnd5e-2024");
  const view = deriveSheet(pack, { level: 1, abilities: wz.draft.abilities, proficientSkills: ["stealth"], expertSkills: ["stealth"], proficientSaves: ["dex"] }, {});
  const html = renderWizard(wz);
  assert.match(html, new RegExp(`Bônus de proficiência \\+${view.proficiency}`));
  assert.match(html, new RegExp(`Iniciativa ${view.initiative}`));
});

test("6. a ficha do Guiado é igual à do import de um .voxchar com os mesmos valores", async () => {
  const a = await ready();
  const b = await ready();
  await finishGuided(a.state, okDraft(), { store: a.store });
  const doc = draftToDoc(okDraft(), getSystemPack("dnd5e-2024"));
  await importVoxchar(b.state, { bytes: new TextEncoder().encode(JSON.stringify(doc)) }, { store: b.store });
  const strip = (s) => JSON.stringify({ attrs: s.attributes_lww, choices: s.system_choices, inv: Object.values(s.inventory_orset).map(({ label, qty }) => [label, qty]), pools: s.pools_base });
  assert.equal(strip(a.state.sheet), strip(b.state.sheet));
});

test("7. importar válido cria ficha nova; inválido mostra os motivos e não grava", async () => {
  const { state, store, writes } = await ready();
  const src = await ready();
  await finishQuick(src.state, "Zed", { store: src.store });
  await actions.openWizard(state);
  await actions.chooseMode(state, { dataset: { mode: "import" } });
  await actions.importInWizard(state, { size: 3, bytes: new TextEncoder().encode("{x") }, { store });
  assert.ok(state.sheetWizard.issues.length > 0);
  assert.deepEqual(writes, []);
  const artifact = exportVoxchar(src.state.sheet);
  await actions.importInWizard(state, { size: artifact.bytes.length, bytes: artifact.bytes }, { store });
  assert.equal(state.sheetWizard, null);
  assert.equal(state.sheet.attributes_lww.name, "Zed");
  assert.deepEqual(writes, ["SHEET_UPSERT"]);
});

test("8. texto com marcação aparece escapado em todos os passos", () => {
  const xss = "<img src=x onerror=alert(1)>";
  const draft = { ...okDraft(), name: xss, class_name: xss, ancestry: xss, items: [{ label: xss, qty: 1, weightLb: 1 }] };
  for (let step = 1; step <= WIZARD_STEPS.length; step += 1) {
    const html = renderWizard({ ...createWizard(), mode: "guided", step, draft, issues: [{ field: "sheetName", message: xss }] });
    assert.equal(html.includes("<img"), false, `passo ${step}`);
  }
});

test("9. criar não altera nenhuma ficha existente", async () => {
  const { state, store } = await ready();
  const before = JSON.stringify(state.sheet);
  const beforeId = state.sheet.character_id;
  await finishQuick(state, "Nova", { store });
  assert.notEqual(state.sheet.character_id, beforeId);
  assert.equal(JSON.stringify(state.sheet).includes("Nova"), true);
  assert.equal(before.includes('"Nova"'), false);
});

test("10. os módulos do assistente não estão em SHELL_ASSETS nem importados estaticamente pelo shell", () => {
  const sw = fs.readFileSync("client/sw.js", "utf8");
  for (const name of ["sheet-wizard"]) assert.equal(sw.includes(name), false, name);
  for (const f of ["client/js/dungeon/dungeon-controller-actions.js", "client/js/dungeon/dungeon-controller.js", "client/js/dungeon/screen-sheet.js"]) {
    assert.equal(/from\s+["'][^"']*sheet-wizard/.test(fs.readFileSync(f, "utf8")), false, f);
  }
});

test("11. nome e ancestralidade acima de 60 caracteres e Dado de Vida fora de d4–d12 recusam o avanço com o motivo", async () => {
  const d = okDraft();
  assert.match(validateStep(1, { ...d, name: "a".repeat(61) })[0].message, /no máximo 60/);
  assert.match(validateStep(1, { ...d, ancestry: "a".repeat(61) })[0].message, /Ancestralidade/);
  assert.match(validateStep(5, { ...d, hitDie: "20" })[0].message, /d4, d6, d8, d10 ou d12/);
  const { state, store } = await ready();
  assert.equal((await finishQuick(state, "a".repeat(61), { store })).ok, false);
});

test("13. abandonar (Cancelar ou Esc confirmado) não deixa estado parcial nem escrita", async () => {
  const { state, writes } = await ready();
  const keys = () => JSON.stringify(Object.entries(globalThis.localStorage));
  const before = keys();
  await ACTION_HANDLERS["wizard-open"](state, null, fakeContainer({}));
  await ACTION_HANDLERS["wizard-mode"](state, { dataset: { mode: "guided" } }, fakeContainer({}));
  await ACTION_HANDLERS["wizard-cancel"](state, null, fakeContainer({ sheetName: "Rascunho" }));
  assert.equal(state.sheetWizard.confirmCancel, true, "Cancelar pede confirmação");
  await ACTION_HANDLERS["wizard-keep"](state, null, fakeContainer({}));
  assert.equal(state.sheetWizard.confirmCancel, false);
  await ACTION_HANDLERS["wizard-cancel"](state, null, fakeContainer({}));
  await ACTION_HANDLERS["wizard-discard"](state, null, fakeContainer({}));
  assert.equal(state.sheetWizard, null);
  assert.deepEqual(writes, []);
  assert.equal(keys(), before);
});

test("14. acessibilidade: Passo X de Y, rótulos, role=alert, foco no primeiro erro e Esc com confirmação", () => {
  const wz = { ...createWizard(), mode: "guided", step: 2, draft: okDraft(), issues: [{ field: "dex", message: "Destreza: fora" }] };
  const html = renderWizard(wz);
  assert.match(html, /Passo 2 de 7: Atributos/);
  assert.match(html, /role="alert"/);
  assert.match(html, /name="dex"[^>]*data-wizard-focus/);
  assert.equal((html.match(/<input/g) || []).length, (html.match(/<label/g) || []).length, "todo campo tem rótulo");
  assert.match(renderWizard({ ...wz, confirmCancel: true }), /role="alertdialog"/);
  const ctl = fs.readFileSync("client/js/dungeon/dungeon-controller.js", "utf8");
  assert.match(ctl, /Escape/);
});

test("15. fronteira de texto: 60 caracteres passam e 61 são recusados em nome, classe e ancestralidade", () => {
  const d = okDraft();
  for (const [field, step] of [["name", 1], ["class_name", 1], ["ancestry", 1]]) {
    assert.deepEqual(validateStep(step, { ...d, [field]: "a".repeat(60) }), [], `${field} 60`);
    assert.equal(validateStep(step, { ...d, [field]: "a".repeat(61) }).length, 1, `${field} 61`);
  }
});

test("16. fronteira de item: nome com 80 passa e com 81 é recusado; quantidade no máximo passa e no máximo+1 é recusada", () => {
  const d = okDraft();
  const item = (over) => ({ ...d, items: [{ label: "x", qty: 1, weightLb: 1, ...over }] });
  assert.deepEqual(validateStep(6, item({ label: "a".repeat(80) })), []);
  assert.equal(validateStep(6, item({ label: "a".repeat(81) })).length, 1);
  assert.deepEqual(validateStep(6, item({ qty: VOXCHAR_LIMITS.qty })), []);
  assert.equal(validateStep(6, item({ qty: VOXCHAR_LIMITS.qty + 1 })).length, 1);
  assert.equal(validateStep(6, item({ qty: 0 })).length, 1);
});

test("17. o despachador tira a foto do formulário antes do import(): o que foi digitado entra no rascunho mesmo se a tela for redesenhada", async () => {
  const { state } = await ready();
  state.sheetWizard = { ...createWizard(), mode: "guided", step: 1 };
  const field = { name: "sheetName", value: "Digitado", type: "text" };
  const form = { querySelectorAll: () => [field, { name: "className", value: "Bardo", type: "text" }, { name: "ancestry", value: "", type: "text" }] };
  const container = { querySelector: (s) => (s === "[data-wizard-form]" ? form : null) };
  const job = ACTION_HANDLERS["wizard-step"](state, { dataset: { dir: "next" } }, container, {});
  field.value = "";
  form.querySelectorAll = () => [];
  await job;
  assert.equal(state.sheetWizard.draft.name, "Digitado");
  assert.equal(state.sheetWizard.draft.class_name, "Bardo");
  assert.equal(state.sheetWizard.step, 2);
  assert.deepEqual(snapshotWizardForm({ querySelector: () => ({ querySelectorAll: () => [{ name: "skill", value: "stealth", type: "checkbox", checked: true }, { name: "skill", value: "arcana", type: "checkbox", checked: false }] }) }), { skill: ["stealth"] });
});

test("18. Esc abre a confirmação sem fechar direto, e um segundo Esc não descarta", async () => {
  const { state } = await ready();
  state.sheetWizard = { ...createWizard(), mode: "guided", step: 2 };
  let prevented = 0;
  const esc = { key: "Escape", preventDefault: () => { prevented += 1; } };
  assert.equal(escapeWizardJob(state, {}, { key: "a" }), undefined);
  await escapeWizardJob(state, {}, esc);
  assert.ok(state.sheetWizard, "não fechou direto");
  assert.equal(state.sheetWizard.confirmCancel, true);
  assert.equal(escapeWizardJob(state, {}, esc), undefined, "o 2º Esc não faz nada");
  assert.ok(state.sheetWizard);
  assert.equal(prevented, 1);
});

test("19. o resumo revalida e volta ao passo com problema; voltar limpa os avisos", async () => {
  const { state, store, writes } = await ready();
  const bad = { ...okDraft(), expertSkills: ["arcana"] };
  const out = await finishGuided(state, bad, { store });
  assert.equal(out.ok, false);
  assert.equal(out.step, 3);
  assert.deepEqual(writes, []);
  state.sheetWizard = { ...createWizard(), mode: "guided", step: 7, draft: bad };
  await actions.stepWizard(state, { dataset: { dir: "finish" } }, {}, { store });
  assert.equal(state.sheetWizard.step, 3);
  assert.ok(state.sheetWizard.issues.length > 0);
  await actions.stepWizard(state, { dataset: { dir: "back" } }, {}, { store });
  assert.deepEqual(state.sheetWizard.issues, []);
});
