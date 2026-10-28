import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as bskyFeed from "../client/js/bsky-feed.js";
import * as feed from "../client/js/render/feed.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client");

test("bsky - buildBskyAuthorFeedUrl encodes actor and strips leading @", () => {
  const url = bskyFeed.buildBskyAuthorFeedUrl("@lula.com.br", 20);
  assert.ok(url.includes("actor=lula.com.br"));
  assert.ok(url.includes("limit=20"));
  assert.ok(!url.includes("@lula"));
});

test("bsky - extractPostImage extracts thumbnails and fullsize images", () => {
  assert.equal(bskyFeed.extractPostImage(null), "");
  assert.equal(bskyFeed.extractPostImage({ images: [{ fullsize: "https://img.jpg" }] }), "https://img.jpg");
  assert.equal(bskyFeed.extractPostImage({ media: { images: [{ thumb: "https://thumb.jpg" }] } }), "https://thumb.jpg");
  assert.equal(bskyFeed.extractPostImage({ thumbnail: "https://card.jpg" }), "https://card.jpg");
});

test("bsky - normalizeBskyPost maps AT Protocol post to Vox post item", () => {
  const raw = {
    post: {
      uri: "at://did:plc:123/app.bsky.feed.post/3kabc123",
      cid: "bafyreitest",
      author: {
        handle: "janones.bsky.social",
        displayName: "André Janones",
        avatar: "https://avatar.jpg",
      },
      record: {
        text: "Comando da tropa: EXPLODE nas redes! #Democracia",
        createdAt: "2026-10-28T15:00:00.000Z",
      },
      likeCount: 42,
      replyCount: 15,
      repostCount: 88,
    },
  };

  const p = bskyFeed.normalizeBskyPost(raw);
  assert.equal(p.id, "bsky_bafyreitest");
  assert.equal(p.isExternal, true);
  assert.equal(p.externalSource, "bluesky");
  assert.equal(p.externalUrl, "https://bsky.app/profile/janones.bsky.social/post/3kabc123");
  assert.equal(p.author, "André Janones");
  assert.equal(p.authorHandle, "@janones.bsky.social");
  assert.equal(p.likesCount, 42);
  assert.equal(p.repostsCount, 88);
  assert.ok(p.body.includes("Comando da tropa"));
});

test("bsky - subscription management add and remove", () => {
  localStorage.clear();
  const init = bskyFeed.loadBskySubscriptions();
  assert.ok(Array.isArray(init));

  const afterAdd = bskyFeed.addBskySubscription("novo.perfil.social");
  assert.ok(afterAdd.includes("novo.perfil.social"));

  const afterRemove = bskyFeed.removeBskySubscription("novo.perfil.social");
  assert.ok(!afterRemove.includes("novo.perfil.social"));
});

test("feed - renderFeedTabsBar renders 4 tabs with active state", () => {
  const voxTabs = feed.renderFeedTabsBar("for-you");
  assert.ok(voxTabs.includes("feed-tabs-bar"));
  assert.ok(voxTabs.includes("🏛️ Vox"));
  assert.ok(voxTabs.includes("🌐 Redes (Bluesky)"));
  assert.ok(voxTabs.includes("🔀 Tudo"));
  assert.ok(voxTabs.includes("⭐ Seguindo"));

  const extTabs = feed.renderFeedTabsBar("external");
  assert.ok(extTabs.includes('href="#/?feed=external" class="feed-tab-chip active"'));
});

test("feed - renderExternalFeedManagerHtml renders input and subscription chips", () => {
  const html = feed.renderExternalFeedManagerHtml(["lula.com.br", "intercept.com"]);
  assert.ok(html.includes("bsky-feed-manager"));
  assert.ok(html.includes("INGESTÃO PREDATÓRIA"));
  assert.ok(html.includes("@lula.com.br"));
  assert.ok(html.includes("@intercept.com"));
  assert.ok(html.includes("btn-remove-bsky-sub"));
});

test("feed - renderPostItem renders external badge for bluesky posts", () => {
  const p = {
    id: "bsky_post_sample",
    type: "topic",
    isExternal: true,
    externalSource: "bluesky",
    externalUrl: "https://bsky.app/sample",
    author: "Perfil Externo",
    authorHandle: "@externo.bsky.social",
    title: "Notícia Importante",
    body: "Conteúdo do Bluesky consumido de forma limpa",
    ts: Date.now(),
  };

  const html = feed.renderPostItem(p);
  assert.ok(html.includes("badge-post-external bsky"));
  assert.ok(html.includes("Bluesky"));
  assert.ok(html.includes("https://bsky.app/sample"));
});

test("sw.js caches bsky-feed.js", () => {
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert.ok(sw.includes('"./js/bsky-feed.js"'));
});
