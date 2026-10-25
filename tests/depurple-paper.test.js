import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client");
const css = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");

test("depurple paper — service worker cache id", () => {
  assert.match(sw, /vox-pwa-v6\.42-no-topbar/);
});

test("depurple paper — sidebar nav active not accent-soft fill", () => {
  const tabActive = css.match(/\.tab-item\.active\s*\{[^}]+\}/s)?.[0] ?? "";
  const feedTabActive = css.match(/\.sidebar-feed-tab\.active\s*\{[^}]+\}/s)?.[0] ?? "";
  assert.ok(!tabActive.includes("accent-soft"), "tab-item.active");
  assert.ok(!feedTabActive.includes("accent-soft"), "sidebar-feed-tab.active");
  assert.ok(tabActive.includes("nav-active-bg"));
});

test("depurple paper — dark surfaces neutral not lavender stack", () => {
  assert.ok(css.includes("--surface-1: #12101f"));
  assert.ok(!css.includes("#c8c0f0"));
});

test("depurple paper — compose tab solid brand not gradient block", () => {
  const compose = css.match(/\.tab-item\.compose-tab\s*\{[^}]+\}/s)?.[0] ?? "";
  assert.ok(compose.includes("brand-navy"));
  assert.ok(!compose.includes("accent-gradient"));
});
