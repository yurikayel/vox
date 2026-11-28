/**
 * @file Painel Editar da ficha: validação explicativa. Valor fora do limite não é ajustado em silêncio; o Salvar
 * é recusado com o motivo, o que o jogador digitou continua no formulário e nada é gravado.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { validateSheetEdit } from "../client/js/dungeon/sheet-edit-validate.js";
import { PACK_5E } from "../client/js/dungeon/system-pack-5e.js";
import { renderSheetEditPanel } from "../client/js/dungeon/screen-sheet-levelup.js";
import { dispatchDungeonFormSubmit } from "../client/js/dungeon/dungeon-controller-actions.js";

const ok = { name: "Kael", armor_class: 15, system: "5e", str: 10, dex: 14 };
const field = (issues, f) => issues.find((i) => i.field === f)?.message || "";

test("validação: edição boa passa; campos de atributo ausentes não são cobrados", () => {
  assert.deepEqual(validateSheetEdit(ok), { ok: true, issues: [] });
  assert.equal(validateSheetEdit({ name: "A", armor_class: 1, str: 30 }).ok, true, "limites inclusivos");
});

test("validação: cada problema vem com campo e motivo em português", () => {
  const r = validateSheetEdit({ name: "  ", armor_class: 99, system: "sistema-inexistente", str: 0, dex: 31, con: "abc", int: 12.5 });
  assert.equal(r.ok, false);
  assert.match(field(r.issues, "sheetName"), /precisa de um nome/);
  assert.match(field(r.issues, "armorClass"), /99 está fora do intervalo 1–40/);
  assert.match(field(r.issues, "str"), /Força: 0 está fora do intervalo 1–30/);
  assert.match(field(r.issues, "dex"), /Destreza: 31/);
  assert.match(field(r.issues, "con"), /Constituição: use um número inteiro/);
  assert.match(field(r.issues, "int"), /Inteligência: use um número inteiro/);
  assert.match(field(r.issues, "sheetSystem"), /"sistema-inexistente" não está instalado/);
  const blank = validateSheetEdit({ name: "A", armor_class: "" });
  assert.match(field(blank.issues, "armorClass"), /em branco/);
  assert.doesNotMatch(field(blank.issues, "armorClass"), /fora do intervalo/);
  assert.equal(validateSheetEdit(undefined).ok, false);
});

test("painel: avisos aparecem num alerta, o painel abre e mostra o que foi digitado", () => {
  const html = renderSheetEditPanel({ name: "Lyra", attributes_lww: { armor_class: 12, abilities: { str: 10 } } }, { issues: [{ field: "armorClass", message: "CA: 99 está fora do intervalo 1–40; x." }], draft: { name: "Kael", armor_class: 99, str: 31 } });
  assert.match(html, /<details[^>]*data-dungeon-details="sheet-edit" open>/);
  assert.match(html, /role="alert"[^>]*><strong>Nada foi salvo\. Corrija:<\/strong><ul><li id="[^"]+">CA: 99 está fora/);
  assert.match(html, /name="sheetName"[^>]*value="Kael"/);
  assert.match(html, /name="armorClass"[^>]*value="99"/);
  assert.match(html, /name="str"[^>]*value="31"/);
  assert.doesNotMatch(renderSheetEditPanel({ name: "Lyra" }), /role="alert"| open>/, "sem avisos: fechado e sem alerta");
});

function fakeForm(values) {
  return { dataset: {}, querySelector: (sel) => { const m = sel.match(/name=(\w+)/); return m && m[1] in values ? { value: values[m[1]] } : null; } };
}
const ctx = { viewOpts: {}, settle: (p) => p };

test("Salvar com valor inválido: recusa, guarda avisos e rascunho e não grava a ficha", async () => {
  const state = createDungeonSessionState();
  const before = JSON.stringify(state.sheet);
  const form = fakeForm({ sheetName: "Kael", armorClass: "99", sheetSystem: "5e", str: "10" });
  await dispatchDungeonFormSubmit("edit-sheet-form", state, form, ctx);
  assert.equal(state.sheetEditIssues.length, 1);
  assert.equal(state.sheetEditDraft.armor_class, "99");
  assert.equal(JSON.stringify(state.sheet), before, "nada gravado");
  await dispatchDungeonFormSubmit("edit-sheet-form", state, fakeForm({ sheetName: "Kael", armorClass: "15", sheetSystem: "5e" }), ctx);
  assert.deepEqual(state.sheetEditIssues, []);
  assert.equal(state.sheetEditDraft, null);
  assert.equal(state.sheet.attributes_lww.armor_class, 15);
});

test("Salvar recusado: classe e sistema digitados continuam no formulário", () => {
  const sheet = { name: "Lyra", role_title: "Paladina", attributes_lww: { armor_class: 12 }, system: { id: "5e", version: 1 } };
  const html = renderSheetEditPanel(sheet, { issues: [{ field: "armorClass", message: "x" }], draft: { name: "Kael", class_name: "Bardo", armor_class: 99, system: "5e" } });
  assert.match(html, /name="sheetClass"[^>]*value="Bardo"/);
  assert.match(html, /<option value="5e" selected>/);
});

test("Salvar recusado pelo formulário: a classe digitada vai para o rascunho", async () => {
  const state = createDungeonSessionState();
  await dispatchDungeonFormSubmit("edit-sheet-form", state, fakeForm({ sheetName: "Kael", sheetClass: "Bardo", armorClass: "", sheetSystem: "5e" }), ctx);
  assert.equal(state.sheetEditDraft.class_name, "Bardo");
  assert.match(state.sheetEditIssues[0].message, /em branco/);
});

test("XSS: nome, classe e sistema com marcação não geram tag no painel", () => {
  const evil = '"><img src=x onerror=alert(1)>';
  const sheet = { name: evil, role_title: evil, attributes_lww: { armor_class: 12 }, system: { id: "5e", version: 1 } };
  const draft = { name: evil, class_name: evil, system: evil };
  for (const html of [renderSheetEditPanel(sheet), renderSheetEditPanel(sheet, { issues: [{ field: "sheetSystem", message: evil }], draft })]) assert.equal(html.includes("<img"), false);
});

const sysCtx = { pack: PACK_5E, trainedSkills: ["perception"] };

test("validação do pacote: Deslocamento fora do intervalo, em branco ou não inteiro", () => {
  const r = (speedFt) => validateSheetEdit({ name: "A", armor_class: 10, speedFt }, sysCtx);
  assert.equal(r("30").ok, true);
  assert.equal(r("0").ok, true);
  assert.match(field(r("999").issues, "speedFt"), /Deslocamento: 999 está fora do intervalo 0–200/);
  assert.match(field(r("").issues, "speedFt"), /em branco/);
  assert.match(field(r("12.5").issues, "speedFt"), /número inteiro/);
  assert.equal(validateSheetEdit({ name: "A", armor_class: 10 }, sysCtx).ok, true, "sem o campo, nada a conferir");
  assert.equal(validateSheetEdit({ name: "A", armor_class: 10, speedFt: "999" }).ok, true, "sem pacote não se cobra");
});

test("validação do pacote: especialização só em perícia treinada, com o nome da perícia; salvaguarda desconhecida", () => {
  const r = validateSheetEdit({ name: "A", armor_class: 10, expertSkills: ["perception", "arcana"], proficientSaves: ["str", "zzz"] }, sysCtx);
  assert.equal(r.issues.length, 2);
  assert.match(field(r.issues, "expertSkill"), /Especialização em Arcanismo: só vale em perícia treinada/);
  assert.match(field(r.issues, "saveProf"), /"zzz" não existe/);
  assert.equal(validateSheetEdit({ name: "A", armor_class: 10, expertSkills: ["perception"], proficientSaves: ["wis"] }, sysCtx).ok, true);
});

function richForm(values, lists = {}) {
  const base = fakeForm(values);
  base.querySelectorAll = (sel) => (lists[sel.match(/name=(\w+)/)[1]] || []).map((value) => ({ value }));
  const one = base.querySelector;
  base.querySelector = (sel) => (/name=saveProf/.test(sel) ? { value: "" } : one(sel));
  return base;
}

test("Salvar com Deslocamento absurdo e especialização sem treino: recusa, nada é gravado e o digitado volta ao painel", async () => {
  const state = createDungeonSessionState();
  const before = JSON.stringify(state.sheet);
  const form = richForm({ sheetName: "Kael", armorClass: "12", sheetSystem: "5e", speedFt: "999" }, { saveProf: ["con"], expertSkill: ["arcana"] });
  await dispatchDungeonFormSubmit("edit-sheet-form", state, form, ctx);
  assert.deepEqual(state.sheetEditIssues.map((i) => i.field).sort(), ["expertSkill", "speedFt"]);
  assert.equal(JSON.stringify(state.sheet), before);
  const html = renderSheetEditPanel(state.sheet, { issues: state.sheetEditIssues, draft: state.sheetEditDraft });
  assert.match(html, /name="speedFt"[^>]*value="999"/);
  assert.match(html, /name="saveProf" value="con" checked/);
});

test("Salvar válido com Deslocamento e salvaguardas grava os campos do pacote", async () => {
  const state = createDungeonSessionState();
  const form = richForm({ sheetName: "Kael", armorClass: "12", sheetSystem: "5e", speedFt: "25" }, { saveProf: ["con"], expertSkill: [] });
  await dispatchDungeonFormSubmit("edit-sheet-form", state, form, ctx);
  assert.deepEqual(state.sheetEditIssues, []);
  assert.equal(state.sheet.attributes_lww.speed_ft, 25);
  assert.deepEqual(state.sheet.system_choices.proficientSaves, ["con"]);
});

test("XSS: Deslocamento digitado com marcação não vira tag", () => {
  const evil = '"><img src=x onerror=alert(1)>';
  const html = renderSheetEditPanel({ name: "A", attributes_lww: {}, system: { id: "5e", version: 1 } }, { issues: [{ field: "speedFt", message: evil }], draft: { speedFt: evil } });
  assert.equal(html.includes("<img"), false);
});

test("painel: CA e atributos do rascunho (texto cru) são escapados no valor", () => {
  const evil = '"><img src=x onerror=alert(1)>';
  const sheet = { name: "A", attributes_lww: { armor_class: 12 }, system: { id: "5e", version: 1 } };
  const html = renderSheetEditPanel(sheet, { issues: [{ field: "armorClass", message: "x" }], draft: { name: "A", armor_class: evil, str: evil, dex: evil } });
  assert.equal(html.includes("<img"), false);
  assert.match(html, /name="armorClass"[^>]*value="&quot;&gt;&lt;img/);
});
