/**
 * @file Armazenamento e agregação de mensagens diretas (DMs) no cache persistente IndexedDB.
 */

import { openDB, DM_STORE_NAME } from "./cache-node-db.js";

/** Avisa a shell (contador de não lidas em Mensagens) que as conversas mudaram. */
export function notifyDmChanged() {
  try {
    if (typeof window !== "undefined" && typeof CustomEvent === "function") {
      window.dispatchEvent(new CustomEvent("vox:dm-changed"));
    }
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
