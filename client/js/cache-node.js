// Cache local persistente para transações e corpos do Vox (IndexedDB + LRU)
import * as hashtags from "./hashtags.js";
import * as mock from "./mock.js";

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

export async function enforceMaxCacheSize(maxMb = 25) {
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
  if (!tombstone?.id) return;
  try {
    const db = await openDB();
    await new Promise((resolve) => {
      const tx = db.transaction(LOCAL_POSTS_STORE, "readwrite");
      const store = tx.objectStore(LOCAL_POSTS_STORE);
      store.put({
        id: tombstone.id,
        type: "tombstone",
        kind: "post-tombstone",
        author: tombstone.author || "",
        ts: tombstone.ts || Date.now(),
        editedAt: tombstone.editedAt || Date.now(),
        sig: tombstone.sig || "",
        pubKey: tombstone.pubKey || null,
        isLocalP2p: true,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
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
          resolve(res);
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

export async function getPostRecord(id) {
  if (!id) return null;
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(LOCAL_POSTS_STORE, "readonly");
      const store = tx.objectStore(LOCAL_POSTS_STORE);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

let cachedReplyCountsMap = null;

export function invalidateReplyCountsCache() {
  cachedReplyCountsMap = null;
}

const LOCAL_POST_DEFAULTS = Object.freeze({
  communityId: "",
  replyTo: "",
  proposalId: "",
  postId: "",
  frame: null,
  frameKind: "",
  buttonIndex: 0,
  buttonLabel: "",
  inputText: "",
  title: "",
  body: "",
  diffText: "",
  closesAt: 0,
  minQuorum: 0,
  state: "open",
  choice: "",
  joinedAt: 0,
  category: "",
  description: "",
  authorDisplay: "",
  authorAvatar: "",
  authorHandle: "",
  image: "",
  imageAlt: "",
  externalPain: "",
  voxResolution: "now",
  priceLabel: "",
  locationLabel: "",
  contactPix: "",
  listingStatus: "available",
  commercialEnabled: false,
  likesCount: 0,
  repliesCount: 0,
  pubKey: null,
  sig: "",
  editedAt: 0,
});

function normalizeLocalPost(post) {
  const combinedText = `${post.title || ""} ${post.body || ""} ${post.description || ""}`;
  return {
    ...LOCAL_POST_DEFAULTS,
    ...post,
    id: post.id,
    type: post.type,
    author: post.author || post.owner || "",
    buttonIndex: Number(post.buttonIndex) || 0,
    commercialEnabled: Boolean(post.commercialEnabled),
    likesCount: Number(post.likesCount) || 0,
    repliesCount: Number(post.repliesCount) || 0,
    tags: hashtags.extractHashtags(combinedText),
    ts: post.ts || post.createdAt || Date.now(),
    isLocalP2p: true,
  };
}

export async function saveLocalPost(post) {
  if (!post?.id || !post?.type) return;
  const tombstone = await getTombstone(post.id);
  const postTime = post.editedAt || post.ts || 0;
  if (tombstone && (tombstone.editedAt || 0) >= postTime) return;

  const record = normalizeLocalPost(post);
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
  } catch {}
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
          resolve(res);
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
        let items = (req.result || []).filter((p) => p.type !== "tombstone" && p.kind !== "post-tombstone");
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
    isLocalP2p: true,
  };
}

function applyCommunityUpdate(existing, u) {
  if (u.image || u.avatar) {
    existing.image = u.image || u.avatar;
    existing.avatar = u.avatar || u.image;
  }
  if (u.title) existing.title = u.title;
  if (u.description) existing.description = u.description;
  if (u.category) existing.category = u.category;
}

export async function getLocalCommunities() {
  const posts = await getLocalPosts({ type: "community" });
  const updates = await getLocalPosts({ type: "community_update" });
  const map = new Map();
  for (const c of posts) {
    const cid = c.communityId || c.id;
    map.set(cid, buildLocalCommunityRecord(c));
  }
  for (const u of updates) {
    const cid = u.communityId || u.id;
    const existing = map.get(cid);
    if (existing) {
      applyCommunityUpdate(existing, u);
    }
  }
  return Array.from(map.values());
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
