/**
 * @file Legenda do item da mochila (`inventory-caption.js`): texto puro e a ligação com a área de aviso.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCaption, itemCaption } from "../client/js/dungeon/inventory-caption.js";

test("itemCaption: em mãos diz 'Segurando', em foco diz 'Item', sempre com o nome inteiro e a quantidade", () => {
  assert.equal(itemCaption({ label: "Corda de Cânhamo (10m)", qty: 3 }, { held: true }), "Segurando: Corda de Cânhamo (10m) ×3.");
  assert.equal(itemCaption({ label: "Tocha", qty: 1 }), "Item: Tocha ×1.");
});

test("itemCaption: sem quantidade válida vale 1; o nome vem sem espaços nas pontas; sem nome ou sem item, texto vazio", () => {
  assert.equal(itemCaption({ label: "  Adaga  " }), "Item: Adaga ×1.");
  assert.equal(itemCaption({ label: "Adaga", qty: "x" }), "Item: Adaga ×1.");
  assert.equal(itemCaption({ label: "Adaga", qty: 2.9 }), "Item: Adaga ×2.");
  assert.equal(itemCaption({ label: "   " }), "");
  assert.equal(itemCaption(null), "");
  assert.equal(itemCaption(undefined, { held: true }), "");
});

function fakeContainer(live, visual = null) {
  return { querySelector: (sel) => (sel === "[data-inv-notice]" ? live : sel === "[data-inv-caption]" ? visual : null) };
}

test("createCaption: sem a área de aviso no contêiner nada acontece, nem erro", () => {
  const caption = createCaption(fakeContainer(null));
  caption.show({ label: "Tocha", qty: 1 });
  caption.clear();
  assert.ok(true);
});

test("createCaption: item sem nome não escreve; clear sem legenda não apaga o aviso que já estava lá", () => {
  const node = { textContent: "Não cabe aí." };
  const caption = createCaption(fakeContainer(node));
  caption.show({ label: "" });
  assert.equal(node.textContent, "Não cabe aí.");
  caption.clear();
  assert.equal(node.textContent, "Não cabe aí.");
});

test("createCaption: 'Segurando' vai na região viva e clear apaga só a própria legenda", () => {
  const node = { textContent: "" };
  const caption = createCaption(fakeContainer(node));
  caption.show({ label: "Tocha", qty: 1 }, { held: true });
  assert.equal(node.textContent, "Segurando: Tocha ×1.");
  node.textContent = "Outro aviso";
  caption.clear();
  assert.equal(node.textContent, "Outro aviso");
});

test("createCaption: o foco escreve só na legenda visual, nunca na região viva; clearFocus apaga só ela", () => {
  const live = { textContent: "" };
  const visual = { textContent: "" };
  const caption = createCaption(fakeContainer(live, visual));
  caption.show({ label: "Tocha", qty: 1 });
  assert.equal(visual.textContent, "Item: Tocha ×1.");
  assert.equal(live.textContent, "", "a região viva não recebe a legenda de foco");
  caption.clearFocus();
  assert.equal(visual.textContent, "");
  caption.show({ label: "Tocha", qty: 1 });
  visual.textContent = "Outro texto";
  caption.clearFocus();
  assert.equal(visual.textContent, "Outro texto", "só apaga o que escreveu");
});

test("createCaption: sem a legenda visual no contêiner o foco não escreve em lugar nenhum", () => {
  const live = { textContent: "" };
  const caption = createCaption(fakeContainer(live, null));
  caption.show({ label: "Tocha", qty: 1 });
  assert.equal(live.textContent, "");
});

test("createCaption: com o item em mãos o foco não troca a legenda, e segurar tira a legenda de foco; clear apaga as duas", () => {
  const live = { textContent: "" };
  const visual = { textContent: "" };
  const caption = createCaption(fakeContainer(live, visual));
  caption.show({ label: "Tocha", qty: 1 });
  caption.show({ label: "Corda", qty: 2 }, { held: true });
  assert.equal(visual.textContent, "", "uma legenda por vez");
  caption.show({ label: "Adaga", qty: 1 });
  assert.equal(visual.textContent, "", "foco não escreve com o item em mãos");
  assert.equal(live.textContent, "Segurando: Corda ×2.");
  caption.clearFocus();
  assert.equal(live.textContent, "Segurando: Corda ×2.", "clearFocus não apaga o item em mãos");
  caption.clear();
  assert.equal(live.textContent, "");
  caption.show({ label: "Adaga", qty: 1 });
  assert.equal(visual.textContent, "Item: Adaga ×1.", "solto, o foco volta a legendar");
});
