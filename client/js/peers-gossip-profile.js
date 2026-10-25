/**
 * @module peers-gossip-profile
 * Ingest PROFILE_CARD via gossip — persiste em profile-directory, **sem** dispatchGossipPost (feed).
 */

import * as profileCard from "./profile-card.js";
import * as profileDirectory from "./profile-directory.js";

/** @param {string} cardId */
export function routeIdFromProfileCardId(cardId) {
  const id = String(cardId || "");
  if (!id.startsWith("pc_vx_")) return "";
  return id.slice(3);
}

/**
 * @param {object} item — payload assinado já verificado por verifyPayload
 * @returns {Promise<boolean>}
 */
export async function applyVerifiedProfileCardItem(item) {
  if (profileCard.isProfileCardExpired(item)) {
    if (item?.routeId) profileDirectory.removeProfileCard(item.routeId);
    return true;
  }
  const check = profileCard.validateProfileCardItem(item);
  if (!check.ok) return false;
  if (!item.discoverable) {
    profileDirectory.removeProfileCard(item.routeId);
    return true;
  }
  profileDirectory.setProfileCard(item.routeId, {
    name: item.displayName || "",
    avatarUrl: item.avatarUrl || "",
    bio: item.bio || "",
    discoverable: true,
    gossipCardId: item.id,
  });
  return true;
}
