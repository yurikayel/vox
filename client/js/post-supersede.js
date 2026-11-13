/**
 * @file Um post que chega (pela malha ou de um arquivo) perde para o que o aparelho já tem: lápide igual
 * ou mais nova, versão igual ou mais nova, ou o mesmo id de outro autor. Mesma regra para os dois caminhos.
 */

import * as cacheNode from "./cache-node.js";

/**
 * O post que chega já foi superado pelo que está guardado?
 * @param {{ id: string, ts?: number, editedAt?: number, author?: string }} item
 * @param {{ getTombstone: Function, getLocalPost: Function }} [store] para testes
 * @returns {Promise<boolean>}
 */
export async function isSupersededLocally(item, store = cacheNode) {
  const incomingTime = item.editedAt || item.ts || 0;
  const tombstone = await store.getTombstone(item.id);
  if (tombstone && (tombstone.editedAt || 0) >= incomingTime) return true;

  const existing = await store.getLocalPost(item.id);
  if (existing) {
    const existingTime = existing.editedAt || existing.ts || 0;
    if (existingTime >= incomingTime) return true;
    if (existing.author && item.author && existing.author !== item.author) return true;
  }
  return false;
}
