import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client");
const css = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
const feedJs = fs.readFileSync(path.join(root, "js/render/feed.js"), "utf8");

test("carbon parchment identity — photo posts bleed flush", () => {
  assert.ok(feedJs.includes("post-layout-photo post-photo-bleed"));
  assert.ok(css.includes(".post-layout-photo.post-photo-bleed"));
  assert.ok(css.includes("background: transparent"));
  assert.ok(!feedJs.includes("post-mural"));
});

test("carbon parchment identity — civic story ring not gradient", () => {
  const ring = css.match(/\.story-ring\s*\{[^}]+\}/s)?.[0] ?? "";
  assert.ok(!ring.includes("linear-gradient"), "no IG-style gradient ring");
  assert.ok(ring.includes("brand-green") || css.includes("story-ring--official"));
});

test("carbon parchment identity — profile grid gutters and radius", () => {
  const grid = css.match(/\.profile-grid\s*\{[^}]+\}/s)?.[0] ?? "";
  assert.ok(grid.includes("gap: 8px"));
  assert.ok(css.includes(".profile-grid-item") && css.includes("border-radius: 10px"));
});
