/**
 * @file Painel Editar da ficha: validação explicativa. Valor fora do limite não é ajustado em silêncio; o Salvar
 * é recusado com o motivo, o que o jogador digitou continua no formulário e nada é gravado.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { validateSheetEdit } from "../client/js/dungeon/sheet-edit-validate.js";
import { renderSheetEditPanel } from "../client/js/dungeon/screen-sheet-levelup.js";
import { dispatchDungeonFormSubmit } from "../client/js/dungeon/dungeon-controller-actions.js";

const ok = { name: "Kael", armor_class: 15, system: "dnd5e-2024", str: 10, dex: 14 };
const field = (issues, f) => issues.find((i) => i.field === f)?.message || "";

test("validação: edição boa passa; campos de atributo ausentes não são cobrados", () => {
  assert.deepEqual(validateSheetEdit(ok), { ok: true, issues: [] });
  assert.equal(validateSheetEdit({ name: "A", armor_class: 1, str: 30 }).ok, true, "limites inclusivos");
});

test("validação: cada problema vem com campo e motivo em português", () => {
  const r = validateSheetEdit({ name: "  ", armor_class: 99, system: "t20", str: 0, dex: 31, con: "abc", int: 12.5 });
  assert.equal(r.ok, false);
  assert.match(field(r.issues, "sheetName"), /precisa de um nome/);
  assert.match(field(r.issues, "armorClass"), /99 está fora do intervalo 1–40/);
  assert.match(field(r.issues, "str"), /Força: 0 está fora do intervalo 1–30/);
  assert.match(field(r.issues, "dex"), /Destreza: 31/);
  assert.match(field(r.issues, "con"), /Constituição: use um número inteiro/);
  assert.match(field(r.issues, "int"), /Inteligência: use um número inteiro/);
  assert.match(field(r.issues, "sheetSystem"), /"t20" não está instalado/);
  const blank = validateSheetEdit({ name: "A", armor_class: "" });
  assert.match(field(blank.issues, "armorClass"), /em branco/);
  assert.doesNotMatch(field(blank.issues, "armorClass"), /fora do intervalo/);
  assert.equal(validateSheetEdit(undefined).ok, false);
});

test("painel: avisos aparecem num alerta, o painel abre e mostra o que foi digitado", () => {
  const html = renderSheetEditPanel({ name: "Lyra", attributes_lww: { armor_class: 12, abilities: { str: 10 } } }, { issues: [{ field: "armorClass", message: "CA: 99 está fora do intervalo 1–40; x." }], draft: { name: "Kael", armor_class: 99, str: 31 } });
  assert.match(html, /<details[^>]*data-dungeon-details="sheet-edit" open>/);
  assert.match(html, /role="alert"><strong>Nada foi salvo\. Corrija:<\/strong><ul><li>CA: 99 está fora/);
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
  const form = fakeForm({ sheetName: "Kael", armorClass: "99", sheetSystem: "dnd5e-2024", str: "10" });
  await dispatchDungeonFormSubmit("edit-sheet-form", state, form, ctx);
  assert.equal(state.sheetEditIssues.length, 1);
  assert.equal(state.sheetEditDraft.armor_class, "99");
  assert.equal(JSON.stringify(state.sheet), before, "nada gravado");
  await dispatchDungeonFormSubmit("edit-sheet-form", state, fakeForm({ sheetName: "Kael", armorClass: "15", sheetSystem: "dnd5e-2024" }), ctx);
  assert.deepEqual(state.sheetEditIssues, []);
  assert.equal(state.sheetEditDraft, null);
  assert.equal(state.sheet.attributes_lww.armor_class, 15);
});

test("Salvar recusado: classe e sistema digitados continuam no formulário", () => {
  const sheet = { name: "Lyra", role_title: "Paladina", attributes_lww: { armor_class: 12 }, system: { id: "dnd5e-2024", version: 1 } };
  const html = renderSheetEditPanel(sheet, { issues: [{ field: "armorClass", message: "x" }], draft: { name: "Kael", class_name: "Bardo", armor_class: 99, system: "dnd5e-2024" } });
  assert.match(html, /name="sheetClass"[^>]*value="Bardo"/);
  assert.match(html, /<option value="dnd5e-2024" selected>/);
});

test("Salvar recusado pelo formulário: a classe digitada vai para o rascunho", async () => {
  const state = createDungeonSessionState();
  await dispatchDungeonFormSubmit("edit-sheet-form", state, fakeForm({ sheetName: "Kael", sheetClass: "Bardo", armorClass: "", sheetSystem: "dnd5e-2024" }), ctx);
  assert.equal(state.sheetEditDraft.class_name, "Bardo");
  assert.match(state.sheetEditIssues[0].message, /em branco/);
});

test("XSS: nome, classe e sistema com marcação não geram tag no painel", () => {
  const evil = '"><img src=x onerror=alert(1)>';
  const sheet = { name: evil, role_title: evil, attributes_lww: { armor_class: 12 }, system: { id: "dnd5e-2024", version: 1 } };
  const draft = { name: evil, class_name: evil, system: evil };
  for (const html of [renderSheetEditPanel(sheet), renderSheetEditPanel(sheet, { issues: [{ field: "sheetSystem", message: evil }], draft })]) assert.equal(html.includes("<img"), false);
});
