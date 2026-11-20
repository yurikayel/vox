/**
 * @file Armazenamento local-first da Mesa Soberana em IndexedDB dedicado (`vox-vtt-db-v1`)
 * com backend em memória injetável para testes unitários sem dependências extras.
 * @module dungeon/vtt-store
 */
import { sha256Hex } from "../rpg-crypto-table.js";
import { checkPersistence, estimateStorage, requestPersistence } from "../storage-persistence.js";
import { reduceCampaign, replayCampaignOps } from "./vtt-reducer.js";
import { createCampaign, validateCampaignDoc } from "./vtt-schema.js";

/** Nome canônico do banco IndexedDB dedicado ao VTT. */
export const VTT_DB_NAME = "vox-vtt-db-v1";
/** Versão de schema do banco IndexedDB do VTT. */
export const VTT_DB_VERSION = 1;
/** Intervalo padrão de compactação automática do log `ops` para `snapshots`. */
export const SNAPSHOT_INTERVAL = 50;

const STORES = Object.freeze({
  campaigns: "campaigns",
  snapshots: "snapshots",
  ops: "ops",
  blobs: "blobs",
});

function keyForStore(storeName, value) {
  if (storeName === STORES.campaigns) return value.id;
  if (storeName === STORES.snapshots) return value.campaignId;
  if (storeName === STORES.blobs) return value.sha256;
  return `${value.campaignId}::${value.opId}`;
}

function getMemoryOps(opsMap, campaignId) {
  const list = [];
  for (const row of opsMap.values()) {
    if (row.campaignId === campaignId) list.push(structuredClone(row));
  }
  return list;
}

function deleteMemoryOps(opsMap, campaignId) {
  for (const [k, row] of opsMap.entries()) {
    if (row.campaignId === campaignId) opsMap.delete(k);
  }
}

/**
 * Cria um backend puro em memória com a mesma interface do backend IndexedDB (ideal para `node:test`).
 * @returns {object} Backend assíncrono compatível com `createVttStore`.
 */
export function createMemoryVttBackend() {
  const tables = {
    [STORES.campaigns]: new Map(),
    [STORES.snapshots]: new Map(),
    [STORES.ops]: new Map(),
    [STORES.blobs]: new Map(),
  };
  return {
    get: async (storeName, key) => (tables[storeName]?.has(key) ? structuredClone(tables[storeName].get(key)) : null),
    put: async (storeName, value) => { tables[storeName].set(keyForStore(storeName, value), structuredClone(value)); },
    delete: async (storeName, key) => { tables[storeName]?.delete(key); },
    getAll: async (storeName) => [...(tables[storeName]?.values() || [])].map((v) => structuredClone(v)),
    getOpsByCampaign: async (campaignId) => getMemoryOps(tables[STORES.ops], campaignId),
    deleteOpsByCampaign: async (campaignId) => deleteMemoryOps(tables[STORES.ops], campaignId),
  };
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Erro em requisição IndexedDB."));
  });
}

function upgradeVttSchema(db) {
  if (!db.objectStoreNames.contains(STORES.campaigns)) db.createObjectStore(STORES.campaigns, { keyPath: "id" });
  if (!db.objectStoreNames.contains(STORES.snapshots)) db.createObjectStore(STORES.snapshots, { keyPath: "campaignId" });
  if (!db.objectStoreNames.contains(STORES.blobs)) db.createObjectStore(STORES.blobs, { keyPath: "sha256" });
  if (!db.objectStoreNames.contains(STORES.ops)) {
    const opsStore = db.createObjectStore(STORES.ops, { keyPath: ["campaignId", "opId"] });
    opsStore.createIndex("byCampaign", "campaignId", { unique: false });
  }
}

function openVttDb(idb) {
  return new Promise((resolve, reject) => {
    const req = idb.open(VTT_DB_NAME, VTT_DB_VERSION);
    req.onupgradeneeded = () => upgradeVttSchema(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Não foi possível abrir o banco local da Mesa."));
  });
}

async function withIdbStore(dbPromise, storeName, mode, fn) {
  const db = await dbPromise;
  const tx = db.transaction(storeName, mode);
  const store = tx.objectStore(storeName);
  const done = new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Falha na transação IndexedDB."));
    tx.onabort = () => reject(tx.error || new Error("Transação IndexedDB abortada."));
  });
  const result = await fn(store);
  await done;
  return result;
}

/**
 * Cria um backend IndexedDB dedicado (`vox-vtt-db-v1`) com 4 object stores (`campaigns`, `snapshots`, `ops`, `blobs`).
 * @param {IDBFactory} [idb=globalThis.indexedDB] Instância IndexedDB do navegador.
 * @returns {object} Backend assíncrono compatível com `createVttStore`.
 */
export function createIdbVttBackend(idb = globalThis.indexedDB) {
  if (!idb || typeof idb.open !== "function") {
    throw new Error("IndexedDB indisponível neste ambiente.");
  }
  let dbPromise = null;
  const getDb = () => (dbPromise ||= openVttDb(idb));
  return {
    get: (storeName, key) => withIdbStore(getDb(), storeName, "readonly", async (s) => (await reqToPromise(s.get(key))) ?? null),
    put: (storeName, value) => withIdbStore(getDb(), storeName, "readwrite", (s) => reqToPromise(s.put(value))),
    delete: (storeName, key) => withIdbStore(getDb(), storeName, "readwrite", (s) => reqToPromise(s.delete(key))),
    getAll: (storeName) => withIdbStore(getDb(), storeName, "readonly", (s) => reqToPromise(s.getAll())),
    getOpsByCampaign: (campaignId) => withIdbStore(getDb(), STORES.ops, "readonly", (s) => reqToPromise(s.index("byCampaign").getAll(campaignId))),
    deleteOpsByCampaign: (campaignId) => withIdbStore(getDb(), STORES.ops, "readwrite", async (s) => {
      const keys = await reqToPromise(s.index("byCampaign").getAllKeys(campaignId));
      for (const k of keys) s.delete(k);
    }),
  };
}

function toCampaignMeta(doc) {
  return {
    id: doc.id,
    name: doc.name,
    system: doc.system,
    activeSheetId: doc.activeSheetId,
    sheetCount: Object.keys(doc.sheetsById || {}).length,
    chronicleCount: (doc.chronicle || []).length,
    lamport: doc.lamport || 0,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function listCampaignsWithBackend(backend) {
  const rows = await backend.getAll(STORES.campaigns);
  return rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

async function saveCampaignWithBackend(backend, cfg, rawDoc) {
  const check = validateCampaignDoc(rawDoc);
  if (!check.valid) throw new Error(check.error);
  const existing = await backend.getAll(STORES.campaigns);
  if (existing.length === 0) await cfg.requestPersistenceFn().catch(() => null);
  const doc = createCampaign(rawDoc);
  await backend.put(STORES.snapshots, { campaignId: doc.id, doc, lamport: doc.lamport, updatedAt: doc.updatedAt });
  await backend.put(STORES.campaigns, toCampaignMeta(doc));
  await backend.deleteOpsByCampaign(doc.id);
  return doc;
}

async function loadCampaignWithBackend(backend, campaignId) {
  const snap = await backend.get(STORES.snapshots, campaignId);
  if (!snap?.doc) return null;
  const rows = await backend.getOpsByCampaign(campaignId);
  const ops = rows.map((r) => r.op).filter(Boolean);
  return ops.length ? replayCampaignOps(snap.doc, ops) : createCampaign(snap.doc);
}

async function appendOpWithBackend(backend, cfg, campaignId, op) {
  const current = await loadCampaignWithBackend(backend, campaignId);
  if (!current) throw new Error(`Campanha não encontrada: "${campaignId}".`);
  const next = reduceCampaign(current, op);
  if (next === current) return { campaign: current, snapshotted: false, duplicate: true };
  await backend.put(STORES.ops, { campaignId, opId: op.opId, lamport: op.lamport, ts: op.ts, op });
  const pendingOps = await backend.getOpsByCampaign(campaignId);
  let snapshotted = false;
  if (pendingOps.length >= cfg.snapshotInterval) {
    await backend.put(STORES.snapshots, { campaignId, doc: next, lamport: next.lamport, updatedAt: next.updatedAt });
    await backend.deleteOpsByCampaign(campaignId);
    snapshotted = true;
  }
  await backend.put(STORES.campaigns, toCampaignMeta(next));
  return { campaign: next, snapshotted, duplicate: false };
}

async function deleteCampaignWithBackend(backend, campaignId) {
  await backend.delete(STORES.campaigns, campaignId);
  await backend.delete(STORES.snapshots, campaignId);
  await backend.deleteOpsByCampaign(campaignId);
}

async function putBlobWithBackend(backend, bytes, mime = "application/octet-stream") {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const sha256 = await sha256Hex(data);
  const existing = await backend.get(STORES.blobs, sha256);
  if (existing) return { sha256, size: data.length, deduplicated: true };
  await backend.put(STORES.blobs, { sha256, bytes: data, mime, size: data.length, createdAt: Date.now() });
  return { sha256, size: data.length, deduplicated: false };
}

async function getBlobWithBackend(backend, sha256) {
  const row = await backend.get(STORES.blobs, sha256);
  return row?.bytes instanceof Uint8Array ? row.bytes : null;
}

async function getAllBlobsMapWithBackend(backend) {
  const rows = await backend.getAll(STORES.blobs);
  const out = new Map();
  for (const row of rows) {
    if (row?.sha256 && row.bytes instanceof Uint8Array) out.set(row.sha256, row.bytes);
  }
  return out;
}

async function estimateUsageWithCfg(cfg) {
  const est = await cfg.estimateStorageFn();
  const persisted = await cfg.checkPersistenceFn();
  return { ...est, persisted };
}

function createCampaignQueue() {
  const tails = new Map();
  return (key, fn) => {
    const prev = tails.get(key) || Promise.resolve();
    const run = prev.catch(() => {}).then(fn);
    const tail = run.finally(() => {
      if (tails.get(key) === tail) tails.delete(key);
    });
    tails.set(key, tail);
    return run;
  };
}

/**
 * Instancia o repositório local-first da Mesa Soberana sobre um backend (IndexedDB ou memória).
 * @param {object} [backend] Backend de persistência; usa IndexedDB quando disponível, ou memória em fallback.
 * @param {object} [opts={}] Opções (`snapshotInterval`, `requestPersistenceFn`, `estimateStorageFn`, `checkPersistenceFn`).
 * @returns {object} API completa do `VttStore`.
 */
export function createVttStore(backend, opts = {}) {
  const b = backend || (typeof globalThis.indexedDB?.open === "function" ? createIdbVttBackend() : createMemoryVttBackend());
  const enqueue = createCampaignQueue();
  const cfg = {
    snapshotInterval: Math.max(1, Math.trunc(Number(opts.snapshotInterval) || SNAPSHOT_INTERVAL)),
    requestPersistenceFn: opts.requestPersistenceFn || requestPersistence,
    estimateStorageFn: opts.estimateStorageFn || estimateStorage,
    checkPersistenceFn: opts.checkPersistenceFn || checkPersistence,
  };
  return {
    listCampaigns: () => listCampaignsWithBackend(b),
    saveCampaign: (doc) => enqueue(doc?.id || "__new__", () => saveCampaignWithBackend(b, cfg, doc)),
    loadCampaign: (id) => loadCampaignWithBackend(b, id),
    appendOp: (id, op) => enqueue(id, () => appendOpWithBackend(b, cfg, id, op)),
    deleteCampaign: (id) => enqueue(id, () => deleteCampaignWithBackend(b, id)),
    putBlob: (bytes, mime) => putBlobWithBackend(b, bytes, mime),
    getBlob: (sha256) => getBlobWithBackend(b, sha256),
    getAllBlobsMap: () => getAllBlobsMapWithBackend(b),
    estimateUsage: () => estimateUsageWithCfg(cfg),
  };
}

let defaultStore = null;

/**
 * Retorna a instância padrão (singleton lazy) do `VttStore` para a aba atual.
 * @param {boolean} [reset=false] Recria a instância (útil em testes).
 * @returns {object} Instância padrão do `VttStore`.
 */
export function getDefaultVttStore(reset = false) {
  if (!defaultStore || reset) defaultStore = createVttStore();
  return defaultStore;
}
