import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as localAccount from "../client/js/local-account.js";
import * as profileCard from "../client/js/profile-card.js";
import * as profileDirectory from "../client/js/profile-directory.js";
import * as peers from "../client/js/peers.js";
import * as cacheNode from "../client/js/cache-node.js";

test("peers profile-card T1 valid discoverable ingests without feed", async () => {
  localStorage.clear();
  profileDirectory.__resetProfileCardsForTests();
  const signed = await profileCard.buildSignedProfileCard({ displayName: "Mesh User", bio: "hey" });
  let feedHits = 0;
  peers.onGossipPost(() => {
    feedHits += 1;
  });
  await peers.handleVoxMessage({ type: "GOSSIP", item: signed, fromPeer: "peer_a" }, () => {}, "broadcast");
  const card = profileDirectory.getProfileCard(signed.routeId);
  assert.ok(card?.name?.includes("Mesh"));
  assert.equal(feedHits, 0);
  const posts = await cacheNode.getLocalPosts({});
  assert.ok(!posts.some((p) => p.id === signed.id));
});

test("peers profile-card T2 stale card removed", async () => {
  localStorage.clear();
  profileDirectory.__resetProfileCardsForTests();
  const signed = await profileCard.buildSignedProfileCard({ displayName: "Stale" });
  signed.editedAt = Date.now() - profileCard.CARD_TTL_MS - 5000;
  await peers.handleVoxMessage({ type: "GOSSIP", item: signed, fromPeer: "p" }, () => {}, "broadcast");
  assert.equal(profileDirectory.getProfileCard(signed.routeId), null);
});

test("peers profile-card T3 wrong author rejected", async () => {
  localStorage.clear();
  profileDirectory.__resetProfileCardsForTests();
  const signed = await profileCard.buildSignedProfileCard({ displayName: "Bad" });
  signed.routeId = "vx_wrongroute0000000";
  await peers.handleVoxMessage({ type: "GOSSIP", item: signed, fromPeer: "p" }, () => {}, "broadcast");
  assert.equal(profileDirectory.getProfileCard("vx_wrongroute0000000"), null);
});

test("peers profile-card T5 revoke via UPDATE", async () => {
  localStorage.clear();
  profileDirectory.__resetProfileCardsForTests();
  const signed = await profileCard.buildSignedProfileCard({ displayName: "Revoke Me" });
  await peers.handleVoxMessage({ type: "GOSSIP", item: signed, fromPeer: "p" }, () => {}, "broadcast");
  assert.ok(profileDirectory.getProfileCard(signed.routeId));
  const revoke = await profileCard.buildRevokeProfileCard();
  await peers.handleVoxMessage({ type: "GOSSIP_UPDATE", item: revoke, fromPeer: "p" }, () => {}, "broadcast");
  assert.equal(profileDirectory.getProfileCard(signed.routeId), null);
});

test("peers profile-card T4 invalid sig ignored", async () => {
  localStorage.clear();
  profileDirectory.__resetProfileCardsForTests();
  const signed = await profileCard.buildSignedProfileCard({ displayName: "Sig" });
  signed.sig = signed.sig.slice(0, -4) + "XXXX";
  await peers.handleVoxMessage({ type: "GOSSIP", item: signed, fromPeer: "p" }, () => {}, "broadcast");
  assert.equal(profileDirectory.getProfileCard(signed.routeId), null);
});
