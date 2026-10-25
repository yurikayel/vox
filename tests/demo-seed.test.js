import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as demoSeed from "../client/js/demo-seed.js";
import * as cacheNode from "../client/js/cache-node.js";
import { MOCK_DEMO_TOPIC_COUNT } from "../client/js/mock.js";

const SEED_KEY = "vox-demo-seeded-v12-uf27-common-names";

test("demo-seed - 81 topicos UF (27×3)", async () => {
  localStorage.clear();
  await cacheNode.clearLocalPosts();
  await demoSeed.ensureDemoSeed();
  assert.equal(localStorage.getItem(SEED_KEY), "true");
  const topics = await cacheNode.getLocalPosts({ type: "topic", communityId: "demo-aprenda-vox" });
  assert.equal(topics.length, MOCK_DEMO_TOPIC_COUNT);
});

test("demo-seed - idempotente", async () => {
  await demoSeed.ensureDemoSeed();
  const topics = await cacheNode.getLocalPosts({ type: "topic", communityId: "demo-aprenda-vox" });
  assert.equal(topics.length, MOCK_DEMO_TOPIC_COUNT);
});

test("demo-seed - interacoes UF cruzadas (MA)", async () => {
  localStorage.clear();
  await cacheNode.clearLocalPosts();
  await demoSeed.ensureDemoSeed();
  const maReply = await cacheNode.getLocalPost("demo-reply-ce-ma-0");
  assert.ok(maReply);
  assert.equal(maReply.replyTo, "demo-post-ma");
  assert.equal(maReply.author, "vx_demo_ce");
  const replies = await cacheNode.getLocalPosts({ type: "reply", replyTo: "demo-post-ma" });
  assert.ok(replies.length >= 4);
  const maExtra = await cacheNode.getLocalPost("demo-post-ma-2");
  assert.ok(maExtra);
  const maExtraReplies = await cacheNode.getLocalPosts({ type: "reply", replyTo: "demo-post-ma-2" });
  assert.ok(maExtraReplies.length >= 2);
});
