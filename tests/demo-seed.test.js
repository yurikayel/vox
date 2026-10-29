import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as demoSeed from "../client/js/demo-seed.js";
import * as cacheNode from "../client/js/cache-node.js";

const SEED_KEY = "vox-demo-seeded-v12-uf27-common-names";

test("demo-seed - purgeMockDemoSeed remove dados legados mock do cache", async () => {
  localStorage.setItem(SEED_KEY, "true");
  // Simula presenca de posts mock legados
  await cacheNode.saveLocalPost({ id: "demo-post-1", type: "topic", communityId: "demo-aprenda-vox", title: "Mock", author: "vx_demo_sp" });
  await cacheNode.saveLocalPost({ id: "c_demo-aprenda-vox", type: "community", communityId: "demo-aprenda-vox", title: "Demo", author: "vx_demo_mg" });
  await cacheNode.saveLocalPost({ id: "real-post-1", type: "topic", communityId: "minha-comunidade", title: "Post Real", author: "vx_real_user" });

  const removed = await demoSeed.purgeMockDemoSeed();
  assert.ok(removed >= 2, "deve remover posts mock");
  assert.equal(localStorage.getItem(SEED_KEY), null, "chave de seed deve ser removida");
  assert.equal(localStorage.getItem("vox-mock-purged-v1"), "true");

  const mockTopic = await cacheNode.getLocalPost("demo-post-1");
  assert.equal(mockTopic, null, "post mock deve sumir");

  const realTopic = await cacheNode.getLocalPost("real-post-1");
  assert.ok(realTopic, "post real deve permanecer intocado");
});

test("demo-seed - ensureDemoSeed atua como purga idempotente", async () => {
  const removed = await demoSeed.ensureDemoSeed();
  assert.equal(typeof removed, "number");
  const posts = await cacheNode.getLocalPosts({ communityId: "demo-aprenda-vox" });
  assert.equal(posts.length, 0, "nenhum post mock deve ser inserido");
});
