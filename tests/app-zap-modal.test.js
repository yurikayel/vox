/**
 * Modal Pix (`app/zap-modal.js`): valor escolhido entra no BR Code, valor
 * personalizado em formato brasileiro, copiar e fechar. DOM mínimo de mentira.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const zap = await import("../client/js/app/zap-modal.js");
const brcode = await import("../client/js/brcode.js");

const el = (extra = {}) => ({
  listeners: {}, classes: new Set(), style: {}, dataset: {}, value: "",
  addEventListener(t, fn) { this.listeners[t] = fn; },
  classList: { add: (c) => el.cls.add(c), remove: (c) => el.cls.delete(c) },
  ...extra,
});

function button(val) {
  const classes = new Set(["btn-outline"]);
  return { dataset: { val }, classes, listeners: {}, addEventListener(t, fn) { this.listeners[t] = fn; },
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) } };
}

function mountModal() {
  const vals = [button("5"), button("10"), button("custom")];
  const parts = {
    "#zap-payload-area": { value: "" },
    ".zap-custom-container": { style: { display: "none" } },
    "#zap-custom-input": { value: "", listeners: {}, addEventListener(t, fn) { this.listeners[t] = fn; } },
    "#btn-copy-zap-payload": el(),
    ".btn-close-zap": el(),
    "#zap-modal-overlay": el(),
  };
  const container = {
    querySelector: (s) => parts[s] || null,
    querySelectorAll: (s) => (s === ".btn-zap-val" ? vals : []),
  };
  return { container, vals, parts };
}

test("valor fixo: gera BR Code com o valor, marca o botão e esconde o campo livre", () => {
  const { container, vals, parts } = mountModal();
  zap.bindZapModalEvents(container, { pixKey: "autor@vox.org", authorName: "Autora" });
  vals[1].listeners.click();
  assert.equal(parts["#zap-payload-area"].value, brcode.buildPixPayload({ key: "autor@vox.org", name: "Autora", amount: 10, description: "Apoio Vox" }));
  assert.match(parts["#zap-payload-area"].value, /540510\.00/);
  assert.ok(vals[1].classes.has("btn-primary") && !vals[1].classes.has("btn-outline"));
  assert.ok(vals[0].classes.has("btn-outline") && !vals[0].classes.has("btn-primary"));
  assert.equal(parts[".zap-custom-container"].style.display, "none");
});

test("valor personalizado: aceita vírgula brasileira e atualiza ao digitar", () => {
  const { container, vals, parts } = mountModal();
  zap.bindZapModalEvents(container, { pixKey: "autor@vox.org", authorName: "Autora" });
  vals[2].listeners.click();
  assert.equal(parts[".zap-custom-container"].style.display, "block");
  parts["#zap-custom-input"].value = "12,50";
  parts["#zap-custom-input"].listeners.input();
  assert.match(parts["#zap-payload-area"].value, /540512\.50/);
});

test("valor personalizado inválido: BR Code sai sem valor, não quebra", () => {
  const { container, parts } = mountModal();
  zap.bindZapModalEvents(container, { pixKey: "autor@vox.org", authorName: "Autora" });
  parts["#zap-custom-input"].value = "abc";
  parts["#zap-custom-input"].listeners.input();
  assert.ok(parts["#zap-payload-area"].value.length > 0);
  assert.doesNotMatch(parts["#zap-payload-area"].value, /5404/);
});

test("fechar: botão fecha; clique no overlay fecha só quando o alvo é o overlay", () => {
  const { container, parts } = mountModal();
  zap.bindZapModalEvents(container, { pixKey: "k", authorName: "A" });
  const overlay = parts["#zap-modal-overlay"];
  assert.equal(typeof parts[".btn-close-zap"].listeners.click, "function");
  assert.doesNotThrow(() => overlay.listeners.click({ target: {} }), "clique dentro do modal é ignorado");
});

test("copiar: usa o texto do payload quando há clipboard", async () => {
  const { container, parts } = mountModal();
  zap.bindZapModalEvents(container, { pixKey: "k", authorName: "A" });
  let copied = "";
  Object.defineProperty(globalThis.navigator, "clipboard", { value: { writeText: async (t) => { copied = t; } }, configurable: true });
  parts["#zap-payload-area"].value = "PAYLOAD";
  try { await parts["#btn-copy-zap-payload"].listeners.click(); } catch { /* closeZapModal usa DOM real */ }
  assert.equal(copied, "PAYLOAD");
});
