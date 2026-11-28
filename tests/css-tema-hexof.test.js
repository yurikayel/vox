/**
 * @file Helper `hexOf` dos testes de contraste: lê a cor curta `#rgb` com o mesmo resultado da forma cheia `#rrggbb`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { contrast, hexOf } from "./helpers/css-tema.js";

test("hexOf: #abc e #aabbcc dão o mesmo resultado", () => {
  assert.equal(hexOf(new Map(), "#abc"), "#aabbcc");
  assert.equal(hexOf(new Map(), "#abc"), hexOf(new Map(), "#aabbcc"));
});

test("hexOf: forma curta em maiúsculas sai em minúsculas", () => {
  assert.equal(hexOf(new Map(), "#F0A"), "#ff00aa");
});

test("hexOf: token com cor curta e var() que aponta para ele resolvem", () => {
  const tokens = new Map([["--a", "#fff"], ["--b", "var(--a)"]]);
  assert.equal(hexOf(tokens, "--a"), "#ffffff");
  assert.equal(hexOf(tokens, "--b"), "#ffffff");
  assert.equal(hexOf(tokens, "var(--a)"), "#ffffff");
});

test("hexOf: a cor cheia segue igual e o que não é cor continua null", () => {
  assert.equal(hexOf(new Map(), "#AABBCC"), "#aabbcc");
  for (const ruim of ["#abcd", "#ab", "#ggg", "blue"]) assert.equal(hexOf(new Map(), ruim), null, ruim);
});

test("contrast: preto e branco em forma curta dão 21", () => {
  assert.equal(Math.round(contrast(hexOf(new Map(), "#fff"), hexOf(new Map(), "#000"))), 21);
});
