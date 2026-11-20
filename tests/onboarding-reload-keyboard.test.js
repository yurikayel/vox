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
    textContent: "",
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
  assert.deepEqual(readGenesisResume(ss), { step: "entry" });
  assert.equal(store.get(GENESIS_RESUME_KEY)?.includes("a@b.c"), false);
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

test("persistGenesisMeshWait grava passo have + meshWaiting e vaultEmail, sem senha", async () => {
  const { persistGenesisMeshWait, readGenesisResume } = await genesisEmail();
  const ss = mapStorage();
  persistGenesisMeshWait("Ana@Exemplo.com", ss);
  const resume = readGenesisResume(ss);
  assert.equal(resume.step, "have");
  assert.equal(resume.meshWaiting, true);
  assert.equal(resume.vaultEmail, "ana@exemplo.com");
  assert.equal("email" in resume, false);
  assert.equal("pass" in resume, false);
  assert.equal(storedText(ss).includes(SENHA), false);
});

function meshReloadHarness() {
  const { modal, doc, mk } = mountGenesisModal();
  const emailInput = mk("oauth-restore-email-input");
  const pass = mk("oauth-sovereign-passphrase-input");
  const errorBox = { textContent: "", hidden: true };
  const getById = doc.getElementById;
  doc.getElementById = (id) => (id === "oauth-enrich-error" ? errorBox : getById(id));
  return { modal, doc, emailInput, pass, errorBox };
}

test("LT-07d: recarga com pedido na malha repõe e-mail, foco na senha e retoma o poll", async () => {
  const email = await genesisEmail();
  const vault = await import("../client/js/vault/index.js");
  const { modal, doc, emailInput, pass } = meshReloadHarness();
  const prev = { doc: globalThis.document, ss: globalThis.sessionStorage, ls: globalThis.localStorage };
  const ls = mapStorage();
  try {
    globalThis.document = doc;
    globalThis.sessionStorage = mapStorage();
    globalThis.localStorage = ls;
    email.writeGenesisResume({ step: "have", meshWaiting: true, vaultEmail: "ana@exemplo.com" });
    vault.saveMeshPending({
      address: "addr-test",
      request: { t: Date.now(), k: "ephemeral" },
      requestId: "req-test",
      sealedPrivate: { v: 0 },
    });
    email.resumeGenesisAfterRender(modal, { onEmailKitFinish: () => {}, onMeshRestored: () => {} });
    assert.equal(emailInput.value, "ana@exemplo.com");
    assert.equal(pass.value, "");
    assert.equal(pass.focused, true);
    await new Promise((r) => setImmediate(r));
    assert.equal(doc.getElementById("oauth-mesh-status").textContent, email.MESH_WAITING_STATUS);
    assert.equal(email.isMeshPollActive(), true);
  } finally {
    email.stopMeshPoll();
    vault.saveMeshPending(null);
    globalThis.document = prev.doc;
    globalThis.sessionStorage = prev.ss;
    globalThis.localStorage = prev.ls;
  }
});

test("persistGenesisEntryDraft grava rascunho da entrada sem a senha", async () => {
  const { persistGenesisEntryDraft, readGenesisResume } = await genesisEmail();
  const ss = mapStorage();
  persistGenesisEntryDraft({ rawName: "Duda", email: "duda@exemplo.com", pass: SENHA, includePhrase: true }, ss);
  const resume = readGenesisResume(ss);
  assert.equal(resume.step, "entry");
  assert.equal(resume.rawName, "Duda");
  assert.equal("email" in resume, false);
  assert.equal(resume.includePhrase, true);
  assert.equal(storedText(ss).includes(SENHA), false);
});

test("writeGenesisResume descarta `pass` e `email` mesmo que o chamador os inclua", async () => {
  const { writeGenesisResume, GENESIS_RESUME_KEY } = await genesisEmail();
  const ss = mapStorage();
  writeGenesisResume({ step: "have", email: "a@b.c", pass: SENHA }, ss);
  const raw = ss.store.get(GENESIS_RESUME_KEY);
  assert.equal(raw.includes(SENHA), false);
  assert.equal(raw.includes("a@b.c"), false);
});

test("readGenesisResume apaga senha deixada por versão antiga e devolve o resto", async () => {
  const { readGenesisResume, GENESIS_RESUME_KEY } = await genesisEmail();
  const ss = mapStorage();
  ss.setItem(GENESIS_RESUME_KEY, JSON.stringify({ step: "have", meshWaiting: true, email: "ana@exemplo.com", pass: SENHA }));
  const resume = readGenesisResume(ss);
  assert.deepEqual(resume, { step: "have", meshWaiting: true });
  assert.equal(storedText(ss).includes(SENHA), false);
  assert.equal(ss.store.get(GENESIS_RESUME_KEY).includes("ana@exemplo.com"), false);
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
    assert.equal(storedText(ss, ls).includes("Duda@Exemplo.com"), false);
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

test("LT-07a: checkOAuthEnrichStep não redesenha quando #oauth-enrich-overlay já está aberto", async () => {
  const { checkOAuthEnrichStep } = await import("../client/js/app/onboarding.js");
  const prevDoc = globalThis.document;
  localStorage.clear();
  try {
    const modalContainer = {
      innerHTML: "<p>digitando...</p>",
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    globalThis.document = {
      getElementById: (id) => {
        if (id === "oauth-enrich-overlay") return { id };
        if (id === "modal-container") return modalContainer;
        return null;
      },
      addEventListener: () => {},
    };
    checkOAuthEnrichStep();
    assert.equal(modalContainer.innerHTML, "<p>digitando...</p>", "não deve sobrescrever o modal já aberto");
  } finally {
    globalThis.document = prevDoc;
  }
});

test("LT-07b: renderOAuthEnrich ativa focus trap, ignora etapas ocultas, trata Escape e devolve foco ao fechar", () => {
  const prevDoc = globalThis.document;
  try {
    const keyListeners = [];
    const opener = { focused: false, focus() { this.focused = true; } };
    const entryInput = { hidden: false, closest: () => null, getAttribute: () => null, hasAttribute: () => false, focus() { doc.activeElement = this; } };
    const hiddenHaveInput = { hidden: false, closest: (s) => (s === "[hidden]" ? {} : null), getAttribute: () => null, hasAttribute: () => false, focus() { doc.activeElement = this; } };
    const entryBtn = { hidden: false, closest: () => null, getAttribute: () => null, hasAttribute: () => false, focus() { doc.activeElement = this; } };
    const haveSection = { dataset: { genesisStep: "have" }, hidden: true, querySelector: () => entryInput };
    const entrySection = { dataset: { genesisStep: "entry" }, hidden: false, querySelector: () => entryInput };
    let skipped = false;
    const doc = {
      activeElement: opener,
      addEventListener: (ev, fn) => { if (ev === "keydown") keyListeners.push(fn); },
      removeEventListener: (ev, fn) => {
        const i = keyListeners.indexOf(fn);
        if (ev === "keydown" && i >= 0) keyListeners.splice(i, 1);
      },
    };
    globalThis.document = doc;
    const container = {
      innerHTML: "",
      contains: (el) => el === entryInput || el === entryBtn,
      querySelectorAll: (sel) => (sel.includes("data-genesis-step") ? [entrySection, haveSection] : [entryInput, hiddenHaveInput, entryBtn]),
      querySelector: (sel) => {
        if (sel === '[data-genesis-step="have"]') return haveSection;
        if (sel === "#btn-oauth-skip") return { click() { skipped = true; } };
        return entryInput;
      },
    };
    render.renderOAuthEnrich(container);
    assert.equal(doc.activeElement, entryInput, "foco inicial no primeiro campo da entrada");
    assert.equal(keyListeners.length, 1, "focus trap registrado");
    keyListeners[0]({ key: "Tab", shiftKey: true, preventDefault() {} });
    assert.equal(doc.activeElement, entryBtn, "Shift+Tab vai ao último visível, pulando etapa [hidden]");
    haveSection.hidden = false;
    entrySection.hidden = true;
    keyListeners[0]({ key: "Escape" });
    assert.equal(haveSection.hidden, true, "Escape em 'have' volta para 'entry'");
    keyListeners[0]({ key: "Escape" });
    assert.equal(skipped, true, "Escape na raiz aciona #btn-oauth-skip quando presente");
    render.closeOAuthEnrich(container);
    assert.equal(keyListeners.length, 0, "focus trap removido ao fechar");
    assert.equal(opener.focused, true, "foco devolvido a quem abriu");
  } finally {
    globalThis.document = prevDoc;
  }
});

test("LT-07c: resumeGenesisAfterRender no passo email-kit reconstrói copyText para copiar/baixar após recarga", async () => {
  const { writeGenesisResume, resumeGenesisAfterRender } = await genesisEmail();
  const { modal, doc } = mountGenesisModal();
  const handlers = {};
  const slot = { innerHTML: "", hidden: true };
  const getById = doc.getElementById;
  doc.getElementById = (id) => {
    if (id === "oauth-email-kit-slot") return slot;
    if (id.startsWith("btn-email-kit-")) return { addEventListener: (ev, fn) => { handlers[id] = fn; } };
    return getById(id);
  };
  let copied = "";
  const prevDoc = globalThis.document;
  const prevSs = globalThis.sessionStorage;
  const prevNav = globalThis.navigator;
  try {
    globalThis.document = doc;
    globalThis.sessionStorage = mapStorage();
    Object.defineProperty(globalThis, "navigator", {
      value: { clipboard: { writeText: async (t) => { copied = t; } } },
      configurable: true,
    });
    const mailtoUrl = "mailto:ana%40exemplo.org?subject=Vox%20Acesso&body=Chave%3A%20vx_123";
    writeGenesisResume({ step: "email-kit", routeId: "vx_123", mailtoUrl, meshWaiting: false });
    resumeGenesisAfterRender(modal, { onEmailKitFinish: () => {} });
    assert.equal(slot.hidden, false);
    assert.ok(slot.innerHTML.includes("ana@exemplo.org"), "e-mail restaurado do mailto");
    await handlers["btn-email-kit-copy"]();
    assert.match(copied, /Assunto: Vox Acesso[\s\S]*Chave: vx_123/);
  } finally {
    globalThis.document = prevDoc;
    globalThis.sessionStorage = prevSs;
    Object.defineProperty(globalThis, "navigator", { value: prevNav, configurable: true });
  }
});