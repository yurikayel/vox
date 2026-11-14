/**
 * @file ADR-032 §3.3 — a semente de onde nascem as chaves das contas novas, guardada por `routeId`.
 *
 * - **Conta destravada:** a semente fica cifrada pela chave do aparelho (`keystore.sealJson`), como a chave privada.
 * - **Conta travada (ADR-026):** a semente entra na cópia cifrada pela Senha Soberana (`key-lock.js`) e aqui fica só
 *   a marca `{ locked }`. Assim continua valendo que a única cópia exportável é a da senha.
 * - **Sem semente** (conta de antes do ADR-032, ou restaurada por cofre ou `.voxid`): a frase é a de 24 palavras,
 *   tirada da própria chave de assinatura.
 */

import { LOCKED_TAG, isLocked, openSealed, sealJson } from "./keystore.js";
import * as keyLock from "./key-lock.js";
import { identityFromSeed, newSeed } from "./recovery-phrase.js";
import { bytesToB64Url, computeRouteId } from "./signed-verify.js";

/** Chave do `localStorage` com as sementes deste aparelho (entra na limpeza local). */
export const SEED_STORAGE = "vox-identity-seed-v1";

const fromB64url = (s) => Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

function readSeeds() {
  try {
    return JSON.parse(localStorage.getItem(SEED_STORAGE) || "{}") || {};
  } catch {
    return {};
  }
}

function writeSeed(routeId, value) {
  const map = readSeeds();
  if (value == null) delete map[routeId];
  else map[routeId] = value;
  localStorage.setItem(SEED_STORAGE, JSON.stringify(map));
}

/**
 * Guarda a semente de uma conta, cifrada pela chave do aparelho.
 * @param {string} routeId
 * @param {Uint8Array} seed
 */
export async function storeSeed(routeId, seed) {
  writeSeed(routeId, await sealJson({ seed: bytesToB64Url(seed) }));
}

/**
 * Conta nova a partir de uma semente sorteada agora; a semente já fica guardada.
 * @returns {Promise<{ routeId: string, publicJwk: object, privateJwk: object, dmKeypair: object }>}
 */
export async function createSeededAccount() {
  const seed = newSeed();
  const { signing, dm } = await identityFromSeed(seed);
  const routeId = await computeRouteId(signing.publicJwk);
  await storeSeed(routeId, seed);
  return { routeId, publicJwk: signing.publicJwk, privateJwk: signing.privateJwk, dmKeypair: dm };
}

/**
 * Se a conta tem semente neste aparelho (travada ou não).
 * @param {string} routeId
 * @returns {boolean}
 */
export function hasSeed(routeId) {
  return Boolean(readSeeds()[routeId]);
}

/**
 * A semente em texto (base64url) enquanto a conta não está travada, para entrar na cópia por senha; senão null.
 * @param {string} routeId
 * @returns {Promise<string|null>}
 */
export async function seedForLock(routeId) {
  const stored = readSeeds()[routeId];
  if (!stored || isLocked(stored)) return null;
  return (await openSealed(stored))?.seed || null;
}

/**
 * Depois de travar: a semente cifrada pelo aparelho sai, fica só a marca (a cópia está com a da senha).
 * @param {string} routeId
 */
export function markSeedLocked(routeId) {
  if (hasSeed(routeId)) writeSeed(routeId, { locked: LOCKED_TAG, kid: `seed:${routeId}` });
}

/**
 * Abre a semente. Conta travada pede a Senha Soberana (lança `KeyLockedError` sem ela).
 * @param {string} routeId
 * @param {string} [passphrase]
 * @returns {Promise<Uint8Array|null>} null quando a conta não tem semente
 */
export async function openSeed(routeId, passphrase = "") {
  const stored = readSeeds()[routeId];
  if (!stored) return null;
  const text = isLocked(stored) ? (await keyLock.openLockedCopy(routeId, passphrase))?.seed : (await openSealed(stored))?.seed;
  return text ? fromB64url(text) : null;
}

/**
 * Esquece a semente de uma conta (conta removida do aparelho).
 * @param {string} routeId
 */
export function forgetSeed(routeId) {
  if (hasSeed(routeId)) writeSeed(routeId, null);
}
