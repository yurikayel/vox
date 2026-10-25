import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brandMarkSrcForColorScheme } from "../client/js/render/shell.js";

const styleCss = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../client/css/style.css"),
  "utf8"
);

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

test("shell brand — same squircle mark in light and dark", () => {
  assert.equal(brandMarkSrcForColorScheme(false), "icons/icon-white-512.png");
  assert.equal(brandMarkSrcForColorScheme(true), "icons/icon-white-512.png");
  assert.ok(shellSrc.includes("export const BRAND_MARK_SRC"));
  assert.ok(shellSrc.includes("icons/icon-white-512.png"));
  assert.ok(!shellSrc.includes("attachBrandMarkTheme"));
  assert.ok(!shellSrc.includes("icons/icon-512.png"));
});

test("shell brand — lowercase vox wordmark matches icon colors", () => {
  const wordBlock = shellSrc.match(/function renderBrandWordmark\(\)[\s\S]*?^}/m)?.[0] ?? "";
  assert.ok(wordBlock.includes("brand-letter-v") && wordBlock.includes(">v</span>"));
  assert.ok(wordBlock.includes("brand-letter-o") && wordBlock.includes(">o</span>"));
  assert.ok(wordBlock.includes("brand-letter-x") && wordBlock.includes(">x</span>"));
  assert.ok(!shellSrc.includes(">Vox</span>"));
});

test("shell sidebar — IA estável (nav, postar, feed slot, footer)", () => {
  assert.ok(shellSrc.includes("sidebar-compose-slot"));
  assert.ok(shellSrc.includes("sidebar-feed-slot"));
  assert.ok(shellSrc.includes("sidebar-sync-slot"));
  assert.ok(shellSrc.includes("sidebar-network-slot"));
  assert.ok(shellSrc.includes("sidebar-account-slot"));
  assert.ok(shellSrc.includes("ICONS.people"));
  assert.ok(shellSrc.includes("ICONS.feedForYou"));
  assert.ok(shellSrc.includes("ICONS.following"));
  const sidebarBlock = shellSrc.match(/function renderSidebar\([\s\S]*?^}/m)?.[0] ?? "";
  const brandIdx = sidebarBlock.indexOf("sidebar-brand");
  const navIdx = sidebarBlock.indexOf('aria-label="Seções"');
  const composeIdx = sidebarBlock.indexOf("sidebar-compose-slot");
  const feedIdx = sidebarBlock.indexOf("${feedSlot}");
  const footerIdx = sidebarBlock.indexOf("renderSidebarFooter");
  assert.ok(brandIdx >= 0 && brandIdx < navIdx && navIdx < composeIdx && composeIdx < feedIdx && feedIdx < footerIdx);
  assert.ok(!sidebarBlock.includes("${feedNav}"));
  assert.ok(shellSrc.includes("classList.add(\"is-active\")"));
});

test("shell layout — no page top bar strip", () => {
  assert.ok(!shellSrc.includes("top-bar"));
  assert.ok(!shellSrc.includes("<header class=\"top-bar\""));
  assert.ok(!shellSrc.includes("topBarHtml"));
  assert.ok(!styleCss.includes(".top-bar"));
  assert.ok(shellSrc.includes("<main id=\"app-main\"></main>"));
});
