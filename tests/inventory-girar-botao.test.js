/**
 * @file SUB-25c: botão "Girar item" da mochila para quem não tem teclado. Escondido até haver item em mãos, 44 px de área
 * de toque, e girar pelo botão faz o mesmo que a tecla R (teclado) ou vale para o item que o dedo segura (toque).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyInventoryMutation, listInventoryItems } from "../client/js/dungeon/vtt-inventory.js";
import { renderInventoryPanel } from "../client/js/dungeon/screen-sheet-inventory.js";
import { bindInventoryDrag } from "../client/js/dungeon/inventory-drag-ui.js";

const css = readFileSync(new URL("../client/css/sv-inventario-arrastar.css", import.meta.url), "utf8");
const sheet = applyInventoryMutation(applyInventoryMutation({}, "add", { label: "Espada" }), "place", { itemId: "espada", x: 2, y: 0 });
const state = { sheet: { inventoryItems: listInventoryItems(sheet.inventory_orset) } };

/** Contêiner de mentira: guarda os ouvintes e entrega a célula, a grade, o fantasma e o botão. */
function fakeMount(dims = { w: "1", h: "3" }) {
  const handlers = {};
  const grid = { ghost: null, ownerDocument: { createElement: () => ({ style: {}, setAttribute() {}, remove: () => { grid.ghost = null; } }) }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 400 }) };
  grid.querySelector = () => grid.ghost;
  grid.appendChild = (g) => { grid.ghost = g; };
  const classes = new Set();
  const cell = { dataset: { invCell: "espada", invW: dims.w, invH: dims.h }, classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) }, focus() {}, setPointerCapture() {}, getBoundingClientRect: () => ({ left: 200, top: 0, width: 100, height: 300 }) };
  cell.closest = (sel) => (sel === "[data-inv-cell]" ? cell : sel === "[data-inv-grid]" ? grid : null);
  const button = { hidden: true };
  button.closest = (sel) => (sel === "[data-inv-rotate]" ? button : null);
  const container = {
    ownerDocument: null,
    addEventListener: (type, fn) => { (handlers[type] ||= []).push(fn); },
    querySelector: (sel) => (sel === "[data-inv-rotate]" ? button : null),
    querySelectorAll: (sel) => (sel === "[data-inv-cell]" ? [cell] : sel === ".sv-inv-ghost" ? [grid.ghost].filter(Boolean) : []),
  };
  bindInventoryDrag(container, { state, store: {} }, async () => {});
  const fire = (type, ev) => (handlers[type] || []).forEach((fn) => fn({ preventDefault() {}, stopImmediatePropagation() {}, ...ev }));
  return { fire, cell, button, grid, held: () => classes.has("is-held") };
}

const span = (grid) => /span (\d+)$/.exec(grid.ghost.style.gridColumn)?.[1];

test("a) o painel traz o botão 'Girar item' (data-inv-rotate, aria-label, escondido) e a dica fala dele", () => {
  const html = renderInventoryPanel(state);
  const button = /<button[^>]*data-inv-rotate[^>]*>/.exec(html)?.[0] || "";
  assert.match(button, /aria-label="Girar item"/);
  assert.match(button, /type="button"/);
  assert.match(button, /\bhidden\b/);
  assert.match(html, /data-inv-rotate[^>]*>Girar item<\/button>/);
  assert.match(html, /data-inv-hint>[^<]*botão Girar item/);
});

test("b) o botão tem área de toque de 44 px e o atributo hidden vence a classe", () => {
  assert.match(css, /\.sv-inv-rotate\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.sv-inv-rotate\s*\{[^}]*min-width:\s*44px/);
  assert.match(css, /\.sv-inv-rotate\[hidden\]\s*\{\s*display:\s*none/);
});

test("c) teclado: o botão aparece com o item em mãos, gira sem soltar o item e some ao soltar o foco", () => {
  const m = fakeMount();
  assert.equal(m.button.hidden, true);
  m.fire("keydown", { target: m.cell, key: "Enter" });
  assert.equal(m.button.hidden, false, "item em mãos mostra o botão");
  assert.equal(span(m.grid), "1");
  m.fire("focusout", { relatedTarget: m.button });
  m.fire("click", { target: m.button });
  assert.equal(m.button.hidden, false, "ir para o botão não solta o item");
  assert.equal(span(m.grid), "3", "girou: a pegada passa de 1×3 para 3×1");
  m.fire("click", { target: m.button });
  assert.equal(span(m.grid), "1", "girou de volta");
  m.fire("focusout", { relatedTarget: null });
  assert.equal(m.button.hidden, true, "perder o foco devolve o item e esconde o botão");
});

test("d) toque: com o item preso por um dedo, o botão gira o item e o segundo dedo não solta nem move o arrasto", () => {
  const m = fakeMount();
  m.fire("pointerdown", { target: m.cell, pointerId: 1, pointerType: "mouse", button: 0, clientX: 250, clientY: 50 });
  m.fire("pointermove", { pointerId: 1, clientX: 260, clientY: 50 });
  assert.equal(m.button.hidden, false, "arrasto começado mostra o botão");
  assert.equal(span(m.grid), "1");
  const before = m.grid.ghost.style.gridColumn;
  m.fire("pointerdown", { target: m.button, pointerId: 2, pointerType: "touch", clientX: 900, clientY: 380 });
  m.fire("pointermove", { pointerId: 2, clientX: 900, clientY: 380 });
  assert.equal(m.grid.ghost.style.gridColumn, before, "o segundo dedo não move o fantasma");
  m.fire("pointerup", { pointerId: 2, clientX: 900, clientY: 380 });
  m.fire("click", { target: m.button });
  assert.equal(m.button.hidden, false, "o segundo dedo não soltou o item");
  assert.equal(span(m.grid), "3", "girou o item que o primeiro dedo segura");
  m.fire("pointercancel", {});
  assert.equal(m.button.hidden, true, "sem arrasto, sem botão");
});

test("f) item quadrado não gira pelo botão (a pegada não muda)", () => {
  const m = fakeMount({ w: "2", h: "2" });
  m.fire("pointerdown", { target: m.cell, pointerId: 1, pointerType: "mouse", button: 0, clientX: 250, clientY: 50 });
  m.fire("pointermove", { pointerId: 1, clientX: 260, clientY: 50 });
  const before = [m.grid.ghost.style.gridColumn, m.grid.ghost.style.gridRow];
  m.fire("click", { target: m.button });
  assert.deepEqual([m.grid.ghost.style.gridColumn, m.grid.ghost.style.gridRow], before);
});

test("e) clique no botão sem item em mãos não faz nada", () => {
  const m = fakeMount();
  m.fire("click", { target: m.button });
  assert.equal(m.grid.ghost, null);
  assert.equal(m.button.hidden, true);
});
