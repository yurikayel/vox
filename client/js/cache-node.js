// Cache local persistente para transações e corpos do Vox (IndexedDB + LRU)
import * as hashtags from "./hashtags.js";
import { normalizeLocalPost, toStoredRecord, toWireForm } from "./post-wire.js";
import * as mock from "./mock.js";
import * as communityUpdates from "./community-updates.js";

const DB_NAME = "vox-cache-db";
const DB_VERSION = 4;
const STORE_NAME = "tx-data";
const DM_STORE_NAME = "dm-threads";
const LOCAL_POSTS_STORE = "local-posts";
const TAG_INDEX_STORE = "tag-index";

let dbPromise = null;

function initTxStore(db) {
  if (db.objectStoreNames.contains(STORE_NAME)) return;
  const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
  store.createIndex("lastAccessed", "lastAccessed", { unique: false });
  store.createIndex("timestamp", "timestamp", { unique: false });
}

function initDmAndTagStores(db) {
  if (!db.objectStoreNames.contains(DM_STORE_NAME)) {
    const dmStore = db.createObjectStore(DM_STORE_NAME, { keyPath: "id" });
    dmStore.createIndex("peerAddress", "peerAddress", { unique: false });
    dmStore.createIndex("ts", "ts", { unique: false });
  }
  if (!db.objectStoreNames.contains(TAG_INDEX_STORE)) {
    const tagStore = db.createObjectStore(TAG_INDEX_STORE, { keyPath: "id" });
    tagStore.createIndex("slug", "slug", { unique: false });
  }
}

function initLocalPostsStore(db) {
  if (db.objectStoreNames.contains(LOCAL_POSTS_STORE)) return;
  const localStore = db.createObjectStore(LOCAL_POSTS_STORE, { keyPath: "id" });
  localStore.createIndex("type", "type", { unique: false });
  localStore.createIndex("communityId", "communityId", { unique: false });
  localStore.createIndex("replyTo", "replyTo", { unique: false });
  localStore.createIndex("ts", "ts", { unique: false });
}

function upgradeDatabaseSchema(db) {
  initTxStore(db);
  initDmAndTagStores(db);
  initLocalPostsStore(db);
}

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      return reject(new Error("IndexedDB não suportado neste ambiente"));
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => upgradeDatabaseSchema(e.target.result);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function getCachedTx(txId) {
  if (!txId) return null;
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(txId);
      req.onsuccess = () => {
        const res = req.result;
        if (res) {
          // Atualiza lastAccessed para política LRU
          res.lastAccessed = Date.now();
          store.put(res);
          resolve(res.data);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function setCachedTx(txId, data) {
  if (!txId || !data) return;
  try {
    const db = await openDB();
    const size = JSON.stringify(data).length;
    const entry = {
      id: txId,
      data,
      size,
      timestamp: Date.now(),
      lastAccessed: Date.now(),
    };
    await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Falha silenciosa em quota cheia
  }
}

export async function getCacheStats() {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = req.result || [];
        const count = items.length;
        const totalBytes = items.reduce((acc, cur) => acc + (cur.size || 0), 0);
        resolve({
          count,
          sizeBytes: totalBytes,
          sizeKb: (totalBytes / 1024).toFixed(1),
          sizeMb: (totalBytes / (1024 * 1024)).toFixed(2),
        });
      };
      req.onerror = () => resolve({ count: 0, sizeBytes: 0, sizeKb: "0.0", sizeMb: "0.00" });
    });
  } catch {
    return { count: 0, sizeBytes: 0, sizeKb: "0.0", sizeMb: "0.00" };
  }
}

export async function clearCache() {
  try {
    const db = await openDB();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {}
}

export async function enforceMaxCacheSize(maxMb = 38) {
  try {
    const db = await openDB();
    const maxBytes = maxMb * 1024 * 1024;
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("lastAccessed");
    const req = index.getAll();

    req.onsuccess = () => {
      const items = req.result || [];
      let currentBytes = items.reduce((acc, cur) => acc + (cur.size || 0), 0);
      if (currentBytes <= maxBytes) return;

      // Ordena pelos acessados há mais tempo (menor lastAccessed)
      items.sort((a, b) => a.lastAccessed - b.lastAccessed);
      for (const item of items) {
        if (currentBytes <= maxBytes) break;
        store.delete(item.id);
        currentBytes -= item.size || 0;
      }
    };
  } catch {}
}

export async function saveDmMessage(msg) {
  if (!msg?.id || !msg?.peerAddress) return;
  try {
    const db = await openDB();
    await new Promise((resolve) => {
      const tx = db.transaction(DM_STORE_NAME, "readwrite");
      const store = tx.objectStore(DM_STORE_NAME);
      store.put({
        id: msg.id,
        peerAddress: msg.peerAddress,
        from: msg.from || "",
        to: msg.to || "",
        text: msg.text || "",
        ts: msg.ts || Date.now(),
        status: msg.status || "delivered",
        replyTo: msg.replyTo || null,
        contextCard: msg.contextCard || null,
        reactions: msg.reactions || {},
        mediaDataUrl: msg.mediaDataUrl || "",
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    notifyDmChanged();
  } catch {}
}

/** Avisa a shell (contador de não lidas em Mensagens) que as conversas mudaram. */
export function notifyDmChanged() {
  try {
    if (typeof window !== "undefined" && typeof CustomEvent === "function") {
      window.dispatchEvent(new CustomEvent("vox:dm-changed"));
    }
  } catch {}
}

export async function getDmMessages(peerAddress) {
  if (!peerAddress) return [];
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(DM_STORE_NAME, "readonly");
      const store = tx.objectStore(DM_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const all = req.result || [];
        const filtered = all
          .filter((m) => m.peerAddress === peerAddress)
          .sort((a, b) => (a.ts || 0) - (b.ts || 0));
        resolve(filtered);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

function readDmReadTimestamps() {
  try {
    return JSON.parse(localStorage.getItem("vox-dm-read-ts-v1") || "{}") || {};
  } catch {
    return {};
  }
}

function populateLatestMessages(all, map) {
  for (const m of all) {
    const existing = map.get(m.peerAddress);
    if (!existing || (m.ts || 0) > (existing.lastTs || 0)) {
      map.set(m.peerAddress, {
        peerAddress: m.peerAddress,
        lastText: m.text,
        lastTs: m.ts || 0,
        lastStatus: m.status,
        unreadCount: 0,
      });
    }
  }
}

function countUnreadDmMessages(all, map) {
  const readMap = readDmReadTimestamps();
  for (const m of all) {
    const item = map.get(m.peerAddress);
    const lastRead = Number(readMap[m.peerAddress]) || 0;
    if (item && m.status === "received" && (m.ts || 0) > lastRead) {
      item.unreadCount = (item.unreadCount || 0) + 1;
    }
  }
}

function aggregateDmConversations(all) {
  const map = new Map();
  populateLatestMessages(all, map);
  countUnreadDmMessages(all, map);
  return Array.from(map.values()).sort((a, b) => b.lastTs - a.lastTs);
}

export async function getDmConversations() {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(DM_STORE_NAME, "readonly");
      const req = tx.objectStore(DM_STORE_NAME).getAll();
      req.onsuccess = () => resolve(aggregateDmConversations(req.result || []));
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function deleteDmThread(peerAddress) {
  if (!peerAddress) return;
  try {
    const db = await openDB();
    const msgs = await getDmMessages(peerAddress);
    await new Promise((resolve) => {
      const tx = db.transaction(DM_STORE_NAME, "readwrite");
      const store = tx.objectStore(DM_STORE_NAME);
      for (const m of msgs) {
        store.delete(m.id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

export async function saveTombstone(tombstone) {
  if (!tombstone?.id) return false;
  const record = toStoredRecord({ type: "tombstone", kind: "post-tombstone", ...tombstone });
  try {
    const db = await openDB();
    await new Promise((resolve) => {
      const tx = db.transaction(LOCAL_POSTS_STORE, "readwrite");
      tx.objectStore(LOCAL_POSTS_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    if (centralMemorySink) centralMemorySink({ type: "GOSSIP_DELETE", tombstone: toWireForm(record) });
    return true;
  } catch {
    return false;
  }
}

export async function getTombstone(id) {
  if (!id) return null;
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(LOCAL_POSTS_STORE, "readonly");
      const store = tx.objectStore(LOCAL_POSTS_STORE);
      const req = store.get(id);
      req.onsuccess = () => {
        const res = req.result;
        if (res && (res.type === "tombstone" || res.kind === "post-tombstone")) {
          resolve(toWireForm(res));
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function getAllTombstones() {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(LOCAL_POSTS_STORE, "readonly");
      const req = tx.objectStore(LOCAL_POSTS_STORE).getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        resolve(list.filter((p) => p && (p.type === "tombstone" || p.kind === "post-tombstone")).map(toWireForm));
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function getPostRecord(id) {
  if (!id) return null;
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(LOCAL_POSTS_STORE, "readonly");
      const store = tx.objectStore(LOCAL_POSTS_STORE);
      const req = store.get(id);
      req.onsuccess = () => resolve(toWireForm(req.result) || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

let cachedReplyCountsMap = null;
let cachedReplyActivityMap = null;
let centralMemorySink = null;

export function registerCentralMemorySink(fn) {
  centralMemorySink = typeof fn === "function" ? fn : null;
}

export function invalidateReplyCountsCache() {
  cachedReplyCountsMap = null;
  cachedReplyActivityMap = null;
}

export async function saveLocalPost(post) {
  if (!post?.id || !post?.type) return false;
  const tombstone = await getTombstone(post.id);
  const postTime = post.editedAt || post.ts || 0;
  if (tombstone && (tombstone.editedAt || 0) >= postTime) return false;

  const record = toStoredRecord(post);
  try {
    const db = await openDB();
    await new Promise((resolve) => {
      const tx = db.transaction(LOCAL_POSTS_STORE, "readwrite");
      tx.objectStore(LOCAL_POSTS_STORE).put(record);
      tx.oncomplete = () => {
        invalidateReplyCountsCache();
        resolve();
      };
      tx.onerror = () => resolve();
    });
    if (centralMemorySink) centralMemorySink({ type: "GOSSIP", item: toWireForm(record) });
    return true;
  } catch {
    return false;
  }
}

export async function getLocalPost(id) {
  if (!id) return null;
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(LOCAL_POSTS_STORE, "readonly");
      const store = tx.objectStore(LOCAL_POSTS_STORE);
      const req = store.get(id);
      req.onsuccess = () => {
        const res = req.result;
        if (!res || res.type === "tombstone" || res.kind === "post-tombstone") {
          resolve(null);
        } else {
          resolve(normalizeLocalPost(res));
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function deleteLocalPost(id) {
  if (!id) return false;
  try {
    const db = await openDB();
    await new Promise((resolve) => {
      const tx = db.transaction(LOCAL_POSTS_STORE, "readwrite");
      const store = tx.objectStore(LOCAL_POSTS_STORE);
      store.delete(id);
      tx.oncomplete = () => {
        invalidateReplyCountsCache();
        resolve();
      };
      tx.onerror = () => resolve();
    });
    return true;
  } catch {
    return false;
  }
}

export async function getLocalPosts({ type = null, communityId = null, replyTo = null, proposalId = null, postId = null } = {}) {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(LOCAL_POSTS_STORE, "readonly");
      const store = tx.objectStore(LOCAL_POSTS_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        let items = (req.result || []).filter((p) => p.type !== "tombstone" && p.kind !== "post-tombstone").map(normalizeLocalPost);
        if (type) items = items.filter((p) => p.type === type);
        if (communityId) items = items.filter((p) => p.communityId === communityId);
        if (replyTo !== null) items = items.filter((p) => p.replyTo === replyTo);
        if (proposalId) items = items.filter((p) => p.proposalId === proposalId);
        if (postId) items = items.filter((p) => p.postId === postId);

        if (type === "reply") {
          items.sort((a, b) => (a.ts || 0) - (b.ts || 0));
        } else {
          items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
        }
        resolve(items);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function getAllLocalPosts() {
  return getLocalPosts();
}

/** Posts na forma assinada, mais novos primeiro: o que a sincronização e a memória central repassam. */
export async function getWirePosts() {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const req = db.transaction(LOCAL_POSTS_STORE, "readonly").objectStore(LOCAL_POSTS_STORE).getAll();
      req.onsuccess = () => {
        const posts = (req.result || []).filter((p) => p && p.type !== "tombstone" && p.kind !== "post-tombstone");
        resolve(posts.sort((a, b) => (b.ts || 0) - (a.ts || 0)).map(toWireForm));
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function getReplyCountsMap() {
  if (cachedReplyCountsMap) {
    return { ...cachedReplyCountsMap };
  }
  const replies = await getLocalPosts({ type: "reply" });
  const counts = {};
  for (const r of replies) {
    if (r.replyTo) {
      counts[r.replyTo] = (counts[r.replyTo] || 0) + 1;
    }
  }
  cachedReplyCountsMap = counts;
  return { ...counts };
}

/** Retorna mapa de { [topicId]: { count: number, lastTs: number } } para bumping determinístico. */
export async function getReplyActivityMap() {
  if (cachedReplyActivityMap) {
    return { ...cachedReplyActivityMap };
  }
  const replies = await getLocalPosts({ type: "reply" });
  const act = {};
  for (const r of replies) {
    if (r.replyTo) {
      const prev = act[r.replyTo] || { count: 0, lastTs: 0 };
      const ts = Number(r.ts) || 0;
      act[r.replyTo] = {
        count: prev.count + 1,
        lastTs: Math.max(prev.lastTs, ts),
      };
    }
  }
  cachedReplyActivityMap = act;
  return { ...act };
}

function buildLocalCommunityRecord(c) {
  const cid = c.communityId || c.id;
  return {
    id: cid,
    communityId: cid,
    title: c.title || cid,
    description: c.description || c.body || "",
    category: c.category || "",
    owner: c.author || "",
    image: c.image || c.avatar || "",
    avatar: c.avatar || c.image || "",
    language: c.language || "Português",
    visibility: c.visibility || "open",
    createdAt: c.createdAt || c.ts || null,
    commercialEnabled: Boolean(c.commercialEnabled),
    newKeyQuarantine: Boolean(c.newKeyQuarantine),
    isLocalP2p: true,
  };
}

export async function getLocalCommunities() {
  const posts = await getLocalPosts({ type: "community" });
  const updates = await getLocalPosts({ type: communityUpdates.COMMUNITY_UPDATE_TYPE });
  const communities = [];
  for (const c of posts) {
    if (!communityUpdates.isCanonicalCommunityPost(c)) continue;
    communities.push(communityUpdates.applyCommunityUpdates(buildLocalCommunityRecord(c), updates));
  }
  return communities;
}

/**
 * PM-09: um `community_update` de quem não é dono nem moderador de uma comunidade
 * conhecida aqui não é gravado nem repassado. Comunidade desconhecida: aceita, e o
 * filtro de `applyCommunityUpdates` decide na hora de mostrar.
 */
export async function isCommunityUpdateAcceptable(update) {
  if (!update?.communityId) return false;
  const post = await getLocalPost(communityUpdates.canonicalCommunityPostId(update.communityId));
  if (!post || post.type !== "community") return true;
  return communityUpdates.canUpdateCommunity(buildLocalCommunityRecord(post), update.author);
}

export async function clearLocalPosts() {
  try {
    const db = await openDB();
    await new Promise((resolve) => {
      const tx = db.transaction(LOCAL_POSTS_STORE, "readwrite");
      const store = tx.objectStore(LOCAL_POSTS_STORE);
      const req = store.clear();
      req.onsuccess = () => {
        invalidateReplyCountsCache();
        resolve();
      };
      req.onerror = () => resolve();
    });
  } catch {}
}

function itemMatchesTag(item, targetSlug) {
  const tags = Array.isArray(item.tags) && item.tags.length > 0
    ? item.tags
    : hashtags.extractHashtags(`${item.title || ""} ${item.body || ""} ${item.description || ""}`);
  return tags.includes(targetSlug);
}

function collectMatchingItems(items, targetSlug, seenIds, results, typeFilter = null) {
  for (const item of items) {
    if (!item || seenIds.has(item.id)) continue;
    if (typeFilter && !typeFilter(item)) continue;
    if (itemMatchesTag(item, targetSlug)) {
      seenIds.add(item.id);
      results.push(item);
    }
  }
}

export async function getPostsByTag(slug) {
  if (!slug) return [];
  const targetSlug = hashtags.slugifyTag(slug);
  if (!targetSlug) return [];

  const results = [];
  const seenIds = new Set();

  try {
    const localPosts = await getLocalPosts();
    collectMatchingItems(
      localPosts,
      targetSlug,
      seenIds,
      results,
      (p) => p.type === "topic" || p.type === "listing",
    );
  } catch {}

  try {
    collectMatchingItems(mock.mockRecentTopics()?.items || [], targetSlug, seenIds, results);
  } catch {}

  try {
    collectMatchingItems(mock.mockListings("demo-feira-local")?.items || [], targetSlug, seenIds, results);
  } catch {}

  results.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return results;
}
