import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as cacheNode from "../client/js/cache-node.js";
import * as localAccount from "../client/js/local-account.js";
import * as peers from "../client/js/peers.js";
import * as postOwnership from "../client/js/post-ownership.js";

test("gossip-retract T1: UPDATE com editedAt maior substitui corpo", async () => {
  await cacheNode.clearLocalPosts();
  localStorage.clear();

  const original = await localAccount.signPayload({
    id: "p_retract_1",
    type: "topic",
    title: "Versão 1",
    body: "Corpo original",
    ts: 1000,
  });

  await cacheNode.saveLocalPost(original);
  assert.equal((await cacheNode.getLocalPost("p_retract_1"))?.title, "Versão 1");

  const update = await localAccount.signPayload({
    ...original,
    title: "Versão 2",
    body: "Corpo atualizado",
    editedAt: 2000,
  });

  await peers.handleVoxMessage({ type: "GOSSIP_UPDATE", item: update, fromPeer: "peer_remote" }, () => {}, "rtc");

  const post = await cacheNode.getLocalPost("p_retract_1");
  assert.ok(post);
  assert.equal(post.title, "Versão 2");
  assert.equal(post.body, "Corpo atualizado");
  assert.equal(post.editedAt, 2000);
});

test("gossip-retract T2: UPDATE com editedAt menor ou igual é no-op", async () => {
  await cacheNode.clearLocalPosts();
  localStorage.clear();

  const current = await localAccount.signPayload({
    id: "p_retract_2",
    type: "topic",
    title: "Versão Atual",
    body: "Corpo novo",
    ts: 1000,
    editedAt: 3000,
  });
  await cacheNode.saveLocalPost(current);

  const olderUpdate = await localAccount.signPayload({
    ...current,
    title: "Versão Antiga Descartada",
    body: "Não deve aplicar",
    editedAt: 2000,
  });

  await peers.handleVoxMessage({ type: "GOSSIP_UPDATE", item: olderUpdate, fromPeer: "peer_remote" }, () => {}, "rtc");

  const post = await cacheNode.getLocalPost("p_retract_2");
  assert.equal(post?.title, "Versão Atual");
  assert.equal(post?.editedAt, 3000);
});

test("gossip-retract T3: UPDATE de autor diferente é rejeitado", async () => {
  await cacheNode.clearLocalPosts();
  localStorage.clear();

  const original = await localAccount.signPayload({
    id: "p_retract_3",
    type: "topic",
    title: "Post de Alice",
    body: "Conteúdo Alice",
    ts: 1000,
  });
  await cacheNode.saveLocalPost(original);

  const forgedUpdate = {
    ...original,
    title: "Invasão de Bob",
    author: "vx_outro_autor_999",
    editedAt: 5000,
  };

  await peers.handleVoxMessage({ type: "GOSSIP_UPDATE", item: forgedUpdate, fromPeer: "peer_remote" }, () => {}, "rtc");

  const post = await cacheNode.getLocalPost("p_retract_3");
  assert.equal(post?.title, "Post de Alice");
});

test("gossip-retract T4: UPDATE com assinatura inválida é rejeitado", async () => {
  await cacheNode.clearLocalPosts();
  localStorage.clear();

  const original = await localAccount.signPayload({
    id: "p_retract_4",
    type: "topic",
    title: "Post Intacto",
    body: "Texto",
    ts: 1000,
  });
  await cacheNode.saveLocalPost(original);

  const badSigUpdate = await localAccount.signPayload({
    ...original,
    title: "Adulterado",
    editedAt: 6000,
  });
  badSigUpdate.sig = "sig_totalmente_falsa_e_invalida";

  await peers.handleVoxMessage({ type: "GOSSIP_UPDATE", item: badSigUpdate, fromPeer: "peer_remote" }, () => {}, "rtc");

  const post = await cacheNode.getLocalPost("p_retract_4");
  assert.equal(post?.title, "Post Intacto");
});

test("gossip-retract T5: DELETE tombstone válido remove e oculta post de queries", async () => {
  await cacheNode.clearLocalPosts();
  localStorage.clear();

  const post = await localAccount.signPayload({
    id: "p_retract_5",
    type: "topic",
    title: "Post a ser apagado",
    body: "Tchau post",
    ts: 1000,
  });
  await cacheNode.saveLocalPost(post);

  let listBefore = await cacheNode.getLocalPosts();
  assert.equal(listBefore.length, 1);

  const tombstone = await postOwnership.createPostTombstone(post);

  let tombstoneNotified = false;
  const unsubscribe = peers.onGossipTombstone((t) => {
    if (t?.id === "p_retract_5") tombstoneNotified = true;
  });

  await peers.handleVoxMessage({ type: "GOSSIP_DELETE", item: tombstone, fromPeer: "peer_remote" }, () => {}, "rtc");
  unsubscribe();

  assert.equal(tombstoneNotified, true);
  const fetched = await cacheNode.getLocalPost("p_retract_5");
  assert.equal(fetched, null);

  const listAfter = await cacheNode.getLocalPosts();
  assert.equal(listAfter.length, 0);

  const storedTombstone = await cacheNode.getTombstone("p_retract_5");
  assert.ok(storedTombstone);
  assert.equal(storedTombstone.id, "p_retract_5");
  assert.equal(storedTombstone.type, "tombstone");
});

test("gossip-retract T6: DELETE com editedAt menor que update local é no-op", async () => {
  await cacheNode.clearLocalPosts();
  localStorage.clear();

  const post = await localAccount.signPayload({
    id: "p_retract_6",
    type: "topic",
    title: "Post Recente",
    body: "Atualizado recentemente",
    ts: 1000,
    editedAt: 5000,
  });
  await cacheNode.saveLocalPost(post);

  const staleTombstone = await localAccount.signPayload({
    kind: "post-tombstone",
    type: "tombstone",
    id: post.id,
    author: post.author,
    ts: 1000,
    editedAt: 4000, // Menor que o post local
  });

  await peers.handleVoxMessage({ type: "GOSSIP_DELETE", item: staleTombstone, fromPeer: "peer_remote" }, () => {}, "rtc");

  const stillThere = await cacheNode.getLocalPost("p_retract_6");
  assert.ok(stillThere);
  assert.equal(stillThere.title, "Post Recente");
});

test("gossip-retract T7: GOSSIP create atrasado após tombstone é ignorado", async () => {
  await cacheNode.clearLocalPosts();
  localStorage.clear();

  const originalPost = await localAccount.signPayload({
    id: "p_retract_7",
    type: "topic",
    title: "Post Criado no Passado",
    body: "Fantasma",
    ts: 1000,
  });

  const tombstone = await localAccount.signPayload({
    kind: "post-tombstone",
    type: "tombstone",
    id: "p_retract_7",
    author: originalPost.author,
    ts: 1000,
    editedAt: 3000,
  });

  await cacheNode.saveTombstone(tombstone);

  await peers.handleVoxMessage({ type: "GOSSIP", item: originalPost, fromPeer: "peer_late" }, () => {}, "rtc");

  const post = await cacheNode.getLocalPost("p_retract_7");
  assert.equal(post, null, "Post não deve ressuscitar sobre tombstone");
});

test("gossip-retract T8: handleVoxMessage roteia GOSSIP_UPDATE e GOSSIP_DELETE", async () => {
  await cacheNode.clearLocalPosts();
  localStorage.clear();

  const post = await localAccount.signPayload({
    id: "p_retract_8",
    type: "topic",
    title: "Roteamento Inicial",
    body: "Corpo",
    ts: 1000,
  });
  await cacheNode.saveLocalPost(post);

  const update = await localAccount.signPayload({
    ...post,
    title: "Roteamento Atualizado",
    editedAt: 2000,
  });
  await peers.handleVoxMessage({ type: "GOSSIP_UPDATE", item: update }, () => {}, "broadcast");
  assert.equal((await cacheNode.getLocalPost("p_retract_8"))?.title, "Roteamento Atualizado");

  const tombstone = await postOwnership.createPostTombstone(update);
  await peers.handleVoxMessage({ type: "GOSSIP_DELETE", tombstone }, () => {}, "broadcast");
  assert.equal(await cacheNode.getLocalPost("p_retract_8"), null);
});

test("gossip-retract T9: dedupe de update repetido não causa churn", async () => {
  await cacheNode.clearLocalPosts();
  localStorage.clear();

  const post = await localAccount.signPayload({
    id: "p_retract_9",
    type: "topic",
    title: "Unico",
    body: "Corpo",
    ts: 1000,
    editedAt: 2000,
  });
  await cacheNode.saveLocalPost(post);

  let notifiedCount = 0;
  const unsubscribe = peers.onGossipPost((item) => {
    if (item?.id === "p_retract_9") notifiedCount++;
  });

  await peers.handleVoxMessage({ type: "GOSSIP_UPDATE", item: post }, () => {}, "rtc");
  await peers.handleVoxMessage({ type: "GOSSIP_UPDATE", item: post }, () => {}, "rtc");
  unsubscribe();

  assert.equal(notifiedCount, 0, "Update com mesmo editedAt não deve notificar nem reprocessar");
});

test("gossip-retract T10: broadcastGossipUpdate e broadcastGossipDelete não quebram", async () => {
  localStorage.clear();

  const dummy = { id: "p_dummy", title: "Dummy", sig: "sig", author: "vx_test" };
  peers.broadcastGossipUpdate(dummy);
  peers.broadcastGossipDelete(dummy);
  assert.ok(true);
});
