/**
 * @file REV-14 — QR SVG offline imprimível no cartão da frase de recuperação: geração offline,
 * palavras numeradas escapadas, isolamento em memória (sem storage/URL/console) e degradação segura.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { decodeQrModules } from "../client/js/qr-url.js";
import { QR_MAX_BYTES } from "../client/js/qr-url-codec.js";
import {
  PHRASE_QR_LABEL,
  PRINT_ROOT_ID,
  buildPhrasePrintCardHtml,
  buildPhraseQrSvg,
  discardPhrasePrintCopy,
  encodePhraseQrModules,
  printPhraseCard,
} from "../client/js/app/phrase-print.js";
import { makeEl, installDom, waitFor } from "./helpers/cov-t5-dom.mjs";
import * as localAccount from "../client/js/identity/local-account.js";
import { showRecoveryPhrase } from "../client/js/app/screens-phrase.js";

const SAMPLE_12 = [
  "abacate", "afivelar", "inativo", "afivelar", "donzela", "achatar",
  "barulho", "beber", "albergue", "exalar", "cuidado", "banir",
];

const SAMPLE_24 = [
  ...SAMPLE_12,
  "abacate", "abaixo", "abalar", "abater", "abduzir", "abelha",
  "aberto", "abismo", "abotoar", "abranger", "abreviar", "abrigar",
];

function makePrintableDom(words) {
  const items = words.map((w) => makeEl({ tagName: "LI", textContent: w }));
  const card = makeEl({
    id: "phrase-print-card",
    innerHTML: `<ol class="phrase-words">${words.map((w) => `<li>${w}</li>`).join("")}</ol>`,
    kidsAll: { ".phrase-words li": items, li: items },
    cloneNode() {
      return makeEl({
        id: this.id,
        innerHTML: this.innerHTML,
        kidsAll: this.kidsAll,
        children: [...items],
      });
    },
  });
  const doc = installDom({ ids: { "phrase-print-card": card } });
  const baseGetById = doc.getElementById;
  doc.getElementById = (id) => (doc.body.children || []).find((el) => el.id === id) || baseGetById(id);
  const listeners = new Map();
  const win = {
    printed: 0,
    addEventListener(type, fn) {
      listeners.set(type, [...(listeners.get(type) || []), fn]);
    },
    fire(type) {
      for (const fn of listeners.get(type) || []) fn();
      listeners.delete(type);
    },
    print() {
      win.printed += 1;
    },
  };
  return { doc, win };
}

function findSvgNode(root) {
  for (const child of root?.children || []) {
    if (child.tagName === "SVG") return child;
    const nested = findSvgNode(child);
    if (nested) return nested;
  }
  return null;
}

test("phrase-qr: HTML do cartão contém <svg> offline com aria-label e payload decodificável (12 e 24 palavras)", () => {
  for (const words of [SAMPLE_12, SAMPLE_24]) {
    const encoded = encodePhraseQrModules(words);
    assert.ok(encoded, "codifica em módulos QR offline");
    assert.equal(decodeQrModules(encoded.modules), words.join(" "));

    const html = buildPhrasePrintCardHtml({ words });
    assert.match(html, /<svg\b/);
    assert.match(html, new RegExp(`aria-label="${PHRASE_QR_LABEL}"`));
    assert.match(html, /<rect\b/);
    assert.match(html, /<ol class="phrase-words">/);
  }
});

test("phrase-qr: HTML do cartão preserva palavras numeradas escapadas contra XSS", () => {
  const words = ["<script>alert(1)</script>", 'a&b"c', "d'e"];
  const html = buildPhrasePrintCardHtml({ words });
  assert.match(html, /<ol class="phrase-words"><li>&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/li><li>a&amp;b&quot;c<\/li><li>d&#39;e<\/li><\/ol>/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /<svg\b/);
});

test("phrase-qr: printPhraseCard anexa QR SVG via DOM na janela de impressão e descarta após imprimir", () => {
  const { doc, win } = makePrintableDom(SAMPLE_12);
  assert.equal(printPhraseCard({ doc, win, words: SAMPLE_12 }), true);
  assert.equal(win.printed, 1);

  const root = doc.body.children.find((el) => el.id === PRINT_ROOT_ID);
  assert.ok(root, "cópia de impressão entra no body");
  assert.ok(root.children.length >= 2, "preserva itens do cartão e adiciona QR");
  const svg = findSvgNode(root);
  assert.ok(svg, "elemento SVG anexado no DOM de impressão");
  assert.equal(svg.getAttribute("aria-label"), PHRASE_QR_LABEL);
  assert.equal(svg.getAttribute("role"), "img");
  assert.ok(svg.children.length > 10, "módulos <rect> presentes no SVG");

  win.fire("afterprint");
  assert.equal(root.removed, true, "cópia removida após afterprint");
  assert.equal(doc.body.classList.contains("printing-phrase"), false);
});

test("phrase-qr: nunca grava a frase em localStorage, sessionStorage, location.hash ou console", () => {
  const prevSession = globalThis.sessionStorage;
  const writes = [];
  const prevLsSet = localStorage.setItem.bind(localStorage);
  const prevLogs = [console.log, console.warn, console.error];
  localStorage.setItem = (k, v) => writes.push(`local:${k}=${v}`);
  globalThis.sessionStorage = { setItem: (k, v) => writes.push(`session:${k}=${v}`), getItem: () => null, removeItem: () => {} };
  console.log = console.warn = console.error = (...a) => writes.push(`console:${a.join(" ")}`);
  const prevHash = globalThis.location.hash;
  try {
    const { doc, win } = makePrintableDom(SAMPLE_12);
    buildPhraseQrSvg(SAMPLE_12);
    buildPhrasePrintCardHtml({ words: SAMPLE_12 });
    printPhraseCard({ doc, win, words: SAMPLE_12 });
    discardPhrasePrintCopy(doc);
    assert.deepEqual(writes, []);
    assert.equal(globalThis.location.hash, prevHash);
  } finally {
    localStorage.setItem = prevLsSet;
    globalThis.sessionStorage = prevSession;
    [console.log, console.warn, console.error] = prevLogs;
  }
});

test("phrase-qr: degrada com segurança quando a frase está vazia ou excede a capacidade do QR", () => {
  for (const empty of [[], ["", "  "], "", null, undefined]) {
    assert.equal(encodePhraseQrModules(empty), null);
    assert.equal(buildPhraseQrSvg(empty), "");
    const html = buildPhrasePrintCardHtml({ words: empty });
    assert.match(html, /<ol class="phrase-words"><\/ol>/);
    assert.doesNotMatch(html, /<svg\b/);
    const { doc, win } = makePrintableDom([]);
    assert.equal(printPhraseCard({ doc, win, words: empty }), true);
    const root = doc.body.children.find((el) => el.id === PRINT_ROOT_ID);
    assert.equal(findSvgNode(root), null);
  }

  const huge = Array.from({ length: 45 }, (_, i) => `palavra${String(i).padStart(3, "0")}`);
  assert.ok(huge.join(" ").length > QR_MAX_BYTES);
  assert.equal(encodePhraseQrModules(huge), null);
  assert.equal(buildPhraseQrSvg(huge), "");
  const hugeHtml = buildPhrasePrintCardHtml({ words: huge });
  assert.match(hugeHtml, /<li>palavra000<\/li>/);
  assert.doesNotMatch(hugeHtml, /<svg\b/);
});

test("phrase-qr: botão imprimir em screens-phrase passa a frase em memória para printPhraseCard", async () => {
  localStorage.clear();
  await localAccount.ensureLocalAccount();
  const screen = makeEl({ id: "phrase-screen" });
  const form = makeEl();
  const btnPrint = makeEl();
  const card = makeEl({ id: "phrase-print-card", cloneNode: () => makeEl({ id: "phrase-print-card" }) });
  const ids = {
    "phrase-screen": screen, "form-phrase-show": form, "phrase-pass": makeEl({ value: "" }),
    "btn-phrase-show": makeEl(), "btn-phrase-print": btnPrint, "btn-phrase-written": makeEl(),
    "phrase-print-card": card,
  };
  const doc = installDom({ ids });
  const prevPrint = globalThis.print;
  let printed = 0;
  globalThis.print = () => { printed += 1; };
  try {
    await showRecoveryPhrase();
    await form.fire("submit");
    await waitFor(() => screen.innerHTML.length > 0);
    await btnPrint.fire("click");
    assert.equal(printed, 1);
    const root = doc.body.children.find((el) => el.id === PRINT_ROOT_ID);
    assert.ok(findSvgNode(root), "SVG do QR anexado pelo fluxo da tela");
  } finally {
    globalThis.print = prevPrint;
    discardPhrasePrintCopy(doc);
  }
});
