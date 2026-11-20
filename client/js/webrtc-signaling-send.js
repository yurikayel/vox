/**
 * @file Envio de mensagens de sinalização (WebSocket ou Nostr), sem depender do ciclo ws↔connection.
 * @module webrtc-signaling-send
 */
import {
  getSignalingWs,
  getNostrTransport,
  peerTransport,
} from "./webrtc-peer-state.js";

/**
 * Envia payload de sinalização ao par (Nostr se o par veio por lá ou WS indisponível).
 * @param {object} data Mensagem de sinalização.
 */
export function sendSignaling(data) {
  const viaNostr = peerTransport.get(data?.to) === "nostr";
  const ws = getSignalingWs();
  const wsOpen = ws && ws.readyState === WebSocket.OPEN;
  const nostr = getNostrTransport();
  if ((viaNostr || !wsOpen) && nostr?.send(data)) return;
  if (wsOpen) ws.send(JSON.stringify(data));
}