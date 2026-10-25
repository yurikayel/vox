import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const shellSrc = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../client/js/render/shell.js"),
  "utf8"
);

test("shell - sidebar footer exposes theme mode toggle", () => {
  assert.ok(shellSrc.includes('id="theme-mode-toggle"'));
  assert.ok(shellSrc.includes("theme-mode-toggle"));
  assert.ok(shellSrc.includes("sidebar-theme-slot"));
  assert.ok(shellSrc.includes("cycleColorMode"));
});
