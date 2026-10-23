import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as demoSeed from "../client/js/demo-seed.js";
import * as cacheNode from "../client/js/cache-node.js";

test("demo-seed - ensureDemoSeed grava comunidade, 10 tópicos e resposta no IndexedDB", async () => {
  localStorage.clear();
  await cacheNode.clearLocalPosts();

  // Primeira execução: insere itens demo v3
  await demoSeed.ensureDemoSeed();
  assert.equal(localStorage.getItem("vox-demo-seeded-v3"), "true");

  // Verifica comunidade
  const comm = await cacheNode.getLocalPost("demo-aprenda-vox");
  assert.ok(comm, "Comunidade demo-aprenda-vox deve existir");
  assert.equal(comm.title, "Aprenda o Vox");
  assert.equal(comm.category, "Tour");
  assert.equal(comm.author, "vx_demo_helena");

  // Verifica tópicos (10 personas)
  const topics = await cacheNode.getLocalPosts({ type: "topic", communityId: "demo-aprenda-vox" });
  assert.equal(topics.length, 10);

  const postHelena = await cacheNode.getLocalPost("demo-post-helena");
  assert.ok(postHelena);
  assert.equal(postHelena.author, "vx_demo_helena");
  assert.equal(postHelena.title, "Comunidades livres em vez de reféns do algoritmo");
  assert.ok(postHelena.body.includes("Instagram"));
  assert.equal(postHelena.image, "images/posts/tour-helena.jpg");
  assert.ok(postHelena.likesCount > 0);
  assert.ok(postHelena.externalPain);
  assert.equal(postHelena.voxResolution, "now");

  const postRaj = await cacheNode.getLocalPost("demo-post-raj");
  assert.ok(postRaj);
  assert.equal(postRaj.author, "vx_demo_raj");

  // Verifica resposta
  const replies = await cacheNode.getLocalPosts({ type: "reply", replyTo: "demo-post-helena" });
  assert.equal(replies.length, 1);
  assert.equal(replies[0].id, "demo-reply-juliana-1");
  assert.equal(replies[0].author, "vx_demo_juliana");
});

test("demo-seed - ensureDemoSeed é idempotente e preserva integridade", async () => {
  // Segunda execução imediata
  await demoSeed.ensureDemoSeed();
  assert.equal(localStorage.getItem("vox-demo-seeded-v3"), "true");

  const topics = await cacheNode.getLocalPosts({ type: "topic", communityId: "demo-aprenda-vox" });
  assert.equal(topics.length, 10);
});

test("demo-seed - resetDemoSeed restaura conteúdo demo", async () => {
  await demoSeed.resetDemoSeed();
  assert.equal(localStorage.getItem("vox-demo-seeded-v3"), "true");

  const topics = await cacheNode.getLocalPosts({ type: "topic", communityId: "demo-aprenda-vox" });
  assert.equal(topics.length, 10);
});
