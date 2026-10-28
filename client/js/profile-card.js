/** PROFILE_CARD gossip v0 — validate, TTL, assinatura (V-MESH). */

import * as localAccount from "./local-account.js";
import * as profileNote from "./profile-note.js";

export const PROFILE_CARD_TYPE = "profile-card";
export const CARD_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function canonicalProfileCardId(routeId) {
  const id = String(routeId || "").trim();
  return id ? `pc_${id}` : "";
}

export function stripSignatureFields(item) {
  if (!item || typeof item !== "object") return {};
  const { sig, pubKey, ...rest } = item;
  return rest;
}

export function isProfileCardExpired(item) {
  const t = Number(item?.editedAt || item?.ts || 0);
  if (!t) return true;
  return Date.now() - t > CARD_TTL_MS;
}

export function validateProfileCardItem(item) {
  if (!item || typeof item !== "object") return { ok: false, reason: "missing" };
  if (item.type !== PROFILE_CARD_TYPE) return { ok: false, reason: "type" };
  const routeId = String(item.routeId || "").trim();
  const author = String(item.author || "").trim();
  if (!routeId.startsWith("vx_") || !author.startsWith("vx_")) return { ok: false, reason: "route" };
  if (routeId !== author) return { ok: false, reason: "author-mismatch" };
  const expectedId = canonicalProfileCardId(routeId);
  if (item.id !== expectedId) return { ok: false, reason: "id" };
  if (typeof item.discoverable !== "boolean") return { ok: false, reason: "discoverable" };
  if (!item.sig || !item.pubKey) return { ok: false, reason: "sig" };
  if (isProfileCardExpired(item)) return { ok: false, reason: "expired" };
  return { ok: true };
}

export async function buildSignedProfileCard({ displayName = "", avatarUrl = "", bio = "" } = {}) {
  const routeId = await localAccount.getRouteId();
  const enrich = localAccount.getProfileEnrichment();
  const note = profileNote.getNote(routeId);
  const payload = {
    id: canonicalProfileCardId(routeId),
    type: PROFILE_CARD_TYPE,
    routeId,
    displayName: String(displayName || localAccount.getDisplayName() || enrich?.displayName || "").slice(0, 80),
    avatarUrl: String(avatarUrl || enrich?.avatarUrl || "").slice(0, 512),
    bio: String(bio || enrich?.bio || "").slice(0, 280),
    note: note?.text || "",
    noteAt: note?.updatedAt || 0,
    discoverable: true,
    editedAt: Date.now(),
  };
  return localAccount.signPayload(payload);
}

export async function buildRevokeProfileCard() {
  const routeId = await localAccount.getRouteId();
  const payload = {
    id: canonicalProfileCardId(routeId),
    type: PROFILE_CARD_TYPE,
    routeId,
    displayName: localAccount.getDisplayName() || "",
    avatarUrl: "",
    bio: "",
    discoverable: false,
    editedAt: Date.now(),
  };
  return localAccount.signPayload(payload);
}
