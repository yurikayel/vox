/** Republicar PROFILE_CARD local quando opt-in (V-MESH). */

import * as localAccount from "./local-account.js";
import * as profileCard from "./profile-card.js";
import * as profileDirectory from "./profile-directory.js";
import * as profileNote from "./profile-note.js";
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
  if (signed.note) {
    profileNote.ingestRemoteNote(signed.routeId, signed.note, signed.noteAt || signed.editedAt);
  }
}

export async function syncMeshProfileCard() {
  if (localAccount.getMeshDiscoverable()) {
    const signed = await profileCard.buildSignedProfileCard();
    applyLocalCardFromSigned(signed);
    peers.broadcastProfileCard(signed);
    void profileCard.publishProfileCardOnChain(signed);
    return signed;
  }
  const revoke = await profileCard.buildRevokeProfileCard();
  applyLocalCardFromSigned(revoke);
  peers.broadcastProfileCardUpdate(revoke);
  return revoke;
}
