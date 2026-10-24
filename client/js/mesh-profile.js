/** Republicar PROFILE_CARD local quando opt-in (V-MESH). */

import * as localAccount from "./local-account.js";
import * as profileCard from "./profile-card.js";
import * as profileDirectory from "./profile-directory.js";
import * as peers from "./peers.js";

function applyLocalCardFromSigned(signed) {
  if (!signed?.routeId) return;
  if (!signed.discoverable) {
    profileDirectory.removeProfileCard(signed.routeId);
    return;
  }
  profileDirectory.setProfileCard(signed.routeId, {
    name: signed.displayName || "",
    avatarUrl: signed.avatarUrl || "",
    bio: signed.bio || "",
    discoverable: true,
    gossipCardId: signed.id,
  });
}

export async function syncMeshProfileCard() {
  if (localAccount.getMeshDiscoverable()) {
    const signed = await profileCard.buildSignedProfileCard();
    applyLocalCardFromSigned(signed);
    peers.broadcastProfileCard(signed);
    return signed;
  }
  const revoke = await profileCard.buildRevokeProfileCard();
  applyLocalCardFromSigned(revoke);
  peers.broadcastProfileCardUpdate(revoke);
  return revoke;
}
