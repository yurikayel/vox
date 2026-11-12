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

test("demo-seed - purgeMockDemoSeed purga dados pre-genese e cards de teste", async () => {
  await cacheNode.saveLocalPost({ id: "pre-genesis-post", type: "topic", title: "Velho", ts: 1000 });
  await cacheNode.saveLocalPost({ id: "post-rede-viva", type: "topic", title: "Novo", ts: Date.now() + 10000 });

  const cards = {
    vx_WAqxgW: { routeId: "vx_WAqxgW", name: "Ana Lúcia", updatedAt: Date.now() + 10000 },
    vx_antigo: { routeId: "vx_antigo", name: "Teste Antigo", updatedAt: 1000 },
    vx_novo: { routeId: "vx_novo", name: "Cidadão Novo", updatedAt: Date.now() + 10000 },
  };
  localStorage.setItem("vox-profile-cards-v1", JSON.stringify(cards));
  localStorage.setItem("vox-contacts-v1", JSON.stringify([{ routeId: "vx_WAqxgW" }, { routeId: "vx_ok" }]));

  await demoSeed.purgeMockDemoSeed();

  assert.equal(await cacheNode.getLocalPost("pre-genesis-post"), null, "post anterior ao corte deve ser removido");
  assert.ok(await cacheNode.getLocalPost("post-rede-viva"), "post da rede viva deve ser preservado");

  const cardsAfter = JSON.parse(localStorage.getItem("vox-profile-cards-v1") || "{}");
  assert.equal(cardsAfter.vx_WAqxgW, undefined);
  assert.equal(cardsAfter.vx_antigo, undefined);
  assert.ok(cardsAfter.vx_novo);

  const contactsAfter = JSON.parse(localStorage.getItem("vox-contacts-v1") || "[]");
  assert.equal(contactsAfter.find((c) => c.routeId === "vx_WAqxgW"), undefined);
  assert.equal(contactsAfter.find((c) => c.routeId === "vx_ok")?.routeId, "vx_ok");
});
