import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const byId = new Map();
const body = [];
function makeEl(tag) {
  const attrs = {};
  return {
    tagName: tag, className: "", textContent: "", id: "", style: {}, attrs,
    classList: { add() {}, remove() {} },
    setAttribute(k, v) { attrs[k] = v; },
    remove() {},
  };
}
globalThis.document = {
  querySelector: () => null,
  getElementById: (id) => byId.get(id) ?? null,
  createElement: makeEl,
  body: { appendChild: (el) => { body.push(el); if (el.id) byId.set(el.id, el); } },
};

const { showToast } = await import("../client/js/share.js");

test("toast anuncia por região viva estável (polite) e erro por assertive", async () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    showToast("Salvo", "info");
    showToast("Outro", "info");
    showToast("Falhou", "error");
    const status = byId.get("vox-toast-status");
    const alert = byId.get("vox-toast-alert");
    assert.ok(status, "região polite existe");
    assert.equal(status.attrs.role, "status");
    assert.equal(status.attrs["aria-live"], "polite");
    assert.ok(alert, "região assertive existe");
    assert.equal(alert.attrs.role, "alert");
    assert.equal(alert.attrs["aria-live"], "assertive");
    assert.equal(body.filter((e) => e.id === "vox-toast-status").length, 1, "região criada uma vez só");
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(status.textContent, "Outro");
    assert.equal(alert.textContent, "Falhou");
  } finally {
    process.env.NODE_ENV = prev;
  }
});
