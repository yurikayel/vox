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
import { wireDungeonView } from "../client/js/dungeon/dungeon-controller.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";
import { createAndSelectCampaign } from "../client/js/dungeon/dungeon-persistence.js";
import { exportVoxchar } from "../client/js/dungeon/voxchar.js";
import { finishQuick } from "../client/js/dungeon/sheet-wizard.js";

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

test("o resumo dos erros é um grupo focável (sem role=alert, para não anunciar duas vezes) e só existe com avisos", () => {
  const html = renderSheetEditPanel({ name: "Lyra" }, { issues: [{ field: "armorClass", message: "CA: x" }] });
  assert.match(html, /<div class="dungeon-alert-warn" role="group" tabindex="-1" data-edit-focus aria-labelledby="sheet-edit-issues-title" aria-describedby="sheet-edit-issues-list">/);
  assert.doesNotMatch(html, /role="alert"/);
  assert.match(html, /<strong id="sheet-edit-issues-title">/);
  assert.match(html, /<ul id="sheet-edit-issues-list">/);
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

/**
 * Mesa real da ficha: `wireDungeonView` com o `settleAndRedraw` verdadeiro, num contêiner falso que redesenha pelo
 * `innerHTML` e só acha `[data-edit-focus]` se o HTML desenhado o tiver (o foco vai para `focado`).
 */
async function fichaMontada() {
  const store = createVttStore(createMemoryVttBackend());
  const state = createDungeonSessionState({ viewerRole: "player", campaignId: "", syncPeer: null });
  await createAndSelectCampaign(state, "Mesa", { store });
  const handlers = {};
  const foco = [];
  const pedidos = [];
  const alvo = { focus: () => foco.push("resumo") };
  const container = {
    dataset: {}, innerHTML: "",
    addEventListener: (type, fn) => { handlers[type] = fn; },
    querySelector(sel) { pedidos.push(sel); return sel === "[data-edit-focus]" && this.innerHTML.includes("data-edit-focus") ? alvo : null; },
    querySelectorAll: () => [],
  };
  wireDungeonView(container, { screen: "ficha", state, store });
  foco.length = 0;
  pedidos.length = 0;
  return { state, container, handlers, foco, pedidos };
}

test("settle real: Salvar recusado desenha o resumo e o foco vai para ele", async () => {
  const { container, handlers, foco } = await fichaMontada();
  const form = { ...fakeForm({ sheetName: "Kael", armorClass: "99", sheetSystem: "5e", str: "10" }), dataset: { dungeon: "edit-sheet-form" } };
  await handlers.submit({ target: form, preventDefault() {} });
  assert.match(container.innerHTML, /data-edit-focus/, "o resumo foi desenhado");
  assert.deepEqual(foco, ["resumo"], "o redesenho focou o resumo");
});

test("settle real: importar .voxchar recusado desenha o resumo e o foco vai para ele", async () => {
  const { state, container, handlers, foco } = await fichaMontada();
  const arquivo = { name: "x.voxchar", size: 3, bytes: new Uint8Array([1, 2, 3]) };
  const alvoChange = { dataset: { dungeon: "import-voxchar" }, files: [arquivo] };
  await handlers.change({ target: alvoChange });
  assert.ok(state.sheetEditIssues.length > 0, "o arquivo inválido foi recusado");
  assert.match(container.innerHTML, /data-edit-focus/);
  assert.deepEqual(foco, ["resumo"]);
});

test("settle real: importar .voxchar aceito não pede foco no resumo (nem o desenha)", async () => {
  const { state, container, handlers, foco, pedidos } = await fichaMontada();
  const src = createDungeonSessionState({ viewerRole: "player", campaignId: "", syncPeer: null });
  const origem = createVttStore(createMemoryVttBackend());
  await createAndSelectCampaign(src, "Origem", { store: origem });
  await finishQuick(src, "Zed", { store: origem });
  const artefato = exportVoxchar(src.sheet);
  const arquivo = { name: "zed.voxchar", size: artefato.bytes.length, bytes: artefato.bytes };
  await handlers.change({ target: { dataset: { dungeon: "import-voxchar" }, files: [arquivo] } });
  assert.deepEqual(state.sheetEditIssues, [], "o arquivo válido foi aceito");
  assert.doesNotMatch(container.innerHTML, /data-edit-focus/);
  assert.deepEqual(foco, []);
  assert.equal(pedidos.includes("[data-edit-focus]"), false, "o redesenho não pediu o foco no resumo");
});
