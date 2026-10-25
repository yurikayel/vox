import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as render from "../client/js/render.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client");

test("post overlay - photo card has hero, overlay and lightbox trigger", () => {
  const html = render.renderPostItem({
    id: "overlay-1",
    title: "Mutirão na praça",
    body: "Plantamos mudas #verde #comunidade",
    image: "https://example.com/photo.jpg",
    author: "vx_demo_mg",
  });
  assert.ok(html.includes("post-media-hero"));
  assert.ok(html.includes("post-overlay"));
  assert.ok(html.includes("post-media-lightbox-trigger"));
  assert.ok(html.includes("post-overlay-title"));
  assert.ok(html.includes("#verde"));
  assert.ok(!html.includes("post-caption-block"));
  assert.ok(html.includes("post-media-scrim-top"));
  assert.ok(html.includes("post-media-scrim-bottom"));
  assert.ok(html.includes("post-media-header"));
  assert.ok(html.includes("btn-post-more-menu"));
  assert.ok(html.includes("post-actions-overlay"));
  assert.ok(html.includes("btn-zap-post overlay-action-btn"));
  assert.ok(html.includes('aria-label="Gostei'));
  assert.ok(!html.includes("overlay-action-label"));
  assert.ok(!html.includes(">Compartilhar<"));
  assert.ok(html.includes("post-overlay-actions-more"));
  assert.ok(!html.includes("post-toolbar"));
  assert.ok(!html.includes("post-overlay-author"));
  const scrimIdx = html.indexOf("post-media-scrim-top");
  const overlayIdx = html.indexOf('class="post-overlay"');
  assert.ok(scrimIdx !== -1 && overlayIdx !== -1 && scrimIdx < overlayIdx);
  const overlayOpen = html.indexOf('class="post-overlay"');
  const scrimInsideOverlay = html.slice(overlayOpen, overlayOpen + 120).includes("post-media-scrim");
  assert.ok(!scrimInsideOverlay, "scrim must be sibling of overlay, not inside it");
});

test("post overlay - title dedupe when title equals body", () => {
  const unique = "LinhaUnicaOverlayDedupe";
  const html = render.renderPostItem({
    id: "overlay-dup",
    title: unique,
    body: unique,
    image: "https://example.com/x.jpg",
    imageAlt: "foto demo",
    author: "vx_demo_sp",
  });
  assert.ok(html.includes("post-overlay-caption-only"));
  assert.ok(!html.includes("post-overlay-title"));
  const contentStart = html.indexOf('class="post-overlay-content"');
  const actionsStart = html.indexOf("post-actions-overlay");
  const overlayBlock = contentStart !== -1 && actionsStart !== -1 ? html.slice(contentStart, actionsStart) : "";
  assert.equal((overlayBlock.match(new RegExp(unique, "g")) || []).length, 1);
});

test("post overlay - index.html exposes lightbox shell", () => {
  const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.ok(indexHtml.includes('id="post-media-lightbox"'));
  assert.ok(indexHtml.includes("post-lightbox"));
});

test("post overlay - CSS classes present", () => {
  const css = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
  assert.ok(css.includes(".post-overlay"));
  assert.ok(css.includes(".post-lightbox"));
  assert.ok(css.includes(".post-media-hero"));
  assert.ok(css.includes(".post-media-header"));
  assert.ok(css.includes(".post-actions-overlay"));
  assert.ok(css.includes("#post-more-sheet") || css.includes(".post-more-sheet"));
});
