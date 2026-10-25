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
  assert.ok(html.includes("post-media-scrim"));
  const scrimIdx = html.indexOf("post-media-scrim");
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
  const overlayBlock = html.match(/class="post-overlay-content"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/)?.[0] ?? "";
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
});
