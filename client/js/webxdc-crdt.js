/**
 * webxdc-crdt.js — Adaptador CRDT e Compactador de Épocas para Cartuchos Webxdc (Vox)
 *
 * Implementa:
 * 1. Padrão ID Lookup enxuto (items com LWW + vetor determinístico order + tombstones);
 * 2. Limiar de compactação determinístico (EPOCH_COMPACT_THRESHOLD = 50);
 * 3. Gatilho de snapshot no relay cego sem colisão entre clientes;
 * 4. Cold boot em 2 passos: GET snapshot base + GET envelopes incrementais.
 */

export const EPOCH_COMPACT_THRESHOLD = 50;
export const MAX_SNAPSHOT_BYTES = 512 * 1024;

function validateStoreId(id) {
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("ID do item deve ser uma string não vazia");
  }
  return id.trim();
}

function normalizeItemPayload(data) {
  if (data !== null && typeof data === "object" && !Array.isArray(data)) {
    return { ...data };
  }
  return { value: data };
}

function shouldSkipLwwSet(existing, tombstones, id, timestamp) {
  if (tombstones.has(id) && tombstones.get(id) >= timestamp) {
    return true;
  }
  if (existing && existing.updatedAt > timestamp) {
    return true;
  }
  return false;
}

function shouldSkipLwwRemove(existing, tombstones, id, timestamp) {
  if (existing && existing.updatedAt > timestamp) {
    return true;
  }
  if (tombstones.has(id) && tombstones.get(id) >= timestamp) {
    return true;
  }
  return false;
}

export class IdLookupStore {
  constructor(initialState = {}) {
    this.items = new Map();
    this.order = [];
    this.tombstones = new Map();
    this.listeners = new Set();
    hydrateInitialState(this.items, this.order, this.tombstones, initialState);
  }

  notify() {
    const snap = getSnapshotObject(this.items, this.order, this.tombstones);
    for (const listener of this.listeners) {
      try {
        listener(snap);
      } catch {
        // Ignora erros em callbacks de observadores
      }
    }
  }

  setItem(rawId, data, ts = Date.now(), sender = "") {
    const id = validateStoreId(rawId);
    const timestamp = Number(ts) || Date.now();
    const existing = this.items.get(id);

    if (shouldSkipLwwSet(existing, this.tombstones, id, timestamp)) {
      return false;
    }

    this.tombstones.delete(id);
    const merged = existing ? { ...existing.data, ...normalizeItemPayload(data) } : normalizeItemPayload(data);
    this.items.set(id, { data: merged, updatedAt: timestamp, sender: String(sender || "") });

    if (!this.order.includes(id)) {
      this.order.push(id);
    }
    this.notify();
    return true;
  }

  removeItem(rawId, ts = Date.now()) {
    const id = validateStoreId(rawId);
    const timestamp = Number(ts) || Date.now();
    const existing = this.items.get(id);

    if (shouldSkipLwwRemove(existing, this.tombstones, id, timestamp)) {
      return false;
    }

    this.tombstones.set(id, timestamp);
    this.items.delete(id);
    const idx = this.order.indexOf(id);
    if (idx !== -1) {
      this.order.splice(idx, 1);
    }
    this.notify();
    return true;
  }

  moveItem(rawId, targetIndex) {
    const id = validateStoreId(rawId);
    if (!this.items.has(id)) {
      return false;
    }
    const curIdx = this.order.indexOf(id);
    if (curIdx === -1) {
      return false;
    }

    this.order.splice(curIdx, 1);
    const bound = Math.max(0, Math.min(Number(targetIndex) || 0, this.order.length));
    this.order.splice(bound, 0, id);
    this.notify();
    return true;
  }

  getItem(rawId) {
    const id = validateStoreId(rawId);
    const entry = this.items.get(id);
    if (!entry) return null;
    return { ...entry.data, _updatedAt: entry.updatedAt, _sender: entry.sender };
  }

  getItems() {
    return this.order
      .filter((id) => this.items.has(id))
      .map((id) => {
        const entry = this.items.get(id);
        return { id, ...entry.data, _updatedAt: entry.updatedAt, _sender: entry.sender };
      });
  }

  getOrder() {
    return [...this.order];
  }

  getStateSnapshot() {
    return getSnapshotObject(this.items, this.order, this.tombstones);
  }

  mergeSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return false;
    mergeRemoteTombstones(this.tombstones, this.items, this.order, snapshot.tombstones);
    mergeRemoteItems(this.items, this.order, this.tombstones, snapshot.items);
    this.notify();
    return true;
  }

  applyRemoteUpdate(update) {
    if (!update || typeof update !== "object") return false;
    if (update.type === "set") {
      return this.setItem(update.id, update.data, update.ts, update.sender);
    }
    if (update.type === "remove") {
      return this.removeItem(update.id, update.ts);
    }
    if (update.type === "move") {
      return this.moveItem(update.id, update.targetIndex);
    }
    if (update.type === "batch" && Array.isArray(update.operations)) {
      return applyBatchOperations(update.operations, (op) => this.applyRemoteUpdate(op));
    }
    if (update.payload && typeof update.payload === "object") {
      return this.applyRemoteUpdate(update.payload);
    }
    return false;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export function createIdLookupStore(initialState = {}) {
  return new IdLookupStore(initialState);
}

function hydrateInitialState(items, order, tombstones, state) {
  hydrateTombstones(tombstones, state.tombstones);
  hydrateItems(items, state.items);
  hydrateOrder(order, items, state.order);
}

function hydrateTombstones(tombstones, rawTombstones) {
  if (!rawTombstones || typeof rawTombstones !== "object") return;
  for (const [id, ts] of Object.entries(rawTombstones)) {
    tombstones.set(id, Number(ts) || 0);
  }
}

function hydrateItems(items, rawItems) {
  if (!rawItems || typeof rawItems !== "object") return;
  for (const [id, val] of Object.entries(rawItems)) {
    items.set(id, {
      data: normalizeItemPayload(val.data || val),
      updatedAt: Number(val.updatedAt) || 0,
      sender: String(val.sender || ""),
    });
  }
}

function hydrateOrder(order, items, rawOrder) {
  if (!Array.isArray(rawOrder)) return;
  for (const id of rawOrder) {
    if (items.has(id) && !order.includes(id)) {
      order.push(id);
    }
  }
}

function getSnapshotObject(items, order, tombstones) {
  const itemsObj = {};
  for (const [k, v] of items.entries()) {
    itemsObj[k] = { data: { ...v.data }, updatedAt: v.updatedAt, sender: v.sender };
  }
  const tombObj = {};
  for (const [k, v] of tombstones.entries()) {
    tombObj[k] = v;
  }
  return { items: itemsObj, order: [...order], tombstones: tombObj };
}

function applyBatchOperations(operations, applyFn) {
  let anyApplied = false;
  for (const op of operations) {
    if (applyFn(op)) {
      anyApplied = true;
    }
  }
  return anyApplied;
}

function mergeRemoteTombstones(tombstones, items, order, remoteTombstones) {
  if (!remoteTombstones || typeof remoteTombstones !== "object") return;
  for (const [id, ts] of Object.entries(remoteTombstones)) {
    const numTs = Number(ts) || 0;
    const cur = tombstones.get(id) || 0;
    if (numTs > cur) {
      tombstones.set(id, numTs);
    }
    removeIfOlderThanTombstone(items, order, id, numTs);
  }
}

function removeIfOlderThanTombstone(items, order, id, tombstoneTs) {
  const item = items.get(id);
  if (item && item.updatedAt <= tombstoneTs) {
    items.delete(id);
    const idx = order.indexOf(id);
    if (idx !== -1) {
      order.splice(idx, 1);
    }
  }
}

function mergeRemoteItems(items, order, tombstones, remoteItems) {
  if (!remoteItems || typeof remoteItems !== "object") return;
  for (const [id, raw] of Object.entries(remoteItems)) {
    if (!raw || typeof raw !== "object") continue;
    const rTs = Number(raw.updatedAt) || 0;
    if (tombstones.has(id) && tombstones.get(id) >= rTs) continue;
    upsertRemoteItemIfNewer(items, order, id, raw, rTs);
  }
}

function upsertRemoteItemIfNewer(items, order, id, raw, rTs) {
  const cur = items.get(id);
  if (!cur || cur.updatedAt < rTs) {
    items.set(id, {
      data: normalizeItemPayload(raw.data || raw),
      updatedAt: rTs,
      sender: String(raw.sender || ""),
    });
    if (!order.includes(id)) {
      order.push(id);
    }
  }
}

export class EpochCompactor {
  constructor({
    channelId,
    relayUrl,
    selfAddr = "",
    threshold = EPOCH_COMPACT_THRESHOLD,
    store = null,
    isAdmin = false,
    onSnapshotEmitted = null,
    fetchImpl = globalThis.fetch,
  }) {
    this.channelId = channelId;
    this.relayUrl = relayUrl;
    this.selfAddr = selfAddr;
    this.threshold = threshold;
    this.store = store;
    this.isAdmin = isAdmin;
    this.onSnapshotEmitted = onSnapshotEmitted;
    this.fetchImpl = fetchImpl;
    this.epoch = 1;
    this.updateCount = 0;
    this.lastSnapshotTimestamp = 0;
  }

  getEpoch() {
    return this.epoch;
  }

  getUpdateCount() {
    return this.updateCount;
  }

  getLastSnapshotTimestamp() {
    return this.lastSnapshotTimestamp;
  }

  shouldEmitSnapshot(update) {
    if (!update || typeof update !== "object") return false;
    const serial = Number(update.serial) || 0;
    const hit = serial > 0 ? serial % this.threshold === 0 : this.updateCount > 0 && this.updateCount % this.threshold === 0;

    if (!hit) return false;
    const isAuthor = Boolean(update.sender && this.selfAddr && update.sender === this.selfAddr);
    return isAuthor || Boolean(this.isAdmin);
  }

  async emitSnapshot() {
    const snap = this.store ? this.store.getStateSnapshot() : null;
    const payload = {
      channelId: this.channelId,
      epoch: this.epoch,
      timestamp: Date.now(),
      author: this.selfAddr,
      snapshot: snap,
    };
    const res = await postSnapshotToRelay(this.relayUrl, this.channelId, payload, this.fetchImpl);
    this.lastSnapshotTimestamp = payload.timestamp;
    this.epoch += 1;
    if (typeof this.onSnapshotEmitted === "function") {
      this.onSnapshotEmitted(payload);
    }
    return res;
  }

  async handleIncomingUpdate(update) {
    if (this.store && typeof this.store.applyRemoteUpdate === "function") {
      this.store.applyRemoteUpdate(update);
    }
    this.updateCount += 1;
    if (this.shouldEmitSnapshot(update)) {
      return this.emitSnapshot();
    }
    return null;
  }
}

export function createEpochCompactor(options) {
  return new EpochCompactor(options);
}

async function postSnapshotToRelay(relayUrl, channelId, payload, fetchImpl) {
  const base = String(relayUrl || "").replace(/\/+$/, "");
  const target = `${base}/relay/snapshot/${encodeURIComponent(channelId)}`;
  const res = await fetchImpl(target, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Falha ao emitir snapshot no relay: HTTP ${res.status}`);
  }
  return res.json();
}

export async function coldBootFetch({ channelId, relayUrl, fetchImpl = globalThis.fetch }) {
  const base = String(relayUrl || "").replace(/\/+$/, "");
  const baseSnapshotData = await fetchBaseSnapshot(base, channelId, fetchImpl);
  const incrementalEnvelopes = await fetchDeltaEnvelopes(base, channelId, baseSnapshotData.timestamp, fetchImpl);

  return {
    baseSnapshot: baseSnapshotData.snapshot,
    snapshotTimestamp: baseSnapshotData.timestamp,
    epoch: baseSnapshotData.epoch,
    incrementalEnvelopes,
  };
}

async function fetchBaseSnapshot(baseUrl, channelId, fetchImpl) {
  const target = `${baseUrl}/relay/snapshot/${encodeURIComponent(channelId)}`;
  try {
    const res = await fetchImpl(target);
    if (!res.ok) return { snapshot: null, timestamp: 0, epoch: 1 };
    const data = await res.json();
    return {
      snapshot: data.snapshot || data.data?.snapshot || data,
      timestamp: Number(data.timestamp || data.data?.timestamp || 0),
      epoch: Number(data.epoch || data.data?.epoch || 1),
    };
  } catch {
    return { snapshot: null, timestamp: 0, epoch: 1 };
  }
}

async function fetchDeltaEnvelopes(baseUrl, channelId, sinceTs, fetchImpl) {
  const target = `${baseUrl}/relay/envelope/${encodeURIComponent(channelId)}?since=${sinceTs}`;
  try {
    const res = await fetchImpl(target);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : data.envelopes || [];
  } catch {
    return [];
  }
}
