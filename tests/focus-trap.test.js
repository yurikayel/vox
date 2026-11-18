import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { trapFocus } from "../client/js/render/focus-trap.js";

/** DOM mínimo: elementos focáveis, contêiner com `contains`, documento com `activeElement` e keydown. */
function makeDom(labels = ["a", "b", "c"]) {
  const doc = { activeElement: null, listeners: [], byId: new Map() };
  doc.addEventListener = (t, fn) => t === "keydown" && doc.listeners.push(fn);
  doc.removeEventListener = (t, fn) => { doc.listeners = doc.listeners.filter((f) => f !== fn); };
  doc.getElementById = (id) => doc.byId.get(id) || null;
  doc.createElement = () => ({ id: "", innerHTML: "" });
  doc.body = { appendChild: (el) => { doc.byId.set(el.id, el); } };
  const mk = (name) => ({ name, focus() { doc.activeElement = this; } });
  const items = labels.map(mk);
  const container = {
    contains: (el) => items.includes(el) || el === container,
    querySelectorAll: () => items,
    focus() { doc.activeElement = this; },
  };
  const press = (key, shiftKey = false) => {
    const ev = { key, shiftKey, prevented: false, preventDefault() { this.prevented = true; } };
    [...doc.listeners].forEach((fn) => fn(ev));
    return ev;
  };
  return { doc, items, container, press, opener: mk("opener") };
}

test("focus-trap: Tab no último vai ao primeiro e Shift+Tab no primeiro vai ao último", () => {
  const { doc, items, container, press, opener } = makeDom();
  doc.activeElement = opener;
  trapFocus(container, { doc });
  items[2].focus();
  assert.equal(press("Tab").prevented, true);
  assert.equal(doc.activeElement, items[0]);
  assert.equal(press("Tab", true).prevented, true);
  assert.equal(doc.activeElement, items[2]);
  items[1].focus();
  assert.equal(press("Tab").prevented, false, "no meio o navegador segue sozinho");
});

test("focus-trap: foco fora do contêiner volta para dentro no Tab", () => {
  const { doc, items, container, press, opener } = makeDom();
  doc.activeElement = opener;
  trapFocus(container, { doc });
  press("Tab");
  assert.equal(doc.activeElement, items[0]);
});

test("focus-trap: Esc chama onEscape e soltar devolve o foco ao gatilho", () => {
  const { doc, container, press, opener } = makeDom();
  doc.activeElement = opener;
  let closed = 0;
  const release = trapFocus(container, { doc, onEscape: () => { closed += 1; } });
  container.focus();
  press("Escape");
  assert.equal(closed, 1);
  release();
  assert.equal(doc.activeElement, opener);
  assert.equal(doc.listeners.length, 0);
  release();
  press("Escape");
  assert.equal(closed, 1, "solto não reage mais");
});
