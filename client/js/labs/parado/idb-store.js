/**
 * @file IndexedDB: fila outbox offline, blobs e KV assíncrono (laboratório).
 * @module labs/parado/idb-store
 */

import { randomBase36 } from "../../shared/html.js";

/**
 * Nome do banco IndexedDB do módulo.
 * @type {string}
 */
export const DB_NAME = "vox-store-db";

/**
 * Versão do esquema do banco.
 * @type {number}
 */
export const DB_VERSION = 1;

/**
 * Nomes das object stores.
 * @type {Readonly<{OUTBOX: string, BLOBS: string, KV: string}>}
 */
export const STORES = {
  OUTBOX: "outbox",
  BLOBS: "blobs",
  KV: "kv",
};

/**
 * Estados possíveis de um item na fila outbox.
 * @type {Readonly<{PENDING: string, SYNCING: string, DELIVERED: string, FAILED: string}>}
 */
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

/**
 * Reseta o singleton de conexão (somente testes).
 * @returns {void}
 */
export function resetDbHandleForTesting() {
  dbPromise = null;
}

/**
 * Abre ou reutiliza a conexão IndexedDB, criando stores na primeira migração.
 * @returns {Promise<IDBDatabase>}
 */
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
    req.onsuccess = (e) => {
      const db = e.target.result || req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
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

/**
 * Enfileira operação offline para sincronização posterior.
 * @param {object} [options={}]
 * @param {string} options.action Nome da operação.
 * @param {unknown} options.payload Corpo serializável.
 * @param {string} [options.target="arweave"] Destino da sincronização.
 * @param {string|null} [options.id=null] Id fixo; gera um se omitido.
 * @param {object} [options.meta={}] Metadados extras.
 * @returns {Promise<object>} Item gravado.
 */
export function enqueueOutboxItem({ action, payload, target = "arweave", id = null, meta = {} } = {}) {
  if (!action || !payload) {
    return Promise.reject(new Error("action e payload são mandatários na fila outbox"));
  }
  const itemId = id || `out_${Date.now()}_${randomBase36(7)}`;
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

/**
 * Lista itens da outbox, opcionalmente filtrados por status.
 * @param {string|null} [statusFilter=null] Um de {@link OUTBOX_STATUS}.
 * @returns {Promise<object[]>}
 */
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

/**
 * Carrega um item da outbox por id.
 * @param {string} id Chave do item.
 * @returns {Promise<object|null>}
 */
export function getOutboxItem(id) {
  if (!id) return Promise.resolve(null);
  return executeTx(STORES.OUTBOX, "readonly", (store, resolve) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

/**
 * Mescla campos num item existente.
 * @param {string} id Chave do item.
 * @param {object} [updates={}] Campos a sobrescrever.
 * @returns {Promise<object|null>}
 */
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

/**
 * Remove item da outbox.
 * @param {string} id Chave do item.
 * @returns {Promise<boolean>}
 */
export function removeOutboxItem(id) {
  if (!id) return Promise.resolve(false);
  return executeTx(STORES.OUTBOX, "readwrite", (store, resolve) => {
    store.delete(id);
    resolve(true);
  });
}

/**
 * Grava blob binário ou string na store de blobs.
 * @param {string} id Chave do blob.
 * @param {string|ArrayBuffer|Uint8Array} data Conteúdo.
 * @param {string} [mimeType="application/octet-stream"] Tipo MIME.
 * @returns {Promise<object>} Entrada persistida.
 */
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

/**
 * Lê blob por id.
 * @param {string} id Chave do blob.
 * @returns {Promise<object|null>}
 */
export function getBlob(id) {
  if (!id) return Promise.resolve(null);
  return executeTx(STORES.BLOBS, "readonly", (store, resolve) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

/**
 * Grava par chave-valor na store KV.
 * @param {string} key Chave.
 * @param {unknown} value Valor serializável pelo IndexedDB.
 * @returns {Promise<unknown>}
 */
export function setKeyValue(key, value) {
  if (!key) return Promise.reject(new Error("key é mandatária"));
  return executeTx(STORES.KV, "readwrite", (store, resolve) => {
    store.put({ id: key, key, value, updatedAt: Date.now() });
    resolve(value);
  });
}

/**
 * Lê valor da store KV.
 * @param {string} key Chave.
 * @returns {Promise<unknown|null>}
 */
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

/**
 * Esvazia uma object store inteira.
 * @param {string} storeName Nome em {@link STORES}.
 * @returns {Promise<true>}
 */
export function clearStore(storeName) {
  return executeTx(storeName, "readwrite", (store, resolve) => {
    store.clear();
    resolve(true);
  });
}