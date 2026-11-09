import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const age = await import("../client/js/age-gate.js");
const render = await import("../client/js/render.js");

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data };
}

test("ADR-020: sem confirmação, não é adulto; confirmar grava só o fato e a data", () => {
  const storage = memoryStorage();
  assert.equal(age.hasConfirmedAdult(storage), false);
  age.confirmAdult(1700000000000, storage);
  assert.equal(age.hasConfirmedAdult(storage), true);
  assert.deepEqual(JSON.parse(storage.data.get(age.AGE_STORAGE_KEY)), { adult: true, confirmedAt: 1700000000000, v: 1 });
});

test("ADR-020: valor corrompido ou diferente não conta como confirmação", () => {
  for (const raw of ["{", "true", JSON.stringify({ adult: "sim" })]) {
    const storage = memoryStorage();
    storage.setItem(age.AGE_STORAGE_KEY, raw);
    assert.equal(age.hasConfirmedAdult(storage), false, raw);
  }
});

test("ADR-020: botões do pacto só ficam ativos com a caixa marcada", () => {
  const listeners = {};
  const box = { checked: false, addEventListener: (ev, fn) => (listeners[ev] = fn) };
  const mkBtn = () => ({ disabled: false, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } });
  const [a, b] = [mkBtn(), mkBtn()];
  const doc = { getElementById: (id) => (id === age.AGE_CHECKBOX_ID ? box : null) };
  assert.equal(age.bindAdultCheck(doc, [a, b, null]), box);
  assert.deepEqual([a.disabled, b.disabled, a.attrs["aria-disabled"]], [true, true, "true"]);
  box.checked = true;
  listeners.change();
  assert.deepEqual([a.disabled, b.disabled, b.attrs["aria-disabled"]], [false, false, "false"]);
});

test("ADR-020: o pacto (modal e etapa final do onboarding) traz a caixa de 18+", () => {
  const modal = { innerHTML: "" };
  render.renderPactModal(modal);
  const steps = { innerHTML: "" };
  render.renderOAuthEnrich(steps);
  for (const html of [modal.innerHTML, steps.innerHTML]) {
    assert.ok(html.includes(`id="${age.AGE_CHECKBOX_ID}"`), "falta a caixa de 18+");
    assert.ok(html.indexOf(age.AGE_CHECKBOX_ID) < html.indexOf('id="btn-pact-accept"'), "a caixa vem antes do botão");
  }
});
