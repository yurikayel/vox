/**
 * Rascunho v0 — Type: cache-manifest (V-I05).
 * Tags Arweave + corpo JSON para espelho/pin de TXs públicas.
 */

import { buildTags } from "./upload.js";

export const CACHE_MANIFEST_TYPE = "cache-manifest";
export const MANIFEST_VERSION = 0;

const TX_ID_REGEX = /^[A-Za-z0-9_-]{43}$/;
const PIN_ROLES = new Set(["community", "topic", "reply", "post", "blob", "index"]);

export function isArweaveTxId(id) {
  return TX_ID_REGEX.test(String(id || "").trim());
}

export function normalizePinEntry(raw = {}) {
  const txId = String(raw.txId || raw.id || "").trim();
  const role = String(raw.role || raw.kind || "blob").trim().toLowerCase();
  const sha256 = String(raw.sha256 || "").trim().toLowerCase();
  return { txId, role, sha256: sha256 || undefined };
}

export function validatePinEntry(entry) {
  const normalized = normalizePinEntry(entry);
  if (!isArweaveTxId(normalized.txId)) {
    return { valid: false, error: "txId inválido (43 caracteres base64url)." };
  }
  if (normalized.role && !PIN_ROLES.has(normalized.role)) {
    return { valid: false, error: "role de pin não reconhecida." };
  }
  if (normalized.sha256 && !/^[a-f0-9]{64}$/.test(normalized.sha256)) {
    return { valid: false, error: "sha256 deve ser hex de 64 caracteres." };
  }
  return { valid: true, entry: normalized };
}

export function validateManifestBody(body = {}) {
  const communityId = String(body.communityId || "").trim();
  if (!communityId) return { valid: false, error: "communityId obrigatório." };
  const v = Number(body.v ?? body.manifestVersion ?? MANIFEST_VERSION);
  if (v !== MANIFEST_VERSION) return { valid: false, error: "manifestVersion incompatível." };

  const pins = Array.isArray(body.pins) ? body.pins : [];
  if (!pins.length) return { valid: false, error: "pins não pode ser vazio." };
  if (pins.length > 512) return { valid: false, error: "pins excede limite de 512 entradas." };

  const normalized = [];
  for (const p of pins) {
    const res = validatePinEntry(p);
    if (!res.valid) return res;
    normalized.push(res.entry);
  }
  const seen = new Set();
  for (const p of normalized) {
    if (seen.has(p.txId)) return { valid: false, error: "txId duplicado no manifesto." };
    seen.add(p.txId);
  }

  const previousManifestTx = body.previousManifestTx
    ? String(body.previousManifestTx).trim()
    : undefined;
  if (previousManifestTx && !isArweaveTxId(previousManifestTx)) {
    return { valid: false, error: "previousManifestTx inválido." };
  }

  return {
    valid: true,
    manifest: {
      v: MANIFEST_VERSION,
      communityId,
      issuedAt: Number(body.issuedAt) || 0,
      pins: normalized,
      previousManifestTx,
    },
  };
}

export function canonicalPinsJson(pins) {
  const sorted = [...pins].sort((a, b) => a.txId.localeCompare(b.txId));
  return JSON.stringify(sorted);
}

export async function pinsRootSha256(pins) {
  const text = canonicalPinsJson(pins);
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function buildManifestBody({ communityId, pins, issuedAt, previousManifestTx, issuerRouteId }) {
  const check = validateManifestBody({ communityId, v: MANIFEST_VERSION, pins, issuedAt, previousManifestTx });
  if (!check.valid) throw new Error(check.error);
  const body = { ...check.manifest, issuedAt: check.manifest.issuedAt || Date.now() };
  if (issuerRouteId) body.issuerRouteId = String(issuerRouteId).trim();
  return body;
}

export function buildCacheManifestTags({ communityId, ownerAddr, previousManifestTx, pinsRoot }) {
  const fields = {
    "Community-Id": communityId,
    "Manifest-Version": String(MANIFEST_VERSION),
  };
  if (ownerAddr) fields["Owner-Addr"] = ownerAddr;
  if (previousManifestTx) fields["Previous-Manifest"] = previousManifestTx;
  if (pinsRoot) fields["Pins-Root"] = pinsRoot;
  return buildTags(CACHE_MANIFEST_TYPE, fields);
}

export function extractCacheManifestMeta(tags = []) {
  const map = Object.fromEntries(
    (Array.isArray(tags) ? tags : []).map((t) => [t.name, t.value])
  );
  return {
    type: map.Type || "",
    communityId: map["Community-Id"] || "",
    manifestVersion: Number(map["Manifest-Version"] ?? NaN),
    ownerAddr: map["Owner-Addr"] || "",
    previousManifest: map["Previous-Manifest"] || "",
    pinsRoot: map["Pins-Root"] || "",
    appName: map["App-Name"] || "",
  };
}
