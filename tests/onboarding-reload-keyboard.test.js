/**
 * LT-07: após recarga, retoma entrada/e-mail ou espera do cofre na malha; teclado nas telas tocadas.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as render from "../client/js/render.js";
import {
  GENESIS_RESUME_KEY,
  clearGenesisResume,
  persistGenesisEntryDraft,
  persistGenesisMeshWait,
  readGenesisResume,
  resumeGenesisAfterRender,
  writeGenesisResume,
} from "../client/js/app/onboarding-email.js";
import { renderPhraseIntroHtml, renderPhraseWordsHtml } from "../client/js/render/recovery-phrase.js";
import { renderBackupWizard } from "../client/js/render/guided-setup.js";

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

test("readGenesisResume / writeGenesisResume na sessionStorage", () => {
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

test("persistGenesisMeshWait grava passo have + meshWaiting", () => {
  const store = new Map();
  const ss = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  persistGenesisMeshWait({ email: "ana@exemplo.com", pass: "senha forte de teste!" }, ss);
  const resume = readGenesisResume(ss);
  assert.equal(resume.step, "have");
  assert.equal(resume.meshWaiting, true);
  assert.equal(resume.email, "ana@exemplo.com");
});

test("resumeGenesisAfterRender preenche volta e chama startMeshRestore (LT-07 recarga)", async () => {
  const { modal, doc, mk } = mountGenesisModal();
  mk("oauth-restore-email-input");
  mk("oauth-sovereign-passphrase-input");
  mk("oauth-mesh-status");
  const prevDoc = globalThis.document;
  const prevSs = globalThis.sessionStorage;
  try {
    globalThis.document = doc;
    const store = new Map();
    globalThis.sessionStorage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    };
    writeGenesisResume({ step: "have", email: "ana@exemplo.com", pass: "senha forte de teste!", meshWaiting: true });
    let meshStarted = 0;
    await resumeGenesisAfterRender(modal, {
      onMeshRestored: () => {},
      onEmailKitFinish: () => {},
      startMesh: () => { meshStarted++; return Promise.resolve(); },
    });
    assert.equal(doc.getElementById("oauth-restore-email-input").value, "ana@exemplo.com");
    assert.equal(doc.getElementById("oauth-sovereign-passphrase-input").value, "senha forte de teste!");
    assert.equal(meshStarted, 1);
    assert.equal(modal._steps.get("have").hidden, false);
  } finally {
    globalThis.document = prevDoc;
    globalThis.sessionStorage = prevSs;
  }
});

test("persistGenesisEntryDraft grava rascunho da entrada", () => {
  const store = new Map();
  const ss = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  persistGenesisEntryDraft({ rawName: "Duda", email: "duda@exemplo.com", pass: "senha forte de teste!", includePhrase: true }, ss);
  const resume = readGenesisResume(ss);
  assert.equal(resume.step, "entry");
  assert.equal(resume.rawName, "Duda");
  assert.equal(resume.includePhrase, true);
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