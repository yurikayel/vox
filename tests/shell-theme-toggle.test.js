import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readShellRenderSource } from "./helpers/shell-render-source.mjs";

const shellSrc = readShellRenderSource(path.join(path.dirname(fileURLToPath(import.meta.url)), "../client"));

test("shell - sidebar footer exposes theme mode toggle", () => {
  assert.ok(shellSrc.includes('id="theme-mode-toggle"'));
  assert.ok(shellSrc.includes("theme-mode-toggle"));
  assert.ok(shellSrc.includes("sidebar-theme-slot"));
  assert.ok(shellSrc.includes("cycleColorMode"));
});
