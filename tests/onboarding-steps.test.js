import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const render = await import("../client/js/render.js");

test("onboarding curto — entrada visível, depois só o pacto; \"Já tenho conta\" é desvio", () => {
  const c = { innerHTML: "" };
  render.renderOAuthEnrich(c);
  const html = c.innerHTML;
  const steps = [...html.matchAll(/data-genesis-step="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(steps, ["entry", "have", "pact"], "quem é novo vê duas telas: entrada e pacto");
  assert.ok(html.includes('data-genesis-step="entry">'), "a entrada começa visível");
  assert.equal((html.match(/data-genesis-step="[a-z]+" hidden/g) || []).length, 2);
  assert.ok(html.includes('id="btn-pact-accept"') && html.includes('id="btn-pact-settings"'), "pacto é a etapa final");
  for (const id of ["form-oauth-custom-name", "form-oauth-restore-passphrase", "oauth-restore-files", "btn-oauth-skip", "oauth-enrich-error"]) {
    assert.ok(html.includes(`id="${id}"`), `falta #${id}`);
  }
  // ADR-032: Google, Meta e GitHub não são porta de entrada (não guardam a conta).
  for (const id of ["btn-oauth-google", "btn-oauth-meta", "btn-oauth-github"]) {
    assert.ok(!html.includes(`id="${id}"`), `#${id} não pode estar na entrada`);
  }
  assert.ok(html.includes("QR para outro aparelho"), "\"Já tenho conta\" aponta o QR do outro aparelho");
  assert.ok(!html.includes("genesis-pick") && !html.includes("Fundamentos da Polis"), "sem menu de escolha nem cartões de princípios");
});

test("onboarding em etapas — showGenesisStep mostra só a etapa pedida", () => {
  const mk = (k) => ({ dataset: { genesisStep: k }, hidden: false, querySelector: () => null });
  const steps = ["entry", "have", "pact"].map(mk);
  const root = { querySelectorAll: () => steps };
  assert.equal(render.showGenesisStep(root, "pact"), true);
  assert.deepEqual(steps.map((s) => s.hidden), [true, true, false]);
  assert.equal(render.showGenesisStep(root, "nope"), false);
});

test("onboarding em etapas — pular deixa claro que sem nome a conta não aparece no diretório", () => {
  const c = { innerHTML: "" };
  render.renderOAuthEnrich(c);
  const html = c.innerHTML;
  assert.ok(!html.includes("só com vx_"), "não oferece a chave crua como identidade");
  assert.ok(html.includes("escolho o nome depois"));
  assert.ok(html.includes("não aparece no diretório"));
});

test("ADR-032: importar nome e foto (Perfil) traz os provedores e diz que não guarda a conta", () => {
  const c = { innerHTML: "" };
  render.renderOAuthEnrich(c, { mode: "import" });
  const html = c.innerHTML;
  for (const id of ["btn-oauth-google", "btn-oauth-meta", "btn-oauth-github", "btn-oauth-skip", "oauth-enrich-error"]) {
    assert.ok(html.includes(`id="${id}"`), `falta #${id}`);
  }
  assert.ok(html.includes("Não guarda sua conta"));
  assert.ok(!html.includes('data-genesis-step="pact"') && !html.includes("form-oauth-custom-name"), "importar não é a entrada");
});
