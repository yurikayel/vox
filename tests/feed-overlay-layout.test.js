import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client");
const render = await import("../client/js/render.js");
const bskyFeed = await import("../client/js/bsky-feed.js");

test("feed layout - full display name and handle without truncation", () => {
  const bskyPost = bskyFeed.normalizeBskyPost({
    post: {
      uri: "at://did:plc:theintercept/app.bsky.feed.post/3k999",
      cid: "bafyintercept",
      author: {
        handle: "theintercept.com",
        displayName: "The Intercept",
        avatar: "https://theintercept.com/avatar.jpg",
      },
      record: {
        text: "Investigative journalism on junk science across courts.",
        createdAt: "2026-10-28T18:00:00.000Z",
      },
      likeCount: 98,
      replyCount: 2,
    },
  });

  const html = render.renderPostItem(bskyPost);

  // Must contain full name and handle, never truncated to "The Inte" or "The"
  assert.ok(html.includes("The Intercept"), "Display name 'The Intercept' should be preserved in full");
  assert.ok(!html.includes("The Inte "), "Truncated 'The Inte ' should not appear");
  assert.ok(html.includes("@theintercept.com"), "Handle '@theintercept.com' should be displayed in full");

  // In external post, name row is on top, and handle is underneath in post-meta-sub
  const nameIdx = html.indexOf("The Intercept");
  const handleIdx = html.indexOf("@theintercept.com");
  assert.ok(nameIdx < handleIdx, "Display name must appear before handle");
  assert.ok(html.includes("post-meta-sub"), "Handle should reside in post-meta-sub line");
});

test("feed layout - photo post header at top overlay with @ underneath name and buttons at bottom overlay", () => {
  const photoPost = {
    id: "post_intercept_photo",
    author: "theintercept.com",
    authorDisplay: "The Intercept",
    authorHandle: "@theintercept.com",
    title: "Vozes da Investigação",
    body: "Reportagem fotográfica exclusiva.",
    image: "https://example.com/theintercept-hero.jpg",
    ts: Date.now(),
    likesCount: 98,
    repliesCount: 2,
  };

  const html = render.renderPostItem(photoPost);

  assert.ok(html.includes("post-media-hero"), "Must include post-media-hero container");
  assert.ok(html.includes("post-ig-header"), "Must include post-ig-header");
  assert.ok(html.includes("post-ig-toolbar"), "Must include post-ig-toolbar");

  // Verify header structure: name row on top, handle row underneath
  assert.ok(html.includes("post-media-header-name-row"));
  assert.ok(html.includes("post-media-header-handle-row"));

  const nameRowIdx = html.indexOf("post-media-header-name-row");
  const handleRowIdx = html.indexOf("post-media-header-handle-row");
  assert.ok(nameRowIdx < handleRowIdx, "Name row must precede handle row");
  assert.ok(html.includes("The Intercept"));
  assert.ok(html.includes("@theintercept.com"));

  // Verify hero structure: media container contains header first, then image, then toolbar
  const heroIdx = html.indexOf("post-media-hero");
  const headerIdx = html.indexOf("post-media-header");
  const toolbarIdx = html.indexOf("post-ig-toolbar");

  assert.ok(heroIdx < headerIdx, "Header overlay must be inside hero");
  assert.ok(headerIdx < toolbarIdx, "Header must come before footer toolbar inside hero");

  // Verify toolbar is inside hero before comments
  const commentsIdx = html.indexOf("post-comments");
  assert.ok(toolbarIdx < commentsIdx, "Toolbar overlay must be within media hero above comments");
});

test("feed layout - CSS rules enforce wider post width (640px) and top/bottom overlays", () => {
  const css = fs.readFileSync(path.join(root, "css/style.css"), "utf8");

  // 1. Post width standardized wider: 640px
  assert.ok(css.includes("--feed-max: 640px;"), "Feed max variable must be 640px");
  assert.ok(css.includes("var(--feed-max, 640px)"), "Fallback must use 640px");

  // 2. Header overlay at top of photo hero
  const igHead = css.match(/\.post-ig-header\.post-media-header\s*\{[^}]+\}/)?.[0] || "";
  assert.match(igHead, /top:\s*0/, "Header must be anchored at top: 0");
  assert.match(igHead, /bottom:\s*auto/, "Header must have bottom: auto");
  assert.match(igHead, /linear-gradient\(to bottom/, "Header must have top-down gradient backdrop");

  // 3. Actions overlay at bottom of photo hero
  const igTool = css.match(/\.post-layout-photo\s+\.post-media-hero\s+\.post-ig-toolbar\s*\{[^}]+\}/)?.[0] || "";
  assert.match(igTool, /bottom:\s*0/, "Toolbar must be anchored at bottom: 0");
  assert.match(igTool, /linear-gradient\(to top/, "Toolbar must have bottom-up gradient backdrop");
});
