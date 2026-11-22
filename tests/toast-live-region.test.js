/** @file Toasts anunciam via aria-live sem roubar foco (S30-S10). */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { renderShell } from "../client/js/render/shell.js";
import * as share from "../client/js/share.js";

const TOAST_STATUS_REGION_ID = "vox-toast-status";
const TOAST_ALERT_REGION_ID = "vox-toast-alert";

function createToastMockElement(tag, children, byId) {
  const el = {
    tagName: tag.toUpperCase(),
    id: "",
    className: "",
    textContent: "",
    style: { cssText: "" },
    attrs: new Map(),
    setAttribute(k, v) {
      this.attrs.set(k, v);
      if (k === "id") this.id = v;
    },
    getAttribute(k) {
      return this.attrs.get(k);
    },
    hasAttribute(k) {
      return this.attrs.has(k);
    },
    classList: { add() {}, remove() {} },
    remove() {
      const i = children.indexOf(el);
      if (i >= 0) children.splice(i, 1);
      if (el.id) byId.delete(el.id);
    },
  };
  return el;
}

function buildToastDom() {
  const byId = new Map();
  const children = [];
  const focusEl = { tagName: "BUTTON", id: "focus-me" };
  const body = {
    children,
    appendChild(el) {
      children.push(el);
      if (el.id) byId.set(el.id, el);
    },
  };
  const doc = {
    body,
    activeElement: focusEl,
    getElementById: (id) => byId.get(id) ?? null,
    querySelector: (sel) => {
      if (sel === ".vox-toast") return children.find((c) => c.className?.startsWith?.("vox-toast")) ?? null;
      return null;
    },
    createElement: (tag) => createToastMockElement(tag, children, byId),
  };
  return { doc, children, focusEl };
}

test("toast live regions — shell injeta regiões polite e alert", () => {
  const prevDoc = globalThis.document;
  const dummyRoot = { innerHTML: "" };
  globalThis.document = {
    getElementById: (id) => (id === "app-root" ? dummyRoot : null),
    documentElement: { setAttribute: () => {} },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  try {
    renderShell({ activeTab: "home" });
    assert.ok(dummyRoot.innerHTML.includes(`id="${TOAST_STATUS_REGION_ID}"`));
    assert.match(dummyRoot.innerHTML, /role="status"/);
    assert.match(dummyRoot.innerHTML, /aria-live="polite"/);
    assert.ok(dummyRoot.innerHTML.includes(`id="${TOAST_ALERT_REGION_ID}"`));
    assert.match(dummyRoot.innerHTML, /role="alert"/);
    assert.doesNotMatch(
      dummyRoot.innerHTML,
      /id="vox-toast-alert"[^>]*aria-live/,
      "role=alert já anuncia; sem aria-live duplicado"
    );
  } finally {
    globalThis.document = prevDoc;
  }
});

test("toast live regions — showToast anuncia na região e o balão não rouba foco", () => {
  const savedDoc = globalThis.document;
  const savedEnv = process.env.NODE_ENV;
  const { doc, children, focusEl } = buildToastDom();
  globalThis.document = doc;
  process.env.NODE_ENV = "development";
  try {
    share.showToast("Link copiado", "info");
    const visual = children.find((c) => c.className === "vox-toast info");
    assert.ok(visual, "toast visual");
    assert.equal(visual.getAttribute("aria-hidden"), "true", "balão decorativo não anuncia de novo");
    assert.ok(!visual.hasAttribute("tabindex"));
    assert.equal(doc.activeElement, focusEl, "foco não vai para o toast");

    const status = doc.getElementById(TOAST_STATUS_REGION_ID);
    assert.ok(status, "região polite existe");
    assert.equal(status.getAttribute("role"), "status");

    share.showToast("Falhou", "error");
    const alert = doc.getElementById(TOAST_ALERT_REGION_ID);
    assert.ok(alert, "região de erro existe");
    assert.equal(alert.getAttribute("role"), "alert");
    assert.doesNotMatch(alert.getAttribute("aria-live") ?? "", /assertive|polite/);
  } finally {
    process.env.NODE_ENV = savedEnv;
    globalThis.document = savedDoc;
  }
});