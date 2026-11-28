/**
 * Preso de foco em modais e no menu ⋯ — DOM falso em Node. Integração via `modal-host` (red-on-base).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { modalHost, clearModalHost } from "../client/js/render/modal-host.js";
import { createFocusTrap } from "../client/js/render/focus-trap.js";

/** Polyfill mínimo para o `modal-host` ligar o preso quando filhos mudam. */
class MockMutationObserver {
  /** @param {() => void} cb */
  constructor(cb) {
    this.cb = cb;
  }
  /** @param {HTMLElement & { __mo?: () => void }} el */
  observe(el) {
    el.__mo = () => this.cb([]);
  }
  disconnect() {}
}
globalThis.MutationObserver = MockMutationObserver;

function makeFakeElement(tag = "div", notifyMo) {
  const children = [];
  const el = {
    id: "",
    tag,
    hidden: false,
    childNodes: children,
    parent: null,
    attributes: new Map(),
    getAttribute(n) {
      return this.attributes.get(n) ?? null;
    },
    hasAttribute(n) {
      return this.attributes.has(n);
    },
    contains(node) {
      if (node === el) return true;
      return children.some((c) => c === node);
    },
    querySelectorAll(sel) {
      if (!sel.includes("button")) return [];
      const out = [];
      const walk = (n) => {
        if (n.tag === "button" && !n.hidden) out.push(n);
        if (n.childNodes) n.childNodes.forEach(walk);
      };
      walk(el);
      return out;
    },
    appendChild(child) {
      children.push(child);
      child.parent = el;
      notifyMo?.(el);
      return child;
    },
    set innerHTML(_v) {
      children.length = 0;
      notifyMo?.(el);
    },
  };
  return el;
}

function makeFakeButton(id, onFocus) {
  const b = {
    id,
    tag: "button",
    hidden: false,
    parent: null,
    attributes: new Map(),
    getAttribute(n) {
      return b.attributes.get(n) ?? null;
    },
    hasAttribute(n) {
      return b.attributes.has(n);
    },
    focus() {
      onFocus(b, id);
    },
  };
  return b;
}

/**
 * @returns {import("../client/js/render/modal-host.js") & {
 *   focusLog: string[],
 *   dispatchTab: (opts?: { shiftKey?: boolean }) => void,
 * }}
 */
function fakeDoc() {
  const byId = new Map();
  const focusLog = [];
  const keyListeners = [];
  let active = null;
  const notifyMo = (el) => el.__mo?.();

  return {
    focusLog,
    get activeElement() {
      return active;
    },
    body: {
      appendChild(el) {
        byId.set(el.id, el);
        el.parent = this;
        notifyMo(el);
      },
    },
    getElementById: (id) => byId.get(id) || null,
    createElement: (tag) => makeFakeElement(tag, notifyMo),
    addEventListener(type, fn, capture) {
      if (type === "keydown" && capture) keyListeners.push(fn);
    },
    removeEventListener(type, fn, _capture) {
      const i = keyListeners.findIndex((f) => f === fn);
      if (i >= 0) keyListeners.splice(i, 1);
    },
    dispatchTab(opts = {}) {
      const e = { key: "Tab", shiftKey: Boolean(opts.shiftKey), defaultPrevented: false, preventDefault() { e.defaultPrevented = true; } };
      keyListeners.forEach((fn) => fn(e));
      return e;
    },
    _button(id) {
      return makeFakeButton(id, (b, btnId) => {
        active = b;
        focusLog.push(btnId);
      });
    },
  };
}

test("modal-host: Tab no último botão volta ao primeiro", () => {
  const doc = fakeDoc();
  const host = modalHost("trap-modal", doc);
  const first = doc._button("first");
  const last = doc._button("last");
  host.appendChild(first);
  host.appendChild(last);
  last.focus();
  doc.dispatchTab();
  assert.equal(doc.activeElement?.id, "first", "o foco circula para o primeiro");
});

test("modal-host: Shift+Tab no primeiro vai ao último", () => {
  const doc = fakeDoc();
  const host = modalHost("trap-modal-shift", doc);
  const first = doc._button("a");
  const last = doc._button("z");
  host.appendChild(first);
  host.appendChild(last);
  first.focus();
  doc.dispatchTab({ shiftKey: true });
  assert.equal(doc.activeElement?.id, "z");
});

test("modal-host: clear devolve o foco a quem abriu", () => {
  const doc = fakeDoc();
  const opener = doc._button("opener");
  opener.focus();
  const host = modalHost("trap-restore", doc);
  const inner = doc._button("in-modal");
  host.appendChild(inner);
  inner.focus();
  clearModalHost("trap-restore", doc);
  assert.equal(doc.activeElement?.id, "opener", "fechar restaura o foco");
});

test("modal-host: ao abrir (denúncia, apontamento) o foco entra no modal, não fica no botão que abriu", () => {
  const doc = fakeDoc();
  const opener = doc._button("summary-denunciar");
  opener.focus();
  const host = modalHost("trap-foco-inicial", doc);
  host.appendChild(doc._button("primeiro"));
  host.appendChild(doc._button("segundo"));
  assert.equal(host.contains(doc.activeElement), true, "o foco está dentro do host");
  assert.equal(doc.activeElement?.id, "primeiro");
  clearModalHost("trap-foco-inicial", doc);
  assert.equal(doc.activeElement?.id, "summary-denunciar", "fechar devolve o foco a quem abriu");
});

/** Contêiner de mentira com os botões dados (contém só eles) e, opcionalmente, um `[autofocus]`. */
function fakeRoot(doc, buttons, autofocus = null) {
  return { contains: (n) => buttons.includes(n), querySelectorAll: () => buttons, querySelector: (sel) => (sel === "[autofocus]" ? autofocus : null) };
}

test("createFocusTrap: com focusOnActivate leva o foco ao [autofocus], senão ao primeiro focável", () => {
  const doc = fakeDoc();
  const [a, b] = [doc._button("a"), doc._button("b")];
  createFocusTrap(fakeRoot(doc, [a, b], b), { doc, focusOnActivate: true }).activate();
  assert.equal(doc.activeElement?.id, "b", "o [autofocus] vence");
  const outro = fakeDoc();
  const [c, d] = [outro._button("c"), outro._button("d")];
  createFocusTrap(fakeRoot(outro, [c, d]), { doc: outro, focusOnActivate: true }).activate();
  assert.equal(outro.activeElement?.id, "c", "sem [autofocus], o primeiro");
});

test("createFocusTrap: o foco que já está dentro não é movido", () => {
  const doc = fakeDoc();
  const [a, b] = [doc._button("a"), doc._button("b")];
  b.focus();
  doc.focusLog.length = 0;
  createFocusTrap(fakeRoot(doc, [a, b]), { doc, focusOnActivate: true }).activate();
  assert.deepEqual(doc.focusLog, [], "nenhuma chamada de foco");
  assert.equal(doc.activeElement?.id, "b");
});

test("createFocusTrap: sem a opção o foco fica onde estava (entrada, gaveta e folha ⋯ não mudam)", () => {
  const doc = fakeDoc();
  const [opener, a] = [doc._button("opener"), doc._button("a")];
  opener.focus();
  createFocusTrap(fakeRoot(doc, [a]), { doc }).activate();
  assert.equal(doc.activeElement?.id, "opener");
});