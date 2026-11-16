/**
 * @file PM-90 — formato do cofre de recuperação.
 *
 * v2 (atual): a chave AES-GCM sai só da Senha Soberana, por PBKDF2-SHA256 com 600 mil iterações e
 * sal aleatório guardado no envelope. O endereço remoto também sai da senha, pelo mesmo custo, para
 * que achar o cofre exija o mesmo trabalho que abri-lo. Nenhum dado de login social entra na chave.
 *
 * v1 (legado, só leitura): mantido para abrir links e cofres antigos uma última vez e migrar.
 */

import { b64UrlToBytes, bytesToB64Url } from "./signed-verify.js";

export const VAULT_V2_ITERATIONS = 600_000;
const MIN_ITERATIONS = 100_000;
const MAX_ITERATIONS = 5_000_000;
const ADDRESS_SALT = "vox-vault-v2:endereco";
const OWNER_SALT = "vox-vault-v2:dono";
const LEGACY_ITERATIONS = 50_000;

/**
 * Normaliza o e-mail usado no cofre (NFC, sem espaços nas pontas e em minúsculas).
 * @param {string} [email]
 * @returns {string}
 */
export function normalizeVaultEmail(email = "") {
  return String(email || "").normalize("NFC").trim().toLowerCase();
}

/**
 * Combina e-mail normalizado e senha (`email:senha`), ou só a senha quando não há e-mail.
 * @param {string} passphrase
 * @param {string} [email]
 * @returns {string}
 */
export function buildVaultSecret(passphrase, email = "") {
  const cleanPass = String(passphrase || "").trim();
  const normEmail = normalizeVaultEmail(email);
  return normEmail ? `${normEmail}:${cleanPass}` : cleanPass;
}

export function bufferToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes(hex) {
  const clean = String(hex || "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  return bytes;
}

const utf8 = (text) => new TextEncoder().encode(String(text));

async function pbkdf2Base(secret) {
  return crypto.subtle.importKey("raw", utf8(secret), "PBKDF2", false, ["deriveBits", "deriveKey"]);
}

async function deriveAesKey(secret, saltBytes, iterations) {
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBytes, iterations, hash: "SHA-256" },
    await pbkdf2Base(secret),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function deriveFromPassphrase(passphrase, salt) {
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: utf8(salt), iterations: VAULT_V2_ITERATIONS, hash: "SHA-256" },
    await pbkdf2Base(passphrase),
    256
  );
  return bufferToHex(bits);
}

/**
 * Endereço do cofre v2 no servidor de memória: custa tanto quanto derivar a chave.
 * @param {string} passphrase
 * @param {string} [email]
 * @returns {Promise<string>}
 */
export function deriveVaultAddress(passphrase, email = "") {
  return deriveFromPassphrase(buildVaultSecret(passphrase, email), ADDRESS_SALT);
}

/**
 * PM-94: prova do dono do cofre. O servidor guarda só o SHA-256 dela e passa a exigir a mesma prova para
 * regravar. Sai da senha com outro sal, então não dá para tirá-la do endereço, que é público.
 * @param {string} passphrase
 * @param {string} [email]
 * @returns {Promise<string>}
 */
export function deriveVaultOwnerToken(passphrase, email = "") {
  return deriveFromPassphrase(buildVaultSecret(passphrase, email), OWNER_SALT);
}

/**
 * Cifra o pacote da conta no formato v2 (PBKDF2-SHA256 + AES-GCM).
 * @param {object} bundle
 * @param {string} passphrase
 * @param {number} [iterations]
 * @param {string} [email]
 * @returns {Promise<object>}
 */
export async function encryptVaultV2(bundle, passphrase, iterations = VAULT_V2_ITERATIONS, email = "") {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(buildVaultSecret(passphrase, email), salt, iterations);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, utf8(JSON.stringify(bundle)));
  return {
    v: 2,
    kdf: "pbkdf2-sha256",
    iter: iterations,
    salt: bufferToHex(salt),
    iv: bufferToHex(iv),
    ciphertext: bufferToHex(ciphertext),
    updatedAt: Date.now(),
  };
}

async function decryptWithKey(record, key) {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: hexToBytes(record.iv) }, key, hexToBytes(record.ciphertext));
  return JSON.parse(new TextDecoder().decode(plain));
}

export function isV2Record(record) {
  const iter = Number(record?.iter);
  return record?.v === 2 && Boolean(record.salt) && iter >= MIN_ITERATIONS && iter <= MAX_ITERATIONS;
}

/** Cofre que o dono revogou (marca gravada por cima do registro antigo). */
export function isRevokedRecord(record) {
  return Boolean(record?.revoked);
}

async function decryptV2Record(record, passphrase, email) {
  const salt = hexToBytes(record.salt);
  const iter = Number(record.iter);
  const secret = buildVaultSecret(passphrase, email);
  try {
    return await decryptWithKey(record, await deriveAesKey(secret, salt, iter));
  } catch (err) {
    if (!normalizeVaultEmail(email)) throw err;
    const pure = String(passphrase || "").trim();
    return decryptWithKey(record, await deriveAesKey(pure, salt, iter));
  }
}

/**
 * Abre um cofre por senha (e e-mail, se informado): v2 (com fallback só-senha), ou v1 de senha.
 * @param {object} record
 * @param {string} passphrase
 * @param {string} [email]
 * @returns {Promise<object|null>}
 */
export async function decryptVaultRecord(record, passphrase, email = "") {
  if (!record?.iv || !record?.ciphertext || isRevokedRecord(record)) return null;
  if (record.v === 2 && !isV2Record(record)) return null;
  if (isV2Record(record)) return decryptV2Record(record, passphrase, email);
  return decryptWithKey(record, await deriveLegacyKey(passphrase, "passphrase"));
}

// ---- v1 (legado): endereço e chave saíam do próprio segredo. Só leitura e revogação. ----

export async function legacyLookupKey(secret, provider) {
  return bufferToHex(await crypto.subtle.digest("SHA-256", utf8(`vox-vault-v1:${provider}:${secret}`)));
}

export async function deriveLegacyKey(secret, provider) {
  return deriveAesKey(secret, utf8(`vox-sovereign-vault:${provider}:${secret}`), LEGACY_ITERATIONS);
}

export async function decryptLegacyRecord(record, secret, provider) {
  if (!record?.iv || !record?.ciphertext || isRevokedRecord(record) || record.v === 2) return null;
  return decryptWithKey(record, await deriveLegacyKey(secret, provider));
}

// ---- Link e QR de sincronização (`#/sync?b=`) ----

const toBase64Url = (text) => btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// `v2.` + base64url de [versão 1][iter 4][len 1][sal 16][len 1][iv 12][cifra + etiqueta GCM 16].
const COMPACT_V2_OVERHEAD = 1 + 4 + 1 + 16 + 1 + 12 + 16;

/**
 * Quantos bytes de texto (JSON em UTF-8) cabem num cofre v2 compacto de até `maxEncodedChars` caracteres.
 * @param {number} maxEncodedChars
 * @returns {number}
 */
export function compactV2PlainBudget(maxEncodedChars) {
  return Math.floor(((maxEncodedChars - 3) * 3) / 4) - COMPACT_V2_OVERHEAD;
}

function packCompactV2(record) {
  const salt = hexToBytes(record.salt);
  const iv = hexToBytes(record.iv);
  const ct = hexToBytes(record.ciphertext);
  const out = new Uint8Array(7 + salt.length + iv.length + ct.length);
  new DataView(out.buffer).setUint32(1, Number(record.iter));
  out[0] = 2;
  out[5] = salt.length;
  out.set(salt, 6);
  out[6 + salt.length] = iv.length;
  out.set(iv, 7 + salt.length);
  out.set(ct, 7 + salt.length + iv.length);
  return `v2.${bytesToB64Url(out)}`;
}

function unpackCompactV2(encoded) {
  const bytes = b64UrlToBytes(encoded.slice(3));
  if (bytes.length < 20 || bytes[0] !== 2) return null;
  const iter = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(1);
  const saltLen = bytes[5];
  const ivPos = 7 + saltLen;
  if (ivPos > bytes.length) return null;
  const ivLen = bytes[6 + saltLen];
  const ctPos = ivPos + ivLen;
  if (ctPos >= bytes.length) return null;
  return {
    v: 2,
    kdf: "pbkdf2-sha256",
    iter,
    salt: bufferToHex(bytes.subarray(6, 6 + saltLen)),
    iv: bufferToHex(bytes.subarray(ivPos, ctPos)),
    ciphertext: bufferToHex(bytes.subarray(ctPos)),
  };
}

/**
 * Codifica o cofre cifrado para link `#/sync?b=…` (binário compacto v2. ou legado).
 * @param {object} record
 * @returns {string}
 */
export function encodeVaultBundleForUrl(record) {
  if (!record?.iv || !record?.ciphertext) return "";
  if (isV2Record(record)) return packCompactV2(record);
  return toBase64Url([record.iv, record.ciphertext].join(":"));
}

function recordFromUrlParts(parts) {
  if (parts.length === 2) return { iv: parts[0], ciphertext: parts[1] };
  if (parts.length !== 5 || parts[0] !== "2") return null;
  const [, iter, salt, iv, ciphertext] = parts;
  return { v: 2, kdf: "pbkdf2-sha256", iter: Number(iter), salt, iv, ciphertext };
}

/**
 * Decodifica o cofre cifrado de `#/sync?b=…` (aceita v2. compacto, v2 textual e v1 legado).
 * @param {string} encoded
 * @returns {object|null}
 */
export function decodeVaultBundleFromUrl(encoded) {
  if (!encoded) return null;
  try {
    const raw = String(encoded);
    const record = raw.startsWith("v2.") ? unpackCompactV2(raw) : recordFromUrlParts(atob(raw.replace(/-/g, "+").replace(/_/g, "/")).split(":"));
    if (!record?.iv || !record?.ciphertext) return null;
    if (record.v === 2 && !isV2Record(record)) return null;
    return { ...record, updatedAt: Date.now() };
  } catch {
    return null;
  }
}
