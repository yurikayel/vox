/**
 * @file Cache local persistente do Vox (IndexedDB `vox-cache-db`): dados de transações com limpeza LRU, posts e
 * lápides deste aparelho, DMs e as contagens de respostas. Os posts e lápides gravados podem ser repassados à memória
 * central (`registerCentralMemorySink`).
 */
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

/**
 * Dado de uma transação no cache local; marca o acesso para a política LRU.
 * @param {string} txId Id da transação.
 * @returns {Promise<object|null>} O dado guardado, ou null se não houver ou a leitura falhar.
 */
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

/**
 * Guarda o dado de uma transação no cache local, com tamanho e horários para a LRU. Quota cheia falha em silêncio.
 * @param {string} txId Id da transação.
 * @param {object} data Dado a guardar; vazio não grava.
 * @returns {Promise<void>} Resolve depois da gravação (ou da falha).
 */
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

/**
 * Tamanho do cache de transações, para a tela de rede.
 * @returns {Promise<{count: number, sizeBytes: number, sizeKb: string, sizeMb: string}>} Itens e tamanho; zerado se a leitura falhar.
 */
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

/**
 * Apaga todo o cache de transações (não toca nos posts locais nem nas DMs).
 * @returns {Promise<void>} Resolve depois de apagar (ou da falha).
 */
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

/**
 * Apaga as transações acessadas há mais tempo até o cache caber no teto. Dispara a limpeza e não espera ela terminar.
 * @param {number} [maxMb=100] Teto em MB.
 * @returns {Promise<void>} Resolve ao disparar a limpeza.
 */
export async function enforceMaxCacheSize(maxMb = 100) {
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

/**
 * Guarda (ou substitui) uma mensagem de DM e avisa a shell que as conversas mudaram.
 * @param {{id: string, peerAddress: string, from?: string, to?: string, text?: string, ts?: number, status?: string, replyTo?: string, contextCard?: object, reactions?: object, mediaDataUrl?: string}} msg
 *   Mensagem; sem `id` ou `peerAddress`, nada é gravado.
 * @returns {Promise<void>} Resolve depois da gravação (ou da falha).
 */
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

/**
 * Todas as DMs deste aparelho, numa leitura só.
 * @returns {Promise<Array<object>>} Mensagens, sem ordem.
 */
export async function getAllDmMessages() {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const req = db.transaction(DM_STORE_NAME, "readonly").objectStore(DM_STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

/**
 * Mensagens de uma conversa, da mais antiga para a mais nova.
 * @param {string} peerAddress Conta do outro lado.
 * @returns {Promise<object[]>} Mensagens; vazio sem conta.
 */
export async function getDmMessages(peerAddress) {
  if (!peerAddress) return [];
  return (await getAllDmMessages()).filter((m) => m.peerAddress === peerAddress).sort((a, b) => (a.ts || 0) - (b.ts || 0));
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

/**
 * Lista de conversas: a última mensagem de cada uma e quantas recebidas ainda não foram lidas.
 * @returns {Promise<{peerAddress: string, lastText: string, lastTs: number, lastStatus: string, unreadCount: number}[]>}
 *   Conversas, mais recentes primeiro; vazio se a leitura falhar.
 */
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

/**
 * Apaga todas as mensagens de uma conversa deste aparelho.
 * @param {string} peerAddress Conta do outro lado.
 * @returns {Promise<void>} Resolve depois de apagar (ou da falha).
 */
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

/**
 * Guarda a lápide de um post removido (no lugar do post) e repassa à memória central, se houver.
 * @param {object} tombstone Lápide assinada.
 * @returns {Promise<boolean>} Falso sem `id` ou se a gravação falhar.
 */
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

/**
 * Lápide guardada com este id.
 * @param {string} id Id do post.
 * @returns {Promise<object|null>} A lápide na forma assinada, ou null se o registro não for uma lápide.
 */
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

/**
 * Todas as lápides guardadas.
 * @returns {Promise<object[]>} Lápides na forma assinada; vazio se a leitura falhar.
 */
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

/**
 * Registro guardado com este id, seja post ou lápide.
 * @param {string} id Id do registro.
 * @returns {Promise<object|null>} O registro na forma assinada, ou null.
 */
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

/**
 * Define quem recebe cada post e lápide gravados, para repassar à memória central (substitui o anterior).
 * @param {((msg: {type: "GOSSIP"|"GOSSIP_DELETE", item?: object, tombstone?: object}) => void)|null} fn Receptor; outro valor desliga.
 */
export function registerCentralMemorySink(fn) {
  centralMemorySink = typeof fn === "function" ? fn : null;
}

/** Descarta as contagens de respostas guardadas em memória (refeitas na próxima leitura). */
export function invalidateReplyCountsCache() {
  cachedReplyCountsMap = null;
  cachedReplyActivityMap = null;
}

/**
 * Guarda (ou substitui) um post local e repassa à memória central, se houver. Post com lápide igual ou mais nova
 * não volta.
 * @param {object} post Post com `id` e `type`.
 * @returns {Promise<boolean>} Falso sem `id`/`type`, se uma lápide vence ou se a gravação falhar.
 */
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

/**
 * Post local com este id.
 * @param {string} id Id do post.
 * @returns {Promise<object|null>} O post normalizado, ou null se não houver ou for uma lápide.
 */
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

/**
 * Apaga o registro deste aparelho, sem lápide (não avisa a malha).
 * @param {string} id Id do post.
 * @returns {Promise<boolean>} Falso sem id ou se a remoção falhar.
 */
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

/**
 * Posts locais (sem lápides), com filtros opcionais. Respostas vêm da mais antiga para a mais nova; o resto, da mais
 * nova para a mais antiga.
 * @param {{type?: string|null, communityId?: string|null, replyTo?: string|null, proposalId?: string|null, postId?: string|null}} [filters]
 *   Tipo, comunidade, post respondido, proposta e post de referência.
 * @returns {Promise<object[]>} Posts normalizados; vazio se a leitura falhar.
 */
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

/**
 * Todos os posts locais, sem filtro (ver `getLocalPosts`).
 * @returns {Promise<object[]>} Posts normalizados.
 */
export async function getAllLocalPosts() {
  return getLocalPosts();
}

/**
 * Posts na forma assinada, mais novos primeiro: o que a sincronização e a memória central repassam.
 * @returns {Promise<object[]>} Posts (sem lápides); vazio se a leitura falhar.
 */
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

/**
 * Quantas respostas cada post tem, contadas nos posts locais e guardadas em memória até a próxima gravação.
 * @returns {Promise<Object<string, number>>} Contagem por id do post respondido (cópia).
 */
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

/**
 * Retorna mapa de { [topicId]: { count: number, lastTs: number } } para bumping determinístico.
 * @returns {Promise<Object<string, {count: number, lastTs: number}>>} Respostas e a hora da última, por tópico (cópia).
 */
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

/**
 * Comunidades criadas neste aparelho ou recebidas da malha, com as atualizações aceitas já aplicadas.
 * @returns {Promise<object[]>} Registros de comunidade (só os posts canônicos de criação).
 */
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
 * @param {object} update Item `community_update` recebido.
 * @returns {Promise<boolean>} Falso sem `communityId` ou se o autor não pode atualizar a comunidade conhecida.
 */
export async function isCommunityUpdateAcceptable(update) {
  if (!update?.communityId) return false;
  const post = await getLocalPost(communityUpdates.canonicalCommunityPostId(update.communityId));
  if (!post || post.type !== "community") return true;
  return communityUpdates.canUpdateCommunity(buildLocalCommunityRecord(post), update.author);
}

/**
 * Apaga todos os posts e lápides deste aparelho.
 * @returns {Promise<void>} Resolve depois de apagar (ou da falha).
 */
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

/**
 * Tópicos e anúncios com a hashtag, dos posts locais e dos dados de demonstração, sem repetir id. Usa as `tags` do
 * item ou, sem elas, as hashtags do título, corpo e descrição.
 * @param {string} slug Hashtag (com ou sem `#`).
 * @returns {Promise<object[]>} Itens, mais novos primeiro; vazio para hashtag vazia.
 */
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
