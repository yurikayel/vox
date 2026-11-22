/**
 * @file Armazenamento de dados de transações em cache local com política LRU e teto de tamanho.
 */

import { openDB, STORE_NAME } from "./cache-node-db.js";

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

function purgeOldEntries(store, items, maxBytes) {
  let currentBytes = items.reduce((acc, cur) => acc + (cur.size || 0), 0);
  if (currentBytes <= maxBytes) return;

  // Ordena pelos acessados há mais tempo (menor lastAccessed)
  items.sort((a, b) => a.lastAccessed - b.lastAccessed);
  for (const item of items) {
    if (currentBytes <= maxBytes) break;
    store.delete(item.id);
    currentBytes -= item.size || 0;
  }
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
      purgeOldEntries(store, items, maxBytes);
    };
  } catch {}
}
