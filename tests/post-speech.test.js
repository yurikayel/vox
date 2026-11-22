import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  canSpeakPost,
  formatPostSpeechText,
  isSpeakingPost,
  stopPostSpeech,
  togglePostSpeech,
} from "../client/js/shared/post-speech.js";
import {
  refreshListenLabel,
  refreshSheetExtras,
  ouvirFromMenu,
} from "../client/js/app/post-more-actions.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client");

class MockUtterance {
  constructor(text) {
    this.text = text;
    this.lang = "";
    this.onend = null;
    this.onerror = null;
  }
}

class MockSpeechSynthesis {
  constructor() {
    this.speaking = false;
    this.spoken = [];
    this.cancelled = false;
  }
  speak(utt) {
    this.speaking = true;
    this.cancelled = false;
    this.spoken.push(utt);
  }
  cancel() {
    this.speaking = false;
    this.cancelled = true;
  }
}

function createSpeechMockWindow() {
  const listeners = new Map();
  return {
    speechSynthesis: new MockSpeechSynthesis(),
    SpeechSynthesisUtterance: MockUtterance,
    addEventListener(name, fn, opts) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push({ fn, opts });
    },
    removeEventListener(name, fn) {
      if (!listeners.has(name)) return;
      listeners.set(name, listeners.get(name).filter((l) => l.fn !== fn));
    },
    dispatch(name) {
      const list = (listeners.get(name) || []).slice();
      for (const item of list) {
        item.fn();
        if (item.opts?.once) this.removeEventListener(name, item.fn);
      }
    },
  };
}

test("canSpeakPost identifica suporte completo e ausências", () => {
  const win = createSpeechMockWindow();
  assert.equal(canSpeakPost(win), true);
  assert.equal(canSpeakPost(null), false);
  assert.equal(canSpeakPost({}), false);
  assert.equal(canSpeakPost({ speechSynthesis: {}, SpeechSynthesisUtterance: MockUtterance }), false);
});

test("formatPostSpeechText limpa markdown e links crus", () => {
  const text = formatPostSpeechText({
    title: "# Olá Mundo",
    body: "Veja [link](https://vox.org) e https://vox.org/cru com `código` e **negrito**.",
  });
  assert.equal(text, "Olá Mundo. Veja link e com código e negrito.");
});

test("formatPostSpeechText lida com pontuação e texto idêntico", () => {
  const punct = formatPostSpeechText({ title: "Atenção!", body: "Comunicado oficial" });
  assert.equal(punct, "Atenção! Comunicado oficial");
  const same = formatPostSpeechText({ title: "Legenda única", body: "Legenda única" });
  assert.equal(same, "Legenda única");
  assert.equal(formatPostSpeechText({}), "");
});

test("togglePostSpeech inicia leitura com idioma pt-BR", () => {
  const win = createSpeechMockWindow();
  stopPostSpeech(win);
  const res = togglePostSpeech({ postId: "post-1", title: "Voz", body: "Teste", win });
  assert.deepEqual(res, { ok: true, speaking: true });
  assert.equal(isSpeakingPost("post-1"), true);
  assert.equal(win.speechSynthesis.spoken[0]?.lang, "pt-BR");
  assert.equal(win.speechSynthesis.spoken[0]?.text, "Voz. Teste");
  stopPostSpeech(win);
});

test("togglePostSpeech no mesmo post interrompe a leitura", () => {
  const win = createSpeechMockWindow();
  stopPostSpeech(win);
  togglePostSpeech({ postId: "post-1", title: "Voz", body: "Teste", win });
  assert.equal(isSpeakingPost("post-1"), true);
  const resStop = togglePostSpeech({ postId: "post-1", win });
  assert.deepEqual(resStop, { ok: true, speaking: false });
  assert.equal(isSpeakingPost("post-1"), false);
  assert.equal(win.speechSynthesis.cancelled, true);
});

test("togglePostSpeech troca automaticamente para nova publicação", () => {
  const win = createSpeechMockWindow();
  stopPostSpeech(win);
  togglePostSpeech({ postId: "post-1", title: "P1", body: "Corpo 1", win });
  assert.equal(isSpeakingPost("post-1"), true);
  const resNext = togglePostSpeech({ postId: "post-2", title: "P2", body: "Corpo 2", win });
  assert.deepEqual(resNext, { ok: true, speaking: true });
  assert.equal(isSpeakingPost("post-1"), false);
  assert.equal(isSpeakingPost("post-2"), true);
  stopPostSpeech(win);
});

test("hashchange interrompe reprodução de voz ativa", () => {
  const win = createSpeechMockWindow();
  stopPostSpeech(win);
  togglePostSpeech({ postId: "post-1", title: "P1", body: "Corpo", win });
  assert.equal(isSpeakingPost("post-1"), true);
  win.dispatch("hashchange");
  assert.equal(isSpeakingPost("post-1"), false);
  assert.equal(win.speechSynthesis.cancelled, true);
});

test("callbacks onend e onerror limpam o estado ativo", () => {
  const win = createSpeechMockWindow();
  stopPostSpeech(win);
  togglePostSpeech({ postId: "post-1", title: "P1", body: "Corpo", win });
  const utt = win.speechSynthesis.spoken[0];
  utt.onend();
  assert.equal(isSpeakingPost("post-1"), false);
  togglePostSpeech({ postId: "post-2", title: "P2", body: "Corpo", win });
  const utt2 = win.speechSynthesis.spoken[1];
  utt2.onerror();
  assert.equal(isSpeakingPost("post-2"), false);
});

test("togglePostSpeech retorna erro se não suportado ou vazio", () => {
  assert.deepEqual(togglePostSpeech({ postId: "", win: {} }), { ok: false, speaking: false, reason: "missing_id" });
  assert.deepEqual(togglePostSpeech({ postId: "p", win: {} }), { ok: false, speaking: false, reason: "unsupported" });
  const win = createSpeechMockWindow();
  const emptyRes = togglePostSpeech({ postId: "p", title: "", body: "", win });
  assert.deepEqual(emptyRes, { ok: false, speaking: false, reason: "empty" });
});

test("refreshListenLabel e refreshSheetExtras atualizam rótulo", () => {
  const win = createSpeechMockWindow();
  stopPostSpeech(win);
  const btn = { textContent: "" };
  const sheet = { querySelector: (sel) => (sel === '[data-action="listen"]' ? btn : null) };
  refreshListenLabel(sheet, "post-x");
  assert.equal(btn.textContent, "Ouvir post");
  togglePostSpeech({ postId: "post-x", title: "T", body: "B", win });
  refreshSheetExtras(sheet, { postId: "post-x", isOwn: false, hasImage: false, pix: "" });
  assert.equal(btn.textContent, "Parar leitura");
  stopPostSpeech(win);
});

test("post-more-menu HTML contém botão data-action listen", () => {
  const src = fs.readFileSync(path.join(root, "js/app/post-more-menu.js"), "utf8");
  assert.ok(src.includes('data-action="listen"'));
  assert.ok(src.includes("Ouvir post"));
  assert.ok(src.includes("ouvirFromMenu"));
});

test("ouvirFromMenu alterna reprodução de voz e valida texto", () => {
  const win = createSpeechMockWindow();
  const prevSynth = globalThis.speechSynthesis;
  const prevUtt = globalThis.SpeechSynthesisUtterance;
  globalThis.speechSynthesis = win.speechSynthesis;
  globalThis.SpeechSynthesisUtterance = win.SpeechSynthesisUtterance;
  try {
    stopPostSpeech(globalThis);
    assert.equal(ouvirFromMenu({}), false);
    assert.equal(ouvirFromMenu({ postId: "pm-ok", title: "" }), false);
    assert.equal(ouvirFromMenu({ postId: "pm-ok", title: "Post Legal" }), true);
    assert.equal(isSpeakingPost("pm-ok"), true);
    assert.equal(ouvirFromMenu({ postId: "pm-ok", title: "Post Legal" }), true);
    assert.equal(isSpeakingPost("pm-ok"), false);
  } finally {
    stopPostSpeech(globalThis);
    globalThis.speechSynthesis = prevSynth;
    globalThis.SpeechSynthesisUtterance = prevUtt;
  }
});
