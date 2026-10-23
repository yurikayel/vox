// Cache local persistente para transações e corpos do Vox (IndexedDB + LRU)

const DB_NAME = "vox-cache-db";
const DB_VERSION = 3;
const STORE_NAME = "tx-data";
const DM_STORE_NAME = "dm-threads";
const LOCAL_POSTS_STORE = "local-posts";

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      return reject(new Error("IndexedDB não suportado neste ambiente"));
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("lastAccessed", "lastAccessed", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
      if (!db.objectStoreNames.contains(DM_STORE_NAME)) {
        const dmStore = db.createObjectStore(DM_STORE_NAME, { keyPath: "id" });
        dmStore.createIndex("peerAddress", "peerAddress", { unique: false });
        dmStore.createIndex("ts", "ts", { unique: false });
      }
      if (!db.objectStoreNames.contains(LOCAL_POSTS_STORE)) {
        const localStore = db.createObjectStore(LOCAL_POSTS_STORE, { keyPath: "id" });
        localStore.createIndex("type", "type", { unique: false });
        localStore.createIndex("communityId", "communityId", { unique: false });
        localStore.createIndex("replyTo", "replyTo", { unique: false });
        localStore.createIndex("ts", "ts", { unique: false });
      }
    };
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

export async function getDmConversations() {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(DM_STORE_NAME, "readonly");
      const store = tx.objectStore(DM_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const all = req.result || [];
        const map = new Map();
        for (const m of all) {
          const existing = map.get(m.peerAddress);
          if (!existing || (m.ts || 0) > (existing.lastTs || 0)) {
            map.set(m.peerAddress, {
              peerAddress: m.peerAddress,
              lastText: m.text,
              lastTs: m.ts || 0,
              lastStatus: m.status,
            });
          }
        }
        const sorted = Array.from(map.values()).sort((a, b) => b.lastTs - a.lastTs);
        resolve(sorted);
      };
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

export async function saveLocalPost(post) {
  if (!post?.id || !post?.type) return;
  try {
    const db = await openDB();
    await new Promise((resolve) => {
      const tx = db.transaction(LOCAL_POSTS_STORE, "readwrite");
      const store = tx.objectStore(LOCAL_POSTS_STORE);
      store.put({
        ...post,
        id: post.id,
        type: post.type,
        communityId: post.communityId || "",
        replyTo: post.replyTo || "",
        proposalId: post.proposalId || "",
        title: post.title || "",
        body: post.body || "",
        diffText: post.diffText || "",
        closesAt: post.closesAt || 0,
        minQuorum: post.minQuorum || 0,
        state: post.state || "open",
        choice: post.choice || "",
        joinedAt: post.joinedAt || 0,
        category: post.category || "",
        description: post.description || "",
        author: post.author || post.owner || "",
        image: post.image || "",
        imageAlt: post.imageAlt || "",
        externalPain: post.externalPain || "",
        voxResolution: post.voxResolution || "now",
        priceLabel: post.priceLabel || "",
        locationLabel: post.locationLabel || "",
        contactPix: post.contactPix || "",
        listingStatus: post.listingStatus || "available",
        commercialEnabled: Boolean(post.commercialEnabled),
        likesCount: Number(post.likesCount) || 0,
        repliesCount: Number(post.repliesCount) || 0,
        pubKey: post.pubKey || null,
        sig: post.sig || "",
        ts: post.ts || post.createdAt || Date.now(),
        isLocalP2p: true,
      });
      tx.oncomplete = () => resolve();
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
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function getLocalPosts({ type = null, communityId = null, replyTo = null, proposalId = null } = {}) {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(LOCAL_POSTS_STORE, "readonly");
      const store = tx.objectStore(LOCAL_POSTS_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        let items = req.result || [];
        if (type) items = items.filter((p) => p.type === type);
        if (communityId) items = items.filter((p) => p.communityId === communityId);
        if (replyTo !== null) items = items.filter((p) => p.replyTo === replyTo);
        if (proposalId) items = items.filter((p) => p.proposalId === proposalId);

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

export async function getLocalCommunities() {
  const posts = await getLocalPosts({ type: "community" });
  return posts.map((c) => ({
    id: c.communityId || c.id,
    communityId: c.communityId || c.id,
    title: c.title || c.communityId || c.id,
    description: c.description || c.body || "",
    category: c.category || "",
    owner: c.author || "",
    commercialEnabled: Boolean(c.commercialEnabled),
    isLocalP2p: true,
  }));
}

export async function clearLocalPosts() {
  try {
    const db = await openDB();
    await new Promise((resolve) => {
      const tx = db.transaction(LOCAL_POSTS_STORE, "readwrite");
      const store = tx.objectStore(LOCAL_POSTS_STORE);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {}
}
