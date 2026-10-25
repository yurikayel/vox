import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const md = await import("../client/js/render/markdown-body.js");

test("markdown-body - splits fenced blocks", () => {
  const parts = md.splitMarkdownFences("hello\n```js\nconst x=1;\n```\nworld");
  assert.equal(parts.length, 3);
  assert.equal(parts[0].type, "text");
  assert.equal(parts[1].type, "code");
  assert.equal(parts[1].lang, "js");
  assert.match(parts[1].value, /const x=1/);
});

test("markdown-body - renders code without script injection", () => {
  const html = md.renderPostBodyMarkdown("```\n<script>alert(1)</script>\n```");
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("post-md-code-pre"));
});

test("markdown-body - linkifies hashtags outside fences", () => {
  const html = md.renderPostBodyMarkdown("Olá #verde");
  assert.ok(html.includes('href="#/tag/'));
  assert.ok(html.includes("verde"));
});

test("markdown-body - diff fence uses diff viewer", () => {
  const html = md.renderPostBodyMarkdown("```diff\n+ added\n- removed\n```");
  assert.ok(html.includes("post-md-code--diff"));
  assert.ok(html.includes("diff-line-add"));
  assert.ok(html.includes("diff-line-del"));
});
