import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as render from "../client/js/render.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client");

test("photo chrome - thin header, toolbar, title; body só nos comentários", () => {
  const html = render.renderPostItem({
    id: "overlay-1",
    title: "Mutirão na praça",
    body: "Mutirão na praça\nPlantamos mudas #verde #comunidade",
    image: "https://example.com/photo.jpg",
    author: "vx_demo_mg",
    ts: Date.now(),
  });
  assert.ok(html.includes("post-media-hero"));
  assert.ok(html.includes("post-media-lightbox-trigger"));
  assert.ok(html.includes("post-ig-header"));
  assert.ok(html.includes("btn-post-more-menu"));
  assert.ok(html.includes("post-ig-toolbar"));
  assert.ok(html.includes("btn-save"));
  assert.ok(html.includes("post-photo-title"));
  assert.ok(html.includes("Mutirão na praça"));
  assert.ok(!html.includes("post-caption-block"));
  assert.ok(!html.includes("post-media-scrim-top"));
  assert.ok(!html.includes("post-overlay-title"));
  assert.ok(!html.includes("post-overlay-caption-only"));
  assert.ok(!html.includes("post-toolbar"));
  assert.ok(!html.includes("Demo ·"));
  assert.ok(!html.includes("btn-zap-post overlay-action-btn"));
  assert.ok(html.includes("post-photo-message"));
  assert.ok(html.includes("#verde"));
  const msg = html.slice(html.indexOf("post-photo-message"));
  assert.ok(msg.includes("#verde"));
  assert.ok(html.includes("hidden"));
});

test("photo chrome - caption-only não duplica título no expander", () => {
  const unique = "LinhaUnicaOverlayDedupe";
  const html = render.renderPostItem({
    id: "overlay-dup",
    title: unique,
    body: unique,
    image: "https://example.com/x.jpg",
    imageAlt: "foto demo",
    author: "vx_demo_sp",
  });
  assert.ok(html.includes("post-photo-title"));
  assert.ok(!html.includes("post-photo-message"));
});

test("post overlay - index.html exposes lightbox shell", () => {
  const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.ok(indexHtml.includes('id="post-media-lightbox"'));
  assert.ok(indexHtml.includes("post-lightbox"));
});

test("photo chrome - CSS compacto", () => {
  const css = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
  assert.ok(css.includes(".post-ig-toolbar"));
  assert.ok(css.includes(".post-photo-title"));
  assert.ok(css.includes(".post-ig-header"));
  assert.ok(css.includes(".post-lightbox"));
  assert.ok(css.includes("#post-more-sheet") || css.includes(".post-more-sheet"));
});

test("photo chrome - header/media and title/body sit tight", () => {
  const css = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
  const igHead = css.match(/\.post-ig-header\.post-media-header\s*\{[^}]+\}/)?.[0] || "";
  const title = css.match(/\.post-photo-title\s*\{[^}]+\}/)?.[0] || "";
  const message = css.match(/\.post-photo-message\s*\{[^}]+\}/)?.[0] || "";
  const comments = css.match(
    /\.post-layout-photo\.post-photo-bleed \.post-comments,\s*\.post-layout-photo\.post-photo-bleed \.post-comments-surface\s*\{[^}]+\}/
  )?.[0] || "";
  const media = css.match(/\.post-layout-photo\.post-photo-bleed \.post-media-container\s*\{[^}]+\}/)?.[0] || "";
  assert.match(igHead, /padding:\s*4px 10px 2px/);
  assert.match(igHead, /min-height:\s*0/);
  assert.match(title, /padding:\s*2px 12px 0/);
  assert.match(message, /padding:\s*4px 12px 8px/);
  assert.match(comments, /padding:\s*0/);
  assert.match(comments, /margin:\s*0/);
  assert.ok(!comments.includes("padding: 10px 0 0"), "expander must not reserve overlay caption pad");
  assert.match(media, /align-items:\s*stretch/);
  assert.match(media, /justify-content:\s*flex-start/);
});
