import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { modalHost, clearModalHost } from "../client/js/render/modal-host.js";

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

test("modal-host: Tab circula, Esc fecha o modal e o foco volta ao gatilho", () => {
  const { doc, items, container, press, opener } = makeDom();
  doc.activeElement = opener;
  const host = modalHost("m-trap", doc);
  Object.assign(host, container);
  host.innerHTML = "<button>x</button>";
  items[2].focus();
  press("Tab");
  assert.equal(doc.activeElement, items[0]);
  press("Escape");
  assert.equal(host.innerHTML, "");
  assert.equal(doc.activeElement, opener);
  clearModalHost("m-trap", doc);
});
