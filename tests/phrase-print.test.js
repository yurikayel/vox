/**
 * @file Impressão do cartão da frase (ADR-032 §3.3): a cópia com as palavras não fica no `body` depois de imprimir,
 * de trocar de rota ou de sair da página, mesmo se o navegador não disparar `afterprint`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PRINT_ROOT_ID, discardPhrasePrintCopy, printPhraseCard } from "../client/js/app/phrase-print.js";

function fakeEl(id) {
  return {
    id,
    parent: null,
    cloneNode() {
      return fakeEl(this.id);
    },
    remove() {
      this.parent?.children.splice(this.parent.children.indexOf(this), 1);
      this.parent = null;
    },
  };
}

function fakeDoc() {
  const card = fakeEl("phrase-print-card");
  const classes = new Set();
  const body = {
    children: [],
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), has: (c) => classes.has(c) },
    append(el) {
      el.parent = body;
      body.children.push(el);
    },
  };
  return {
    body,
    getElementById: (id) => (id === card.id ? card : body.children.find((el) => el.id === id) || null),
  };
}

function fakeWin({ withPrint = true } = {}) {
  const listeners = new Map();
  const win = {
    printed: 0,
    addEventListener(type, fn) {
      listeners.set(type, [...(listeners.get(type) || []), fn]);
    },
    fire(type) {
      const fns = listeners.get(type) || [];
      listeners.delete(type);
      fns.forEach((fn) => fn());
    },
  };
  if (withPrint) win.print = () => win.printed++;
  return win;
}

const copies = (doc) => doc.body.children.filter((el) => el.id === PRINT_ROOT_ID).length;

test("impressão da frase - cópia entra no body só durante a impressão e sai no afterprint", () => {
  const doc = fakeDoc();
  const win = fakeWin();
  assert.equal(printPhraseCard({ doc, win }), true);
  assert.equal(win.printed, 1);
  assert.equal(copies(doc), 1);
  assert.equal(doc.body.classList.has("printing-phrase"), true);
  win.fire("afterprint");
  assert.equal(copies(doc), 0);
  assert.equal(doc.body.classList.has("printing-phrase"), false);
});

test("impressão da frase - sem afterprint, trocar de rota ou sair da página tira a cópia", () => {
  for (const type of ["hashchange", "pagehide"]) {
    const doc = fakeDoc();
    const win = fakeWin();
    printPhraseCard({ doc, win });
    win.fire(type);
    assert.equal(copies(doc), 0, type);
    assert.equal(doc.body.classList.has("printing-phrase"), false, type);
  }
});

test("impressão da frase - imprimir de novo não empilha cópias; descartar à mão limpa", () => {
  const doc = fakeDoc();
  const win = fakeWin();
  printPhraseCard({ doc, win });
  printPhraseCard({ doc, win });
  assert.equal(copies(doc), 1);
  discardPhrasePrintCopy(doc);
  assert.equal(copies(doc), 0);
  discardPhrasePrintCopy(doc);
  assert.equal(copies(doc), 0);
});

test("impressão da frase - navegador sem print() não deixa cópia no body", () => {
  const doc = fakeDoc();
  assert.equal(printPhraseCard({ doc, win: fakeWin({ withPrint: false }) }), false);
  assert.equal(copies(doc), 0);
  assert.equal(doc.body.classList.has("printing-phrase"), false);
});

test("impressão da frase - printCard em screens-phrase limpa cópia e classe no hashchange", async () => {
  const doc = fakeDoc();
  const win = fakeWin();
  const { printCard } = await import("../client/js/app/screens-phrase.js");
  assert.equal(printCard({ doc, win }), true);
  assert.equal(copies(doc), 1);
  assert.equal(doc.body.classList.has("printing-phrase"), true);
  win.fire("hashchange");
  assert.equal(copies(doc), 0);
  assert.equal(doc.body.classList.has("printing-phrase"), false);
});
