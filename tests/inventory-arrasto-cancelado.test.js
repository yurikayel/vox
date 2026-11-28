/**
 * @file Arrasto da mochila por ponteiro: o `pointercancel` do dono e a perda da captura do ponteiro (`lostpointercapture`)
 * encerram o arrasto e deixam o estado limpo (sem fantasma, sem item em mãos, sem botão de girar, sem soltar o item).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { fakeMount } from "./helpers/inventory-drag-mount.js";

/** Monta a mochila e começa um arrasto do dedo 1 (mouse, passou do limiar de movimento). */
function arrastando() {
  let soltos = 0;
  const m = fakeMount(undefined, { settle: async () => { soltos += 1; } });
  m.fire("pointerdown", { target: m.cell, pointerId: 1, pointerType: "mouse", button: 0, clientX: 250, clientY: 50 });
  m.fire("pointermove", { pointerId: 1, clientX: 260, clientY: 50 });
  assert.equal(m.held(), true, "o arrasto começou");
  assert.notEqual(m.grid.ghost, null);
  assert.equal(m.button.hidden, false);
  return { m, soltos: () => soltos };
}

function assertLimpo({ m, soltos }) {
  assert.equal(m.grid.ghost === null, true, "sem fantasma");
  assert.equal(m.held(), false, "sem item em mãos");
  assert.equal(m.button.hidden, true, "sem botão de girar");
  m.fire("pointermove", { pointerId: 1, clientX: 400, clientY: 50 });
  m.fire("pointerup", { pointerId: 1, clientX: 400, clientY: 50 });
  assert.equal(m.grid.ghost === null, true, "movimento depois do fim não pinta de novo");
  assert.equal(soltos(), 0, "o item não foi solto");
}

test("pointercancel do dono encerra o arrasto e limpa o estado", () => {
  const ctx = arrastando();
  ctx.m.fire("pointercancel", { pointerId: 1 });
  assertLimpo(ctx);
});

test("lostpointercapture do dono encerra o arrasto do mesmo jeito", () => {
  const ctx = arrastando();
  ctx.m.fire("lostpointercapture", { pointerId: 1 });
  assertLimpo(ctx);
});

test("lostpointercapture de outro dedo não encerra o arrasto do dono", () => {
  const { m } = arrastando();
  m.fire("lostpointercapture", { pointerId: 2 });
  assert.equal(m.held(), true);
  assert.notEqual(m.grid.ghost, null);
});

test("lostpointercapture que o navegador manda depois de soltar não desfaz a soltura", () => {
  const { m, soltos } = arrastando();
  m.fire("pointerup", { pointerId: 1, clientX: 260, clientY: 50 });
  assert.equal(soltos(), 1, "soltou uma vez");
  assert.doesNotThrow(() => m.fire("lostpointercapture", { pointerId: 1 }));
  assert.equal(soltos(), 1);
  assert.equal(m.grid.ghost === null, true, "a soltura não deixa fantasma");
});

test("lostpointercapture sem arrasto nenhum não faz nada", () => {
  const m = fakeMount();
  assert.doesNotThrow(() => m.fire("lostpointercapture", { pointerId: 1 }));
  assert.equal(m.button.hidden, true);
});
