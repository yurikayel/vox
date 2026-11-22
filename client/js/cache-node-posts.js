/**
 * @file Armazenamento e consulta de posts locais, respostas e contagens de atividade no cache persistente.
 */

import { openDB, LOCAL_POSTS_STORE } from "./cache-node-db.js";
import { dispatchCentralMemory } from "./cache-node-sink.js";
import { getTombstone } from "./cache-node-tombstones.js";
import { normalizeLocalPost, toStoredRecord, toWireForm } from "./post-wire.js";

let cachedReplyCountsMap = null;
let cachedReplyActivityMap = null;

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
  const { sanitizeCommunityGossipImages, communityGossipHasRejectedImages } = await import("./shared/community-avatar-image.js");
  if (communityGossipHasRejectedImages(post)) return false;
  post = sanitizeCommunityGossipImages(post);
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
    dispatchCentralMemory({ type: "GOSSIP", item: toWireForm(record) });
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

function filterPostItems(items, { type, communityId, replyTo, proposalId, postId }) {
  let res = items;
  if (type) res = res.filter((p) => p.type === type);
  if (communityId) res = res.filter((p) => p.communityId === communityId);
  if (replyTo !== null) res = res.filter((p) => p.replyTo === replyTo);
  if (proposalId) res = res.filter((p) => p.proposalId === proposalId);
  if (postId) res = res.filter((p) => p.postId === postId);
  return res;
}

function sortPostItems(items, type) {
  if (type === "reply") {
    return items.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  }
  return items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
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
        const raw = (req.result || []).filter((p) => p.type !== "tombstone" && p.kind !== "post-tombstone").map(normalizeLocalPost);
        const filtered = filterPostItems(raw, { type, communityId, replyTo, proposalId, postId });
        resolve(sortPostItems(filtered, type));
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
