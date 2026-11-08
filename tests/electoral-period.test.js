import { test } from "node:test";
import assert from "node:assert/strict";
import { isInElectoralWindow, isElectoralModeActive } from "../client/js/electoral-period.js";

test("modo eleitoral: janela 16/08–31/10 só em ano par", () => {
  assert.equal(isInElectoralWindow(new Date(2028, 7, 15)), false);
  assert.equal(isInElectoralWindow(new Date(2028, 7, 16)), true);
  assert.equal(isInElectoralWindow(new Date(2028, 9, 31, 12)), true);
  assert.equal(isInElectoralWindow(new Date(2028, 10, 1)), false);
  assert.equal(isInElectoralWindow(new Date(2027, 8, 10)), false);
});

test("modo eleitoral: flag força fora da janela", () => {
  assert.equal(isElectoralModeActive(new Date(2027, 0, 1), { forced: false }), false);
  assert.equal(isElectoralModeActive(new Date(2027, 0, 1), { forced: true }), true);
});
