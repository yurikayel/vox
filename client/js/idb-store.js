/**
 * idb-store.js — Armazenamento Transacional IndexedDB & Fila Outbox Offline (Vox)
 *
 * Provê persistência assíncrona desacoplada de localStorage para:
 * 1. Fila Outbox (operações criadas offline aguardando sincronização de rede ou malha);
 * 2. Blobs binários e mídias cacheadas com integridade;
 * 3. Tabela chave-valor genérica assíncrona.
 */

export const DB_NAME = "vox-store-db";
export const DB_VERSION = 1;

export const STORES = {
  OUTBOX: "outbox",
  BLOBS: "blobs",
  KV: "kv",
};

export const OUTBOX_STATUS = {
  PENDING: "pending",
  SYNCING: "syncing",
  DELIVERED: "delivered",
  FAILED: "failed",
};

let dbPromise = null;

function getIndexedDB() {
  if (typeof window !== "undefined" && window.indexedDB) {
    return window.indexedDB;
  }
  if (typeof globalThis !== "undefined" && globalThis.indexedDB) {
    return globalThis.indexedDB;
  }
  return null;
}

export function resetDbHandleForTesting() {
  dbPromise = null;
}

export function openStoreDB() {
  if (dbPromise) return dbPromise;
  const idb = getIndexedDB();
  if (!idb) return Promise.reject(new Error("IndexedDB não disponível"));

  dbPromise = new Promise((resolve, reject) => {
    const req = idb.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      createStoresIfMissing(db);
    };
    req.onsuccess = (e) => resolve(e.target.result || req.result);
    req.onerror = () => reject(req.error || new Error("Falha ao abrir IndexedDB"));
  });
  return dbPromise;
}

function createStoresIfMissing(db) {
  if (!db.objectStoreNames.contains(STORES.OUTBOX)) {
    const outbox = db.createObjectStore(STORES.OUTBOX, { keyPath: "id" });
    outbox.createIndex("status", "status", { unique: false });
    outbox.createIndex("createdAt", "createdAt", { unique: false });
  }
  if (!db.objectStoreNames.contains(STORES.BLOBS)) {
    const blobs = db.createObjectStore(STORES.BLOBS, { keyPath: "id" });
    blobs.createIndex("mimeType", "mimeType", { unique: false });
    blobs.createIndex("createdAt", "createdAt", { unique: false });
  }
  if (!db.objectStoreNames.contains(STORES.KV)) {
    db.createObjectStore(STORES.KV, { keyPath: "key" });
  }
}

function executeTx(storeName, mode, callback) {
  return openStoreDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      callback(store, resolve, reject);
      tx.onerror = () => reject(tx.error);
    });
  });
}

export function enqueueOutboxItem({ action, payload, target = "arweave", id = null, meta = {} } = {}) {
  if (!action || !payload) {
    return Promise.reject(new Error("action e payload são mandatários na fila outbox"));
  }
  const itemId = id || `out_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const item = {
    id: itemId,
    action,
    payload,
    target,
    meta,
    status: OUTBOX_STATUS.PENDING,
    attempts: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastError: null,
  };
  return executeTx(STORES.OUTBOX, "readwrite", (store, resolve) => {
    store.put(item);
    resolve(item);
  });
}

export function listOutboxItems(statusFilter = null) {
  return executeTx(STORES.OUTBOX, "readonly", (store, resolve) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const items = req.result || [];
      if (!statusFilter) return resolve(items);
      resolve(items.filter((i) => i.status === statusFilter));
    };
    req.onerror = () => resolve([]);
  });
}

export function getOutboxItem(id) {
  if (!id) return Promise.resolve(null);
  return executeTx(STORES.OUTBOX, "readonly", (store, resolve) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

export function updateOutboxItem(id, updates = {}) {
  return getOutboxItem(id).then((existing) => {
    if (!existing) return null;
    const merged = { ...existing, ...updates, updatedAt: Date.now() };
    return executeTx(STORES.OUTBOX, "readwrite", (store, resolve) => {
      store.put(merged);
      resolve(merged);
    });
  });
}

export function removeOutboxItem(id) {
  if (!id) return Promise.resolve(false);
  return executeTx(STORES.OUTBOX, "readwrite", (store, resolve) => {
    store.delete(id);
    resolve(true);
  });
}

export function putBlob(id, data, mimeType = "application/octet-stream") {
  if (!id || data === undefined || data === null) {
    return Promise.reject(new Error("id e data são mandatários para putBlob"));
  }
  const entry = {
    id,
    data,
    mimeType,
    size: typeof data === "string" ? data.length : data.byteLength || 0,
    createdAt: Date.now(),
  };
  return executeTx(STORES.BLOBS, "readwrite", (store, resolve) => {
    store.put(entry);
    resolve(entry);
  });
}

export function getBlob(id) {
  if (!id) return Promise.resolve(null);
  return executeTx(STORES.BLOBS, "readonly", (store, resolve) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

export function setKeyValue(key, value) {
  if (!key) return Promise.reject(new Error("key é mandatária"));
  return executeTx(STORES.KV, "readwrite", (store, resolve) => {
    store.put({ id: key, key, value, updatedAt: Date.now() });
    resolve(value);
  });
}

export function getKeyValue(key) {
  if (!key) return Promise.resolve(null);
  return executeTx(STORES.KV, "readonly", (store, resolve) => {
    const req = store.get(key);
    req.onsuccess = () => {
      const res = req.result;
      resolve(res ? res.value : null);
    };
    req.onerror = () => resolve(null);
  });
}

export function clearStore(storeName) {
  return executeTx(storeName, "readwrite", (store, resolve) => {
    store.clear();
    resolve(true);
  });
}
