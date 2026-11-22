/**
 * @file Registro e despacho de ouvintes de eventos da malha P2P (DMs, posts e lápides de gossip).
 */

const dmListeners = new Set();
const gossipListeners = new Set();
const gossipTombstoneListeners = new Set();

/**
 * Inscreve um ouvinte de DMs que chegam pela malha (WebRTC ou outra aba).
 * @param {(envelope: object, source: string) => void} listener Recebe o envelope cifrado e a origem (`"rtc"` ou `"broadcast"`).
 * @returns {() => boolean} Função que cancela a inscrição.
 */
export function onDirectMessage(listener) {
  dmListeners.add(listener);
  return () => dmListeners.delete(listener);
}

/**
 * Despacha um envelope de DM recebido para todos os ouvintes inscritos.
 * @param {object} envelope Envelope cifrado da mensagem direta.
 * @param {string} [source="rtc"] Origem do tráfego (`"rtc"` ou `"broadcast"`).
 */
export function dispatchDirectMessage(envelope, source = "rtc") {
  if (!envelope) return;
  for (const fn of dmListeners) {
    try {
      fn(envelope, source);
    } catch {}
  }
}

/**
 * Inscreve um ouvinte de posts e edições aceitos do gossip (já conferidos e gravados no cache local).
 * @param {(item: object, source: string) => void} listener Recebe o item assinado e a origem (`"rtc"` ou `"broadcast"`).
 * @returns {() => boolean} Função que cancela a inscrição.
 */
export function onGossipPost(listener) {
  gossipListeners.add(listener);
  return () => gossipListeners.delete(listener);
}

/**
 * Despacha um post ou edição de gossip aceito para os ouvintes inscritos.
 * @param {object} item Item assinado aceito pelo gossip.
 * @param {string} [source="rtc"] Origem do item (`"rtc"` ou `"broadcast"`).
 */
export function dispatchGossipPost(item, source = "rtc") {
  if (!item) return;
  for (const fn of gossipListeners) {
    try {
      fn(item, source);
    } catch {}
  }
}

/**
 * Inscreve um ouvinte de remoções aceitas do gossip (lápides conferidas e gravadas no cache local).
 * @param {(tombstone: object, source: string) => void} listener Recebe a lápide assinada e a origem.
 * @returns {() => boolean} Função que cancela a inscrição.
 */
export function onGossipTombstone(listener) {
  gossipTombstoneListeners.add(listener);
  return () => gossipTombstoneListeners.delete(listener);
}

/**
 * Despacha uma lápide de remoção de gossip aceita para os ouvintes inscritos.
 * @param {object} tombstone Lápide assinada aceita pelo gossip.
 * @param {string} [source="rtc"] Origem da lápide (`"rtc"` ou `"broadcast"`).
 */
export function dispatchGossipTombstone(tombstone, source = "rtc") {
  if (!tombstone) return;
  for (const fn of gossipTombstoneListeners) {
    try {
      fn(tombstone, source);
    } catch {}
  }
}
