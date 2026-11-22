/**
 * @file Inicialização e acesso ao banco IndexedDB `vox-cache-db` do cache local persistente do Vox.
 */

const DB_NAME = "vox-cache-db";
const DB_VERSION = 4;

/** Nome da store de dados de transações. */
export const STORE_NAME = "tx-data";

/** Nome da store de conversas de DM. */
export const DM_STORE_NAME = "dm-threads";

/** Nome da store de posts locais e lápides. */
export const LOCAL_POSTS_STORE = "local-posts";

/** Nome da store do índice de tags. */
export const TAG_INDEX_STORE = "tag-index";

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

/**
 * Abre (ou reaproveita) a conexão com o banco IndexedDB do cache.
 * @returns {Promise<IDBDatabase>} Conexão aberta do IndexedDB.
 */
export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      return reject(new Error("IndexedDB não suportado neste ambiente"));
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => upgradeDatabaseSchema(e.target.result);
    req.onsuccess = (e) => {
      const db = e.target.result;
      // "Apagar conta local" remove o banco: solta a conexão para a remoção não ficar presa.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
