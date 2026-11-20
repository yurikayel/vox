/**
 * @file Handlers, identidade de pares e envio de mensagens/dM via RTCDataChannel.
 * @module webrtc-messaging
 */
import { sendSignaling } from "./webrtc-signaling-send.js";
import {
  addressToPeer,
  dmPubByAddress,
  peerConnections,
  getCurrentPeerId,
  getCurrentAddress,
  getCurrentDmPub,
  setCurrentAddress,
  setCurrentDmPub,
  getSignalingWs,
  getSignalingHealth,
  setMessageHandler,
  setDmMessageHandler,
  setSignalingHealthHandler,
  setIdentityHandler,
  setPeerConnectHandler,
  getIdentityHandler,
} from "./webrtc-peer-state.js";

/**
 * @param {string} address
 * @param {string} peerId
 * @returns {boolean}
 */
function isBeaconIdentity(address, peerId) {
  return (
    address === "vx_zero_memory_beacon" ||
    String(peerId || "").startsWith("peer_zero_memory")
  );
}

/**
 * Define quem trata as mensagens do canal de dados `vox-peer-v0`.
 * @param {(msg: object, replyFn: (reply: object) => void, source: "rtc") => void} handler
 */
export function onVoxMessage(handler) {
  setMessageHandler(handler);
}

/**
 * Define quem trata os envelopes que chegam pelo canal de DM.
 * @param {(envelope: object, remotePeerId: string) => void} handler
 */
export function onDmMessage(handler) {
  setDmMessageHandler(handler);
}

/**
 * `handler(down)` na virada: true quando a sinalização cai, false quando volta.
 * @param {(down: boolean) => void} handler
 */
export function onSignalingHealth(handler) {
  setSignalingHealthHandler(handler);
}

/**
 * LAN-21: indica se a sinalização está caída.
 * @returns {boolean}
 */
export function isSignalingDown() {
  return getSignalingHealth().isDown();
}

/**
 * Define quem recebe a chave de DM anunciada por um par na sinalização.
 * @param {(address: string, dmPub: object) => void} handler
 */
export function onPeerIdentity(handler) {
  setIdentityHandler(handler);
}

/**
 * Define quem é chamado quando o canal de dados com um par abre.
 * @param {(remotePeerId: string, sendFn: (obj: object) => boolean) => void} handler
 */
export function onPeerConnect(handler) {
  setPeerConnectHandler(handler);
}

/**
 * Guarda a conta e a chave de DM deste aparelho e registra na sinalização aberta.
 * @param {string} address
 * @param {object|null} [dmPub=null]
 */
export function announceIdentity(address, dmPub = null) {
  setCurrentAddress(address);
  if (dmPub) setCurrentDmPub(dmPub);
  const ws = getSignalingWs();
  const peerId = getCurrentPeerId();
  if (ws && ws.readyState === WebSocket.OPEN && peerId) {
    sendSignaling({
      type: "register",
      peerId,
      address: getCurrentAddress(),
      dmPub: getCurrentDmPub(),
    });
  }
}

/**
 * Associa a conta de um par ao seu id na malha.
 * @param {string} address
 * @param {string} peerId
 * @param {object|null} [dmPub=null]
 */
export function registerAddressMapping(address, peerId, dmPub = null) {
  if (!address || !peerId) return;
  const identityHandler = getIdentityHandler();
  if (dmPub && identityHandler) {
    identityHandler(address, dmPub);
  }
  if (isBeaconIdentity(address, peerId)) return;
  addressToPeer.set(address, peerId);
  if (dmPub) {
    dmPubByAddress.set(address, dmPub);
  }
}

/**
 * Contas `vx_` de pares conhecidos pela sinalização.
 * @returns {string[]}
 */
export function listKnownPeerAddresses() {
  return Array.from(addressToPeer.keys()).filter(
    (a) => String(a || "").startsWith("vx_") && a !== "vx_zero_memory_beacon",
  );
}

/**
 * Chave pública de DM que o par da conta anunciou.
 * @param {string} address
 * @returns {object|null}
 */
export function getPeerDmPub(address) {
  return dmPubByAddress.get(address) || null;
}

/**
 * Indica se há canal de DM WebRTC aberto com a conta.
 * @param {string} address
 * @returns {boolean}
 */
export function isAddressConnectedRtc(address) {
  const pid = addressToPeer.get(address);
  if (!pid) return false;
  const entry = peerConnections.get(pid);
  return Boolean(entry?.dmDc && entry.dmDc.readyState === "open");
}

/**
 * Quantos pares têm o canal de dados aberto.
 * @returns {number}
 */
export function getConnectedRtcPeersCount() {
  let count = 0;
  for (const entry of peerConnections.values()) {
    if (entry.dc && entry.dc.readyState === "open") {
      count++;
    }
  }
  return count;
}

/**
 * Ids dos pares com o canal de dados aberto.
 * @returns {string[]}
 */
export function listOpenRtcPeerIds() {
  const openPeers = [];
  for (const [peerId, entry] of peerConnections.entries()) {
    if (entry.dc && entry.dc.readyState === "open") {
      openPeers.push(peerId);
    }
  }
  return openPeers;
}

/**
 * Manda um envelope de DM pelo canal de DM aberto com a conta.
 * @param {string} toAddress
 * @param {object} envelope
 * @returns {boolean}
 */
export function sendDmRtc(toAddress, envelope) {
  const pid = addressToPeer.get(toAddress);
  if (!pid) return false;
  const entry = peerConnections.get(pid);
  if (!entry?.dmDc || entry.dmDc.readyState !== "open") return false;
  try {
    entry.dmDc.send(JSON.stringify({ type: "DM", envelope }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Manda uma mensagem a um par pelo canal de dados.
 * @param {string} remotePeerId
 * @param {object} obj
 * @returns {boolean}
 */
export function sendVoxMessage(remotePeerId, obj) {
  const entry = peerConnections.get(remotePeerId);
  if (entry && entry.dc && entry.dc.readyState === "open") {
    try {
      entry.dc.send(JSON.stringify(obj));
      return true;
    } catch {}
  }
  return false;
}

/**
 * Manda a mesma mensagem a todos os pares com o canal de dados aberto.
 * @param {object} obj
 * @returns {number}
 */
export function broadcastRtcMessage(obj) {
  const payload = JSON.stringify(obj);
  let sentCount = 0;
  for (const entry of peerConnections.values()) {
    if (entry.dc && entry.dc.readyState === "open") {
      try {
        entry.dc.send(payload);
        sentCount++;
      } catch {}
    }
  }
  return sentCount;
}

export { isBeaconIdentity };