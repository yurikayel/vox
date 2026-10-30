import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as peers from "../client/js/peers.js";
import * as cacheNode from "../client/js/cache-node.js";
import * as webrtcPeer from "../client/js/webrtc-peer.js";

test("hardening - handleVoxMessage descarta PROFILE_CARD_HELLO excessivo (> 64 KB)", async () => {
  localStorage.clear();
  peers.savePeerSettings({ enabled: true, dailyCapMb: 50, wifiOnly: false });

  const giantBio = "A".repeat(70000);
  const oversizedCard = {
    id: "pc_vx_alice_oversized",
    type: "profile-card",
    author: "vx_alice_oversized",
    pubKey: { kty: "EC", crv: "P-256", x: "x", y: "y" },
    sig: "sig_dummy",
    bio: giantBio,
  };

  let processed = false;
  await peers.handleVoxMessage(
    { type: "PROFILE_CARD_HELLO", card: oversizedCard },
    () => { processed = true; },
    "rtc"
  );

  assert.equal(processed, false);
});

test("hardening - handleVoxMessage ignora WANT com txId malformado", async () => {
  localStorage.clear();
  peers.savePeerSettings({ enabled: true, dailyCapMb: 50, wifiOnly: false });

  let sentPayload = null;
  // txId curto demais (< 3 chars) ou com caracteres inválidos
  await peers.handleVoxMessage(
    { type: "WANT", txId: "a", fromPeer: "peer_remoto" },
    (payload) => { sentPayload = payload; },
    "rtc"
  );
  assert.equal(sentPayload, null);

  await peers.handleVoxMessage(
    { type: "WANT", txId: "tx_invalid$#@!", fromPeer: "peer_remoto" },
    (payload) => { sentPayload = payload; },
    "rtc"
  );
  assert.equal(sentPayload, null);
});

test("hardening - getReplyCountsMap utiliza memoização e invalida em saveLocalPost", async () => {
  await cacheNode.clearLocalPosts();

  const countsEmpty = await cacheNode.getReplyCountsMap();
  assert.deepEqual(countsEmpty, {});

  await cacheNode.saveLocalPost({
    id: "rep_h1",
    type: "reply",
    replyTo: "topic_h100",
    author: "vx_autor1",
    body: "Primeira resposta",
    ts: 1000,
  });

  const counts1 = await cacheNode.getReplyCountsMap();
  assert.equal(counts1["topic_h100"], 1);

  await cacheNode.saveLocalPost({
    id: "rep_h2",
    type: "reply",
    replyTo: "topic_h100",
    author: "vx_autor2",
    body: "Segunda resposta",
    ts: 1010,
  });

  const counts2 = await cacheNode.getReplyCountsMap();
  assert.equal(counts2["topic_h100"], 2);

  await cacheNode.clearLocalPosts();
  const countsCleared = await cacheNode.getReplyCountsMap();
  assert.deepEqual(countsCleared, {});
});

test("hardening - closePeerConnection limpa sem exceções mesmo para peer inexistente", () => {
  assert.doesNotThrow(() => {
    webrtcPeer.closePeerConnection("peer_inexistente_123");
  });
});
