/**
 * @file Layout da Mesa: fronteira desktop em 1024px, alvos de toque de 44px e redução de movimento.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync(new URL("../client/css/dungeon-layout.css", import.meta.url), "utf8");
const agora = readFileSync(new URL("../client/css/agora.css", import.meta.url), "utf8");

function block(css, header) {
  const start = css.indexOf(header);
  assert.ok(start >= 0, `bloco ausente: ${header}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    depth += css[i] === "{" ? 1 : css[i] === "}" ? -1 : 0;
    if (depth === 0) return css.slice(open + 1, i);
  }
  return "";
}

test("breakpoint: desktop a partir de 1024px e mobile abaixo, sem restos de 820/960 na Mesa", () => {
  assert.match(block(layout, "@media (min-width: 1024px)"), /dungeon-z3-drawer/);
  assert.match(block(layout, "@media (max-width: 1023.98px)"), /dungeon-tactics-tools/);
  assert.doesNotMatch(layout, /min-width: 960px|max-width: 820px/);
  assert.match(block(agora, "@media (max-width: 1023.98px) {\n  .dungeon-hero-camp"), /dungeon-mobile-dock \{ display: flex/);
});

test("toque: 44x44 em pointer coarse e em telas estreitas para todos os controles da Mesa", () => {
  const touch = block(layout, "@media (pointer: coarse), (max-width: 1023.98px)");
  for (const cls of [".dungeon-chip-btn", ".dungeon-grid-cell", ".dungeon-action-remove", ".dungeon-file-trigger"]) {
    assert.ok(touch.includes(cls), `${cls} sem alvo de toque`);
  }
  assert.match(touch, /min-height: 44px/);
  assert.match(touch, /min-width: 44px/);
  assert.match(touch, /dungeon-field-mini \.dungeon-input \{\s*min-height: 44px/);
});

test("movimento: prefers-reduced-motion zera animação e transição na Mesa", () => {
  const reduced = block(layout, "@media (prefers-reduced-motion: reduce)");
  assert.match(reduced, /animation-duration: 0\.01ms !important/);
  assert.match(reduced, /transition-duration: 0\.01ms !important/);
  assert.match(reduced, /\.dungeon-sanctum/);
});
