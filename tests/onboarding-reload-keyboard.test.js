/**
 * LT-07: após recarga, retoma entrada/e-mail ou espera do cofre na malha; teclado nas telas tocadas.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as render from "../client/js/render.js";
import { renderPhraseIntroHtml, renderPhraseWordsHtml } from "../client/js/render/recovery-phrase.js";
import { renderBackupWizard } from "../client/js/render/guided-setup.js";

async function genesisEmail() {
  return import("../client/js/app/onboarding-email.js");
}

test("onboarding: GENESIS_RESUME_KEY exportada (RED na base)", async () => {
  const { GENESIS_RESUME_KEY } = await genesisEmail();
  assert.equal(GENESIS_RESUME_KEY, "vox-genesis-resume-v1");
});

function fakeInput(id) {
  return {
    id,
    value: "",
    type: "text",
    hidden: false,
    checked: false,
    focus() { this.focused = true; },
    setAttribute() {},
    removeAttribute() {},
    addEventListener() {},
  };
}

function mountGenesisModal() {
  const inputs = new Map();
  const mk = (id) => {
    const el = fakeInput(id);
    inputs.set(id, el);
    return el;
  };
  const panel = {
    addEventListener() {},
    querySelectorAll(sel) {
      if (!sel.includes("data-genesis-step")) return [];
      return [...(modal._steps?.values() || [])];
    },
  };
  const modal = {
    innerHTML: "",
    querySelector: (sel) => {
      if (sel === ".genesis-panel--steps") return panel;
      const step = sel.match(/data-genesis-step="([^"]+)"/);
      if (step) return modal._steps?.get(step[1]) || null;
      return null;
    },
    querySelectorAll(sel) {
      if (!sel.includes("data-genesis-step")) return [];
      return [...(modal._steps?.values() || [])];
    },
  };
  const c = { innerHTML: "" };
  render.renderOAuthEnrich(c);
  modal.innerHTML = c.innerHTML;
  modal._steps = new Map();
  for (const key of ["entry", "have", "pact"]) {
    const section = { dataset: { genesisStep: key }, hidden: key !== "entry", querySelector(s) {
      if (s === "input, button:not(.genesis-back)") return inputs.get(key === "have" ? "oauth-restore-email-input" : "oauth-custom-name-input");
      return null;
    } };
    modal._steps.set(key, section);
  }
  const doc = {
    getElementById: (id) => {
      if (inputs.has(id)) return inputs.get(id);
      if (id === "oauth-enrich-error") return { textContent: "", hidden: true };
      if (id === "oauth-mesh-status") return mk("oauth-mesh-status");
      if (id === "form-oauth-custom-name") return { hidden: false, parentElement: { querySelector: () => ({ hidden: false }) } };
      if (id === "oauth-email-kit-slot") return { innerHTML: "", hidden: true };
      return null;
    },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  return { modal, doc, inputs, mk };
}

test("readGenesisResume / writeGenesisResume na sessionStorage", async () => {
  const {
    GENESIS_RESUME_KEY,
    clearGenesisResume,
    readGenesisResume,
    writeGenesisResume,
  } = await genesisEmail();
  const store = new Map();
  const ss = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
  clearGenesisResume(ss);
  assert.equal(readGenesisResume(ss), null);
  writeGenesisResume({ step: "entry", email: "a@b.c" }, ss);
  assert.deepEqual(readGenesisResume(ss), { step: "entry", email: "a@b.c" });
  assert.equal(store.get(GENESIS_RESUME_KEY)?.includes("a@b.c"), true);
  clearGenesisResume(ss);
  assert.equal(readGenesisResume(ss), null);
});

const SENHA = "senha forte de teste!";

function mapStorage(store = new Map()) {
  return { store, getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
}

function storedText(...storages) {
  return storages.flatMap((s) => [...s.store.entries()].flat()).join(" ");
}

test("persistGenesisMeshWait grava passo have + meshWaiting, só com o e-mail", async () => {
  const { persistGenesisMeshWait, readGenesisResume } = await genesisEmail();
  const ss = mapStorage();
  persistGenesisMeshWait({ email: "ana@exemplo.com", pass: SENHA }, ss);
  const resume = readGenesisResume(ss);
  assert.equal(resume.step, "have");
  assert.equal(resume.meshWaiting, true);
  assert.equal(resume.email, "ana@exemplo.com");
  assert.equal("pass" in resume, false);
  assert.equal(storedText(ss).includes(SENHA), false);
});

test("resumeGenesisAfterRender reabre a volta com senha vazia, foco nela e sem retomar a malha sozinha (LT-07)", async () => {
  const { writeGenesisResume, resumeGenesisAfterRender } = await genesisEmail();
  const { modal, doc, mk } = mountGenesisModal();
  mk("oauth-restore-email-input");
  mk("oauth-sovereign-passphrase-input");
  const errorBox = { textContent: "", hidden: true };
  const getById = doc.getElementById;
  doc.getElementById = (id) => (id === "oauth-enrich-error" ? errorBox : getById(id));
  const prevDoc = globalThis.document;
  const prevSs = globalThis.sessionStorage;
  try {
    globalThis.document = doc;
    globalThis.sessionStorage = mapStorage();
    writeGenesisResume({ step: "have", email: "ana@exemplo.com", meshWaiting: true });
    resumeGenesisAfterRender(modal, { onEmailKitFinish: () => {} });
    assert.equal(doc.getElementById("oauth-restore-email-input").value, "ana@exemplo.com");
    const pass = doc.getElementById("oauth-sovereign-passphrase-input");
    assert.equal(pass.value, "");
    assert.equal(pass.focused, true);
    assert.equal(modal._steps.get("have").hidden, false);
    assert.equal(errorBox.hidden, false);
    assert.match(errorBox.textContent, /digite a Senha Soberana de novo/);
  } finally {
    globalThis.document = prevDoc;
    globalThis.sessionStorage = prevSs;
  }
});

test("persistGenesisEntryDraft grava rascunho da entrada sem a senha", async () => {
  const { persistGenesisEntryDraft, readGenesisResume } = await genesisEmail();
  const ss = mapStorage();
  persistGenesisEntryDraft({ rawName: "Duda", email: "duda@exemplo.com", pass: SENHA, includePhrase: true }, ss);
  const resume = readGenesisResume(ss);
  assert.equal(resume.step, "entry");
  assert.equal(resume.rawName, "Duda");
  assert.equal(resume.email, "duda@exemplo.com");
  assert.equal(resume.includePhrase, true);
  assert.equal(storedText(ss).includes(SENHA), false);
});

test("writeGenesisResume descarta `pass` mesmo que o chamador o inclua", async () => {
  const { writeGenesisResume, GENESIS_RESUME_KEY } = await genesisEmail();
  const ss = mapStorage();
  writeGenesisResume({ step: "have", email: "a@b.c", pass: SENHA }, ss);
  assert.equal(ss.store.get(GENESIS_RESUME_KEY).includes(SENHA), false);
});

test("readGenesisResume apaga senha deixada por versão antiga e devolve o resto", async () => {
  const { readGenesisResume, GENESIS_RESUME_KEY } = await genesisEmail();
  const ss = mapStorage();
  ss.setItem(GENESIS_RESUME_KEY, JSON.stringify({ step: "have", meshWaiting: true, email: "ana@exemplo.com", pass: SENHA }));
  const resume = readGenesisResume(ss);
  assert.deepEqual(resume, { step: "have", meshWaiting: true, email: "ana@exemplo.com" });
  assert.equal(storedText(ss).includes(SENHA), false);
  assert.equal(ss.store.get(GENESIS_RESUME_KEY).includes("ana@exemplo.com"), true);
});

test("digitar a senha na entrada não deixa o valor em sessionStorage nem localStorage (CodeQL 282)", async () => {
  const { bindEmailEntryForm } = await genesisEmail();
  const ids = ["oauth-custom-name-input", "oauth-entry-email-input", "oauth-entry-pass-input", "oauth-entry-include-phrase"];
  const inputs = new Map(ids.map((id) => [id, fakeInput(id)]));
  const listeners = {};
  const form = { addEventListener: (type, fn) => { listeners[type] = fn; } };
  const prev = { doc: globalThis.document, ss: globalThis.sessionStorage, ls: globalThis.localStorage };
  const ss = mapStorage();
  const ls = mapStorage();
  try {
    globalThis.document = { getElementById: (id) => inputs.get(id) || null };
    globalThis.sessionStorage = ss;
    globalThis.localStorage = ls;
    bindEmailEntryForm(form, { finish: () => {}, finishNameOnly: () => {} });
    inputs.get("oauth-entry-email-input").value = "Duda@Exemplo.com";
    inputs.get("oauth-entry-pass-input").value = SENHA;
    listeners.input();
    assert.ok(ss.store.size > 0, "o rascunho sem segredo continua sendo gravado");
    assert.equal(storedText(ss, ls).includes(SENHA), false);
  } finally {
    globalThis.document = prev.doc;
    globalThis.sessionStorage = prev.ss;
    globalThis.localStorage = prev.ls;
  }
});

test("frase de recuperação — cartão de impressão fora da ordem de Tab", () => {
  const html = renderPhraseWordsHtml({ words: ["a", "b", "c"], kind: "semente" });
  assert.match(html, /id="phrase-print-card"[^>]*tabindex="-1"/);
  for (const id of ["btn-phrase-print", "btn-phrase-written"]) {
    assert.ok(html.includes(`id="${id}"`) && html.includes('type="button"'));
    assert.ok(html.indexOf(`id="${id}"`) < html.indexOf("phrase-print-card"));
  }
  const intro = renderPhraseIntroHtml({ needsPassphrase: true });
  assert.ok(intro.includes('id="btn-phrase-show"') && intro.includes('type="submit"'));
  assert.ok(intro.includes('id="phrase-pass"'));
  assert.ok(intro.includes('href="#/guardioes"') && intro.includes('href="#/backup"'));
});

test("backup guiado — ações críticas são botões ou links focáveis", () => {
  const main = { innerHTML: "" };
  renderBackupWizard(main);
  assert.ok(main.innerHTML.includes('id="btn-backup-wizard-save"'));
  assert.ok(main.innerHTML.includes('id="bk-pass"'));
  assert.doesNotMatch(main.innerHTML, /btn-backup-wizard-save[^>]*tabindex="-1"/);
});