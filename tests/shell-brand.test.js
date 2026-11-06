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
  const block = shellSrc.match(/function renderHomeIcon\(\)[\s\S]*?^}/m)?.[0] ?? "";
  assert.ok(block.includes('class="brand-logo brand-mark tab-brand-mark"'));
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

test("shell brand — ADR-016: wordmark VOX epigráfico no topo do menu e na topbar móvel", () => {
  assert.ok(shellSrc.includes("renderHomeIcon()"));
  assert.ok(shellSrc.includes("function renderAgoraWordmark()"));
  assert.ok(shellSrc.includes('class="agora-wordmark-text">VOX</span>'));
  assert.ok(!/class="sidebar-brand/.test(shellSrc), "usa agora-sidebar-brand, não o legado sidebar-brand");
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
  const navIdx = sidebarBlock.indexOf('aria-label="Seções"');
  const composeIdx = sidebarBlock.indexOf("sidebar-compose-slot");
  const feedIdx = sidebarBlock.indexOf("${feedSlot}");
  const footerIdx = sidebarBlock.indexOf("renderSidebarFooter");
  assert.ok(navIdx >= 0 && navIdx < composeIdx && composeIdx < feedIdx && feedIdx < footerIdx);
  assert.ok(!sidebarBlock.includes("${feedNav}"));
  assert.ok(shellSrc.includes("classList.add(\"is-active\")"));
});

test("shell layout — ADR-016: topbar Stitch com busca, Votar agora e chip de identidade", () => {
  assert.ok(shellSrc.includes('<header class="agora-topbar"'));
  assert.ok(shellSrc.includes('id="agora-search-form"'));
  assert.ok(shellSrc.includes('href="#/vote" class="agora-btn agora-btn--ghost agora-topbar-vote"'));
  assert.ok(shellSrc.includes('id="agora-identity-toggle"'));
  assert.ok(shellSrc.includes('id="agora-identity-drawer"'));
  assert.ok(!styleCss.includes(".top-bar"), "o legado .top-bar continua fora do style.css");
  assert.ok(shellSrc.includes("<main id=\"app-main\"></main>"));
});
