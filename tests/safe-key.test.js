/** @file `isSafeKey`: chave de mapa que não toca no protótipo. */
import test from "node:test";
import assert from "node:assert/strict";
import { isSafeKey, withEntry } from "../client/js/shared/safe-key.js";

test("isSafeKey: recusa nomes de protótipo e o que não é string", () => {
  for (const k of ["__proto__", "constructor", "prototype", "", null, 1]) assert.equal(isSafeKey(k), false, String(k));
  assert.equal(isSafeKey("demo-feira-local"), true);
});

test("withEntry: grava `__proto__` como entrada própria e não altera o original", () => {
  const orig = { a: 1 };
  const out = withEntry(orig, "b", 2);
  assert.deepEqual(out, { a: 1, b: 2 });
  assert.deepEqual(orig, { a: 1 });
  const odd = withEntry(null, "__proto__", 5);
  assert.equal(Object.getPrototypeOf(odd), Object.prototype);
  assert.ok(Object.hasOwn(odd, "__proto__"));
});
