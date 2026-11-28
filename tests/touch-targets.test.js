/**
 * S30-S12: alvos de toque ≥44px em compose e toolbar (PM-111).
 */
import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

test("style.css — bloco coarse com inline-composer-tool 44px (RED na base)", () => {
  const css = fs.readFileSync(new URL("../client/css/style.css", import.meta.url), "utf8");
  const marker = "@media (pointer: coarse), (width < 48em)";
  const start = css.indexOf(marker);
  assert.ok(start >= 0, "falta media query coarse/mobile para touch targets");
  const chunk = css.slice(start, start + 900);
  assert.match(chunk, /\.inline-composer-tool[\s\S]*min-height:\s*44px/);
  assert.match(chunk, /\.btn-inline-submit[\s\S]*min-height:\s*44px/);
});