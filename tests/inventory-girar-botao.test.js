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

/** Contêiner de mentira: guarda os ouvintes e entrega as células (`cell` e `cell2`, lado a lado), a grade, o fantasma e o botão. */
function fakeMount(dims = { w: "1", h: "3" }, { realFocus = false } = {}) {
  const handlers = {};
  const grid = { ghost: null, ownerDocument: { createElement: () => ({ style: {}, setAttribute() {}, remove: () => { grid.ghost = null; } }) }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 400 }) };
  grid.querySelector = () => grid.ghost;
  grid.appendChild = (g) => { grid.ghost = g; };
  const makeCell = (id, left) => {
    const classes = new Set();
    const c = { classes, dataset: { invCell: id, invW: dims.w, invH: dims.h }, classList: { add: (n) => classes.add(n), remove: (n) => classes.delete(n) }, focus() {}, setPointerCapture() {}, getBoundingClientRect: () => ({ left, top: 0, width: 100, height: 300 }) };
    c.closest = (sel) => (sel === "[data-inv-cell]" ? c : sel === "[data-inv-grid]" ? grid : null);
    return c;
  };
  const cell = makeCell("espada", 200);
  const cell2 = makeCell("escudo", 600);
  const button = { hidden: true };
  button.closest = (sel) => (sel === "[data-inv-rotate]" ? button : null);
  const container = {
    ownerDocument: null,
    addEventListener: (type, fn) => { (handlers[type] ||= []).push(fn); },
    querySelector: (sel) => (sel === "[data-inv-rotate]" ? button : null),
    querySelectorAll: (sel) => (sel === "[data-inv-cell]" ? [cell, cell2] : sel === ".sv-inv-ghost" ? [grid.ghost].filter(Boolean) : []),
  };
  bindInventoryDrag(container, { state, store: {} }, async () => {});
  const fire = (type, ev) => (handlers[type] || []).forEach((fn) => fn({ preventDefault() {}, stopImmediatePropagation() {}, ...ev }));
  // Foco como no navegador: focus() em quem já tem o foco não dispara nada; blur() dispara focusout sem destino.
  let focusouts = 0;
  let focused = null;
  if (realFocus) cell.focus = () => { if (focused !== cell) { if (focused) { focusouts += 1; fire("focusout", { relatedTarget: cell }); } focused = cell; } };
  const blur = () => { focused = null; focusouts += 1; fire("focusout", { relatedTarget: null }); };
  const origFire = fire;
  const fireTracked = (type, ev) => { if (realFocus && ev?.target === cell && !focused) cell.focus(); origFire(type, ev); };
  return { fire: realFocus ? fireTracked : fire, cell, cell2, button, grid, blur, focusouts: () => focusouts, held: () => cell.classes.has("is-held"), held2: () => cell2.classes.has("is-held") };
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

test("c) teclado: o botão não aparece, o R gira sem soltar o item e só perder o foco o devolve", () => {
  const m = fakeMount({ w: "1", h: "3" }, { realFocus: true });
  m.fire("keydown", { target: m.cell, key: "Enter" });
  assert.equal(m.button.hidden, true, "no teclado o botão nunca aparece");
  assert.equal(span(m.grid), "1");
  m.fire("keydown", { target: m.cell, key: "r" });
  assert.equal(span(m.grid), "3", "R girou: a pegada passa de 1×3 para 3×1");
  assert.equal(m.focusouts(), 0, "girar não move o foco");
  m.fire("keydown", { target: m.cell, key: "r" });
  assert.equal(span(m.grid), "1", "o item segue em mãos: R gira de volta");
  assert.equal(m.button.hidden, true);
  m.blur();
  assert.equal(m.grid.ghost, null, "perder o foco devolve o item");
  assert.equal(m.held(), false);
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
  m.fire("pointercancel", { pointerId: 1 });
  assert.equal(m.button.hidden, true, "sem arrasto, sem botão");
});

test("g) toque: o pointercancel do segundo dedo não cancela o arrasto do primeiro", () => {
  const m = fakeMount();
  m.fire("pointerdown", { target: m.cell, pointerId: 1, pointerType: "mouse", button: 0, clientX: 250, clientY: 50 });
  m.fire("pointermove", { pointerId: 1, clientX: 260, clientY: 50 });
  m.fire("pointercancel", { pointerId: 2 });
  assert.equal(m.button.hidden, false, "o arrasto do primeiro dedo segue");
  assert.notEqual(m.grid.ghost, null);
  assert.equal(m.held(), true);
  m.fire("pointercancel", { pointerId: 1 });
  assert.equal(m.grid.ghost, null, "o cancel do dono cancela");
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

const FORA = 5000;
const down = (m, target, pointerId, pointerType = "mouse") => m.fire("pointerdown", { target, pointerId, pointerType, button: 0, clientX: 250, clientY: 50 });

test("h) segundo dedo em OUTRA célula não toma o arrasto: o fantasma, o botão e o item preso seguem com o dono e só ele solta", () => {
  const m = fakeMount();
  down(m, m.cell, 1);
  m.fire("pointermove", { pointerId: 1, clientX: 260, clientY: 50 });
  assert.equal(m.button.hidden, false);
  down(m, m.cell2, 2, "touch");
  m.fire("pointermove", { pointerId: 2, clientX: 700, clientY: 50 });
  m.fire("pointerup", { pointerId: 2, clientX: FORA, clientY: 50 });
  m.fire("pointercancel", { pointerId: 2 });
  assert.equal(m.held(), true, "o item do dono segue preso");
  assert.equal(m.held2(), false, "a outra célula não foi pega");
  assert.equal(m.button.hidden, false);
  assert.notEqual(m.grid.ghost, null);
  const before = m.grid.ghost.style.gridColumn;
  m.fire("pointermove", { pointerId: 1, clientX: 330, clientY: 50 });
  assert.notEqual(m.grid.ghost.style.gridColumn, before, "o dono ainda conduz o fantasma");
  m.fire("click", { target: m.button });
  assert.equal(span(m.grid), "3", "o botão gira o item do dono");
  m.fire("pointerup", { pointerId: 1, clientX: FORA, clientY: 50 });
  assert.equal(m.grid.ghost, null, "o dono solta: o fantasma some");
  assert.equal(m.button.hidden, true, "e o botão some");
  assert.equal(m.held(), false);
  assert.equal(m.held2(), false);
});

test("i) depois do arrasto (ou de um toque sem arrasto) um dedo novo, em qualquer célula, pega o item normalmente", () => {
  const m = fakeMount();
  down(m, m.cell, 1);
  m.fire("pointermove", { pointerId: 1, clientX: 260, clientY: 50 });
  m.fire("pointerup", { pointerId: 1, clientX: FORA, clientY: 50 });
  down(m, m.cell2, 2);
  m.fire("pointermove", { pointerId: 2, clientX: 700, clientY: 50 });
  assert.equal(m.held2(), true, "o dedo 2 pegou a segunda célula depois do solto do dedo 1");
  assert.equal(m.button.hidden, false);
  m.fire("pointerup", { pointerId: 2, clientX: FORA, clientY: 50 });
  down(m, m.cell, 3, "touch");
  m.fire("pointerup", { pointerId: 3, clientX: 250, clientY: 50 });
  down(m, m.cell2, 4);
  m.fire("pointermove", { pointerId: 4, clientX: 700, clientY: 50 });
  assert.equal(m.held2(), true, "um toque sem arrasto não deixa o dono preso");
  assert.equal(m.held(), false);
});

test("j) o mesmo ponteiro (o mouse tem sempre o id 1) que aperta de novo durante um arrasto sem 'soltar' recupera o controle", () => {
  const m = fakeMount();
  down(m, m.cell, 1);
  m.fire("pointermove", { pointerId: 1, clientX: 260, clientY: 50 });
  assert.equal(m.held(), true);
  down(m, m.cell2, 1);
  m.fire("pointermove", { pointerId: 1, clientX: 700, clientY: 50 });
  assert.equal(m.held2(), true, "o dono que aperta de novo pega a outra célula, em vez de ficar preso ao arrasto perdido");
  assert.equal(m.held(), false);
});
