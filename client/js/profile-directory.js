/** Resolve display/avatar/bio: mock, welcome, cards locais, self (V-DIS-06). */

import * as mock from "./mock.js";
import * as localAccount from "./local-account.js";
import { getWelcomeProfile, isWelcomeRouteId } from "./vox-welcome-profile.js";

const CARDS_KEY = "vox-profile-cards-v1";

function loadCards() {
  try {
    const raw = localStorage.getItem(CARDS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setProfileCard(routeId, partial) {
  const id = String(routeId || "").trim();
  if (!id) return;
  const cards = loadCards();
  cards[id] = { ...cards[id], ...partial, routeId: id, updatedAt: Date.now() };
  try {
    localStorage.setItem(CARDS_KEY, JSON.stringify(cards));
  } catch {
    /* ignore */
  }
}

export function getProfileCard(routeId) {
  const id = String(routeId || "").trim();
  if (!id) return null;
  return loadCards()[id] || null;
}

export function removeProfileCard(routeId) {
  const id = String(routeId || "").trim();
  if (!id) return;
  const cards = loadCards();
  delete cards[id];
  try {
    localStorage.setItem(CARDS_KEY, JSON.stringify(cards));
  } catch {
    /* ignore */
  }
}

export function listDiscoverableProfileCards() {
  const cards = loadCards();
  return Object.values(cards).filter((c) => c && c.discoverable !== false && c.routeId);
}

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

export async function resolveProfile(routeId) {
  const id = String(routeId || "").trim();
  if (!id) return { routeId: "", name: "", handle: "", avatar: "", bio: "" };

  if (isWelcomeRouteId(id)) {
    const w = getWelcomeProfile();
    return {
      routeId: w.routeId,
      name: w.name,
      handle: w.handle,
      avatar: w.avatar,
      bio: w.bio,
      readme: w.readme,
      isSystem: true,
    };
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
  };
}

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

export async function fetchAndCacheOnChainProfile(target) {
  const id = String(target || "").trim();
  if (!id) return null;
  const isRoute = id.startsWith("vx_");
  const gql = await import("./graphql.js");
  const onChain = await gql.fetchProfileCardOnChain(isRoute ? { routeId: id } : { address: id });
  if (!onChain) return null;

  const cardData = {
    name: onChain.displayName || onChain.name || "",
    bio: onChain.bio || "",
    avatarUrl: onChain.avatarUrl || "",
    arweaveAddress: onChain.owner || "",
    onChainTxId: onChain.txId || "",
    discoverable: onChain.discoverable,
  };

  const key = onChain.routeId || id;
  setProfileCard(key, cardData);
  if (onChain.owner && onChain.routeId) {
    setProfileCard(onChain.owner, cardData);
  }
  return { routeId: key, ...cardData };
}
