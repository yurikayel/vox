/**
 * Construtor de enquete (`app/compose-poll.js`): limites 2–6, renumeração,
 * ligação única e leitura das opções. Usa um DOM mínimo de mentira.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const { bindPollBuilder, readPollOptions } = await import("../client/js/app/compose-poll.js");

class Node_ {
  constructor(cls, parent = null) {
    this.classes = cls.split(" ");
    this.children = [];
    this.parent = parent;
    this.dataset = {};
    this.attrs = {};
    this.listeners = {};
    this.disabled = false;
    this.value = "";
    this.placeholder = "";
  }
  get firstElementChild() { return this.children[0]; }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  focus() { Node_.focused = this; }
  appendChild(c) { c.parent = this; this.children.push(c); }
  remove() { this.parent.children = this.parent.children.filter((c) => c !== this); }
  closest(sel) {
    const cls = sel.slice(1);
    for (let n = this; n; n = n.parent) if (n.classes.includes(cls)) return n;
    return null;
  }
  all(cls) { return this.children.flatMap((c) => [...(c.classes.includes(cls) ? [c] : []), ...c.all(cls)]); }
  querySelectorAll(sel) { return this.all(sel.slice(1)); }
  querySelector(sel) {
    if (sel === "input") return this.all("civic-poll-input")[0];
    return this.all(sel.slice(1))[0];
  }
  cloneNode() {
    const copy = new Node_(this.classes.join(" "));
    this.children.forEach((c) => copy.appendChild(c.cloneNode()));
    copy.value = this.value;
    return copy;
  }
  fire(t, ev) { (this.listeners[t] || []).forEach((fn) => fn(ev)); }
}

function row() {
  const r = new Node_("civic-poll-row");
  r.appendChild(new Node_("civic-poll-input"));
  r.appendChild(new Node_("civic-poll-remove"));
  return r;
}

function mount(rows = 2) {
  const list = new Node_("");
  for (let i = 0; i < rows; i++) list.appendChild(row());
  const add = new Node_("");
  const byId = { "civic-poll-options": list, "btn-civic-poll-add": add };
  globalThis.document = {
    getElementById: (id) => byId[id] || null,
    querySelectorAll: () => list.all("civic-poll-input"),
  };
  return { list, add };
}

const clickRemove = (list, i) => {
  const btn = list.children[i].all("civic-poll-remove")[0];
  list.fire("click", { target: { closest: (s) => btn.closest(s) } });
};

test("bindPollBuilder: sem lista no DOM não faz nada", () => {
  globalThis.document = { getElementById: () => null };
  assert.doesNotThrow(() => bindPollBuilder());
});

test("bindPollBuilder: começa em 2 opções, numerada, sem remover e podendo adicionar", () => {
  const { list, add } = mount(2);
  bindPollBuilder();
  const inputs = list.all("civic-poll-input");
  assert.deepEqual(inputs.map((i) => i.placeholder), ["Opção 1", "Opção 2"]);
  assert.equal(inputs[1].attrs["aria-label"], "Opção 2");
  assert.ok(list.all("civic-poll-remove").every((b) => b.disabled), "no mínimo não remove");
  assert.equal(add.disabled, false);
});

test("bindPollBuilder: adiciona opção vazia, foca nela e para em 6", () => {
  const { list, add } = mount(2);
  bindPollBuilder();
  list.all("civic-poll-input")[0].value = "Sim";
  for (let i = 0; i < 10; i++) add.fire("click");
  assert.equal(list.children.length, 6);
  assert.equal(add.disabled, true);
  assert.equal(list.all("civic-poll-input")[5].placeholder, "Opção 6");
  assert.equal(list.all("civic-poll-input")[2].value, "", "a cópia nasce vazia");
  assert.equal(Node_.focused, list.all("civic-poll-input")[5]);
});

test("bindPollBuilder: remove e renumera, mas nunca abaixo de 2", () => {
  const { list, add } = mount(4);
  bindPollBuilder();
  clickRemove(list, 0);
  assert.deepEqual(list.all("civic-poll-input").map((i) => i.placeholder), ["Opção 1", "Opção 2", "Opção 3"]);
  clickRemove(list, 0);
  clickRemove(list, 0);
  clickRemove(list, 0);
  assert.equal(list.children.length, 2);
  assert.equal(add.disabled, false);
});

test("bindPollBuilder: chamar duas vezes não duplica os ouvintes", () => {
  const { list, add } = mount(2);
  bindPollBuilder();
  bindPollBuilder();
  assert.equal(add.listeners.click.length, 1);
  assert.equal(list.listeners.click.length, 1);
});

test("readPollOptions: tira espaços e descarta opções vazias, mantendo a ordem", () => {
  const { list } = mount(4);
  ["  Sim ", "", "Não", "   "].forEach((v, i) => { list.all("civic-poll-input")[i].value = v; });
  assert.deepEqual(readPollOptions(), ["Sim", "Não"]);
});
