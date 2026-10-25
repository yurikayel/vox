import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as demoSeed from "../client/js/demo-seed.js";
import * as cacheNode from "../client/js/cache-node.js";
import { MOCK_DEMO_UF_COUNT } from "../client/js/mock.js";

const SEED_KEY = "vox-demo-seeded-v8-uf27-media";

test("demo-seed - 27 topicos UF", async () => {
  localStorage.clear();
  await cacheNode.clearLocalPosts();
  await demoSeed.ensureDemoSeed();
  assert.equal(localStorage.getItem(SEED_KEY), "true");
  const topics = await cacheNode.getLocalPosts({ type: "topic", communityId: "demo-aprenda-vox" });
  assert.equal(topics.length, MOCK_DEMO_UF_COUNT);
});

test("demo-seed - idempotente", async () => {
  await demoSeed.ensureDemoSeed();
  const topics = await cacheNode.getLocalPosts({ type: "topic", communityId: "demo-aprenda-vox" });
  assert.equal(topics.length, MOCK_DEMO_UF_COUNT);
});
