import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as profileCard from "../client/js/profile-card.js";
import * as profileDirectory from "../client/js/profile-directory.js";
import * as gossipProfile from "../client/js/peers-gossip-profile.js";
import * as meshProfile from "../client/js/mesh-profile.js";
import * as localAccount from "../client/js/local-account.js";

const fresh = () => {
  localStorage.clear();
  profileDirectory.__resetProfileCardsForTests();
};

test("PM-84 - cartão repetido não é reaplicado nem segue adiante; versão nova segue", async () => {
  fresh();
  const card = await profileCard.buildSignedProfileCard({ displayName: "Eco" });
  let sunk = 0;
  profileDirectory.registerProfileMemorySink(() => { sunk += 1; });
  try {
    assert.equal(await gossipProfile.applyVerifiedProfileCardItem(card), true, "primeira vez: aplica e repassa");
    for (let i = 0; i < 5; i++) assert.equal(await gossipProfile.applyVerifiedProfileCardItem({ ...card }), false);
    assert.equal(sunk, 1, "a memória central recebe o cartão uma vez, não a cada eco");
    const older = await localAccount.signPayload({ ...strip(card), editedAt: card.editedAt - 1000 });
    assert.equal(await gossipProfile.applyVerifiedProfileCardItem(older), false, "versão mais velha não volta");
    const newer = await localAccount.signPayload({ ...strip(card), displayName: "Eco 2", editedAt: card.editedAt + 1000 });
    assert.equal(await gossipProfile.applyVerifiedProfileCardItem(newer), true);
    assert.equal(profileDirectory.getProfileCard(card.routeId).name, "Eco 2");
  } finally {
    profileDirectory.registerProfileMemorySink(null);
  }
});

test("PM-84 - mesma data com outra assinatura é outro cartão", async () => {
  fresh();
  const card = await profileCard.buildSignedProfileCard({ displayName: "A" });
  assert.equal(await gossipProfile.applyVerifiedProfileCardItem(card), true);
  const twin = await localAccount.signPayload({ ...strip(card), displayName: "B" });
  assert.equal(await gossipProfile.applyVerifiedProfileCardItem(twin), true);
});

test("PM-84 - o próprio cartão publicado não volta pelo eco; a marca sobrevive no diretório", async () => {
  fresh();
  localAccount.setMeshDiscoverable(true);
  const signed = await meshProfile.syncMeshProfileCard();
  assert.equal(signed.discoverable, true);
  assert.equal(await gossipProfile.applyVerifiedProfileCardItem({ ...signed }), false);
  const stored = profileDirectory.getProfileCard(signed.routeId);
  assert.equal(stored.gossipCardSig, signed.sig);
  assert.equal(gossipProfile.isProfileCardSeen(signed), true);
});

function strip({ sig: _s, pubKey: _p, author: _a, ...rest }) {
  return rest;
}
