/**
 * @module central-memory
 * Cliente de sincronização automática com o nó local zero-central-memory.
 * Copia todos os artefatos locais para o disco do nó local e reidrata o estado
 * completo ao iniciar ou reconectar, evitando perda de memória da rede.
 */

import * as cacheNode from "./cache-node.js";
import { getRelayHttpUrls } from "./inbox.js";
import * as localAccount from "./local-account.js";
import * as mediaBlob from "./media-blob.js";
import * as manifestMesh from "./peers-cache-manifest.js";
import * as profileDirectory from "./profile-directory.js";

const DEFAULT_MEMORY_URLS = ["http://127.0.0.1:3921", "http://127.0.0.1:3920"];
const MEMORY_URL_STORAGE_KEY = "vox-central-memory-url";
const BUDDY_RELAY_STORAGE_KEY = "vox-relay-buddy-http-url";
const REQUEST_TIMEOUT_MS = 3000;

let preferredUrl = null;
let hydratingDepth = 0;
let syncInFlight = false;
let syncTimerId = null;
let autoPushEnabled = false;
let lastServerRevision = 0;
let lastServerTimestamp = 0;
let lastLocalSyncMs = 0;
let lastHydratedCallback = null;

export function resetCentralMemoryCursor() {
  lastServerRevision = 0;
  lastServerTimestamp = 0;
  lastLocalSyncMs = 0;
}

export function registerDiscoveredMemoryUrl(rawUrl, { triggerSync = true } = {}) {
  const raw = String(rawUrl || "").trim().replace(/\/+$/, "");
  if (!raw || !/^https:\/\//i.test(raw)) return "";
  let prev = "";
  try {
    prev = String(localStorage.getItem(MEMORY_URL_STORAGE_KEY) || "").trim();
    localStorage.setItem(MEMORY_URL_STORAGE_KEY, raw);
    localStorage.setItem(BUDDY_RELAY_STORAGE_KEY, raw);
  } catch {
    /* ignore */
  }
  if (prev !== raw) {
    if (!preferredUrl || !preferredUrl.startsWith("http://127.0.0.1")) {
      preferredUrl = raw;
    }
    if (triggerSync) {
      resetCentralMemoryCursor();
      void syncWithCentralMemory();
    }
  }
  return raw;
}

export function getDiscoveredPublicMemoryUrl() {
  try {
    const stored = String(localStorage.getItem(MEMORY_URL_STORAGE_KEY) || "").trim();
    return /^https:\/\//i.test(stored) ? stored.replace(/\/+$/, "") : "";
  } catch {
    return "";
  }
}

export function setCentralMemoryAutoPush(enabled) {
  autoPushEnabled = Boolean(enabled);
  const sink = autoPushEnabled ? notifyCentralMemory : null;
  cacheNode.registerCentralMemorySink(sink);
  mediaBlob.registerBlobMemorySink(sink);
  profileDirectory.registerProfileMemorySink(sink);
}

export function notifyCentralMemory(event) {
  if (!autoPushEnabled || !event || isHydratingFromCentralMemory()) return;
  void pushEventToCentralMemory(event);
  const blob = event?.item?.mediaBlob || event?.mediaBlob;
  if (blob?.hash && blob?.data) {
    void pushEventToCentralMemory({ type: "MEDIA_BLOB", blob });
  }
}

function extractMemoryParamFromLocation() {
  if (typeof window === "undefined" || !window.location) return "";
  try {
    const searchParams = new URLSearchParams(window.location.search || "");
    const fromSearch = searchParams.get("memory") || searchParams.get("relay") || "";
    if (fromSearch) return fromSearch.trim();
    const hash = String(window.location.hash || "");
    const qIdx = hash.indexOf("?");
    if (qIdx === -1) return "";
    const hashParams = new URLSearchParams(hash.slice(qIdx + 1));
    return (hashParams.get("memory") || hashParams.get("relay") || "").trim();
  } catch {
    return "";
  }
}

export function captureMemoryUrlFromLocation() {
  const raw = extractMemoryParamFromLocation();
  if (!raw || !/^https?:\/\//i.test(raw)) return "";
  const clean = raw.replace(/\/+$/, "");
  try {
    localStorage.setItem(MEMORY_URL_STORAGE_KEY, clean);
    localStorage.setItem(BUDDY_RELAY_STORAGE_KEY, clean);
  } catch {
    /* ignore */
  }
  return clean;
}

export function getCentralMemoryUrls() {
  captureMemoryUrlFromLocation();
  let storedMemoryUrl = "";
  try {
    storedMemoryUrl = String(localStorage.getItem(MEMORY_URL_STORAGE_KEY) || "").trim();
  } catch {
    storedMemoryUrl = "";
  }
  const configured = typeof getRelayHttpUrls === "function" ? getRelayHttpUrls() : [];
  const merged = [storedMemoryUrl, ...configured, ...DEFAULT_MEMORY_URLS]
    .map((u) => String(u || "").trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return [...new Set(merged)];
}

export function isHydratingFromCentralMemory() {
  return hydratingDepth > 0;
}

async function fetchJsonWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function postToFirstAvailable(path, payload) {
  const urls = preferredUrl
    ? [preferredUrl, ...getCentralMemoryUrls().filter((u) => u !== preferredUrl)]
    : getCentralMemoryUrls();
  const body = JSON.stringify(payload);
  for (const base of urls) {
    const data = await fetchJsonWithTimeout(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (data && typeof data === "object") {
      preferredUrl = base;
      return data;
    }
  }
  return null;
}

export async function pushEventToCentralMemory(event) {
  if (!event || typeof event !== "object" || isHydratingFromCentralMemory()) {
    return null;
  }
  return postToFirstAvailable("/memory/ingest", event);
}

function extractPostBlobHash(post) {
  if (!post || typeof post !== "object") return "";
  if (post.mediaRef && post.mediaRef.hash) return post.mediaRef.hash;
  if (post.mediaBlob && post.mediaBlob.hash) return post.mediaBlob.hash;
  return "";
}

async function resolveBlobForPost(post, hash) {
  if (post.mediaBlob && post.mediaBlob.data) {
    return post.mediaBlob;
  }
  return mediaBlob.defaultBlobStorage.get(hash);
}

async function collectLocalBlobs(posts) {
  const blobs = [];
  const seen = new Set();
  for (const post of posts) {
    const hash = extractPostBlobHash(post);
    if (!hash || seen.has(hash)) continue;
    seen.add(hash);
    const stored = await resolveBlobForPost(post, hash);
    if (stored && stored.hash && stored.data) {
      blobs.push(stored);
    }
  }
  return blobs;
}

function filterDeltaItems(items, watermarkMs) {
  if (watermarkMs <= 0) return items;
  return items.filter((it) => itemTimestamp(it) >= watermarkMs);
}

function listKnownBlobHashes(posts) {
  const hashes = new Set();
  for (const post of posts) {
    const h = extractPostBlobHash(post);
    if (h && mediaBlob.defaultBlobStorage.has(h)) hashes.add(h);
  }
  return [...hashes];
}

function cleanStr(val) {
  return val ? String(val).trim() : "";
}

function hasFieldDiff(nextVal, prevVal) {
  return Boolean(nextVal && nextVal !== prevVal);
}

function hasCardChanges(existing, cleanName, cleanAvatar, cleanBio) {
  if (!existing) return true;
  if (hasFieldDiff(cleanName, existing.name)) return true;
  if (hasFieldDiff(cleanAvatar, existing.avatarUrl)) return true;
  return hasFieldDiff(cleanBio, existing.bio);
}

function mergeCardField(cleanVal, existingVal) {
  return cleanVal ? cleanVal : cleanStr(existingVal);
}

function upsertDirectoryCardIfNeeded(routeId, name, avatarUrl = "", bio = "") {
  const id = cleanStr(routeId);
  if (!id.startsWith("vx_")) return;
  const existing = profileDirectory.getProfileCard(id);
  const cleanName = cleanStr(name);
  const cleanAvatar = cleanStr(avatarUrl);
  const cleanBio = cleanStr(bio);
  if (!hasCardChanges(existing, cleanName, cleanAvatar, cleanBio)) return;
  const ex = existing ? existing : {};
  profileDirectory.setProfileCard(id, {
    name: mergeCardField(cleanName, ex.name),
    avatarUrl: mergeCardField(cleanAvatar, ex.avatarUrl),
    bio: mergeCardField(cleanBio, ex.bio),
    discoverable: true,
  });
}

function syncActiveAccountCard() {
  const myId = localAccount.getCachedRouteIdSync();
  if (!myId) return;
  const enrich = localAccount.getProfileEnrichment();
  const enrichObj = enrich ? enrich : {};
  const myName = localAccount.getDisplayName() || enrichObj.displayName;
  upsertDirectoryCardIfNeeded(myId, myName, enrichObj.avatarUrl, enrichObj.bio);
}

function syncVaultCards() {
  if (typeof localAccount.listVaultAccountsSync !== "function") return;
  for (const v of localAccount.listVaultAccountsSync()) {
    if (v) upsertDirectoryCardIfNeeded(v.routeId, v.displayName, v.avatarUrl, v.bio);
  }
}

function syncLocalAccountsToProfileDirectory(allPosts) {
  syncActiveAccountCard();
  syncVaultCards();
  const list = Array.isArray(allPosts) ? allPosts : [];
  for (const post of list) {
    if (!post) continue;
    const author = post.author ? post.author : post.owner;
    upsertDirectoryCardIfNeeded(author, post.authorDisplay, post.authorAvatar, "");
  }
}

async function buildLocalSyncBundle() {
  const [allPosts, allTombstones] = await Promise.all([
    cacheNode.getWirePosts(),
    cacheNode.getAllTombstones(),
  ]);
  syncLocalAccountsToProfileDirectory(allPosts);
  const posts = filterDeltaItems(allPosts, lastLocalSyncMs);
  const tombstones = filterDeltaItems(allTombstones, lastLocalSyncMs);
  const profiles = profileDirectory.listDiscoverableProfileCards();
  const manifests = filterDeltaItems(manifestMesh.listKnownManifests(), lastLocalSyncMs);
  const blobs = await collectLocalBlobs(posts);
  return {
    posts,
    tombstones,
    profiles,
    manifests,
    blobs,
    includeBlobs: true,
    clientRevision: lastServerRevision,
    since: lastServerTimestamp,
    knownBlobs: listKnownBlobHashes(allPosts),
  };
}

async function hydrateBlobs(blobs) {
  if (!Array.isArray(blobs)) return new Map();
  const byHash = new Map();
  for (const blob of blobs) {
    if (!blob?.hash || !blob?.data) continue;
    byHash.set(blob.hash, blob);
    if (!mediaBlob.defaultBlobStorage.has(blob.hash)) {
      await mediaBlob.defaultBlobStorage.put(blob);
    }
  }
  return byHash;
}

async function hydrateTombstones(tombstones) {
  if (!Array.isArray(tombstones)) return 0;
  let added = 0;
  for (const tomb of tombstones) {
    if (!tomb?.id) continue;
    const existing = await cacheNode.getTombstone(tomb.id);
    if (!existing) {
      await cacheNode.saveTombstone(tomb);
      added += 1;
    }
  }
  return added;
}

function itemTimestamp(item) {
  if (!item || typeof item !== "object") return 0;
  return Number(item.updatedAt || item.editedAt || item.ts || item.timestamp || item.createdAt || 0);
}

function attachHydratedBlob(post, blobsByHash) {
  const mediaHash = post.mediaRef && post.mediaRef.hash;
  if (!mediaHash || !blobsByHash.has(mediaHash)) return post;
  return mediaBlob.attachMedia(post, blobsByHash.get(mediaHash));
}

async function hydrateSinglePost(post, blobsByHash) {
  if (!post || !post.id) return false;
  const author = post.author || post.owner || "";
  upsertDirectoryCardIfNeeded(author, post.authorDisplay, post.authorAvatar, "");
  const current = await cacheNode.getLocalPost(post.id);
  if (current && itemTimestamp(current) >= itemTimestamp(post)) return false;
  const hydrated = attachHydratedBlob(post, blobsByHash);
  return cacheNode.saveLocalPost(hydrated);
}

async function hydratePosts(posts, blobsByHash) {
  if (!Array.isArray(posts)) return 0;
  let added = 0;
  for (const post of posts) {
    if (await hydrateSinglePost(post, blobsByHash)) {
      added += 1;
    }
  }
  return added;
}

function shouldApplyIncomingProfile(existing, incoming) {
  if (!existing) return true;
  const inName = cleanStr(incoming?.name || incoming?.displayName);
  const inAvatar = cleanStr(incoming?.avatarUrl || incoming?.avatar);
  const inBio = cleanStr(incoming?.bio);
  if (!hasCardChanges(existing, inName, inAvatar, inBio)) return false;
  if (inName && !existing.name) return true;
  if (inAvatar && !existing.avatarUrl) return true;
  return itemTimestamp(incoming) > itemTimestamp(existing);
}

function hydrateProfiles(profiles) {
  if (!Array.isArray(profiles)) return 0;
  let added = 0;
  for (const card of profiles) {
    const routeId = String(card?.routeId || card?.author || "").trim();
    if (!routeId) continue;
    const existing = profileDirectory.getProfileCard(routeId);
    if (shouldApplyIncomingProfile(existing, card)) {
      const normalized = {
        ...card,
        name: card.name || card.displayName || existing?.name || "",
        discoverable: card.discoverable !== false,
      };
      profileDirectory.setProfileCard(routeId, normalized);
      added += 1;
    }
  }
  return added;
}

async function applyRemoteBundle(remote) {
  hydratingDepth += 1;
  try {
    const blobsByHash = await hydrateBlobs(remote.blobs);
    const tombCount = await hydrateTombstones(remote.tombstones);
    const postCount = await hydratePosts(remote.posts, blobsByHash);
    const profCount = hydrateProfiles(remote.profiles);
    return tombCount + postCount + profCount;
  } finally {
    hydratingDepth = Math.max(0, hydratingDepth - 1);
  }
}

function recordRemoteSyncWatermark(remote, syncStartedMs) {
  if (remote.tunnelUrl) {
    registerDiscoveredMemoryUrl(remote.tunnelUrl, { triggerSync: false });
  }
  lastServerRevision = Number(remote.revision || lastServerRevision);
  lastServerTimestamp = Number(remote.updatedAt || lastServerTimestamp);
  lastLocalSyncMs = syncStartedMs;
}

export async function syncWithCentralMemory({ onHydrated } = {}) {
  if (syncInFlight) return { ok: false, skipped: true };
  syncInFlight = true;
  try {
    const syncStartedMs = Date.now();
    const bundle = await buildLocalSyncBundle();
    const remote = await postToFirstAvailable("/memory/sync", bundle);
    if (!remote || remote.status !== "ok") {
      return { ok: false, hydratedCount: 0 };
    }
    recordRemoteSyncWatermark(remote, syncStartedMs);
    const hydratedCount = remote.upToDate ? 0 : await applyRemoteBundle(remote);
    const cb = typeof onHydrated === "function" ? onHydrated : lastHydratedCallback;
    if (hydratedCount > 0 && typeof cb === "function") {
      cb({ hydratedCount, revision: remote.revision });
    }
    return { ok: true, hydratedCount, revision: remote.revision, counts: remote.counts };
  } finally {
    syncInFlight = false;
  }
}

export function startCentralMemoryLoop({ intervalMs = 15000, onHydrated } = {}) {
  if (typeof onHydrated === "function") lastHydratedCallback = onHydrated;
  setCentralMemoryAutoPush(true);
  if (syncTimerId !== null) clearInterval(syncTimerId);
  void syncWithCentralMemory({ onHydrated });
  syncTimerId = setInterval(() => {
    void syncWithCentralMemory({ onHydrated });
  }, intervalMs);
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void syncWithCentralMemory({ onHydrated });
      }
    });
  }
  return () => {
    if (syncTimerId !== null) {
      clearInterval(syncTimerId);
      syncTimerId = null;
    }
  };
}
