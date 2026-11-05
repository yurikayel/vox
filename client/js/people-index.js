/** Índice local de pessoas para busca (V-DIS + V-MESH P1/P2). */

import * as cacheNode from "./cache-node.js";
import * as contacts from "./contacts.js";
import * as handles from "./handles.js";
import * as mock from "./mock.js";
import { getWelcomeProfile, WELCOME_ROUTE_ID } from "./vox-welcome-profile.js";
import * as profileDirectory from "./profile-directory.js";
import * as localAccount from "./local-account.js";
import * as webrtcPeer from "./webrtc-peer.js";
import { shortId } from "./render/util.js";

const DEFAULT_PREFER_SOURCES = ["system", "self", "contact", "vault", "mesh-card", "mesh-author", "route-direct"];
export const PEOPLE_SEARCH_OK_METRIC = "vox-metric-people-search-ok";

function isFallbackRouteName(name, routeId) {
  if (!name) return true;
  return name === routeId || name === String(routeId || "").slice(0, 14) || name === String(routeId || "").slice(0, 12);
}

function chooseBestName(existingName, incomingName, routeId) {
  if (!isFallbackRouteName(incomingName, routeId) && isFallbackRouteName(existingName, routeId)) {
    return incomingName;
  }
  return existingName || incomingName || String(routeId || "").slice(0, 14);
}

function isSameGoogleAvatar(avA, avB, nameA, nameB) {
  const isGoogleA = avA.includes("googleusercontent.com/");
  const isGoogleB = avB.includes("googleusercontent.com/");
  if (!isGoogleA || !isGoogleB) return false;
  return avA.split("=")[0] === avB.split("=")[0] || Boolean(nameA && nameA === nameB);
}

function isSameMetaAvatar(avA, avB, nameA, nameB) {
  const isMetaA = avA.includes("facebook.com") || avA.includes("fbsbx.com") || avA.includes("fbcdn.net");
  const isMetaB = avB.includes("facebook.com") || avB.includes("fbsbx.com") || avB.includes("fbcdn.net");
  if (!isMetaA || !isMetaB) return false;
  return avA === avB || Boolean(nameA && nameA === nameB);
}

function isSameNamedLocalIdentity(entryA, entryB, nameA, nameB) {
  const isNamedA = !isFallbackRouteName(nameA, entryA.routeId);
  const isNamedB = !isFallbackRouteName(nameB, entryB.routeId);
  if (!isNamedA || !isNamedB || nameA !== nameB) return false;
  const isLocalA = entryA.source === "self" || entryA.source === "vault";
  const isLocalB = entryB.source === "self" || entryB.source === "vault";
  if (isLocalA && isLocalB) return true;
  return Boolean(isLocalA || isLocalB);
}

function isSameSocialIdentity(entryA, entryB) {
  const avA = entryA.avatarUrl || profileDirectory.getAuthorAvatarSync(entryA.routeId) || "";
  const avB = entryB.avatarUrl || profileDirectory.getAuthorAvatarSync(entryB.routeId) || "";
  if (avA && avB && avA === avB) return true;
  if (isSameGoogleAvatar(avA, avB, entryA.name, entryB.name)) return true;
  if (isSameMetaAvatar(avA, avB, entryA.name, entryB.name)) return true;
  return isSameNamedLocalIdentity(entryA, entryB, entryA.name, entryB.name);
}

export const isSameGoogleIdentity = isSameSocialIdentity;

function pruneSocialDuplicates(map, entry, preferSources) {
  const rank = (s) => {
    const i = preferSources.indexOf(s);
    return i >= 0 ? i : 99;
  };
  const toDelete = [];
  let shouldDropIncoming = false;

  for (const [id, ex] of map.entries()) {
    if (id === entry.routeId) continue;
    if (isSameSocialIdentity(entry, ex)) {
      if (rank(entry.source) < rank(ex.source)) {
        toDelete.push(id);
      } else {
        shouldDropIncoming = true;
      }
    }
  }

  for (const id of toDelete) {
    map.delete(id);
  }
  return shouldDropIncoming;
}

function upsert(map, entry, preferSources = DEFAULT_PREFER_SOURCES) {
  const shouldDrop = pruneSocialDuplicates(map, entry, preferSources);
  if (shouldDrop) return;

  const existing = map.get(entry.routeId);
  if (!existing) {
    map.set(entry.routeId, entry);
    return;
  }
  const rank = (s) => {
    const i = preferSources.indexOf(s);
    return i >= 0 ? i : 99;
  };
  const bestName = chooseBestName(existing.name, entry.name, entry.routeId);
  const bestHandle = existing.handle || entry.handle || "";
  const bestAvatar = existing.avatarUrl || entry.avatarUrl || "";
  if (rank(entry.source) < rank(existing.source)) {
    map.set(entry.routeId, { ...existing, ...entry, name: bestName, handle: bestHandle, avatarUrl: bestAvatar, source: entry.source });
  } else {
    map.set(entry.routeId, { ...existing, name: bestName, handle: bestHandle, avatarUrl: bestAvatar });
  }
}

function resolveMeshAuthorEntry(post) {
  if (!post) return null;
  const author = post.author ? post.author : post.owner;
  if (!author) return null;
  const dirName = profileDirectory.getAuthorDisplaySync(author);
  const name = dirName || post.authorDisplay || author.slice(0, 14);
  const handle = post.authorHandle || mock.getAuthorHandle(author) || handles.getCachedAddressHandle(author) || "";
  const avatarUrl = post.authorAvatar || profileDirectory.getAuthorAvatarSync(author) || "";
  return { routeId: author, name, handle, avatarUrl, source: "mesh-author" };
}

function indexSignalingPeers(map) {
  if (typeof webrtcPeer.listKnownPeerAddresses !== "function") return;
  for (const addr of webrtcPeer.listKnownPeerAddresses()) {
    upsert(map, {
      routeId: addr,
      name: profileDirectory.getAuthorDisplaySync(addr) || addr.slice(0, 14),
      handle: handles.getCachedAddressHandle(addr) || mock.getAuthorHandle(addr) || "",
      source: "mesh-author",
    });
  }
}

async function indexMeshAuthors(map) {
  const posts = typeof cacheNode.getAllLocalPosts === "function"
    ? await cacheNode.getAllLocalPosts()
    : await cacheNode.getLocalPosts({});
  for (const p of posts) {
    const entry = resolveMeshAuthorEntry(p);
    if (entry) upsert(map, entry);
  }
  indexSignalingPeers(map);
}

function indexMeshCards(map) {
  for (const card of profileDirectory.listDiscoverableProfileCards()) {
    const routeId = card.routeId;
    upsert(map, {
      routeId,
      name: card.name || card.displayName || profileDirectory.getAuthorDisplaySync(routeId) || routeId.slice(0, 14),
      handle: card.handle || handles.getCachedAddressHandle(routeId) || mock.getAuthorHandle(routeId) || "",
      avatarUrl: card.avatarUrl || card.avatar || "",
      source: "mesh-card",
    });
  }
}

function indexSelfAccount(map) {
  const myId = localAccount.getCachedRouteIdSync();
  if (!myId) return;
  const myName = localAccount.getDisplayName()
    || localAccount.getProfileEnrichment()?.displayName
    || profileDirectory.getAuthorDisplaySync(myId)
    || "";
  upsert(map, {
    routeId: myId,
    name: myName || myId.slice(0, 14),
    handle: handles.getCachedAddressHandle(myId) || "",
    avatarUrl: localAccount.getProfileEnrichment()?.avatarUrl || profileDirectory.getAuthorAvatarSync(myId) || "",
    source: "self",
  });
}

function indexVaultAccounts(map) {
  if (typeof localAccount.listVaultAccountsSync !== "function") return;
  for (const v of localAccount.listVaultAccountsSync()) {
    if (!v?.routeId) continue;
    upsert(map, {
      routeId: v.routeId,
      name: v.displayName || profileDirectory.getAuthorDisplaySync(v.routeId) || v.routeId.slice(0, 14),
      handle: handles.getCachedAddressHandle(v.routeId) || "",
      avatarUrl: v.avatarUrl || "",
      source: "vault",
    });
  }
}

function indexLocalAndVaultAccounts(map) {
  indexSelfAccount(map);
  indexVaultAccounts(map);
}

function comparePeopleEntries(a, b) {
  if (a.routeId === WELCOME_ROUTE_ID) return -1;
  if (b.routeId === WELCOME_ROUTE_ID) return 1;
  const aFallback = isFallbackRouteName(a.name, a.routeId);
  const bFallback = isFallbackRouteName(b.name, b.routeId);
  if (aFallback !== bFallback) return aFallback ? 1 : -1;
  const nameCmp = String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", {
    sensitivity: "base",
  });
  if (nameCmp !== 0) return nameCmp;
  return String(a.routeId || "").localeCompare(String(b.routeId || ""));
}

export async function buildPeopleIndex() {
  const map = new Map();

  const welcome = getWelcomeProfile();
  map.set(WELCOME_ROUTE_ID, {
    routeId: WELCOME_ROUTE_ID,
    name: welcome.name,
    handle: welcome.handle,
    source: "system",
  });

  indexLocalAndVaultAccounts(map);

  for (const c of contacts.listContacts()) {
    upsert(map, {
      routeId: c.routeId,
      name: c.label || profileDirectory.getAuthorDisplaySync(c.routeId) || c.routeId,
      handle: handles.getCachedAddressHandle(c.routeId) || "",
      source: "contact",
    });
  }

  await indexMeshAuthors(map);
  indexMeshCards(map);

  return Array.from(map.values()).sort(comparePeopleEntries);
}

export async function buildPeopleSections() {
  const all = await buildPeopleIndex();
  const contactsList = all.filter(
    (p) => p.source === "contact" || p.source === "system" || p.source === "self" || p.source === "vault",
  );
  const mesh = all.filter(
    (p) => p.source === "mesh-author" || p.source === "mesh-card" || p.source === "route-direct",
  );
  const tour = all.filter((p) => p.source === "demo");
  return { contacts: contactsList, mesh, tour, all };
}

export function recordPeopleSearchOk() {
  try {
    localStorage.setItem(PEOPLE_SEARCH_OK_METRIC, String(Date.now()));
  } catch {
    /* ignore */
  }
}

function resolveDirectRouteQuery(cleanQ, all) {
  const cleanQl = cleanQ.toLowerCase();
  if (cleanQl.startsWith("vx_") && cleanQl.length >= 6) {
    const already = all.some((p) => (p.routeId || "").toLowerCase().includes(cleanQl));
    if (!already) {
      const disp = profileDirectory.getAuthorDisplaySync(cleanQ);
      all.push({
        routeId: cleanQ,
        name: disp || cleanQ.slice(0, 14),
        handle: handles.getCachedAddressHandle(cleanQ) || "",
        source: "route-direct",
      });
    }
  }
}

function matchesTextQuery(text, ql, cleanQl) {
  if (!text) return false;
  return text.includes(ql) || Boolean(cleanQl && text.includes(cleanQl));
}

function matchesRouteId(pRoute, pShort, cleanQl) {
  if (!cleanQl) return false;
  return pRoute.includes(cleanQl) || pShort.includes(cleanQl);
}

function matchesPerson(p, ql, cleanQl, handleRoute) {
  if (handleRoute && p.routeId === handleRoute) return true;
  const pRoute = (p.routeId || "").toLowerCase();
  const pShort = shortId(p.routeId).toLowerCase();
  if (matchesRouteId(pRoute, pShort, cleanQl)) return true;

  const pName = (p.name || "").toLowerCase();
  if (matchesTextQuery(pName, ql, cleanQl)) return true;

  const pHandle = (p.handle || "").toLowerCase();
  return matchesTextQuery(pHandle, ql, cleanQl);
}

export async function searchPeople(query) {
  const q = String(query || "").trim();
  const all = await buildPeopleIndex();
  if (!q) return all;

  const cleanQ = q.replace(/^@/, "").trim();
  let handleRoute = "";
  if (q.startsWith("@") || cleanQ) {
    const mapped = handles.getCachedHandleMapping(q.startsWith("@") ? q : `@${cleanQ}`);
    if (mapped) handleRoute = mapped;
  }
  if (handleRoute && !all.some((p) => p.routeId === handleRoute)) {
    all.push({
      routeId: handleRoute,
      name: profileDirectory.getAuthorDisplaySync(handleRoute) || handleRoute.slice(0, 14),
      handle: handles.getCachedAddressHandle(handleRoute) || handles.normalizeSlug(cleanQ),
      source: "handle-cache",
    });
  }

  resolveDirectRouteQuery(cleanQ, all);

  const ql = q.toLowerCase();
  const cleanQl = cleanQ.toLowerCase();
  const results = all.filter((p) => matchesPerson(p, ql, cleanQl, handleRoute));

  if (results.length > 0) recordPeopleSearchOk();
  return results;
}

export function extractRecentAuthors(topics, limit = 8) {
  const out = [];
  const seen = new Set();
  for (const t of topics || []) {
    const author = t.author || t.owner;
    if (!author || seen.has(author)) continue;
    seen.add(author);
    out.push({
      routeId: author,
      name: profileDirectory.getAuthorDisplaySync(author) || author.slice(0, 14),
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function parseConnectTarget(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const connectMatch = raw.match(/#\/connect\/([^/?#]+)/i) || raw.match(/connect\/([^/?#]+)/i);
  if (connectMatch) return decodeURIComponent(connectMatch[1]);
  const clean = raw.replace(/^@/, "").trim();
  if (clean.startsWith("vx_")) return clean.split(/\s/)[0];
  return null;
}
