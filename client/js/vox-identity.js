/**
 * vox-identity.js — Cintura Fina Criptográfica (Thin Waist) da Vox
 *
 * Implementa:
 * 1. Identidade soberana com Ed25519 (assinatura) e X25519 (acordo de chaves);
 * 2. Padrão Wrap/Unwrap: semente em RAM derivada para backup e zerada com seed.fill(0);
 * 3. Chave privada persistida como CryptoKey não-extraível (extractable: false);
 * 4. Cabeçalho binário canônico de 152 bytes determinístico cross-engine;
 * 5. Envelopes assinados com validação de deriva de timestamp (+-10 min) e audience;
 * 6. Solicitação proativa de persistência (navigator.storage.persist).
 */

import * as idbStore from "./idb-store.js";

export const HEADER_SIZE = 152;
export const SENDER_OFFSET = 0;
export const AUDIENCE_OFFSET = 32;
export const TIMESTAMP_OFFSET = 64;
export const NONCE_OFFSET = 72;
export const CAPS_HASH_OFFSET = 88;
export const PAYLOAD_HASH_OFFSET = 120;

export const DRIFT_TOLERANCE_MS = 10 * 60 * 1000; // +-10 minutos
export const IDENTITY_STORAGE_KEY = "vox-identity-v1";
export const BACKUP_ALGO = "PBKDF2-AES-GCM-256";
export const BACKUP_ITERATIONS = 100000;

let cachedIdentity = null;

export function bytesToHex(bytes) {
  if (!bytes) return "";
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let hex = "";
  for (let i = 0; i < arr.length; i++) {
    hex += arr[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export function hexToBytes(hex) {
  if (!hex || typeof hex !== "string") return new Uint8Array(0);
  const clean = hex.length % 2 !== 0 ? `0${hex}` : hex;
  const len = clean.length / 2;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToB64Url(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < arr.length; i++) {
    bin += String.fromCharCode(arr[i]);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64UrlToBytes(b64url) {
  if (!b64url) return new Uint8Array(0);
  const padded = String(b64url).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

export async function computeSha256(data) {
  let bytes;
  if (typeof data === "string") {
    bytes = new TextEncoder().encode(data);
  } else if (data instanceof Uint8Array) {
    bytes = data;
  } else if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else {
    bytes = new TextEncoder().encode(JSON.stringify(data));
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
}

export function buildCanonicalBinaryHeader({
  sender,
  audience,
  timestamp,
  nonce,
  capsHash,
  payloadHash,
}) {
  const header = new Uint8Array(HEADER_SIZE);
  header.set(normalize32Bytes(sender), SENDER_OFFSET);
  header.set(normalize32Bytes(audience), AUDIENCE_OFFSET);

  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const tsBig = BigInt(Math.max(0, Math.floor(Number(timestamp || Date.now()))));
  view.setBigUint64(TIMESTAMP_OFFSET, tsBig, false); // Big-Endian

  header.set(normalize16Bytes(nonce), NONCE_OFFSET);
  header.set(normalize32Bytes(capsHash), CAPS_HASH_OFFSET);
  header.set(normalize32Bytes(payloadHash), PAYLOAD_HASH_OFFSET);
  return header;
}

function normalize32Bytes(input) {
  if (input instanceof Uint8Array && input.byteLength === 32) return input;
  if (typeof input === "string") {
    const raw = hexToBytes(input);
    if (raw.byteLength === 32) return raw;
  }
  const out = new Uint8Array(32);
  if (input) {
    const src = input instanceof Uint8Array ? input : new TextEncoder().encode(String(input));
    out.set(src.slice(0, 32));
  }
  return out;
}

function normalize16Bytes(input) {
  if (input instanceof Uint8Array && input.byteLength === 16) return input;
  if (typeof input === "string") {
    const raw = hexToBytes(input);
    if (raw.byteLength === 16) return raw;
  }
  const out = new Uint8Array(16);
  if (input) {
    const src = input instanceof Uint8Array ? input : new TextEncoder().encode(String(input));
    out.set(src.slice(0, 16));
  } else {
    crypto.getRandomValues(out);
  }
  return out;
}

export function parseCanonicalBinaryHeader(headerBytes) {
  if (!headerBytes || headerBytes.byteLength !== HEADER_SIZE) {
    throw new Error(`Cabeçalho binário inválido: esperado ${HEADER_SIZE} bytes`);
  }
  const arr = headerBytes instanceof Uint8Array ? headerBytes : new Uint8Array(headerBytes);
  const view = new DataView(arr.buffer, arr.byteOffset, arr.byteLength);

  return {
    sender: arr.slice(SENDER_OFFSET, SENDER_OFFSET + 32),
    audience: arr.slice(AUDIENCE_OFFSET, AUDIENCE_OFFSET + 32),
    timestamp: Number(view.getBigUint64(TIMESTAMP_OFFSET, false)),
    nonce: arr.slice(NONCE_OFFSET, NONCE_OFFSET + 16),
    capsHash: arr.slice(CAPS_HASH_OFFSET, CAPS_HASH_OFFSET + 32),
    payloadHash: arr.slice(PAYLOAD_HASH_OFFSET, PAYLOAD_HASH_OFFSET + 32),
  };
}

export function validateHeaderTimestamp(
  headerBytes,
  now = Date.now(),
  driftToleranceMs = DRIFT_TOLERANCE_MS
) {
  const { timestamp } = parseCanonicalBinaryHeader(headerBytes);
  const driftMs = Math.abs(now - timestamp);
  return {
    valid: driftMs <= driftToleranceMs,
    timestamp,
    driftMs,
  };
}

export async function deriveBackupKey(passphrase, salt) {
  const enc = new TextEncoder().encode(passphrase);
  const baseKey = await crypto.subtle.importKey("raw", enc, "PBKDF2", false, ["deriveKey"]);
  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: BACKUP_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptSeedBackup(seed, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveBackupKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, seed);
  return {
    algo: BACKUP_ALGO,
    iterations: BACKUP_ITERATIONS,
    salt: bytesToHex(salt),
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(new Uint8Array(ciphertext)),
  };
}

export async function decryptSeedBackup(bundle, passphrase) {
  const salt = hexToBytes(bundle.salt);
  const iv = hexToBytes(bundle.iv);
  const ciphertext = hexToBytes(bundle.ciphertext);
  const key = await deriveBackupKey(passphrase, salt);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new Uint8Array(decrypted);
}

async function generateKeyPairBundle() {
  const signPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const rawPublic = new Uint8Array(await crypto.subtle.exportKey("raw", signPair.publicKey));
  const pkcs8Private = await crypto.subtle.exportKey("pkcs8", signPair.privateKey);

  const nonExtractablePrivate = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8Private,
    { name: "Ed25519" },
    false,
    ["sign"]
  );

  const agreePair = await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveKey", "deriveBits"]);
  const rawAgreePublic = new Uint8Array(await crypto.subtle.exportKey("raw", agreePair.publicKey));

  return { signPair, rawPublic, nonExtractablePrivate, agreePair, rawAgreePublic };
}

export async function generateIdentity({ passphrase = null, persist = true } = {}) {
  const seed = crypto.getRandomValues(new Uint8Array(32));
  const backupBundle = passphrase ? await encryptSeedBackup(seed, passphrase) : null;
  const keys = await generateKeyPairBundle();

  seed.fill(0); // Limpa semente em RAM imediatamente

  const identity = {
    routeId: `vx_ed25519_${bytesToHex(keys.rawPublic).slice(0, 16)}`,
    rawPublicKey: keys.rawPublic,
    rawAgreementPublicKey: keys.rawAgreePublic,
    publicKey: keys.signPair.publicKey,
    privateKey: keys.nonExtractablePrivate,
    agreementPublicKey: keys.agreePair.publicKey,
    agreementPrivateKey: keys.agreePair.privateKey,
    backupBundle,
    isExtractable: false,
    createdAt: Date.now(),
  };

  cachedIdentity = identity;
  if (persist) await persistIdentity(identity);
  return identity;
}

export async function persistIdentity(identity) {
  try {
    const meta = {
      routeId: identity.routeId,
      rawPublicKey: bytesToHex(identity.rawPublicKey),
      rawAgreementPublicKey: bytesToHex(identity.rawAgreementPublicKey),
      backupBundle: identity.backupBundle,
      createdAt: identity.createdAt,
    };
    await idbStore.setKeyValue(IDENTITY_STORAGE_KEY, meta);
  } catch (err) {
    console.warn("Aviso ao persistir identidade no idbStore:", err);
  }
}

export async function signCanonicalHeader(privateKey, headerBuffer) {
  if (!headerBuffer || headerBuffer.byteLength !== HEADER_SIZE) {
    throw new Error(`Buffer deve ter exatamente ${HEADER_SIZE} bytes`);
  }
  const sig = await crypto.subtle.sign({ name: "Ed25519" }, privateKey, headerBuffer);
  return new Uint8Array(sig);
}

export async function verifyCanonicalHeader(publicKey, signature, headerBuffer) {
  if (!headerBuffer || headerBuffer.byteLength !== HEADER_SIZE) return false;
  if (!signature || signature.byteLength !== 64) return false;
  try {
    return await crypto.subtle.verify({ name: "Ed25519" }, publicKey, signature, headerBuffer);
  } catch {
    return false;
  }
}

export function canonicalizePayload(payload) {
  if (payload instanceof Uint8Array) {
    return { serialized: bytesToB64Url(payload), bytes: payload, isBinary: true };
  }
  if (typeof payload === "string") {
    return { serialized: payload, bytes: new TextEncoder().encode(payload), isBinary: false };
  }
  const str = JSON.stringify(payload);
  return { serialized: str, bytes: new TextEncoder().encode(str), isBinary: false };
}

function formatEnvelopePayloadBytes(payload, isBinary) {
  if (isBinary) return b64UrlToBytes(payload);
  if (typeof payload === "string") return new TextEncoder().encode(payload);
  return new TextEncoder().encode(JSON.stringify(payload));
}

function assembleEnvelopeObject(identity, parsed, docId, caps, serializedPayload, isBinary, sig) {
  return {
    version: 1,
    sender: bytesToHex(identity.rawPublicKey),
    audience: bytesToHex(parsed.audience),
    documentId: String(docId || ""),
    timestamp: parsed.timestamp,
    nonce: bytesToHex(parsed.nonce),
    capabilityChain: caps,
    payload: serializedPayload,
    isBinary: Boolean(isBinary),
    sig: bytesToHex(sig),
  };
}

export async function buildSignedEnvelope({
  identity,
  audience,
  documentId,
  capabilityChain = [],
  payload,
  timestamp = Date.now(),
  nonce = null,
}) {
  const capsHash = await computeSha256(capabilityChain);
  const { serialized, bytes, isBinary } = canonicalizePayload(payload);
  const payloadHash = await computeSha256(bytes);

  const header = buildCanonicalBinaryHeader({
    sender: identity.rawPublicKey,
    audience,
    timestamp,
    nonce,
    capsHash,
    payloadHash,
  });

  const sig = await signCanonicalHeader(identity.privateKey, header);
  const parsed = parseCanonicalBinaryHeader(header);
  return assembleEnvelopeObject(identity, parsed, documentId, capabilityChain, serialized, isBinary, sig);
}

async function reconstructHeaderFromEnvelope(envelope) {
  const capsHash = await computeSha256(envelope.capabilityChain || []);
  const payloadBytes = formatEnvelopePayloadBytes(envelope.payload, envelope.isBinary);
  const payloadHash = await computeSha256(payloadBytes);

  return buildCanonicalBinaryHeader({
    sender: hexToBytes(envelope.sender),
    audience: hexToBytes(envelope.audience),
    timestamp: envelope.timestamp,
    nonce: hexToBytes(envelope.nonce),
    capsHash,
    payloadHash,
  });
}

export async function verifySignedEnvelope(
  envelope,
  publicKey,
  { now = Date.now(), driftToleranceMs = DRIFT_TOLERANCE_MS } = {}
) {
  if (!envelope?.sender || !envelope?.sig) {
    return { valid: false, error: "Envelope malformado" };
  }

  const drift = Math.abs(now - Number(envelope.timestamp || 0));
  if (drift > driftToleranceMs) {
    return { valid: false, error: `Deriva de timestamp excedida (${drift}ms > ${driftToleranceMs}ms)` };
  }

  const reconstructedHeader = await reconstructHeaderFromEnvelope(envelope);
  const sigBytes = hexToBytes(envelope.sig);
  const valid = await verifyCanonicalHeader(publicKey, sigBytes, reconstructedHeader);
  return {
    valid,
    error: valid ? null : "Assinatura Ed25519 inválida para o cabeçalho canônico",
    header: valid ? parseCanonicalBinaryHeader(reconstructedHeader) : null,
  };
}

export async function requestStoragePersistence() {
  if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.persist) {
    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }
  return false;
}

export function getCachedIdentity() {
  if (!cachedIdentity) return null;
  return Object.freeze({
    routeId: cachedIdentity.routeId,
    publicKeyHex: cachedIdentity.publicKeyHex,
    agreementPublicKeyHex: cachedIdentity.agreementPublicKeyHex,
    isExtractable: Boolean(cachedIdentity.isExtractable),
    createdAt: cachedIdentity.createdAt,
  });
}

export function resetIdentityCacheForTesting() {
  cachedIdentity = null;
}
