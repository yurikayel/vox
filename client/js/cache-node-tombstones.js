/**
 * @file Armazenamento e consulta de lápides de remoção de posts no cache local.
 */

import { openDB, LOCAL_POSTS_STORE } from "./cache-node-db.js";
import { dispatchCentralMemory } from "./cache-node-sink.js";
import { toStoredRecord, toWireForm } from "./post-wire.js";

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
    dispatchCentralMemory({ type: "GOSSIP_DELETE", tombstone: toWireForm(record) });
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
