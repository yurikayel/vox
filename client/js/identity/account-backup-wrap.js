/**
 * Envelope opcional de senha para o arquivo de soberania (AES-GCM + PBKDF2).
 * Plaintext permanece kind vox-account-backup; cifrado usa vox-account-backup-wrapped.
 */

/** `kind` do arquivo de soberania em claro. */
export const KIND_PLAIN = "vox-account-backup";
/** `kind` do arquivo de soberania cifrado por senha. */
export const KIND_WRAPPED = "vox-account-backup-wrapped";
const WRAP_ITER = 210000;

/**
 * Codifica bytes em base64url (sem preenchimento).
 *
 * @param {ArrayBuffer|Uint8Array} bytes
 * @returns {string}
 */
function bytesToB64Url(bytes) {
  let bin = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) {
    bin += String.fromCharCode(arr[i]);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Decodifica base64url para bytes.
 *
 * @param {string} b64url
 * @returns {Uint8Array}
 */
function b64UrlToBytes(b64url) {
  let padded = String(b64url).replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4;
  if (pad) padded += "=".repeat(4 - pad);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

/**
 * Exige senha não vazia; lança com `emptyMsg` quando falta.
 *
 * @param {string} passphrase
 * @param {string} emptyMsg
 * @returns {string}
 */
function requireSecret(passphrase, emptyMsg) {
  const secret = String(passphrase || "");
  if (!secret) throw new Error(emptyMsg);
  return secret;
}

/**
 * Valida o número de iterações do PBKDF2 vindo do arquivo; fora do intervalo seguro volta ao padrão.
 *
 * @param {number|string} raw
 * @returns {number}
 */
function wrapIterations(raw) {
  const n = Number(raw) || WRAP_ITER;
  if (n < 10000 || n > 1000000) return WRAP_ITER;
  return n;
}

/**
 * Deriva a chave AES-GCM de embrulho a partir da senha e do sal.
 *
 * @param {string} passphrase
 * @param {Uint8Array} salt
 * @param {string[]} usages
 * @param {number} iterations
 * @returns {Promise<CryptoKey>}
 */
async function deriveWrapKey(passphrase, salt, usages, iterations) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usages
  );
}

/**
 * Cifra o arquivo de soberania com uma senha (PBKDF2-SHA256 + AES-GCM-256).
 * @param {object} plainObj arquivo em claro (`kind: KIND_PLAIN`)
 * @param {string} passphrase senha escolhida pela pessoa
 * @returns {Promise<object>} envelope `kind: KIND_WRAPPED`
 */
export async function wrapBackup(plainObj, passphrase) {
  const secret = requireSecret(passphrase, "Informe uma senha para cifrar o arquivo");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveWrapKey(secret, salt, ["encrypt"], WRAP_ITER);
  const pt = new TextEncoder().encode(JSON.stringify(plainObj));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, pt);
  return {
    voxVersion: 1,
    kind: KIND_WRAPPED,
    alg: "AES-GCM",
    kdf: "PBKDF2",
    hash: "SHA-256",
    iter: WRAP_ITER,
    salt: bytesToB64Url(salt),
    iv: bytesToB64Url(iv),
    ct: bytesToB64Url(ct),
    routeId: plainObj.routeId || "",
    exportedAt: Date.now(),
  };
}

/**
 * Confere que o envelope tem tipo, texto cifrado, sal e IV; lança se estiver incompatível.
 *
 * @param {object} env
 */
function assertWrappedShape(env) {
  if (env?.kind !== KIND_WRAPPED || !env.ct || !env.salt || !env.iv) {
    throw new Error("Backup incompatível ou corrompido");
  }
}

/**
 * Decifra o envelope de backup com a senha e devolve os bytes internos.
 *
 * @param {object} env
 * @param {string} passphrase
 * @returns {Promise<Uint8Array>}
 */
async function decryptWrappedBytes(env, passphrase) {
  const secret = requireSecret(passphrase, "Este arquivo está cifrado — informe a senha");
  try {
    const key = await deriveWrapKey(
      secret,
      b64UrlToBytes(env.salt),
      ["decrypt"],
      wrapIterations(env.iter)
    );
    return await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64UrlToBytes(env.iv) },
      key,
      b64UrlToBytes(env.ct)
    );
  } catch {
    throw new Error("Senha incorreta ou arquivo corrompido");
  }
}

/**
 * Interpreta os bytes decifrados como o JSON do backup; lança se estiver corrompido.
 *
 * @param {Uint8Array} bytes
 * @returns {object}
 */
function parseInnerPlain(bytes) {
  let inner;
  try {
    inner = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("Backup incompatível ou corrompido");
  }
  if (inner?.kind !== KIND_PLAIN) throw new Error("Backup incompatível ou corrompido");
  return inner;
}

/**
 * Abre um arquivo de soberania cifrado por senha.
 * @param {object} env envelope `kind: KIND_WRAPPED`
 * @param {string} passphrase senha usada ao cifrar
 * @returns {Promise<object>} arquivo em claro
 * @throws {Error} formato inválido ou senha incorreta
 */
export async function unwrapBackup(env, passphrase) {
  assertWrappedShape(env);
  const pt = await decryptWrappedBytes(env, passphrase);
  return parseInnerPlain(pt);
}

/**
 * Lê o `kind` de um arquivo de soberania sem abri-lo.
 * @param {string|object} raw texto do arquivo ou objeto já lido
 * @returns {string} o `kind`, ou "" se não for JSON
 */
export function peekBackupKind(raw) {
  if (raw && typeof raw === "object") return raw.kind || "";
  try {
    return JSON.parse(String(raw || ""))?.kind || "";
  } catch {
    return "";
  }
}
