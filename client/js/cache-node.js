// Cache local persistente para transações e corpos do Vox (IndexedDB + LRU)

const DB_NAME = "vox-cache-db";
const DB_VERSION = 1;
const STORE_NAME = "tx-data";

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
