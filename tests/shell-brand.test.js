import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brandMarkSrcForColorScheme } from "../client/js/render/shell.js";

const shellSrc = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../client/js/render/shell.js"),
  "utf8"
);

test("shell brand — single squircle img in markup", () => {
  const block = shellSrc.match(/function renderBrandLink\(\)[\s\S]*?^}/m)?.[0] ?? "";
  assert.ok(block.includes('class="brand-logo brand-mark"'));
  assert.equal((block.match(/<img/g) || []).length, 1);
  assert.ok(!block.includes("brand-mark--light"));
  assert.ok(!block.includes("brand-mark--dark"));
});

test("shell brand — theme pairing for mark src", () => {
  assert.equal(brandMarkSrcForColorScheme(false), "icons/icon-512.png");
  assert.equal(brandMarkSrcForColorScheme(true), "icons/icon-white-512.png");
});
