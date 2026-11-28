/**
 * @file Contêiner de mentira da mochila para os testes do arrastar (`bindInventoryDrag`): guarda os ouvintes e entrega
 * a célula, a grade, o fantasma e o botão de girar.
 */
import { applyInventoryMutation, listInventoryItems } from "../../client/js/dungeon/vtt-inventory.js";
import { bindInventoryDrag } from "../../client/js/dungeon/inventory-drag-ui.js";

const sheet = applyInventoryMutation(applyInventoryMutation({}, "add", { label: "Espada" }), "place", { itemId: "espada", x: 2, y: 0 });
export const state = { sheet: { inventoryItems: listInventoryItems(sheet.inventory_orset) } };

/** Contêiner de mentira: guarda os ouvintes e entrega a célula, a grade, o fantasma e o botão. */
export function fakeMount(dims = { w: "1", h: "3" }, { realFocus = false, settle = async () => {} } = {}) {
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
  bindInventoryDrag(container, { state, store: {} }, settle);
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
