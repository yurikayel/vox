import * as ans104 from "./ans104.js";

const STORAGE_KEY = "vox-wallet-jwk";
export const WALLET_KIND_PLAIN = "vox-wallet-plain";
export const WALLET_KIND_ENCRYPTED = "vox-wallet-encrypted";
const KDF_ITERATIONS = 100000;

let arweaveInstance = null;
let sessionJwk = null;

async function getArweave() {
  if (arweaveInstance) return arweaveInstance;
  const module = await import("https://esm.sh/arweave@1.15.7");
  const Arweave = module.default || module;
  arweaveInstance = Arweave.init({
    host: "arweave.net",
    port: 443,
    protocol: "https",
    timeout: 20000,
  });
  return arweaveInstance;
}

async function deriveAesKey(passphrase, salt) {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: KDF_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export function isWalletEncrypted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return parsed?.kind === WALLET_KIND_ENCRYPTED;
  } catch {
    return false;
  }
}

export async function encryptStoredWallet(passphrase) {
  const current = getStoredJwk();
  if (!current) throw new Error("Nenhuma carteira encontrada para cifrar");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt);
  const plainBytes = new TextEncoder().encode(JSON.stringify(current));
  const ctBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plainBytes);

  const envelope = {
    kind: WALLET_KIND_ENCRYPTED,
    kdf: "PBKDF2",
    iter: KDF_ITERATIONS,
    salt: ans104.bytesToB64Url(salt),
    iv: ans104.bytesToB64Url(iv),
    ct: ans104.bytesToB64Url(new Uint8Array(ctBuf)),
    savedAt: Date.now(),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  sessionJwk = current;
  return envelope;
}

export async function unlockWallet(passphrase) {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error("Nenhuma carteira armazenada");
  const envelope = JSON.parse(raw);
  if (envelope?.kind !== WALLET_KIND_ENCRYPTED) {
    sessionJwk = envelope;
    return sessionJwk;
  }

  const salt = ans104.b64UrlToBytes(envelope.salt);
  const iv = ans104.b64UrlToBytes(envelope.iv);
  const ct = ans104.b64UrlToBytes(envelope.ct);
  const key = await deriveAesKey(passphrase, salt);

  try {
    const ptBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    sessionJwk = JSON.parse(new TextDecoder().decode(ptBuf));
    return sessionJwk;
  } catch {
    throw new Error("Senha incorreta para decifrar a carteira");
  }
}

export function lockWallet() {
  sessionJwk = null;
}

export function __resetSessionForTests() {
  sessionJwk = null;
}

export function getStoredJwk() {
  if (sessionJwk) return sessionJwk;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.kind === WALLET_KIND_ENCRYPTED) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveJwk(jwk) {
  if (!jwk || typeof jwk !== "object") {
    throw new Error("JWK inválido");
  }
  sessionJwk = jwk;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jwk));
}

export function removeWallet() {
  sessionJwk = null;
  localStorage.removeItem(STORAGE_KEY);
}

export function hasWallet() {
  return Boolean(getStoredJwk());
}

export async function getAddress() {
  const jwk = getStoredJwk();
  if (!jwk) return null;
  return ans104.jwkToAddress(jwk);
}

export async function getBalance(address) {
  if (!address) return "0.000";
  try {
    const arweave = await getArweave();
    const winston = await arweave.wallets.getBalance(address);
    return arweave.ar.winstonToAr(winston);
  } catch {
    return "0.000";
  }
}

export async function generateNewWallet() {
  const pair = await crypto.subtle.generateKey(
    { name: "RSA-PSS", modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const address = await ans104.jwkToAddress(jwk);
  saveJwk(jwk);
  return { jwk, address };
}

export async function ensureWallet() {
  const existing = getStoredJwk();
  if (existing) return existing;
  const { jwk } = await generateNewWallet();
  return jwk;
}
