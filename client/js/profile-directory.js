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

  let displayName = card?.name || mockProf?.name || mock.getAuthorDisplay(id) || "";
  if (myId === id) {
    displayName = localAccount.getDisplayName() || enrich?.displayName || displayName;
  } else if (enrich?.displayName) {
    displayName = enrich.displayName;
  }

  return {
    routeId: id,
    name: displayName || id.slice(0, 12),
    handle: card?.handle || mockProf?.handle || mock.getAuthorHandle(id) || "",
    avatar: card?.avatarUrl || card?.avatar || enrich?.avatarUrl || mockProf?.avatar || mock.getAuthorAvatar(id) || "",
    bio: card?.bio || enrich?.bio || mockProf?.readme?.slice(0, 120) || "",
    readme: mockProf?.readme || mock.getAuthorReadme(id) || "",
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
