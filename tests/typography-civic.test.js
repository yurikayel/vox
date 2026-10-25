import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../client");
const css = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("typography civic — CSS tokens and display pairing", () => {
  assert.match(css, /--font-sans:\s*"Source Sans 3"/);
  assert.match(css, /--font-display:\s*"Outfit"/);
  assert.match(css, /--font-weight-nav:\s*600/);
  assert.ok(css.includes("font-family: var(--font-sans)"));
  assert.ok(css.includes(".brand-word") && css.includes("var(--font-display)"));
  assert.ok(css.includes(".brand-letter-v") && css.includes("var(--brand-green)"));
  assert.ok(css.includes(".brand-letter-o") && css.includes("var(--brand-yellow)"));
  assert.ok(css.includes(".brand-letter-x") && css.includes("var(--brand-blue)"));
});

test("typography civic — Google Fonts loaded in shell", () => {
  assert.ok(indexHtml.includes("fonts.googleapis.com"));
  assert.ok(indexHtml.includes("Source+Sans+3"));
  assert.ok(indexHtml.includes("Outfit"));
});
