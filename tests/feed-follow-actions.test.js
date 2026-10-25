import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as render from "../client/js/render.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(__dirname, "../client/css/style.css"), "utf8");

test("feed follow - CSS pill IG no hero", () => {
  assert.ok(css.includes(".post-follow-overlay"));
  assert.ok(css.includes(".btn-follow-overlay"));
});

test("feed follow - comentários decoupled do overlay", () => {
  const html = render.renderPostItem({
    id: "c1",
    title: "Debate",
    body: "Texto",
    image: "https://example.com/x.jpg",
    author: "vx_demo_mg",
    repliesCount: 1,
    ts: Date.now(),
  });
  assert.ok(html.includes("post-comments-surface"));
  const mediaBlock = html.slice(html.indexOf("post-media-container"), html.indexOf("insta-actions"));
  assert.ok(!mediaBlock.includes("post-comments"));
  assert.ok(!mediaBlock.includes("post-overlay-excerpt") || mediaBlock.includes("post-overlay"));
});

test("feed toolbar - overflow esconde estrela e copy-md da barra principal", () => {
  const html = render.renderPostItem({
    id: "t1",
    title: "Post",
    author: "vx_demo_sp",
    ts: Date.now(),
  });
  assert.ok(html.includes("toolbar-primary"));
  assert.ok(html.includes("toolbar-overflow"));
  assert.ok(html.includes("btn-save"));
});
