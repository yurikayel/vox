/** Republicar PROFILE_CARD local quando opt-in (V-MESH). */

import * as localAccount from "./local-account.js";
import * as profileCard from "./profile-card.js";
import * as profileDirectory from "./profile-directory.js";
import { markProfileCardSeen, seenStamp } from "./peers-gossip-profile.js";
import * as profileNote from "./profile-note.js";
import * as peers from "./peers.js";

function applyLocalCardFromSigned(signed) {
  if (!signed?.routeId) return;
  markProfileCardSeen(signed);
  if (!signed.discoverable) {
    profileDirectory.removeProfileCard(signed.routeId);
    return;
  }
  profileDirectory.setProfileCard(signed.routeId, {
    name: signed.displayName || "",
    avatarUrl: signed.avatarUrl || "",
    bio: signed.bio || "",
    discoverable: true,
    ...seenStamp(signed),
  });
  if (signed.note) {
    profileNote.ingestRemoteNote(signed.routeId, signed.note, signed.noteAt || signed.editedAt);
  }
}

export async function syncMeshProfileCard() {
  if (localAccount.getMeshDiscoverable()) {
    const signed = await profileCard.buildSignedProfileCard();
    applyLocalCardFromSigned(signed);
    // Sem nome escolhido o cartão fica só aqui: não vai para a malha nem para o Arweave.
    if (profileDirectory.hasChosenCardName({ name: signed.displayName, routeId: signed.routeId })) {
      peers.broadcastProfileCard(signed);
      void profileCard.publishProfileCardOnChain(signed);
    }
    return signed;
  }
  const revoke = await profileCard.buildRevokeProfileCard();
  applyLocalCardFromSigned(revoke);
  peers.broadcastProfileCardUpdate(revoke);
  return revoke;
}
