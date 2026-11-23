/** @file `isSafeKey`: chave de mapa que não toca no protótipo. */
import test from "node:test";
import assert from "node:assert/strict";
import { isSafeKey } from "../client/js/shared/safe-key.js";

test("isSafeKey: recusa nomes de protótipo e o que não é string", () => {
  for (const k of ["__proto__", "constructor", "prototype", "", null, 1]) assert.equal(isSafeKey(k), false, String(k));
  assert.equal(isSafeKey("demo-feira-local"), true);
});
