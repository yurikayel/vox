/**
 * @module peers-gossip-profile
 * Ingest PROFILE_CARD via gossip — persiste em profile-directory, **sem** dispatchGossipPost (feed).
 */

import * as moderation from "./moderation.js";
import * as profileCard from "./profile-card.js";
import * as profileDirectory from "./profile-directory.js";
import * as profileNote from "./profile-note.js";

/** @param {string} cardId */
export function routeIdFromProfileCardId(cardId) {
  const id = String(cardId || "");
  if (!id.startsWith("pc_vx_")) return "";
  return id.slice(3);
}

/** Versão (`editedAt` e assinatura) de cada cartão já aplicado nesta sessão; o diretório guarda a mesma marca entre sessões. */
const seenCards = new Map();
const SEEN_CARDS_MAX = 2000;
const cardTime = (item) => Number(item?.editedAt || item?.ts || 0);

/** Já tenho esta versão ou uma mais nova. Mesma data com outra assinatura é outro cartão. */
function isCovered(seen, item) {
  if (!seen) return false;
  const t = cardTime(item);
  return seen.at > t || (seen.at === t && seen.sig === item.sig);
}

/** PM-84: o cartão que chega de novo (mesma versão ou mais velha) não é reaplicado nem repassado. */
export function isProfileCardSeen(item) {
  if (isCovered(seenCards.get(item.id), item)) return true;
  const stored = profileDirectory.getProfileCard(item.routeId);
  if (stored?.gossipCardId !== item.id) return false;
  return isCovered({ at: Number(stored.gossipCardAt || 0), sig: stored.gossipCardSig }, item);
}

export function markProfileCardSeen(item) {
  if (!item?.id) return;
  seenCards.delete(item.id);
  if (seenCards.size >= SEEN_CARDS_MAX) seenCards.delete(seenCards.keys().next().value);
  seenCards.set(item.id, { at: cardTime(item), sig: item.sig });
}

/** Marca de versão guardada junto do cartão no diretório. */
export const seenStamp = (item) => ({ gossipCardId: item.id, gossipCardAt: cardTime(item), gossipCardSig: item.sig || "" });

/**
 * @param {object} item — payload assinado já verificado por verifyPayload
 * @returns {Promise<boolean>} true se o cartão é novo e foi aplicado (e deve seguir adiante na malha)
 */
export async function applyVerifiedProfileCardItem(item) {
  if (isProfileCardSeen(item)) return false;
  const applied = applyProfileCard(item);
  if (applied) markProfileCardSeen(item);
  return applied;
}

function applyProfileCard(item) {
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
  // Cartão sem nome (de app antigo) não é guardado nem repassado.
  if (!profileDirectory.hasChosenCardName({ name: item.displayName, routeId: item.routeId })) return false;
  profileDirectory.setProfileCard(item.routeId, {
    name: item.displayName || "",
    avatarUrl: item.avatarUrl || "",
    bio: item.bio || "",
    pronouns: item.pronouns || "",
    gender: item.gender || "",
    orientation: item.orientation || "",
    discoverable: true,
    ...seenStamp(item),
  });
  if (item.note) profileNote.ingestRemoteNote(item.routeId, item.note, item.noteAt || item.editedAt);
  return true;
}

function shouldUpdateDirectoryCard(existing, inName, card) {
  if (!existing) return true;
  if (inName && !existing.name) return true;
  return Number(card.updatedAt) > Number(existing.updatedAt);
}

function pickCardField(primary, fallback) {
  return primary ? String(primary).trim() : String(fallback || "").trim();
}

/** Cartão de diretório sem assinatura (sincronização ao conectar, identidade do par WebRTC). */
export function applyDirectoryProfileCard(card) {
  if (!card || typeof card !== "object") return;
  const routeId = pickCardField(card.routeId, card.author);
  if (!routeId.startsWith("vx_") || moderation.shouldDropGossip(routeId)) return;
  const existing = profileDirectory.getProfileCard(routeId);
  const inName = pickCardField(card.name, card.displayName);
  if (!shouldUpdateDirectoryCard(existing, inName, card)) return;
  const ex = existing ? existing : {};
  const inAvatar = pickCardField(card.avatarUrl, card.avatar);
  profileDirectory.setProfileCard(routeId, {
    name: pickCardField(inName, ex.name),
    avatarUrl: pickCardField(inAvatar, ex.avatarUrl),
    bio: pickCardField(card.bio, ex.bio),
    handle: pickCardField(card.handle, ex.handle),
    pronouns: pickCardField(card.pronouns, ex.pronouns),
    gender: pickCardField(card.gender, ex.gender),
    orientation: pickCardField(card.orientation, ex.orientation),
    discoverable: card.discoverable !== false,
  });
}
