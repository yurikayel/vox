import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as demoSeed from "../client/js/demo-seed.js";
import * as cacheNode from "../client/js/cache-node.js";

test("demo-seed - ensureDemoSeed grava comunidade, 5 tópicos e resposta no IndexedDB", async () => {
  localStorage.clear();
  await cacheNode.clearLocalPosts();

  // Primeira execução: insere itens demo
  await demoSeed.ensureDemoSeed();
  assert.equal(localStorage.getItem("vox-demo-seeded-v2"), "true");

  // Verifica comunidade
  const comm = await cacheNode.getLocalPost("demo-aprenda-vox");
  assert.ok(comm, "Comunidade demo-aprenda-vox deve existir");
  assert.equal(comm.title, "Aprenda o Vox");
  assert.equal(comm.category, "Tour");
  assert.equal(comm.author, "vx_demo_lia");

  // Verifica tópicos
  const topics = await cacheNode.getLocalPosts({ type: "topic", communityId: "demo-aprenda-vox" });
  assert.equal(topics.length, 5);

  const postLia = await cacheNode.getLocalPost("demo-post-lia");
  assert.ok(postLia);
  assert.equal(postLia.author, "vx_demo_lia");
  assert.equal(postLia.title, "O Vox mora no seu celular");
  assert.ok(postLia.body.includes("Sua rede"));
  assert.equal(postLia.image, "images/posts/tour-celular.jpg");
  assert.ok(postLia.likesCount > 0);

  const postPri = await cacheNode.getLocalPost("demo-post-pri");
  assert.ok(postPri);
  assert.equal(postPri.author, "vx_demo_pri");

  // Verifica resposta
  const replies = await cacheNode.getLocalPosts({ type: "reply", replyTo: "demo-post-lia" });
  assert.equal(replies.length, 1);
  assert.equal(replies[0].id, "demo-reply-pri-1");
  assert.equal(replies[0].author, "vx_demo_pri");
});

test("demo-seed - ensureDemoSeed é idempotente e preserva integridade", async () => {
  // Segunda execução imediata
  await demoSeed.ensureDemoSeed();
  assert.equal(localStorage.getItem("vox-demo-seeded-v2"), "true");

  const topics = await cacheNode.getLocalPosts({ type: "topic", communityId: "demo-aprenda-vox" });
  assert.equal(topics.length, 5);
});

test("demo-seed - resetDemoSeed restaura conteúdo demo", async () => {
  await demoSeed.resetDemoSeed();
  assert.equal(localStorage.getItem("vox-demo-seeded-v2"), "true");

  const topics = await cacheNode.getLocalPosts({ type: "topic", communityId: "demo-aprenda-vox" });
  assert.equal(topics.length, 5);
});
