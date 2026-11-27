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

function fakeContainer(node) {
  return { querySelector: (sel) => (sel === "[data-inv-notice]" ? node : null) };
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

test("createCaption: show escreve, clear apaga só a própria legenda", () => {
  const node = { textContent: "" };
  const caption = createCaption(fakeContainer(node));
  caption.show({ label: "Tocha", qty: 1 }, { held: true });
  assert.equal(node.textContent, "Segurando: Tocha ×1.");
  node.textContent = "Outro aviso";
  caption.clear();
  assert.equal(node.textContent, "Outro aviso");
  caption.show({ label: "Tocha", qty: 1 });
  caption.clear();
  assert.equal(node.textContent, "");
});
