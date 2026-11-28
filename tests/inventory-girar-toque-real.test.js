/**
 * @file Girar o item pelo botão durante um arrasto por toque real: o segundo dedo que toca o botão não gera `click`
 * (o navegador só sintetiza clique para o primeiro toque), então o giro tem de sair do próprio `pointerdown` do dedo.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { LONG_PRESS_MS } from "../client/js/dungeon/inventory-drag.js";
import { fakeMount } from "./helpers/inventory-drag-mount.js";

const span = (grid) => /span (\d+)$/.exec(grid.ghost.style.gridColumn)?.[1];

/** Monta a mochila com o dedo 1 segurando o item depois do toque longo (temporizador do teste, sem esperar 300 ms). */
function arrastoPorToque(dims) {
  const timers = [];
  const real = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  const m = fakeMount(dims);
  m.fire("pointerdown", { target: m.cell, pointerId: 1, pointerType: "touch", isPrimary: true, clientX: 250, clientY: 50 });
  globalThis.setTimeout = real;
  assert.equal(timers[0]?.ms, LONG_PRESS_MS, "o toque arma o toque longo");
  timers[0].fn();
  m.fire("pointermove", { pointerId: 1, clientX: 252, clientY: 50 });
  assert.equal(m.button.hidden, false, "o arrasto começou e o botão aparece");
  return m;
}

/** O segundo dedo toca o botão: pointerdown e pointerup, sem `click` (como no navegador). */
function toqueNoBotao(m, pointerId = 2) {
  m.fire("pointerdown", { target: m.button, pointerId, pointerType: "touch", isPrimary: false, clientX: 900, clientY: 380 });
  m.fire("pointerup", { target: m.button, pointerId, pointerType: "touch", isPrimary: false, clientX: 900, clientY: 380 });
}

test("toque real: o segundo dedo no botão gira o item no meio do arrasto, sem click", () => {
  const m = arrastoPorToque();
  assert.equal(span(m.grid), "1");
  toqueNoBotao(m);
  assert.equal(span(m.grid), "3", "girou");
  assert.equal(m.button.hidden, false, "o arrasto do primeiro dedo segue");
});

test("toque real: um segundo toque no botão gira de volta", () => {
  const m = arrastoPorToque();
  toqueNoBotao(m);
  assert.equal(span(m.grid), "3");
  toqueNoBotao(m, 3);
  assert.equal(span(m.grid), "1");
});

test("toque real: se o navegador ainda mandar o click depois do toque, não gira duas vezes", () => {
  const m = arrastoPorToque();
  toqueNoBotao(m);
  m.fire("click", { target: m.button });
  assert.equal(span(m.grid), "3");
});

test("toque real: item quadrado não muda de pegada", () => {
  const m = arrastoPorToque({ w: "2", h: "2" });
  toqueNoBotao(m);
  assert.equal(span(m.grid), "2");
});

test("toque no botão sem arrasto em curso não faz nada e o click seguinte vale como antes", () => {
  const m = fakeMount();
  toqueNoBotao(m);
  assert.equal(m.grid.ghost, null);
  assert.equal(m.button.hidden, true);
});
