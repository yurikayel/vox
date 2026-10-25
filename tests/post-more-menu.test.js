import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as render from "../client/js/render.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client");

test("post more menu - hero exposes trigger with post id", () => {
  const html = render.renderPostItem({
    id: "pm-1",
    title: "Foto",
    image: "https://example.com/p.jpg",
    author: "vx_demo_ac",
    ts: Date.now(),
  });
  assert.ok(html.includes("btn-post-more-menu"));
  assert.ok(html.includes('data-post-id="pm-1"'));
  assert.ok(html.includes("Demo · AC"));
});

test("post more menu - module defines sheet id", () => {
  const src = fs.readFileSync(path.join(root, "js/render/post-more-menu.js"), "utf8");
  assert.ok(src.includes("post-more-sheet"));
  assert.ok(src.includes("Denunciar"));
  assert.ok(src.includes("Incorporar"));
});
