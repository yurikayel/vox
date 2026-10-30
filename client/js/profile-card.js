/** PROFILE_CARD gossip v0 — validate, TTL, assinatura (V-MESH). */

import * as localAccount from "./local-account.js";
import * as profileNote from "./profile-note.js";
import * as upload from "./upload.js";

export const PROFILE_CARD_TYPE = "profile-card";
export const CARD_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function canonicalProfileCardId(routeId) {
  const id = String(routeId || "").trim();
  return id ? `pc_${id}` : "";
}

export function stripSignatureFields(item) {
  if (!item || typeof item !== "object") return {};
  const { sig: _sig, pubKey: _pubKey, ...rest } = item;
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

function resolveCardDisplayName(displayName, enrich) {
  if (displayName) return displayName;
  const local = localAccount.getDisplayName();
  if (local) return local;
  return (enrich && enrich.displayName) ? enrich.displayName : "";
}

function resolveCardAvatar(avatarUrl, enrich) {
  if (avatarUrl) return avatarUrl;
  return (enrich && enrich.avatarUrl) ? enrich.avatarUrl : "";
}

function resolveCardBio(bio, enrich) {
  if (bio) return bio;
  return (enrich && enrich.bio) ? enrich.bio : "";
}

export async function buildSignedProfileCard({ displayName = "", avatarUrl = "", bio = "" } = {}) {
  const routeId = await localAccount.getRouteId();
  const enrich = localAccount.getProfileEnrichment();
  const note = profileNote.getNote(routeId);
  const name = resolveCardDisplayName(displayName, enrich);
  const avatar = resolveCardAvatar(avatarUrl, enrich);
  const resolvedBio = resolveCardBio(bio, enrich);

  const payload = {
    id: canonicalProfileCardId(routeId),
    type: PROFILE_CARD_TYPE,
    routeId,
    displayName: String(name).slice(0, 80),
    avatarUrl: String(avatar).slice(0, 512),
    bio: String(resolvedBio).slice(0, 280),
    note: (note && note.text) ? note.text : "",
    noteAt: (note && note.updatedAt) ? note.updatedAt : 0,
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

function getCardTagValue(val, maxLen) {
  const str = String(val || "").trim();
  return maxLen ? str.slice(0, maxLen) : str;
}

export function buildProfileCardArweaveTags(card) {
  const c = card || {};
  const name = c.displayName || c.name || "";
  const ts = c.editedAt || c.ts || Date.now();
  return [
    { name: "App-Name", value: "vox-brasil" },
    { name: "Type", value: PROFILE_CARD_TYPE },
    { name: "Route-Id", value: getCardTagValue(c.routeId) },
    { name: "Display-Name", value: getCardTagValue(name, 80) },
    { name: "Bio", value: getCardTagValue(c.bio, 280) },
    { name: "Avatar-Url", value: getCardTagValue(c.avatarUrl, 512) },
    { name: "Discoverable", value: c.discoverable !== false ? "true" : "false" },
    { name: "Timestamp", value: String(ts) },
    { name: "Content-Type", value: "application/json" },
  ];
}

export async function publishProfileCardOnChain(card, { uploadFn = upload.postData } = {}) {
  if (!card?.routeId) return { ok: false, reason: "invalid-card" };
  const tags = buildProfileCardArweaveTags(card);
  const data = JSON.stringify(card);
  try {
    const res = await uploadFn(data, tags, { autoCreate: true });
    return { ok: true, id: res.id, via: res.via };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
