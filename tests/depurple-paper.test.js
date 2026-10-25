import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client");
const css = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");

test("depurple paper - service worker cache id", () => {
  assert.match(sw, /vox-pwa-v6\.49-celeste-sky-theme/);
});

test("onboarding paper - modal sheet/card in CSS, neutral scrim", () => {
  assert.ok(css.includes(".modal-sheet"));
  assert.ok(css.includes(".modal-card"));
  assert.ok(css.includes("rgba(0, 0, 0, 0.5)"));
  const overlay = css.match(/\.modal-overlay\s*\{[^}]+\}/s)?.[0] ?? "";
  assert.ok(!overlay.includes("backdrop-filter: blur"), "modal overlay must not blur");
});

test("onboarding paper - oauth modals use semantic classes not glass card", () => {
  const modals = fs.readFileSync(path.join(root, "js/render/oauth-modals.js"), "utf8");
  assert.ok(modals.includes("modal-sheet"));
  assert.ok(modals.includes("modal-card"));
  assert.ok(modals.includes("modal-feature"));
  assert.ok(!modals.includes('class="modal-dialog card"'));
  assert.ok(!modals.includes("pact-feature"));
  assert.ok(!/style="[^"]*(?:gradient|#312183|rgba\(49)/i.test(modals));
});

test("depurple paper - sidebar nav active not accent-soft fill", () => {
  const tabActive = css.match(/\.tab-item\.active\s*\{[^}]+\}/s)?.[0] ?? "";
  const feedTabActive = css.match(/\.sidebar-feed-tab\.active\s*\{[^}]+\}/s)?.[0] ?? "";
  assert.ok(!tabActive.includes("accent-soft"), "tab-item.active");
  assert.ok(!feedTabActive.includes("accent-soft"), "sidebar-feed-tab.active");
  assert.ok(tabActive.includes("nav-active-bg"));
});

test("depurple paper - dark surfaces neutral not lavender stack", () => {
  assert.ok(css.includes("--surface-1: #0f1d2e"));
  assert.ok(!css.includes("#312183"), "purple brand chrome removed");
  assert.ok(!css.includes("#c8c0f0"));
});

test("depurple paper - compose tab solid brand not gradient block", () => {
  const compose = css.match(/\.tab-item\.compose-tab\s*\{[^}]+\}/s)?.[0] ?? "";
  assert.ok(compose.includes("brand-navy"));
  assert.ok(!compose.includes("accent-gradient"));
});
