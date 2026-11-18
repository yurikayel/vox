/**
 * Testes focados em render/feed, render/review-banner e render/channel-bar
 * (complementam PR #232, que cobre dm, proposal, tag-polis e diff/repost/nota).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";

import * as moderation from "../client/js/moderation.js";
const feed = await import("../client/js/render/feed.js");
const banner = await import("../client/js/render/review-banner.js");
const channelBar = await import("../client/js/render/channel-bar.js");

const XSS = '"><img onerror=1>';

test("feed - commentsPanelId higieniza id e renderPostComments não quebra atributos", () => {
  const hostile = `evil${XSS}`;
  const panelId = feed.commentsPanelId(hostile);
  assert.match(panelId, /^post-comments-[a-zA-Z0-9_-]+$/);
  assert.ok(!panelId.includes('"') && !panelId.includes("<"), "id DOM sem aspas nem tags");
  const html = feed.renderPostComments(hostile, `comm${XSS}`, { replies: [], expanded: true });
  assert.ok(!html.includes("<img onerror"), "id do painel não injeta tag");
  assert.match(html, new RegExp(`id="${panelId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.ok(html.includes("&quot;&gt;&lt;img onerror=1&gt;"), "data-comm escapado");
});

test("feed - composer aninhado escapa parent, tópico, comunidade e menção", () => {
  const html = feed.renderCommentNestedReplyComposer(XSS, XSS, XSS, XSS);
  assert.ok(!html.includes('data-parent=""><img'));
  assert.match(html, /data-parent="&quot;&gt;&lt;img onerror=1&gt;"/);
  assert.ok(!html.includes("<img onerror"));
  assert.match(html, />@&quot;&gt;&lt;img onerror=1&gt; /);
});

test("feed - quarentena local: data-id escapa id hostil e compartilhar fica disabled", () => {
  const bait = `post-${XSS}`;
  assert.equal(moderation.isPostQuarantined(bait), false);
  moderation.quarantinePost(bait);
  const action = feed.renderQuarantineAction(bait);
  assert.ok(!action.includes('data-id="post-"><img'));
  assert.match(action, /data-id="post-&quot;&gt;&lt;img onerror=1&gt;"/);
  assert.match(action, /aria-pressed="true"/);
  assert.match(feed.quarantineShareAttrs(bait), /disabled aria-disabled="true"/);
  moderation.unquarantinePost(bait);
});

test("review-banner e channel-bar - pílula, faixa vazia e shells acessíveis", () => {
  assert.match(banner.renderInReviewPillHtml(), /community-review-pill/);
  assert.equal(banner.renderReviewBannerHtml({ inReview: false }), "");
  assert.match(channelBar.renderChannelHeldPillHtml(), /Fora do canal/);
  const hidden = channelBar.renderChannelHiddenTopicShellHtml();
  assert.match(hidden, /role="status"/);
  assert.match(hidden, /Publicação fora do canal/);
});