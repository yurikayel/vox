/**
 * @file PM-93 etapa 2 — trava das chaves depois do backup com a Senha Soberana.
 *
 * Antes do primeiro backup, a chave privada fica cifrada pela chave do aparelho (`keystore.js`). Depois dele:
 * - assinatura (ECDSA) e DM (ECDH) usam `CryptoKey` **não exportável**, guardada no IndexedDB;
 * - no `localStorage` fica só uma referência travada (`{ locked, kid }`) no lugar da chave;
 * - a única cópia exportável é a cifrada pela senha (`vox-locked-keys-v1`, formato do cofre v2), aberta só para
 *   fazer outro backup.
 *
 * Ordem segura: chave gravada e testada no IndexedDB, depois a cópia por senha, e só então quem chama troca a
 * chave pela referência. Qualquer falha antes disso deixa tudo como estava.
 */

import { KeyLockedError, KeystoreUnavailableError, LOCKED_TAG, isLocked, loadKey, openSealed, removeKey, storeKey } from "./keystore.js";
import { decryptVaultRecord, encryptVaultV2 } from "./vault-crypto.js";

const LOCKED_COPIES = "vox-locked-keys-v1";
/** Mesmo mínimo do cofre (`VAULT_PASSPHRASE_MIN`): senha curta não trava nada. */
export const LOCK_MIN_PASSPHRASE = 12;

const ECDSA = { name: "ECDSA", namedCurve: "P-256" };
const ECDH = { name: "ECDH", namedCurve: "P-256" };
const sessionKeys = new Map();

const signKid = (routeId) => `sign:${routeId}`;
const dmKid = (routeId) => `dm:${routeId}`;
const lockedRef = (kid) => ({ locked: LOCKED_TAG, kid });

function readCopies() {
  try {
    const raw = localStorage.getItem(LOCKED_COPIES);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeCopies(map) {
  localStorage.setItem(LOCKED_COPIES, JSON.stringify(map));
}

async function keyFor(atRest, algo, usages) {
  if (!isLocked(atRest)) return crypto.subtle.importKey("jwk", await openSealed(atRest), algo, false, usages);
  if (!sessionKeys.has(atRest.kid)) {
    const key = await loadKey(atRest.kid).catch(() => null);
    if (!key) throw new KeystoreUnavailableError();
    sessionKeys.set(atRest.kid, key);
  }
  return sessionKeys.get(atRest.kid);
}

/** Chave de assinatura para uso, a partir do que está guardado (cifrado, em claro ou travado). */
export function signingKey(atRest) {
  return keyFor(atRest, ECDSA, ["sign"]);
}

/** Chave privada de DM para uso, a partir do que está guardado. */
export function dmPrivateKey(atRest) {
  return keyFor(atRest, ECDH, ["deriveKey"]);
}

async function signsForPublicKey(key, publicJwk) {
  const nonce = crypto.getRandomValues(new Uint8Array(32));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, nonce);
  const pub = await crypto.subtle.importKey("jwk", publicJwk, ECDSA, false, ["verify"]);
  return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, sig, nonce);
}

async function storeSigningKey(routeId, publicJwk, privateJwk) {
  const key = await crypto.subtle.importKey("jwk", privateJwk, ECDSA, false, ["sign"]);
  const stored = await storeKey(signKid(routeId), key);
  return stored && (await signsForPublicKey(stored, publicJwk)) ? signKid(routeId) : null;
}

async function storeDmKey(routeId, dmKeypair) {
  if (!dmKeypair?.privateJwk) return null;
  const key = await crypto.subtle.importKey("jwk", dmKeypair.privateJwk, ECDH, false, ["deriveKey"]);
  return (await storeKey(dmKid(routeId), key)) ? dmKid(routeId) : null;
}

/**
 * Trava as chaves de uma conta. Recebe as chaves abertas e a Senha Soberana; devolve as referências que
 * substituem as chaves guardadas, ou null se este aparelho não consegue travar (sem IndexedDB, senha curta).
 */
export async function lockKeys({ routeId, publicJwk, privateJwk, dmKeypair }, passphrase) {
  const secret = String(passphrase || "").trim();
  if (!routeId || !privateJwk || secret.length < LOCK_MIN_PASSPHRASE) return null;
  const signId = await storeSigningKey(routeId, publicJwk, privateJwk).catch(() => null);
  if (!signId) return null;
  const dmId = await storeDmKey(routeId, dmKeypair).catch(() => null);
  const copy = await encryptVaultV2({ routeId, privateJwk, dmKeypair: dmId ? dmKeypair : null }, secret);
  writeCopies({ ...readCopies(), [routeId]: copy });
  sessionKeys.delete(signId);
  if (dmId) sessionKeys.delete(dmId);
  return { privateJwk: lockedRef(signId), dmPrivateJwk: dmId ? lockedRef(dmId) : null };
}

/** Abre a cópia exportável de uma conta travada. Só a Senha Soberana que travou abre. */
export async function openLockedCopy(routeId, passphrase) {
  const secret = String(passphrase || "").trim();
  if (!secret) throw new KeyLockedError();
  const record = readCopies()[routeId];
  if (!record) {
    throw new KeyLockedError("A cópia travada desta conta não está neste aparelho. Restaure pelo cofre ou pelo arquivo .voxid.");
  }
  try {
    return await decryptVaultRecord(record, secret);
  } catch {
    throw new KeyLockedError("Senha incorreta. Use a Senha Soberana com que esta conta foi travada.");
  }
}

/** Apaga a cópia por senha e as chaves não exportáveis de uma conta. */
export async function forgetLockedAccount(routeId) {
  const copies = readCopies();
  if (copies[routeId]) {
    delete copies[routeId];
    writeCopies(copies);
  }
  for (const kid of [signKid(routeId), dmKid(routeId)]) {
    sessionKeys.delete(kid);
    await removeKey(kid).catch(() => {});
  }
}

/** Limpeza local: esquece todas as contas travadas deste aparelho. */
export async function forgetAllLockedAccounts() {
  const ids = Object.keys(readCopies());
  try {
    localStorage.removeItem(LOCKED_COPIES);
  } catch {
    /* ignore */
  }
  await Promise.all(ids.map((id) => forgetLockedAccount(id)));
}

export function __resetKeyLockForTests() {
  sessionKeys.clear();
}
