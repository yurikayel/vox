/**
 * Conta Local & Identidade P2P-first (Fase 1 / Protocolo vox-local-v0)
 * Permite autoria, participação em comunidades e mensagens diretas
 * sem dependência obrigatória de carteira Arweave ou custos financeiros.
 */

import * as cryptoDm from "./crypto-dm.js";

const ACCOUNT_STORAGE = "vox-local-account-v1";
const DISPLAY_NAME_STORAGE = "vox-display-name";
const PIX_STORAGE = "vox-pix-key-v1";
const ENRICHMENT_STORAGE = "vox-profile-enrichment-v1";
const DISCOVERABLE_STORAGE = "vox-discoverable-mesh-v1";

function bytesToB64Url(bytes) {
  let bin = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) {
    bin += String.fromCharCode(arr[i]);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64UrlToBytes(b64url) {
  const padded = String(b64url).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function canonicalString(obj) {
  const { sig, pubKey, ...rest } = obj;
  return JSON.stringify(rest, Object.keys(rest).sort());
}

let cachedAccount = null;

export async function computeRouteId(pubJwk) {
  if (!pubJwk?.x || !pubJwk?.y) return "";
  const raw = new TextEncoder().encode(`P-256:${pubJwk.x}:${pubJwk.y}`);
  const hash = await crypto.subtle.digest("SHA-256", raw);
  return "vx_" + bytesToB64Url(hash).slice(0, 20);
}

export async function ensureLocalAccount() {
  try {
    const stored = localStorage.getItem(ACCOUNT_STORAGE);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed?.routeId && parsed?.publicJwk && parsed?.privateJwk) {
        cachedAccount = parsed;
        // Garante também as chaves ECDH para DMs
        await cryptoDm.ensureDmKeys();
        return cachedAccount;
      }
    }
  } catch {}

  cachedAccount = null;

  // Gera par de chaves ECDSA P-256 para autoria e assinatura P2P
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const routeId = await computeRouteId(publicJwk);

  // Inicializa chaves DM
  await cryptoDm.ensureDmKeys();

  cachedAccount = {
    routeId,
    publicJwk,
    privateJwk,
    createdAt: Date.now(),
  };

  try {
    localStorage.setItem(ACCOUNT_STORAGE, JSON.stringify(cachedAccount));
  } catch {}

  return cachedAccount;
}

export async function getRouteId() {
  const acc = await ensureLocalAccount();
  return acc?.routeId || "";
}

export function getCachedRouteIdSync() {
  if (cachedAccount?.routeId) return cachedAccount.routeId;
  try {
    const stored = localStorage.getItem(ACCOUNT_STORAGE);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed?.routeId) {
        cachedAccount = parsed;
        return parsed.routeId;
      }
    }
  } catch {}
  return "";
}

export function getDisplayName() {
  try {
    return localStorage.getItem(DISPLAY_NAME_STORAGE) || "";
  } catch {
    return "";
  }
}

export function setDisplayName(name) {
  try {
    const clean = String(name || "").trim().slice(0, 30);
    localStorage.setItem(DISPLAY_NAME_STORAGE, clean);
    return clean;
  } catch {
    return "";
  }
}

export function getProfileEnrichment() {
  try {
    const raw = localStorage.getItem(ENRICHMENT_STORAGE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setProfileEnrichment({ displayName, bio, avatarUrl, oauthProvider } = {}) {
  try {
    const prev = getProfileEnrichment() || {};
    const next = {
      ...prev,
      displayName: displayName !== undefined ? String(displayName).trim().slice(0, 80) : prev.displayName,
      bio: bio !== undefined ? String(bio).trim().slice(0, 280) : prev.bio,
      avatarUrl: avatarUrl !== undefined ? String(avatarUrl).trim().slice(0, 512) : prev.avatarUrl,
      oauthProvider: oauthProvider !== undefined ? String(oauthProvider).trim() : prev.oauthProvider,
      linkedAt: Date.now(),
    };
    localStorage.setItem(ENRICHMENT_STORAGE, JSON.stringify(next));
    if (next.displayName) setDisplayName(next.displayName);
    return next;
  } catch {
    return null;
  }
}

export function clearProfileEnrichment() {
  try {
    localStorage.removeItem(ENRICHMENT_STORAGE);
    return true;
  } catch {
    return false;
  }
}

export async function exportLocalAccountBundle() {
  const acc = await ensureLocalAccount();
  return {
    type: "vox-local-account-bundle",
    schemaVersion: 1,
    routeId: acc.routeId,
    publicJwk: acc.publicJwk,
    privateJwk: acc.privateJwk,
    displayName: getDisplayName(),
    enrichment: getProfileEnrichment(),
    pix: getPixKey(),
    exportedAt: Date.now(),
  };
}

export async function importLocalAccountBundle(bundle) {
  if (!bundle?.routeId || !bundle?.publicJwk || !bundle?.privateJwk) return false;
  cachedAccount = {
    routeId: bundle.routeId,
    publicJwk: bundle.publicJwk,
    privateJwk: bundle.privateJwk,
    createdAt: bundle.createdAt || Date.now(),
  };
  localStorage.setItem(ACCOUNT_STORAGE, JSON.stringify(cachedAccount));
  if (bundle.displayName) setDisplayName(bundle.displayName);
  if (bundle.enrichment) localStorage.setItem(ENRICHMENT_STORAGE, JSON.stringify(bundle.enrichment));
  if (bundle.pix) localStorage.setItem(PIX_STORAGE, JSON.stringify(bundle.pix));
  await cryptoDm.ensureDmKeys();
  return true;
}

export function getPixKey() {
  try {
    const raw = localStorage.getItem(PIX_STORAGE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setPixKey({ normalized, type, masked = "" }) {
  try {
    const data = {
      normalized: String(normalized || ""),
      type: String(type || "unknown"),
      masked: String(masked || ""),
      updatedAt: Date.now(),
    };
    localStorage.setItem(PIX_STORAGE, JSON.stringify(data));
    return data;
  } catch {
    return null;
  }
}

export function clearPixKey() {
  try {
    localStorage.removeItem(PIX_STORAGE);
    return true;
  } catch {
    return false;
  }
}

export async function signPayload(payload) {
  const acc = await ensureLocalAccount();
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    acc.privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const enriched = {
    ...payload,
    id: payload.id || "p_" + bytesToB64Url(crypto.getRandomValues(new Uint8Array(12))),
    author: acc.routeId,
    ts: payload.ts || Date.now(),
  };

  const rawData = new TextEncoder().encode(canonicalString(enriched));
  const sigBuffer = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    rawData
  );

  return {
    ...enriched,
    pubKey: acc.publicJwk,
    sig: bytesToB64Url(sigBuffer),
  };
}

export async function verifyPayload(signed) {
  if (!signed?.sig || !signed?.pubKey || !signed?.author) return false;
  try {
    // 1. Valida que routeId é derivado da chave pública anexada
    const expectedRouteId = await computeRouteId(signed.pubKey);
    if (signed.author !== expectedRouteId) return false;

    // 2. Valida assinatura criptográfica
    const imported = await crypto.subtle.importKey(
      "jwk",
      signed.pubKey,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
    const verifyData = new TextEncoder().encode(canonicalString(signed));
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      imported,
      b64UrlToBytes(signed.sig),
      verifyData
    );
  } catch {
    return false;
  }
}


export function getMeshDiscoverable() {
  try {
    return localStorage.getItem(DISCOVERABLE_STORAGE) === "1";
  } catch {
    return false;
  }
}

export function setMeshDiscoverable(on) {
  try {
    if (on) localStorage.setItem(DISCOVERABLE_STORAGE, "1");
    else localStorage.removeItem(DISCOVERABLE_STORAGE);
    return true;
  } catch {
    return false;
  }
}

export async function exportAccountBundle() {
  const acc = await ensureLocalAccount();
  const dmKeypair = await cryptoDm.getDmKeypair();
  const bundle = {
    voxVersion: 1,
    kind: "vox-account-backup",
    routeId: acc.routeId,
    publicJwk: acc.publicJwk,
    privateJwk: acc.privateJwk,
    dmKeypair,
    displayName: getDisplayName(),
    pixKey: getPixKey(),
    meshDiscoverable: getMeshDiscoverable(),
    exportedAt: Date.now(),
  };
  return JSON.stringify(bundle, null, 2);
}

export async function importAccountBundle(rawBundle) {
  let parsed = null;
  if (typeof rawBundle === "string") {
    try {
      parsed = JSON.parse(rawBundle);
    } catch {
      throw new Error("Formato de backup inválido (não é JSON)");
    }
  } else if (rawBundle && typeof rawBundle === "object") {
    parsed = rawBundle;
  }

  if (!parsed || parsed.kind !== "vox-account-backup" || !parsed.routeId) {
    throw new Error("Backup incompatível ou corrompido");
  }

  if (!parsed.publicJwk || !parsed.privateJwk) {
    throw new Error("Chaves de assinatura ausentes no backup");
  }

  const expectedRouteId = await computeRouteId(parsed.publicJwk);
  if (!expectedRouteId || expectedRouteId !== parsed.routeId) {
    throw new Error("Chave pública não corresponde ao routeId declarado");
  }

  try {
    const privKey = await crypto.subtle.importKey(
      "jwk",
      parsed.privateJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"]
    );
    const pubKey = await crypto.subtle.importKey(
      "jwk",
      parsed.publicJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
    const nonce = new TextEncoder().encode(`vox-verify-${Date.now()}`);
    const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privKey, nonce);
    const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pubKey, sig, nonce);
    if (!valid) throw new Error("Assinatura de teste falhou");
  } catch (err) {
    throw new Error(`Validação das chaves falhou: ${err.message}`);
  }

  cachedAccount = {
    routeId: parsed.routeId,
    publicJwk: parsed.publicJwk,
    privateJwk: parsed.privateJwk,
    createdAt: parsed.createdAt || Date.now(),
    importedAt: Date.now(),
  };
  localStorage.setItem(ACCOUNT_STORAGE, JSON.stringify(cachedAccount));

  if (parsed.dmKeypair) {
    cryptoDm.setDmKeypair(parsed.dmKeypair);
  }
  if (parsed.displayName) {
    setDisplayName(parsed.displayName);
  }
  if (parsed.pixKey) {
    setPixKey(parsed.pixKey);
  }
  if (typeof parsed.meshDiscoverable === "boolean") {
    setMeshDiscoverable(parsed.meshDiscoverable);
  }

  return cachedAccount;
}
