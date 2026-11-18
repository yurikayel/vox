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

test("ADR-032 §6: entrada 1-etapa com e-mail, senha sem confirmação, frase opcional desmarcada e cartão §6.5", () => {
  const c = { innerHTML: "" };
  render.renderOAuthEnrich(c);
  const html = c.innerHTML;
  for (const id of [
    "oauth-entry-email-input",
    "oauth-entry-pass-input",
    "btn-oauth-toggle-pass",
    "oauth-entry-include-phrase",
    "btn-oauth-name-only",
    "oauth-restore-email-input",
    "oauth-restore-kit-text",
  ]) {
    assert.ok(html.includes(`id="${id}"`), `falta #${id}`);
  }
  assert.ok(html.includes('autocomplete="username"') && html.includes('autocomplete="new-password"'));
  assert.ok(html.includes('autocomplete="current-password"'));
  assert.ok(html.includes("Seu e-mail não sai deste aparelho"));
  assert.match(html, /id="oauth-entry-include-phrase"[^>]*>/);
  assert.doesNotMatch(html, /id="oauth-entry-include-phrase"[^>]*checked/);

  const card = render.renderEmailKitCardHtml({ email: "ana@exemplo.com", mailtoUrl: "mailto:ana%40exemplo.com?subject=ok" });
  for (const id of ["btn-email-kit-fix-email", "btn-email-kit-open-app", "btn-email-kit-copy", "btn-email-kit-download", "btn-email-kit-confirm", "btn-email-kit-later"]) {
    assert.ok(card.includes(`id="${id}"`), `falta #${id} no cartão §6.5`);
  }
});

function oauthErrorDom() {
  const mk = () => ({ textContent: "", hidden: true, focusCalls: 0, focus() { this.focusCalls += 1; } });
  const errorEl = mk();
  const passEl = mk();
  const map = { "oauth-enrich-error": errorEl, "oauth-entry-pass-input": passEl };
  return { errorEl, passEl, doc: { getElementById: (id) => map[id] ?? null } };
}

test("setOAuthEnrichError com focusId mostra mensagem e foca o campo", async () => {
  const { errorEl, passEl, doc } = oauthErrorDom();
  const prev = globalThis.document;
  globalThis.document = doc;
  try {
    const { setOAuthEnrichError } = await import("../client/js/app/onboarding.js");
    setOAuthEnrichError("Senha curta", "oauth-entry-pass-input");
    assert.equal(errorEl.textContent, "Senha curta");
    assert.equal(errorEl.hidden, false);
    assert.equal(passEl.focusCalls, 1);
  } finally {
    globalThis.document = prev;
  }
});

test("setOAuthEnrichError sem focusId não chama focus", async () => {
  const { errorEl, passEl, doc } = oauthErrorDom();
  const prev = globalThis.document;
  globalThis.document = doc;
  try {
    const { setOAuthEnrichError } = await import("../client/js/app/onboarding.js");
    setOAuthEnrichError("Falha");
    assert.equal(errorEl.textContent, "Falha");
    assert.equal(passEl.focusCalls, 0);
  } finally {
    globalThis.document = prev;
  }
});

test("validateEmailEntryIssue mapeia foco ao campo que falhou (LT-07)", async () => {
  const emailKit = await import("../client/js/email-kit.js");
  assert.equal(typeof emailKit.validateEmailEntryIssue, "function");
  const cases = [
    [{ rawName: "", email: "", pass: "" }, "name"],
    [{ rawName: "Duda", email: "sem-arroba", pass: "dozechar!!!!" }, "email"],
    [{ rawName: "Duda", email: "duda@exemplo.com", pass: "curta" }, "pass"],
  ];
  for (const [values, field] of cases) {
    assert.equal(emailKit.validateEmailEntryIssue(values)?.field, field);
    assert.equal(emailKit.validateEmailEntryIssue(values)?.message, emailKit.validateEmailEntry(values));
  }
  assert.equal(emailKit.validateEmailEntryIssue({ rawName: "Duda", email: "", pass: "" }), null);
  const focusIds = { name: "oauth-custom-name-input", email: "oauth-entry-email-input", pass: "oauth-entry-pass-input" };
  const c = { innerHTML: "" };
  render.renderOAuthEnrich(c);
  for (const id of Object.values(focusIds)) assert.ok(c.innerHTML.includes(`id="${id}"`), id);
});

test("warnIfAccountNotPersisted expõe API (RED na base)", async () => {
  const mod = await import("../client/js/app/onboarding.js");
  assert.equal(typeof mod.warnIfAccountNotPersisted, "function");
});

test("warnIfAccountNotPersisted mostra aviso em oauth-enrich-error", async () => {
  const { errorEl, doc } = oauthErrorDom();
  const prev = globalThis.document;
  globalThis.document = doc;
  const orig = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (key, val) => {
    if (key === "vox-local-account-v1") throw new DOMException("quota", "QuotaExceededError");
    return orig(key, val);
  };
  try {
    localStorage.clear();
    const localAccount = await import("../client/js/identity/local-account.js");
    await localAccount.wipeLocalAccount();
    await localAccount.ensureLocalAccount();
    const { warnIfAccountNotPersisted } = await import("../client/js/app/onboarding.js");
    warnIfAccountNotPersisted();
    assert.match(errorEl.textContent, /armazenamento cheio ou bloqueado/);
    assert.equal(errorEl.hidden, false);
  } finally {
    localStorage.setItem = orig;
    globalThis.document = prev;
  }
});

test("setOAuthEnrichError com mensagem vazia esconde e não foca", async () => {
  const { errorEl, passEl, doc } = oauthErrorDom();
  const prev = globalThis.document;
  globalThis.document = doc;
  try {
    const { setOAuthEnrichError } = await import("../client/js/app/onboarding.js");
    setOAuthEnrichError("", "oauth-entry-pass-input");
    assert.equal(errorEl.textContent, "");
    assert.equal(errorEl.hidden, true);
    assert.equal(passEl.focusCalls, 0);
  } finally {
    globalThis.document = prev;
  }
});
