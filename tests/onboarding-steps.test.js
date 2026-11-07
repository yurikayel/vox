import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const render = await import("../client/js/render.js");

test("onboarding em etapas — boas-vindas visível, demais etapas ocultas, IDs preservados", () => {
  const c = { innerHTML: "" };
  render.renderOAuthEnrich(c);
  const html = c.innerHTML;
  for (const k of ["welcome", "pick", "new", "restore", "import"]) {
    assert.ok(html.includes(`data-genesis-step="${k}"`), `falta etapa ${k}`);
  }
  assert.ok(html.includes('data-genesis-step="welcome">'), "boas-vindas começa visível");
  assert.equal((html.match(/data-genesis-step="[a-z]+" hidden/g) || []).length, 4);
  for (const id of ["form-oauth-custom-name", "form-oauth-restore-passphrase", "btn-oauth-google", "btn-oauth-skip", "oauth-enrich-error"]) {
    assert.ok(html.includes(`id="${id}"`), `falta #${id}`);
  }
  assert.equal((html.match(/class="genesis-pick"/g) || []).length, 3);
});

test("onboarding em etapas — showGenesisStep mostra só a etapa pedida", () => {
  const mk = (k) => ({ dataset: { genesisStep: k }, hidden: false, querySelector: () => null });
  const steps = ["welcome", "pick", "new"].map(mk);
  const root = { querySelectorAll: () => steps };
  assert.equal(render.showGenesisStep(root, "new"), true);
  assert.deepEqual(steps.map((s) => s.hidden), [true, true, false]);
  assert.equal(render.showGenesisStep(root, "nope"), false);
});
