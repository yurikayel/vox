/**
 * Conta Local & Identidade P2P-first (Fase 1 / Protocolo vox-local-v0)
 * Permite autoria, participação em comunidades e mensagens diretas
 * sem dependência obrigatória de carteira Arweave ou custos financeiros.
 */

import * as cryptoDm from "./crypto-dm.js";
import { KIND_PLAIN, KIND_WRAPPED, wrapBackup, unwrapBackup } from "./account-backup-wrap.js";

const ACCOUNT_STORAGE = "vox-local-account-v1";
const DISPLAY_NAME_STORAGE = "vox-display-name";
const PIX_STORAGE = "vox-pix-key-v1";
const ENRICHMENT_STORAGE = "vox-profile-enrichment-v1";
const DISCOVERABLE_STORAGE = "vox-discoverable-mesh-v1";
const DM_KEYPAIR_STORAGE = "vox-dm-keypair";
const VAULT_STORAGE = "vox-accounts-vault-v1";
const SESSION_PASSPHRASE_KEYS = ["vox-sovereignty-passphrase", "vox-backup-passphrase"];

export const LOCAL_WIPE_NOTICE =
  "Apaga chaves JWK DESTE navegador. Posts no permaweb, relay/inbox e arquivo .json/.voxid em disco NÃO são apagados.";

const LOCAL_WIPE_KEYS = [
  ACCOUNT_STORAGE,
  DM_KEYPAIR_STORAGE,
  DISPLAY_NAME_STORAGE,
  PIX_STORAGE,
  ENRICHMENT_STORAGE,
  DISCOVERABLE_STORAGE,
  VAULT_STORAGE,
];

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

  const enrich = getProfileEnrichment();
  const fallbackDisplay = getDisplayName() || enrich?.displayName || "";
  const fallbackAvatar = enrich?.avatarUrl || "";
  const enriched = {
    ...payload,
    id: payload.id || "p_" + bytesToB64Url(crypto.getRandomValues(new Uint8Array(12))),
    author: acc.routeId,
    ...(payload.authorDisplay !== undefined
      ? { authorDisplay: payload.authorDisplay }
      : (fallbackDisplay ? { authorDisplay: fallbackDisplay } : {})),
    ...(payload.authorAvatar !== undefined
      ? { authorAvatar: payload.authorAvatar }
      : (fallbackAvatar ? { authorAvatar: fallbackAvatar } : {})),
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

async function buildAccountBackup() {
  const acc = await ensureLocalAccount();
  return {
    voxVersion: 1,
    kind: KIND_PLAIN,
    routeId: acc.routeId,
    publicJwk: acc.publicJwk,
    privateJwk: acc.privateJwk,
    dmKeypair: await cryptoDm.getDmKeypair(),
    displayName: getDisplayName(),
    pixKey: getPixKey(),
    meshDiscoverable: getMeshDiscoverable(),
    exportedAt: Date.now(),
  };
}

export async function exportAccountBundle(passphrase) {
  const bundle = await buildAccountBackup();
  const secret = String(passphrase || "").trim();
  if (!secret) return JSON.stringify(bundle, null, 2);
  return JSON.stringify(await wrapBackup(bundle, secret), null, 2);
}

function parseBackupRaw(rawBundle) {
  if (typeof rawBundle === "string") {
    try {
      return JSON.parse(rawBundle);
    } catch {
      throw new Error("Formato de backup inválido (não é JSON)");
    }
  }
  if (rawBundle && typeof rawBundle === "object") return rawBundle;
  throw new Error("Formato de backup inválido (não é JSON)");
}

async function unwrapIfNeeded(parsed, passphrase) {
  if (parsed?.kind === KIND_PLAIN) return parsed;
  if (parsed?.kind === KIND_WRAPPED) return unwrapBackup(parsed, passphrase);
  throw new Error("Backup incompatível ou corrompido");
}

async function assertBackupIdentity(parsed) {
  if (!parsed?.routeId) throw new Error("Backup incompatível ou corrompido");
  if (!parsed.publicJwk || !parsed.privateJwk) {
    throw new Error("Chaves de assinatura ausentes no backup");
  }
  const expected = await computeRouteId(parsed.publicJwk);
  if (!expected || expected !== parsed.routeId) {
    throw new Error("Chave pública não corresponde ao routeId declarado");
  }
}

async function importEcdsaKey(jwk, usages) {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    usages
  );
}

async function challengeSigningPair(parsed) {
  try {
    const privKey = await importEcdsaKey(parsed.privateJwk, ["sign"]);
    const pubKey = await importEcdsaKey(parsed.publicJwk, ["verify"]);
    const nonce = new TextEncoder().encode(`vox-verify-${Date.now()}`);
    const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privKey, nonce);
    const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pubKey, sig, nonce);
    if (!valid) throw new Error("Assinatura de teste falhou");
  } catch (err) {
    throw new Error(`Validação das chaves falhou: ${err.message}`);
  }
}

function persistAccountBackup(parsed) {
  cachedAccount = {
    routeId: parsed.routeId,
    publicJwk: parsed.publicJwk,
    privateJwk: parsed.privateJwk,
    createdAt: parsed.createdAt || Date.now(),
    importedAt: Date.now(),
  };
  localStorage.setItem(ACCOUNT_STORAGE, JSON.stringify(cachedAccount));
  if (parsed.dmKeypair) cryptoDm.setDmKeypair(parsed.dmKeypair);
  if (parsed.displayName) setDisplayName(parsed.displayName);
  if (parsed.pixKey) setPixKey(parsed.pixKey);
  if (typeof parsed.meshDiscoverable === "boolean") {
    setMeshDiscoverable(parsed.meshDiscoverable);
  }
  return cachedAccount;
}

export async function importAccountBundle(rawBundle, passphrase) {
  const inner = await unwrapIfNeeded(parseBackupRaw(rawBundle), passphrase);
  await assertBackupIdentity(inner);
  await challengeSigningPair(inner);
  return persistAccountBackup(inner);
}

function dropStoredKey(store, key) {
  try {
    store.removeItem(key);
  } catch {}
}

function dropSessionPassphrase() {
  try {
    const ss = globalThis.sessionStorage;
    if (!ss) return;
    for (const key of SESSION_PASSPHRASE_KEYS) dropStoredKey(ss, key);
  } catch {}
}

export function confirmLocalWipe(ask = globalThis.confirm) {
  const prompt = typeof ask === "function" ? ask : () => false;
  return Boolean(prompt(LOCAL_WIPE_NOTICE) && prompt(LOCAL_WIPE_NOTICE));
}

export function wipeLocalAccount() {
  cachedAccount = null;
  for (const key of LOCAL_WIPE_KEYS) dropStoredKey(localStorage, key);
  dropSessionPassphrase();
}


function readVaultMap() {
  try {
    const raw = localStorage.getItem(VAULT_STORAGE);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeVaultMap(map) {
  try {
    localStorage.setItem(VAULT_STORAGE, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

export async function syncActiveAccountToVault() {
  const acc = await ensureLocalAccount();
  if (!acc?.routeId) return null;
  const vault = readVaultMap();
  const existing = vault[acc.routeId] || {};
  const dmKeys = await cryptoDm.getDmKeypair();
  vault[acc.routeId] = {
    ...existing,
    routeId: acc.routeId,
    publicJwk: acc.publicJwk,
    privateJwk: acc.privateJwk,
    dmKeypair: dmKeys || existing.dmKeypair || null,
    displayName: getDisplayName() || existing.displayName || "",
    enrichment: getProfileEnrichment() || existing.enrichment || null,
    pixKey: getPixKey() || existing.pixKey || null,
    meshDiscoverable: getMeshDiscoverable(),
    createdAt: acc.createdAt || existing.createdAt || Date.now(),
    lastUsedAt: Date.now(),
  };
  writeVaultMap(vault);
  return vault[acc.routeId];
}

export function listVaultAccountsSync() {
  const vault = readVaultMap();
  const currentId = getCachedRouteIdSync();
  return Object.values(vault).map((item) => ({
    routeId: item.routeId,
    displayName: item.displayName || "",
    avatarUrl: item.enrichment?.avatarUrl || "",
    bio: item.enrichment?.bio || "",
    createdAt: item.createdAt || 0,
    lastUsedAt: item.lastUsedAt || 0,
    isCurrent: item.routeId === currentId,
  })).sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
}

export async function listVaultAccounts() {
  await syncActiveAccountToVault();
  return listVaultAccountsSync();
}

export async function switchActiveAccount(targetRouteId) {
  if (!targetRouteId) return false;
  await syncActiveAccountToVault();
  const vault = readVaultMap();
  const target = vault[targetRouteId];
  if (!target?.routeId || !target?.publicJwk || !target?.privateJwk) return false;

  cachedAccount = {
    routeId: target.routeId,
    publicJwk: target.publicJwk,
    privateJwk: target.privateJwk,
    createdAt: target.createdAt || Date.now(),
  };
  localStorage.setItem(ACCOUNT_STORAGE, JSON.stringify(cachedAccount));
  if (target.dmKeypair) {
    cryptoDm.setDmKeypair(target.dmKeypair);
  } else {
    await cryptoDm.ensureDmKeys();
  }
  setDisplayName(target.displayName || "");
  if (target.enrichment) {
    localStorage.setItem(ENRICHMENT_STORAGE, JSON.stringify(target.enrichment));
  } else {
    localStorage.removeItem(ENRICHMENT_STORAGE);
  }
  if (target.pixKey) {
    localStorage.setItem(PIX_STORAGE, JSON.stringify(target.pixKey));
  } else {
    localStorage.removeItem(PIX_STORAGE);
  }
  setMeshDiscoverable(Boolean(target.meshDiscoverable));
  target.lastUsedAt = Date.now();
  vault[targetRouteId] = target;
  writeVaultMap(vault);
  return true;
}

export async function createAdditionalAccount({ displayName = "" } = {}) {
  await syncActiveAccountToVault();
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const routeId = await computeRouteId(publicJwk);

  const dmPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"]
  );
  const dmPublicJwk = await crypto.subtle.exportKey("jwk", dmPair.publicKey);
  const dmPrivateJwk = await crypto.subtle.exportKey("jwk", dmPair.privateKey);
  const dmKeypair = { publicKey: dmPublicJwk, privateKey: dmPrivateJwk };

  cachedAccount = { routeId, publicJwk, privateJwk, createdAt: Date.now() };
  localStorage.setItem(ACCOUNT_STORAGE, JSON.stringify(cachedAccount));
  cryptoDm.setDmKeypair(dmKeypair);
  setDisplayName(displayName);
  localStorage.removeItem(ENRICHMENT_STORAGE);
  localStorage.removeItem(PIX_STORAGE);

  await syncActiveAccountToVault();
  return cachedAccount;
}

export function removeVaultAccount(targetRouteId) {
  const currentId = getCachedRouteIdSync();
  if (!targetRouteId || targetRouteId === currentId) return false;
  const vault = readVaultMap();
  if (!vault[targetRouteId]) return false;
  delete vault[targetRouteId];
  writeVaultMap(vault);
  return true;
}
