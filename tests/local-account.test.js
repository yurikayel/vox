import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as localAccount from "../client/js/local-account.js";
import * as cacheNode from "../client/js/cache-node.js";

test("local-account - gera e persiste par ECDSA P-256 e routeId unico", async () => {
  localStorage.clear();
  const acc1 = await localAccount.ensureLocalAccount();
  assert.ok(acc1.routeId);
  assert.ok(acc1.routeId.startsWith("vx_"));
  assert.equal(acc1.publicJwk.kty, "EC");
  assert.equal(acc1.publicJwk.crv, "P-256");

  const routeId2 = await localAccount.getRouteId();
  assert.equal(routeId2, acc1.routeId);
  assert.equal(localAccount.getCachedRouteIdSync(), acc1.routeId);
});

test("local-account - gerencia display name localmente", async () => {
  localStorage.clear();
  assert.equal(localAccount.getDisplayName(), "");

  localAccount.setDisplayName("Maria da Silva");
  assert.equal(localAccount.getDisplayName(), "Maria da Silva");

  localAccount.setDisplayName("   ");
  assert.equal(localAccount.getDisplayName(), "");
});

test("local-account - assina e verifica payload canonicamente", async () => {
  localStorage.clear();
  await localAccount.ensureLocalAccount();

  const original = {
    type: "topic",
    communityId: "democracia",
    title: "Voz do Povo",
    body: "Post descentralizado sem intermediários",
  };

  const signed = await localAccount.signPayload(original);
  assert.ok(signed.id);
  assert.ok(signed.ts);
  assert.ok(signed.author);
  assert.ok(signed.pubKey);
  assert.ok(signed.sig);
  assert.equal(signed.title, "Voz do Povo");

  const isValid = await localAccount.verifyPayload(signed);
  assert.equal(isValid, true);

  // Adulteração de conteúdo deve invalidar a assinatura
  const tampered = { ...signed, title: "Título Adulterado" };
  const isTamperedValid = await localAccount.verifyPayload(tampered);
  assert.equal(isTamperedValid, false);

  // Payload sem assinatura deve falhar
  assert.equal(await localAccount.verifyPayload(original), false);
});

test("cache-node - armazena e consulta posts locais P2P (local-posts)", async () => {
  await cacheNode.clearLocalPosts();

  const post1 = {
    id: "p_1",
    type: "topic",
    communityId: "tecnologia",
    title: "WebRTC e Redes Mesh",
    ts: 1000,
  };
  const post2 = {
    id: "p_2",
    type: "reply",
    communityId: "tecnologia",
    replyTo: "p_1",
    body: "Excelente iniciativa",
    ts: 2000,
  };
  const comm1 = {
    id: "c_tecnologia",
    type: "community",
    communityId: "tecnologia",
    title: "Tecnologia",
    ts: 500,
  };

  await cacheNode.saveLocalPost(post1);
  await cacheNode.saveLocalPost(post2);
  await cacheNode.saveLocalPost(comm1);

  const fetched1 = await cacheNode.getLocalPost("p_1");
  assert.equal(fetched1?.title, "WebRTC e Redes Mesh");

  const topics = await cacheNode.getLocalPosts({ type: "topic", communityId: "tecnologia" });
  assert.equal(topics.length, 1);
  assert.equal(topics[0].id, "p_1");

  const replies = await cacheNode.getLocalPosts({ type: "reply", replyTo: "p_1" });
  assert.equal(replies.length, 1);
  assert.equal(replies[0].id, "p_2");

  const comms = await cacheNode.getLocalCommunities();
  assert.equal(comms.length, 1);
  assert.equal(comms[0].communityId, "tecnologia");
});
