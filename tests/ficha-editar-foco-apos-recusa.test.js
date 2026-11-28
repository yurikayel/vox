/**
 * @file Editar ficha: depois de um Salvar recusado por validação o foco vai para o resumo dos erros (que lista o campo
 * inválido), e não cai no body; um Salvar aceito não pede foco no resumo.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { renderSheetEditPanel } from "../client/js/dungeon/screen-sheet-levelup.js";
import { dispatchDungeonFormSubmit } from "../client/js/dungeon/dungeon-controller-actions.js";
import { restoreUiViewState } from "../client/js/dungeon/dungeon-dom-focus.js";

function fakeForm(values) {
  return { dataset: {}, querySelector: (sel) => { const m = sel.match(/name=(\w+)/); return m && m[1] in values ? { value: values[m[1]] } : null; } };
}

/** Contêiner falso: `querySelector(sel)` só acha o alvo se o HTML desenhado tiver o atributo do seletor. */
function containerFor(html, doc) {
  const alvo = { tabindex: /tabindex="-1"/.test(html), focus() { doc.activeElement = this; } };
  return { querySelector: (sel) => (sel === "[data-edit-focus]" && html.includes("data-edit-focus") ? alvo : null), querySelectorAll: () => [] };
}

test("Salvar recusado: o foco sai do botão e vai para o resumo dos erros (não para o body)", async () => {
  const state = createDungeonSessionState();
  const doc = { activeElement: { tag: "body" } };
  const pedidos = [];
  const ctx = { viewOpts: {}, settle: (p, extra) => { pedidos.push(extra); return p; } };
  await dispatchDungeonFormSubmit("edit-sheet-form", state, fakeForm({ sheetName: "Kael", armorClass: "99", sheetSystem: "5e", str: "10" }), ctx);
  assert.equal(pedidos[0]?.focusSelector, "[data-edit-focus]", "pede foco no resumo dos erros");
  const html = renderSheetEditPanel(state.sheet, { issues: state.sheetEditIssues, draft: state.sheetEditDraft });
  restoreUiViewState(containerFor(html, doc), {}, pedidos[0].focusSelector);
  assert.notEqual(doc.activeElement.tag, "body", "o foco não ficou no body");
  assert.equal(doc.activeElement.tabindex, true, "o alvo aceita foco por script (tabindex=-1)");
});

test("o resumo dos erros é o alerta do painel e só existe com avisos", () => {
  const html = renderSheetEditPanel({ name: "Lyra" }, { issues: [{ field: "armorClass", message: "CA: x" }] });
  assert.match(html, /<div class="dungeon-alert-warn" role="alert" tabindex="-1" data-edit-focus>/);
  assert.equal(html.match(/data-edit-focus/g).length, 1);
  assert.doesNotMatch(renderSheetEditPanel({ name: "Lyra" }), /data-edit-focus/);
});

test("Salvar aceito não pede foco no resumo dos erros", async () => {
  const state = createDungeonSessionState();
  const pedidos = [];
  const ctx = { viewOpts: {}, settle: (p, extra) => { pedidos.push(extra); return p; } };
  await dispatchDungeonFormSubmit("edit-sheet-form", state, fakeForm({ sheetName: "Kael", armorClass: "15", sheetSystem: "5e" }), ctx);
  assert.equal(pedidos[0]?.focusSelector, undefined);
});
