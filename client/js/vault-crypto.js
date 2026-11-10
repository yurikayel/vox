/**
 * @file PM-90 — formato do cofre de recuperação.
 *
 * v2 (atual): a chave AES-GCM sai só da Senha Soberana, por PBKDF2-SHA256 com 600 mil iterações e
 * sal aleatório guardado no envelope. O endereço remoto também sai da senha, pelo mesmo custo, para
 * que achar o cofre exija o mesmo trabalho que abri-lo. Nenhum dado de login social entra na chave.
 *
 * v1 (legado, só leitura): mantido para abrir links e cofres antigos uma última vez e migrar.
 */

export const VAULT_V2_ITERATIONS = 600_000;
const MIN_ITERATIONS = 100_000;
const MAX_ITERATIONS = 5_000_000;
const ADDRESS_SALT = "vox-vault-v2:endereco";
const OWNER_SALT = "vox-vault-v2:dono";
const LEGACY_ITERATIONS = 50_000;

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

/** Endereço do cofre v2 no servidor de memória: custa tanto quanto derivar a chave. */
export function deriveVaultAddress(passphrase) {
  return deriveFromPassphrase(passphrase, ADDRESS_SALT);
}

/**
 * PM-94: prova do dono do cofre. O servidor guarda só o SHA-256 dela e passa a exigir a mesma prova para
 * regravar. Sai da senha com outro sal, então não dá para tirá-la do endereço, que é público.
 */
export function deriveVaultOwnerToken(passphrase) {
  return deriveFromPassphrase(passphrase, OWNER_SALT);
}

export async function encryptVaultV2(bundle, passphrase, iterations = VAULT_V2_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt, iterations);
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

/** Abre um cofre por senha: v2, ou v1 de senha (legado). Lança erro se a senha não confere. */
export async function decryptVaultRecord(record, passphrase) {
  if (!record?.iv || !record?.ciphertext || isRevokedRecord(record)) return null;
  if (record.v === 2 && !isV2Record(record)) return null;
  const key = isV2Record(record)
    ? await deriveAesKey(passphrase, hexToBytes(record.salt), Number(record.iter))
    : await deriveLegacyKey(passphrase, "passphrase");
  return decryptWithKey(record, key);
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

export function encodeVaultBundleForUrl(record) {
  if (!record?.iv || !record?.ciphertext) return "";
  const parts = isV2Record(record)
    ? ["2", record.iter, record.salt, record.iv, record.ciphertext]
    : [record.iv, record.ciphertext];
  return toBase64Url(parts.join(":"));
}

function recordFromUrlParts(parts) {
  if (parts.length === 2) return { iv: parts[0], ciphertext: parts[1] };
  if (parts.length !== 5 || parts[0] !== "2") return null;
  const [, iter, salt, iv, ciphertext] = parts;
  return { v: 2, kdf: "pbkdf2-sha256", iter: Number(iter), salt, iv, ciphertext };
}

export function decodeVaultBundleFromUrl(encoded) {
  if (!encoded) return null;
  try {
    const parts = atob(encoded.replace(/-/g, "+").replace(/_/g, "/")).split(":");
    const record = recordFromUrlParts(parts);
    if (!record?.iv || !record?.ciphertext) return null;
    if (record.v === 2 && !isV2Record(record)) return null;
    return { ...record, updatedAt: Date.now() };
  } catch {
    return null;
  }
}
