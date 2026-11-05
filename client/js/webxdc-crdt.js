/**
 * webxdc-crdt.js — Adaptador CRDT e Compactador de Épocas para Cartuchos Webxdc (Vox)
 *
 * Implementa:
 * 1. Padrão ID Lookup enxuto e convergente (LWW-Element-Set + Fractional Indexing determinístico);
 * 2. Prevenção de poluição de protótipo, envenenamento de relógio e recursão ilimitada;
 * 3. Notificações eficientes O(1) com listeners ativos e suporte a lotes (batch);
 * 4. Compactador de épocas com assinaturas, cursor por coveredSerial e proteção de estado incompleto.
 */

export const EPOCH_COMPACT_THRESHOLD = 50;
export const MAX_SNAPSHOT_BYTES = 512 * 1024;
export const MAX_CLOCK_DRIFT_MS = 10 * 60 * 1000; // 10 minutos
const FORBIDDEN_IDS = new Set(["__proto__", "prototype", "constructor"]);

export function isNewer(tsA, senderA, tsB, senderB) {
  const a = Number(tsA) || 0;
  const b = Number(tsB) || 0;
  if (a > b) return true;
  if (a < b) return false;
  return String(senderA || "").localeCompare(String(senderB || "")) > 0;
}

export function validateStoreId(id) {
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("ID do item deve ser uma string não vazia");
  }
  const clean = id.trim();
  if (FORBIDDEN_IDS.has(clean)) {
    throw new Error(`ID '${clean}' é reservado e não pode ser utilizado`);
  }
  return clean;
}

export function validateTimestamp(ts) {
  const num = Number(ts);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error("Timestamp deve ser um número finito positivo");
  }
  const maxAllowed = Date.now() + MAX_CLOCK_DRIFT_MS;
  if (num > maxAllowed) {
    throw new Error(`Timestamp no futuro excede tolerância de deriva (${num} > ${maxAllowed})`);
  }
  return num;
}

function normalizeItemPayload(data) {
  if (data !== null && typeof data === "object" && !Array.isArray(data)) {
    return { ...data };
  }
  return { value: data };
}

function sortOrderDeterministically(order, items) {
  order.sort((idA, idB) => {
    const a = items.get(idA);
    const b = items.get(idB);
    if (!a || !b) return 0;
    const rankA = Number(a.orderRank !== undefined ? a.orderRank : a.updatedAt) || 0;
    const rankB = Number(b.orderRank !== undefined ? b.orderRank : b.updatedAt) || 0;
    if (rankA !== rankB) return rankA - rankB;
    return idA.localeCompare(idB);
  });
}

export class IdLookupStore {
  constructor(initialState = {}) {
    this.items = new Map();
    this.order = [];
    this.tombstones = new Map();
    this.listeners = new Set();
    this.coveredSerial = 0;
    hydrateInitialState(this.items, this.order, this.tombstones, initialState);
    if (initialState.coveredSerial) {
      this.coveredSerial = Number(initialState.coveredSerial) || 0;
    }
  }

  notify() {
    if (this.listeners.size === 0) return;
    const snap = getSnapshotObject(this.items, this.order, this.tombstones, this.coveredSerial);
    for (const listener of this.listeners) {
      try {
        listener(snap);
      } catch {
        // Ignora erros em callbacks de observadores
      }
    }
  }

  setItem(rawId, data, ts = Date.now(), sender = "", silent = false) {
    const id = validateStoreId(rawId);
    const timestamp = validateTimestamp(ts);
    const tomb = this.tombstones.get(id);

    if (tomb && !isNewer(timestamp, sender, tomb.timestamp, tomb.sender)) {
      return false;
    }
    const existing = this.items.get(id);
    if (existing && !isNewer(timestamp, sender, existing.updatedAt, existing.sender)) {
      return false;
    }

    this.tombstones.delete(id);
    const merged = existing ? { ...existing.data, ...normalizeItemPayload(data) } : normalizeItemPayload(data);
    const orderMeta = resolveItemOrderMeta(data, timestamp, sender, existing);

    this.items.set(id, {
      data: merged,
      updatedAt: timestamp,
      sender: String(sender || ""),
      orderRank: orderMeta.orderRank,
      orderTs: orderMeta.orderTs,
      orderSender: orderMeta.orderSender,
      isMoved: orderMeta.isMoved,
    });

    if (!this.order.includes(id)) {
      this.order.push(id);
    }
    sortOrderDeterministically(this.order, this.items);
    if (!silent) this.notify();
    return true;
  }

  removeItem(rawId, ts = Date.now(), sender = "", silent = false) {
    const id = validateStoreId(rawId);
    const timestamp = validateTimestamp(ts);
    const existing = this.items.get(id);

    if (existing && !isNewer(timestamp, sender, existing.updatedAt, existing.sender)) {
      return false;
    }
    const tomb = this.tombstones.get(id);
    if (tomb && !isNewer(timestamp, sender, tomb.timestamp, tomb.sender)) {
      return false;
    }

    this.tombstones.set(id, { timestamp, sender: String(sender || "") });
    this.items.delete(id);
    const idx = this.order.indexOf(id);
    if (idx !== -1) {
      this.order.splice(idx, 1);
    }
    if (!silent) this.notify();
    return true;
  }

  moveItem(rawId, targetIndex, ts = Date.now(), sender = "", silent = false) {
    const id = validateStoreId(rawId);
    if (!this.items.has(id)) return false;
    const cur = this.items.get(id);
    const timestamp = validateTimestamp(ts);

    if (cur.orderTs && !isNewer(timestamp, sender, cur.orderTs, cur.orderSender)) {
      return false;
    }

    const newRank = calculateNewRank(this.order, this.items, id, targetIndex);
    cur.isMoved = true;
    cur.orderRank = newRank;
    cur.orderTs = timestamp;
    cur.orderSender = String(sender || "");

    sortOrderDeterministically(this.order, this.items);
    if (!silent) this.notify();
    return true;
  }

  getItem(rawId) {
    const id = validateStoreId(rawId);
    const entry = this.items.get(id);
    if (!entry) return null;
    return {
      ...entry.data,
      id,
      _updatedAt: entry.updatedAt,
      _sender: entry.sender,
      _orderRank: entry.orderRank,
    };
  }

  getItems() {
    return this.order
      .filter((id) => this.items.has(id))
      .map((id) => {
        const entry = this.items.get(id);
        return {
          ...entry.data,
          id,
          _updatedAt: entry.updatedAt,
          _sender: entry.sender,
          _orderRank: entry.orderRank,
        };
      });
  }

  getOrder() {
    return [...this.order];
  }

  getStateSnapshot() {
    return getSnapshotObject(this.items, this.order, this.tombstones, this.coveredSerial);
  }

  getCoveredSerial() {
    return this.coveredSerial;
  }

  setCoveredSerial(serial) {
    const s = Number(serial) || 0;
    if (s > this.coveredSerial) this.coveredSerial = s;
  }

  mergeSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return false;
    mergeRemoteTombstones(this.tombstones, this.items, this.order, snapshot.tombstones);
    mergeRemoteItems(this.items, this.order, this.tombstones, snapshot.items);
    sortOrderDeterministically(this.order, this.items);
    this.setCoveredSerial(snapshot.coveredSerial);
    this.notify();
    return true;
  }

  applyRemoteUpdate(update, depth = 2, silent = false) {
    if (!update || typeof update !== "object" || depth <= 0) return false;
    if (update.serial) this.setCoveredSerial(update.serial);

    if (update.type === "set") {
      return this.setItem(update.id, update.data, update.ts, update.sender, silent);
    }
    if (update.type === "remove") {
      return this.removeItem(update.id, update.ts, update.sender, silent);
    }
    if (update.type === "move") {
      return this.applyRemoteMove(update, silent);
    }
    if (update.type === "batch" && Array.isArray(update.operations)) {
      return this.applyBatchOperations(update.operations, depth - 1, silent);
    }
    if (update.payload && typeof update.payload === "object") {
      return this.applyRemoteUpdate(update.payload, depth - 1, silent);
    }
    return false;
  }

  applyRemoteMove(update, silent) {
    const id = validateStoreId(update.id);
    if (!this.items.has(id)) return false;
    const cur = this.items.get(id);
    const ts = validateTimestamp(update.ts || Date.now());
    const sender = String(update.sender || "");

    if (cur.orderTs && !isNewer(ts, sender, cur.orderTs, cur.orderSender)) {
      return false;
    }
    if (update.orderRank !== undefined) {
      cur.isMoved = true;
      cur.orderRank = Number(update.orderRank);
      cur.orderTs = ts;
      cur.orderSender = sender;
      sortOrderDeterministically(this.order, this.items);
      if (!silent) this.notify();
      return true;
    }
    return this.moveItem(update.id, update.targetIndex, ts, sender, silent);
  }

  applyBatchOperations(operations, depth, silent) {
    let anyApplied = false;
    for (const op of operations) {
      if (this.applyRemoteUpdate(op, depth, true)) {
        anyApplied = true;
      }
    }
    if (anyApplied && !silent) this.notify();
    return anyApplied;
  }

  pruneTombstones(maxAgeMs = 30 * 86400 * 1000) {
    const threshold = Date.now() - maxAgeMs;
    for (const [id, t] of this.tombstones.entries()) {
      if (t.timestamp < threshold) {
        this.tombstones.delete(id);
      }
    }
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export function createIdLookupStore(initialState = {}) {
  return new IdLookupStore(initialState);
}

function calculateNewRank(order, items, id, targetIndex) {
  const filtered = order.filter((i) => i !== id && items.has(i));
  if (filtered.length === 0) return 100;

  const bound = Math.max(0, Math.min(Number(targetIndex) || 0, filtered.length));
  if (bound === 0) {
    const firstRank = items.get(filtered[0]).orderRank || 0;
    return firstRank - 100;
  }
  if (bound >= filtered.length) {
    const lastRank = items.get(filtered[filtered.length - 1]).orderRank || 0;
    return lastRank + 100;
  }
  const prevRank = items.get(filtered[bound - 1]).orderRank || 0;
  const nextRank = items.get(filtered[bound]).orderRank || 0;
  return (prevRank + nextRank) / 2;
}

function hydrateInitialState(items, order, tombstones, state) {
  hydrateTombstones(tombstones, state.tombstones);
  hydrateItems(items, state.items);
  hydrateOrder(order, items, state.order);
}

function hydrateTombstones(tombstones, rawTombstones) {
  if (!rawTombstones || typeof rawTombstones !== "object") return;
  for (const [id, val] of Object.entries(rawTombstones)) {
    if (FORBIDDEN_IDS.has(id)) continue;
    const ts = typeof val === "object" ? Number(val.timestamp) || 0 : Number(val) || 0;
    const sender = typeof val === "object" ? String(val.sender || "") : "";
    tombstones.set(id, { timestamp: ts, sender });
  }
}

function resolveItemOrderMeta(data, timestamp, sender, existing) {
  if (data && data.orderRank !== undefined) {
    return {
      orderRank: Number(data.orderRank),
      orderTs: timestamp,
      orderSender: sender,
      isMoved: true,
    };
  }
  if (existing && existing.isMoved) {
    return {
      orderRank: existing.orderRank,
      orderTs: existing.orderTs,
      orderSender: existing.orderSender,
      isMoved: true,
    };
  }
  return {
    orderRank: timestamp,
    orderTs: timestamp,
    orderSender: sender,
    isMoved: false,
  };
}

function hydrateItems(items, rawItems) {
  if (!rawItems || typeof rawItems !== "object") return;
  for (const [id, val] of Object.entries(rawItems)) {
    if (FORBIDDEN_IDS.has(id)) continue;
    items.set(id, {
      data: normalizeItemPayload(val.data || val),
      updatedAt: Number(val.updatedAt) || 0,
      sender: String(val.sender || ""),
      orderRank: Number(val.orderRank !== undefined ? val.orderRank : val.updatedAt) || 0,
      orderTs: Number(val.orderTs || val.updatedAt) || 0,
      orderSender: String(val.orderSender || val.sender || ""),
      isMoved: Boolean(val.isMoved),
    });
  }
}

function hydrateOrder(order, items, rawOrder) {
  if (Array.isArray(rawOrder)) {
    for (const id of rawOrder) {
      if (items.has(id) && !order.includes(id)) {
        order.push(id);
      }
    }
  }
  for (const id of items.keys()) {
    if (!order.includes(id)) order.push(id);
  }
  sortOrderDeterministically(order, items);
}

function getSnapshotObject(items, order, tombstones, coveredSerial) {
  const itemsObj = Object.create(null);
  for (const [k, v] of items.entries()) {
    itemsObj[k] = {
      data: { ...v.data },
      updatedAt: v.updatedAt,
      sender: v.sender,
      orderRank: v.orderRank,
      orderTs: v.orderTs,
      orderSender: v.orderSender,
      isMoved: Boolean(v.isMoved),
    };
  }
  const tombObj = Object.create(null);
  for (const [k, v] of tombstones.entries()) {
    tombObj[k] = { timestamp: v.timestamp, sender: v.sender };
  }
  return { items: itemsObj, order: [...order], tombstones: tombObj, coveredSerial };
}

function mergeRemoteTombstones(tombstones, items, order, remoteTombstones) {
  if (!remoteTombstones || typeof remoteTombstones !== "object") return;
  for (const [id, val] of Object.entries(remoteTombstones)) {
    if (FORBIDDEN_IDS.has(id)) continue;
    const rTs = typeof val === "object" ? Number(val.timestamp) || 0 : Number(val) || 0;
    const rSender = typeof val === "object" ? String(val.sender || "") : "";
    const cur = tombstones.get(id);

    if (!cur || isNewer(rTs, rSender, cur.timestamp, cur.sender)) {
      tombstones.set(id, { timestamp: rTs, sender: rSender });
    }
    removeIfOlderThanTombstone(items, order, id, rTs, rSender);
  }
}

function removeIfOlderThanTombstone(items, order, id, tombTs, tombSender) {
  const item = items.get(id);
  if (item && !isNewer(item.updatedAt, item.sender, tombTs, tombSender)) {
    items.delete(id);
    const idx = order.indexOf(id);
    if (idx !== -1) order.splice(idx, 1);
  }
}

function mergeRemoteItems(items, order, tombstones, remoteItems) {
  if (!remoteItems || typeof remoteItems !== "object") return;
  for (const [id, raw] of Object.entries(remoteItems)) {
    if (FORBIDDEN_IDS.has(id) || !raw || typeof raw !== "object") continue;
    const rTs = Number(raw.updatedAt) || 0;
    const rSender = String(raw.sender || "");
    const tomb = tombstones.get(id);
    if (tomb && !isNewer(rTs, rSender, tomb.timestamp, tomb.sender)) continue;

    upsertRemoteItemIfNewer(items, order, id, raw, rTs, rSender);
  }
}

function upsertRemoteItemIfNewer(items, order, id, raw, rTs, rSender) {
  const cur = items.get(id);
  if (!cur || isNewer(rTs, rSender, cur.updatedAt, cur.sender)) {
    const isRawMoved = Boolean(raw.isMoved || (raw.orderRank !== undefined && raw.orderRank !== rTs));
    const rank = Number(raw.orderRank !== undefined ? raw.orderRank : rTs) || 0;
    items.set(id, {
      data: normalizeItemPayload(raw.data || raw),
      updatedAt: rTs,
      sender: rSender,
      orderRank: rank,
      orderTs: Number(raw.orderTs || rTs) || 0,
      orderSender: String(raw.orderSender || rSender),
      isMoved: isRawMoved,
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
    initialEpoch = 1,
    signer = null,
    onSnapshotEmitted = null,
    fetchImpl = globalThis.fetch,
  }) {
    this.channelId = channelId;
    this.relayUrl = relayUrl;
    this.selfAddr = selfAddr;
    this.threshold = threshold;
    this.store = store;
    this.isAdmin = isAdmin;
    this.signer = signer;
    this.onSnapshotEmitted = onSnapshotEmitted;
    this.fetchImpl = fetchImpl;
    this.epoch = Number(initialEpoch) || 1;
    this.lastSnapshotTimestamp = 0;
  }

  getEpoch() {
    return this.epoch;
  }

  setEpoch(epoch) {
    const e = Number(epoch) || 1;
    if (e > this.epoch) this.epoch = e;
  }

  shouldEmitSnapshot(update) {
    if (!update || typeof update !== "object") return false;
    const serial = Number(update.serial) || (this.store ? this.store.getCoveredSerial() : 0);
    if (serial <= 0 || serial % this.threshold !== 0) return false;

    const isAuthor = Boolean(update.sender && this.selfAddr && update.sender === this.selfAddr);
    return isAuthor;
  }

  async emitSnapshot() {
    const snap = this.store ? this.store.getStateSnapshot() : null;
    const coveredSerial = this.store ? this.store.getCoveredSerial() : 0;
    const payload = {
      channelId: this.channelId,
      epoch: this.epoch,
      coveredSerial,
      timestamp: Date.now(),
      author: this.selfAddr,
      snapshot: snap,
    };
    if (this.signer && typeof this.signer.sign === "function") {
      payload.sig = await this.signer.sign(payload);
    }
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
  const bodyStr = JSON.stringify(payload);
  if (bodyStr.length > MAX_SNAPSHOT_BYTES) {
    throw new Error(`Snapshot excede o limite máximo de ${MAX_SNAPSHOT_BYTES} bytes`);
  }
  const res = await fetchImpl(target, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: bodyStr,
  });
  if (!res.ok) {
    throw new Error(`Falha ao emitir snapshot no relay: HTTP ${res.status}`);
  }
  return res.json();
}

export async function coldBootFetch({ channelId, relayUrl, fetchImpl = globalThis.fetch }) {
  const base = String(relayUrl || "").replace(/\/+$/, "");
  const baseData = await fetchBaseSnapshot(base, channelId, fetchImpl);
  const incrementalEnvelopes = await fetchDeltaEnvelopes(base, channelId, baseData.timestamp, baseData.coveredSerial, fetchImpl);

  return {
    baseSnapshot: baseData.snapshot,
    snapshotTimestamp: baseData.timestamp,
    epoch: baseData.epoch,
    coveredSerial: baseData.coveredSerial,
    incrementalEnvelopes,
  };
}

async function fetchBaseSnapshot(baseUrl, channelId, fetchImpl) {
  const target = `${baseUrl}/relay/snapshot/${encodeURIComponent(channelId)}`;
  let res;
  try {
    res = await fetchImpl(target);
  } catch (err) {
    throw new Error(`Falha de conexão ao buscar snapshot do canal '${channelId}': ${err.message}`);
  }

  if (res.status === 404) {
    return { snapshot: null, timestamp: 0, epoch: 1, coveredSerial: 0 };
  }
  if (!res.ok) {
    throw new Error(`Relay retornou HTTP ${res.status} ao buscar snapshot do canal '${channelId}'`);
  }

  const data = await res.json();
  return parseSnapshotResponse(data);
}

function parseSnapshotResponse(data) {
  const d = data.data || data;
  return {
    snapshot: data.snapshot || d.snapshot || data,
    timestamp: Number(data.timestamp || d.timestamp || 0),
    epoch: Number(data.epoch || d.epoch || 1),
    coveredSerial: Number(data.coveredSerial || d.coveredSerial || 0),
  };
}

async function fetchDeltaEnvelopes(baseUrl, channelId, sinceTs, coveredSerial, fetchImpl) {
  const query = coveredSerial > 0 ? `since_serial=${coveredSerial}` : `since=${sinceTs}`;
  const target = `${baseUrl}/relay/envelope/${encodeURIComponent(channelId)}?${query}`;
  let res;
  try {
    res = await fetchImpl(target);
  } catch (err) {
    throw new Error(`Falha de conexão ao buscar envelopes da cauda incremental: ${err.message}`);
  }

  if (!res.ok) {
    throw new Error(`Relay retornou HTTP ${res.status} ao buscar envelopes da cauda incremental`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : data.envelopes || [];
}
