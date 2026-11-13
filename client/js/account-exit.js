/**
 * @file ADR-032 — a conta nasce com saída. Registra, por conta, as saídas soberanas que já existem fora
 * deste navegador (cofre aceito por um servidor de memória, arquivo `.voxid` com senha, backup no e-mail)
 * e decide quando a faixa "esta conta só existe neste navegador" volta depois de dispensada.
 * Atalhos (passkey, segundo aparelho) não contam como saída. Nada sai do aparelho: é só um registro local.
 */

import * as localAccount from "./local-account.js";
import * as cacheNode from "./cache-node.js";
import { isLocked } from "./keystore.js";

/**
 * Tipos de saída soberana (ADR-032 §3.2). `frase` e `guardioes` chegam nos passos seguintes; `anterior` é o
 * backup com senha feito antes deste registro existir.
 */
export const EXIT_KINDS = Object.freeze(["frase", "guardioes", "cofre", "arquivo", "email", "anterior"]);
/** Depois de "Agora não", a faixa volta em 7 dias… */
export const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
/** …ou depois de mais 10 posts, o que vier primeiro. */
export const SNOOZE_POSTS = 10;

const exitsKey = (routeId) => `vox-account-exits-v1:${routeId}`;
const snoozeKey = (routeId) => `vox-account-exit-snooze-v1:${routeId}`;
const currentRouteId = () => localAccount.getCachedRouteIdSync() || "";

function readJson(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* navegador cheio ou modo privado: a faixa só volta a aparecer */
  }
}

/**
 * Registra que esta conta ganhou uma saída soberana.
 * @param {string} kind um de `EXIT_KINDS`
 * @param {string} [routeId] conta (padrão: a ativa)
 * @param {number} [now]
 * @returns {boolean} se registrou
 */
export function markAccountExit(kind, routeId = currentRouteId(), now = Date.now()) {
  if (!routeId || !EXIT_KINDS.includes(kind)) return false;
  writeJson(exitsKey(routeId), { ...readJson(exitsKey(routeId)), [kind]: now });
  return true;
}

/**
 * Saídas registradas desta conta, com a data de cada uma.
 * @param {string} [routeId]
 * @returns {Record<string, number>}
 */
export function getAccountExits(routeId = currentRouteId()) {
  return (routeId && readJson(exitsKey(routeId))) || {};
}

/**
 * Primeira vez que o registro vê a conta: se ela já estava travada por senha (ADR-026), houve um backup com a
 * Senha Soberana antes deste registro, e ele conta como saída. Depois disso, travar não conta mais: salvar o
 * cofre sem servidor ou ligar o backup no e-mail sem mandar nada também trava, e não é saída.
 */
async function adoptEarlierBackup(routeId) {
  if (readJson(exitsKey(routeId))) return;
  const acc = await localAccount.ensureLocalAccount().catch(() => null);
  const earlier = acc?.routeId === routeId && isLocked(acc.privateJwk);
  writeJson(exitsKey(routeId), earlier ? { anterior: Date.now() } : {});
}

/**
 * A conta já tem saída soberana?
 * @param {string} [routeId]
 * @returns {Promise<boolean>}
 */
export async function hasSovereignExit(routeId = currentRouteId()) {
  if (!routeId) return false;
  await adoptEarlierBackup(routeId);
  return Object.keys(getAccountExits(routeId)).length > 0;
}

/**
 * Quantos posts desta conta estão no aparelho.
 * @param {string} me
 * @param {{ getWirePosts: Function }} [store]
 * @returns {Promise<number>}
 */
export async function countOwnPosts(me, store = cacheNode) {
  if (!me) return 0;
  return (await store.getWirePosts()).filter((p) => (p.author || p.owner) === me).length;
}

/**
 * "Agora não": guarda quando foi e quantos posts havia.
 * @param {number} ownPosts
 * @param {string} [routeId]
 * @param {number} [now]
 */
export function snoozeExitBanner(ownPosts, routeId = currentRouteId(), now = Date.now()) {
  if (routeId) writeJson(snoozeKey(routeId), { at: now, posts: ownPosts });
}

/**
 * A faixa aparece agora? Só sem saída, e depois de dispensada volta em 7 dias ou 10 posts.
 * @param {{ routeId?: string, hasExit: boolean, ownPosts: number, now?: number }} state
 * @returns {boolean}
 */
export function shouldShowExitBanner({ routeId = currentRouteId(), hasExit, ownPosts, now = Date.now() }) {
  if (!routeId || hasExit) return false;
  const snooze = readJson(snoozeKey(routeId));
  if (!snooze) return true;
  return now - (snooze.at || 0) >= SNOOZE_MS || ownPosts - (snooze.posts || 0) >= SNOOZE_POSTS;
}
