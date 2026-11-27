/**
 * @file Nome inteiro do item da mochila na área de aviso: a célula estreita corta o rótulo, o `title` não aparece no
 * toque e tocar equipa. Ao segurar o item (começo do arrasto) ou focar a célula, `[data-inv-notice]` diz o nome e a
 * quantidade; soltar, cancelar ou sair do foco apaga a legenda, e ela não reescreve o aviso a cada movimento.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { applyInventoryMutation, listInventoryItems } from "../client/js/dungeon/vtt-inventory.js";
import { bindInventoryDrag } from "../client/js/dungeon/inventory-drag-ui.js";

const LONG = "Corda de Cânhamo (10m)";
const inv = applyInventoryMutation(applyInventoryMutation({}, "add", { label: LONG, qty: 3 }), "add", { label: "Tocha" });
const items = listInventoryItems(inv.inventory_orset);
const idOf = (label) => items.find((it) => it.label === label).id;

/** Contêiner de mentira com duas células (texto cortado, como na tela) e a área de aviso que conta as escritas. */
function fakeMount() {
  const handlers = {};
  const state = { sheet: { inventoryItems: items.map((it) => ({ ...it })) } };
  const grid = { ghost: null, ownerDocument: { createElement: () => ({ style: {}, setAttribute() {}, remove: () => { grid.ghost = null; } }) }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 400 }) };
  grid.querySelector = () => grid.ghost;
  grid.appendChild = (g) => { grid.ghost = g; };
  const makeCell = (id, left) => {
    const classes = new Set();
    const c = { classes, dataset: { invCell: id, invW: "1", invH: "1" }, textContent: "Cor ×3", title: "Cor ×3", classList: { add: (n) => classes.add(n), remove: (n) => classes.delete(n) }, setPointerCapture() {}, getBoundingClientRect: () => ({ left, top: 0, width: 100, height: 100 }) };
    c.closest = (sel) => (sel === "[data-inv-cell]" ? c : sel === "[data-inv-grid]" ? grid : null);
    return c;
  };
  const cell = makeCell(idOf(LONG), 200);
  const cell2 = makeCell(idOf("Tocha"), 600);
  const notice = { text: "", writes: 0, get textContent() { return this.text; }, set textContent(v) { this.text = v; this.writes += 1; } };
  const container = {
    ownerDocument: null,
    addEventListener: (type, fn) => { (handlers[type] ||= []).push(fn); },
    querySelector: (sel) => (sel === "[data-inv-notice]" ? notice : null),
    querySelectorAll: (sel) => (sel === "[data-inv-cell]" ? [cell, cell2] : sel === ".sv-inv-ghost" ? [grid.ghost].filter(Boolean) : []),
  };
  bindInventoryDrag(container, { state, store: {} }, async () => {});
  const fire = (type, ev) => (handlers[type] || []).forEach((fn) => fn({ preventDefault() {}, stopImmediatePropagation() {}, ...ev }));
  return { fire, cell, cell2, notice };
}

const grab = (m, cell = m.cell, pointerId = 1) => m.fire("pointerdown", { target: cell, pointerId, pointerType: "mouse", button: 0, clientX: 250, clientY: 50 });
const drag = (m, x = 300, pointerId = 1) => m.fire("pointermove", { pointerId, clientX: x, clientY: 50 });

test("a) segurar o item (começo do arrasto) mostra o nome inteiro e a quantidade, não o rótulo cortado da célula", () => {
  const m = fakeMount();
  grab(m);
  assert.equal(m.notice.text, "", "só apertar não é segurar");
  drag(m);
  assert.equal(m.notice.text, `Segurando: ${LONG} ×3.`);
});

test("b) soltar apaga a legenda", () => {
  const m = fakeMount();
  grab(m);
  drag(m);
  assert.match(m.notice.text, /Segurando/);
  m.fire("pointerup", { pointerId: 1, clientX: 300, clientY: 50 });
  assert.equal(m.notice.text, "");
});

test("b2) pointercancel (o sistema toma o gesto) também apaga a legenda", () => {
  const m = fakeMount();
  grab(m);
  drag(m);
  assert.match(m.notice.text, /Segurando/);
  m.fire("pointercancel", { pointerId: 1 });
  assert.equal(m.notice.text, "");
});

test("c) a legenda apaga só o que ela escreveu: outro aviso (por exemplo 'Não cabe aí.') fica", () => {
  const m = fakeMount();
  grab(m);
  drag(m);
  m.notice.text = "Não cabe aí.";
  m.fire("pointerup", { pointerId: 1, clientX: 300, clientY: 50 });
  assert.equal(m.notice.text, "Não cabe aí.");
});

test("d) uma escrita por pegada: mover o item não reescreve a área de aviso (role=status não anuncia em loop)", () => {
  const m = fakeMount();
  grab(m);
  drag(m, 300);
  const writes = m.notice.writes;
  for (const x of [320, 340, 360, 380, 400]) drag(m, x);
  assert.equal(m.notice.writes, writes, "os movimentos não escrevem");
  assert.equal(writes, 1, "uma escrita ao segurar");
});

test("e) o segundo dedo não troca a legenda do item que o primeiro segura", () => {
  const m = fakeMount();
  grab(m);
  drag(m);
  grab(m, m.cell2, 2);
  drag(m, 700, 2);
  assert.equal(m.notice.text, `Segurando: ${LONG} ×3.`);
});

test("f) teclado: focar a célula mostra o nome inteiro e a quantidade; sair do foco apaga; trocar de célula troca o texto", () => {
  const m = fakeMount();
  m.fire("focusin", { target: m.cell });
  assert.equal(m.notice.text, `Item: ${LONG} ×3.`);
  m.fire("focusout", { relatedTarget: m.cell2 });
  m.fire("focusin", { target: m.cell2 });
  assert.equal(m.notice.text, "Item: Tocha ×1.");
  m.fire("focusout", { relatedTarget: null });
  assert.equal(m.notice.text, "");
});

test("g) foco fora de uma célula, ou de célula que a ficha não conhece, não escreve nada", () => {
  const m = fakeMount();
  m.fire("focusin", { target: { closest: () => null } });
  m.fire("focusin", { target: { closest: () => ({ dataset: { invCell: "fantasma" } }) } });
  assert.equal(m.notice.writes, 0);
});

test("h) focar de novo a mesma célula não reescreve o mesmo texto", () => {
  const m = fakeMount();
  m.fire("focusin", { target: m.cell });
  m.fire("focusin", { target: m.cell });
  assert.equal(m.notice.writes, 1);
});
