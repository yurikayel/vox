import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as localAccount from "../client/js/local-account.js";
import * as profileCard from "../client/js/profile-card.js";

test("profile-card - canonical id and signed card", async () => {
  localStorage.clear();
  const routeId = await localAccount.getRouteId();
  assert.equal(profileCard.canonicalProfileCardId(routeId), `pc_${routeId}`);
  const signed = await profileCard.buildSignedProfileCard({ displayName: "Ana", bio: "Oi" });
  assert.equal(signed.type, profileCard.PROFILE_CARD_TYPE);
  assert.equal(signed.discoverable, true);
  const v = profileCard.validateProfileCardItem(signed);
  assert.equal(v.ok, true);
  assert.equal(await localAccount.verifyPayload(signed), true);
});

test("profile-card - expired and revoke", async () => {
  localStorage.clear();
  const signed = await profileCard.buildSignedProfileCard({ displayName: "Velho" });
  signed.editedAt = Date.now() - profileCard.CARD_TTL_MS - 1000;
  assert.equal(profileCard.validateProfileCardItem(signed).ok, false);
  const revoke = await profileCard.buildRevokeProfileCard();
  assert.equal(revoke.discoverable, false);
  assert.equal(profileCard.validateProfileCardItem(revoke).ok, true);
});

test("profile-card - author mismatch and bad sig rejected", async () => {
  localStorage.clear();
  const signed = await profileCard.buildSignedProfileCard({ displayName: "X" });
  const badAuthor = { ...signed, routeId: "vx_other" };
  assert.equal(profileCard.validateProfileCardItem(badAuthor).ok, false);
  const badSig = { ...signed, sig: "invalid" };
  assert.equal(await localAccount.verifyPayload(badSig), false);
});
