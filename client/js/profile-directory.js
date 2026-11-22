/**
 * @file Diretório local de cartões de perfil descobríveis na malha.
 *
 * Resolve nome, avatar e bio: mock, boas-vindas, cartões locais e identidade ativa (V-DIS-06).
 */

import * as mock from "./mock.js";
import * as localAccount from "./identity/index.js";
import { getWelcomeProfile, isWelcomeRouteId } from "./vox-welcome-profile.js";
import { isBeforeGenesisMs, isTestRouteId } from "./genesis.js";
import { getLocalIdentityMeta, hasAnyIdentityMeta, pickIdentityMeta } from "./profile-identity-meta.js";
import { detectSocialAvatarType } from "./account-social-match.js";
import { dedupeAsync } from "./shared/async-dedupe.js";

const CARDS_KEY = "vox-profile-cards-v1";
const FORBIDDEN_CARD_KEYS = new Set(["__proto__", "constructor", "prototype"]);
let profileMemorySink = null;

function isSafeCardKey(id) {
  return Boolean(id) && !FORBIDDEN_CARD_KEYS.has(id);
}

/** Operação `registerProfileMemorySink` do módulo.
 * @param {*} [fn] Parâmetro `fn`.
 */
export function registerProfileMemorySink(fn) {
  profileMemorySink = typeof fn === "function" ? fn : null;
}

function loadCardsMap() {
  try {
    const raw = localStorage.getItem(CARDS_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return new Map();
    return new Map(Object.entries(parsed).filter(([k]) => isSafeCardKey(k)));
  } catch {
    return new Map();
  }
}

function saveCardsMap(cardsMap) {
  try {
    localStorage.setItem(CARDS_KEY, JSON.stringify(Object.fromEntries(cardsMap)));
  } catch {
    /* ignore */
  }
}

function normalizeMetaAvatarBase(url) {
  // Links do Facebook identificam a conta por query (?psid=/asid=); sem isso todos colidiriam.
  const base = `${url.origin}${url.pathname}`;
  return url.searchParams.has("psid") || url.searchParams.has("asid") ? `${base}${url.search}` : base;
}

// Provedor pelo host da URL (detectSocialAvatarType), nunca por trecho: "https://x.example/?a=fbcdn.net" fica inteira.
function normalizeSocialAvatarBase(av) {
  const clean = String(av || "").trim();
  const type = detectSocialAvatarType(clean);
  if (type === "google") return clean.split("=")[0];
  if (type === "meta") return normalizeMetaAvatarBase(new URL(clean));
  return clean;
}

/** Indica se SameCardIdentity.
 * @param {*} [cardA] Parâmetro `cardA`.
 * @param {*} [cardB] Parâmetro `cardB`.
 * @returns {*} Resultado da operação.
 */
export function isSameCardIdentity(cardA, cardB) {
  if (!cardA || !cardB) return false;
  const isAlias = Boolean(cardA.arweaveAddress && cardB.arweaveAddress && cardA.arweaveAddress === cardB.arweaveAddress);
  if (isAlias) return false;

  const avA = normalizeSocialAvatarBase(cardA.avatarUrl || cardA.avatar || "");
  const avB = normalizeSocialAvatarBase(cardB.avatarUrl || cardB.avatar || "");
  return Boolean(avA && avB && avA === avB);
}

/** Operação `pruneCardsMatchingSocialIdentity` do módulo.
 * @param {object} [options={}] Critérios de identidade social.
 */
export function pruneCardsMatchingSocialIdentity({ canonicalRouteId, displayName, avatarUrl } = {}) {
  const cards = loadCardsMap();
  const target = { name: displayName, avatarUrl };
  let changed = false;
  for (const [id, c] of cards.entries()) {
    if (id !== canonicalRouteId && isSameCardIdentity(c, target)) {
      cards.delete(id);
      changed = true;
    }
  }
  if (changed) saveCardsMap(cards);
}

function isAliasProfileCard(c, id, nextCard) {
  if (c?.arweaveAddress && (c.arweaveAddress === id || c.arweaveAddress === nextCard.arweaveAddress)) {
    return true;
  }
  return Boolean(c?.onChainTxId && nextCard.onChainTxId && c.onChainTxId === nextCard.onChainTxId);
}

function pruneConflictingIdentityCards(cards, id, nextCard) {
  for (const [otherId, c] of Array.from(cards.entries())) {
    if (otherId === id) continue;
    if (!isAliasProfileCard(c, id, nextCard) && isSameCardIdentity(c, nextCard)) {
      cards.delete(otherId);
    }
  }
}

/** Define ProfileCard.
 * @param {*} [routeId] Parâmetro `routeId`.
 * @param {*} [partial] Parâmetro `partial`.
 */
export function setProfileCard(routeId, partial) {
  const id = String(routeId || "").trim();
  if (!isSafeCardKey(id) || isTestRouteId(id)) return;
  const cards = loadCardsMap();
  const prev = cards.get(id) || {};
  const nextCard = { ...prev, ...partial, routeId: id, updatedAt: Date.now() };

  pruneConflictingIdentityCards(cards, id, nextCard);

  cards.set(id, nextCard);
  saveCardsMap(cards);
  if (profileMemorySink && isShareableCard(nextCard)) profileMemorySink({ type: "PROFILE_CARD", card: nextCard });
}

/** Obtém ProfileCard.
 * @param {*} [routeId] Parâmetro `routeId`.
 * @returns {*} Resultado da operação.
 */
export function getProfileCard(routeId) {
  const id = String(routeId || "").trim();
  if (!isSafeCardKey(id)) return null;
  return loadCardsMap().get(id) || null;
}

/** Operação `removeProfileCard` do módulo.
 * @param {*} [routeId] Parâmetro `routeId`.
 */
export function removeProfileCard(routeId) {
  const id = String(routeId || "").trim();
  if (!isSafeCardKey(id)) return;
  const cards = loadCardsMap();
  if (cards.delete(id)) saveCardsMap(cards);
}

/**
 * Apaga deste aparelho os cartões de perfil que a condição apontar (usado pela purga da gênese).
 * @param {(card: object, routeId: string) => boolean} shouldDrop Recebe o cartão e a chave; true apaga.
 * @returns {number} Quantos cartões foram apagados.
 */
export function removeProfileCardsWhere(shouldDrop) {
  const cards = loadCardsMap();
  const before = cards.size;
  for (const [id, c] of Array.from(cards.entries())) {
    if (shouldDrop(c, id)) cards.delete(id);
  }
  const removed = before - cards.size;
  if (removed > 0) saveCardsMap(cards);
  return removed;
}

/**
 * Nome escolhido pela pessoa: não vazio e diferente da própria chave (`vx_…`).
 * @param {{name?: string, routeId?: string}} card Cartão ou entrada do diretório.
 * @returns {boolean} True se o nome foi escolhido.
 */
export function hasChosenCardName(card) {
  const name = String(card?.name || "").trim();
  const id = String(card?.routeId || "");
  return Boolean(name) && !id.startsWith(name) && !/^vx_/i.test(name);
}

// Só sai do aparelho cartão com nome escolhido: conta só com a chave é a descartável que suja a rede.
// O próprio cartão também não sai quando a pessoa desligou "aparecer na malha".
function isShareableCard(card) {
  if (!hasChosenCardName(card)) return false;
  return card.routeId !== localAccount.getCachedRouteIdSync() || localAccount.getMeshDiscoverable();
}

/**
 * Cartões que este aparelho manda para a memória central e para a malha.
 * @returns {Array<object>} Cartões descobríveis que podem sair do aparelho.
 */
export function listShareableProfileCards() {
  return listDiscoverableProfileCards().filter(isShareableCard);
}

/** Operação `listDiscoverableProfileCards` do módulo.
 * @returns {*} Resultado da operação.
 */
export function listDiscoverableProfileCards() {
  const cards = loadCardsMap();
  const all = Array.from(cards.values()).filter((c) => {
    if (!c || c.discoverable === false || !c.routeId) return false;
    const ts = c.updatedAt || c.timestamp || c.ts || 0;
    return !isBeforeGenesisMs(ts) && c.routeId !== "vx_WAqxgW" && !isTestRouteId(c.routeId);
  });
  const deduped = [];
  for (const card of all) {
    const existingIdx = deduped.findIndex((ex) => isSameCardIdentity(ex, card));
    if (existingIdx >= 0) {
      if ((card.updatedAt || 0) > (deduped[existingIdx].updatedAt || 0)) {
        deduped[existingIdx] = card;
      }
    } else {
      deduped.push(card);
    }
  }
  return deduped;
}

/** Reset de estado interno para testes.
 */
export function __resetProfileCardsForTests() {
  try {
    localStorage.removeItem(CARDS_KEY);
  } catch {
    /* ignore */
  }
}

function resolveDisplayName({ id, card, mockProf, myId, enrich }) {
  if (myId === id) {
    const selfName = localAccount.getDisplayName();
    if (selfName) return selfName;
    if (enrich?.displayName) return enrich.displayName;
  }
  if (card?.name) return card.name;
  if (enrich?.displayName) return enrich.displayName;
  if (mockProf?.name) return mockProf.name;
  const mockDisp = mock.getAuthorDisplay(id);
  if (mockDisp) return mockDisp;
  return id.slice(0, 12);
}

function resolveAvatar({ id, card, enrich, mockProf }) {
  if (card?.avatarUrl) return card.avatarUrl;
  if (card?.avatar) return card.avatar;
  if (enrich?.avatarUrl) return enrich.avatarUrl;
  if (mockProf?.avatar) return mockProf.avatar;
  return mock.getAuthorAvatar(id) || "";
}

function resolveHandle({ id, card, mockProf }) {
  if (card?.handle) return card.handle;
  if (mockProf?.handle) return mockProf.handle;
  return mock.getAuthorHandle(id) || "";
}

function resolveBio({ card, enrich, mockProf }) {
  if (card?.bio) return card.bio;
  if (enrich?.bio) return enrich.bio;
  if (mockProf?.readme) return mockProf.readme.slice(0, 120);
  return "";
}

function resolveReadme({ id, mockProf }) {
  if (mockProf?.readme) return mockProf.readme;
  return mock.getAuthorReadme(id) || "";
}

function resolveIdentityMeta({ id, card, mockProf, myId }) {
  if (myId && myId === id) {
    const local = getLocalIdentityMeta(id);
    if (hasAnyIdentityMeta(local)) return local;
  }
  return pickIdentityMeta(card, mockProf);
}

/** Operação `resolveProfile` do módulo.
 * @param {*} [routeId] Parâmetro `routeId`.
 * @returns {*} Resultado da operação.
 */
export async function resolveProfile(routeId) {
  const id = String(routeId || "").trim();
  if (!id) return { routeId: "", name: "", handle: "", avatar: "", bio: "", pronouns: "", gender: "", orientation: "" };

  if (isWelcomeRouteId(id)) {
    const w = getWelcomeProfile();
    return { routeId: w.routeId, name: w.name, handle: w.handle, avatar: w.avatar, bio: w.bio, readme: w.readme, ...pickIdentityMeta(), isSystem: true };
  }

  const card = getProfileCard(id);
  const mockProf = mock.getMockProfile(id);
  const myId = await localAccount.getRouteId();
  const enrich = myId === id ? localAccount.getProfileEnrichment() : null;
  const ctx = { id, card, mockProf, myId, enrich };

  return {
    routeId: id,
    name: resolveDisplayName(ctx),
    handle: resolveHandle(ctx),
    avatar: resolveAvatar(ctx),
    bio: resolveBio(ctx),
    readme: resolveReadme(ctx),
    ...resolveIdentityMeta(ctx),
  };
}

/** Obtém AuthorDisplaySync.
 * @param {*} [routeId] Parâmetro `routeId`.
 * @returns {*} Resultado da operação.
 */
export function getAuthorDisplaySync(routeId) {
  if (isWelcomeRouteId(routeId)) return getWelcomeProfile().name;
  const card = getProfileCard(routeId);
  if (card?.name) return card.name;
  const mockName = mock.getAuthorDisplay(routeId);
  if (mockName) return mockName;
  const myId = localAccount.getCachedRouteIdSync();
  if (myId === routeId) {
    const selfName = localAccount.getDisplayName() || localAccount.getProfileEnrichment()?.displayName || "";
    if (selfName) return selfName;
  }
  if (typeof localAccount.listVaultAccountsSync === "function") {
    const vault = localAccount.listVaultAccountsSync();
    const match = vault.find((v) => v.routeId === routeId);
    if (match?.displayName) return match.displayName;
  }
  return "";
}

/** Obtém AuthorAvatarSync.
 * @param {*} [routeId] Parâmetro `routeId`.
 * @returns {*} Resultado da operação.
 */
export function getAuthorAvatarSync(routeId) {
  if (isWelcomeRouteId(routeId)) return getWelcomeProfile().avatar;
  const card = getProfileCard(routeId);
  if (card?.avatarUrl || card?.avatar) return card.avatarUrl || card.avatar;
  const mockAv = mock.getAuthorAvatar(routeId);
  if (mockAv) return mockAv;
  const myId = localAccount.getCachedRouteIdSync();
  if (myId === routeId) {
    const e = localAccount.getProfileEnrichment();
    if (e?.avatarUrl) return e.avatarUrl;
  }
  if (typeof localAccount.listVaultAccountsSync === "function") {
    const vault = localAccount.listVaultAccountsSync();
    const match = vault.find((v) => v.routeId === routeId);
    if (match?.avatarUrl) return match.avatarUrl;
  }
  return "";
}

async function loadAndCacheOnChainProfile(id) {
  const isRoute = id.startsWith("vx_");
  const gql = await import("./graphql.js");
  const onChain = await gql.fetchProfileCardOnChain(isRoute ? { routeId: id } : { address: id });
  if (!onChain) return null;

  const cardData = {
    name: onChain.displayName || onChain.name || "",
    bio: onChain.bio || "",
    avatarUrl: onChain.avatarUrl || "",
    ...pickIdentityMeta(onChain),
    arweaveAddress: onChain.owner || "",
    onChainTxId: onChain.txId || "",
    discoverable: onChain.discoverable,
  };

  const key = onChain.routeId || id;
  setProfileCard(key, cardData);
  if (onChain.owner && onChain.routeId) setProfileCard(onChain.owner, cardData);
  return { routeId: key, ...cardData };
}

/** Busca AndCacheOnChainProfile nos gateways configurados (deduplicando chamadas concorrentes).
 * @param {*} [target] Parâmetro `target`.
 * @returns {*} Resultado da operação.
 */
export async function fetchAndCacheOnChainProfile(target) {
  const id = String(target || "").trim();
  if (!id) return null;
  return dedupeAsync(`profile-onchain:${id}`, () => loadAndCacheOnChainProfile(id));
}
