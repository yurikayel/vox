/**
 * Malha v0 — gossip CACHE_MANIFEST + prioridade WANT (V-I05).
 */
import {
  CACHE_MANIFEST_TYPE,
  validateManifestBody,
} from "./cache-manifest.js";

const STORAGE_KEY = "vox-cache-manifest-by-comm";

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(map) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function getLatestManifestForCommunity(communityId) {
  const store = readStore();
  return store[String(communityId || "").trim()] || null;
}

export function listKnownManifests() {
  return Object.values(readStore());
}

export function collectPriorityPinTxIds() {
  const ids = new Set();
  for (const entry of listKnownManifests()) {
    const pins = entry?.manifest?.pins;
    if (!Array.isArray(pins)) continue;
    for (const p of pins) {
      if (p?.txId) ids.add(p.txId);
    }
  }
  return ids;
}

export function isManifestPriorityTx(txId) {
  if (!txId) return false;
  return collectPriorityPinTxIds().has(txId);
}

export async function ingestSignedCacheManifestItem(item, verifyFn) {
  if (!item?.id || item.type !== CACHE_MANIFEST_TYPE || !item.communityId) {
    return { ok: false, reason: "formato" };
  }
  if (typeof verifyFn !== "function" || !(await verifyFn(item))) {
    return { ok: false, reason: "sig" };
  }
  const check = validateManifestBody(item.manifest || {});
  if (!check.valid) return { ok: false, reason: check.error || "manifest" };
  if (check.manifest.communityId !== item.communityId) {
    return { ok: false, reason: "communityId" };
  }

  const store = readStore();
  const prev = store[item.communityId];
  const incomingAt = Number(check.manifest.issuedAt || item.ts || 0);
  const prevAt = Number(prev?.manifest?.issuedAt || prev?.ts || 0);
  if (prev && prevAt >= incomingAt) {
    return { ok: true, skipped: true };
  }

  store[item.communityId] = {
    ...item,
    manifest: check.manifest,
  };
  writeStore(store);
  return { ok: true, skipped: false, manifest: check.manifest };
}

export function buildCacheManifestGossipDraft({ communityId, manifest }) {
  const comm = String(communityId || manifest?.communityId || "").trim();
  const issuedAt = Number(manifest?.issuedAt) || Date.now();
  return {
    id: `cmf_${comm}_${issuedAt}`,
    type: CACHE_MANIFEST_TYPE,
    communityId: comm,
    manifest,
    ts: Date.now(),
  };
}
