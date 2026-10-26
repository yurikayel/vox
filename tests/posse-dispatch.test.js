import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const posse = await import("../client/js/posse-dispatch.js");

test("posse - canonical URL encodes id and community", () => {
  const url = posse.buildCanonicalTopicUrl("top_abc/xyz", {
    origin: "https://example.org",
    pathname: "/vox/",
    communityId: "geral",
  });
  assert.ok(url.includes("https://example.org/vox/#/t/"));
  assert.ok(url.includes(encodeURIComponent("top_abc/xyz")));
  assert.ok(url.includes("c=geral"));
});

test("posse - share text includes title and canonical link", () => {
  const text = posse.buildPosseShareText({
    title: "Mutirão",
    body: "Vamos plantar.",
    url: "https://x.test/#/t/1",
  });
  assert.match(text, /Mutirão/);
  assert.match(text, /Vamos plantar/);
  assert.match(text, /https:\/\/x\.test/);
});

test("posse - intent URLs encode safely", () => {
  const wa = posse.buildWhatsAppShareUrl("olá & #vox");
  assert.ok(wa.startsWith("https://wa.me/?text="));
  assert.ok(wa.includes(encodeURIComponent("olá & #vox")));
  const tw = posse.buildTwitterIntentUrl("tweet", "https://a.b/t");
  assert.ok(tw.includes("twitter.com/intent/tweet"));
  const bsky = posse.buildBlueskyIntentUrl("bsky post");
  assert.ok(bsky.includes("bsky.app/intent/compose"));
});

test("posse - export payload shape", () => {
  const payload = posse.buildPosseExportPayload({
    id: "top_1",
    communityId: "feira",
    title: "T",
    body: "B",
  });
  assert.equal(payload.v, 1);
  assert.equal(payload.topicId, "top_1");
  assert.equal(payload.communityId, "feira");
  assert.ok(payload.canonicalUrl.includes("top_1"));
});

test("posse - webhook lines parser", () => {
  const urls = posse.parseWebhookLines(" https://a.com \n\nhttps://b.com/x ");
  assert.deepEqual(urls, ["https://a.com", "https://b.com/x"]);
});

test("posse - re-exports honest limits microcopy for sheet UI", () => {
  assert.match(posse.SHARE_HONEST_LIMITS_SHORT, /Sem post automático/i);
  assert.match(posse.POSSE_SHEET_LEAD, /manualmente/i);
});
