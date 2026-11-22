/**
 * @file Camada de transporte da malha de pares: BroadcastChannel local (entre abas) e canais WebRTC (entre nós).
 */

import { myPeerId } from "./peers-base.js";
import * as webrtcPeer from "./webrtc-peer.js";

let broadcastChannel = null;

/**
 * Retorna a instância atual do BroadcastChannel local.
 * @returns {BroadcastChannel|null} Canal ativo ou nulo se desligado.
 */
export function getBroadcastChannel() {
  return broadcastChannel;
}

/**
 * Define a instância ativa do BroadcastChannel local.
 * @param {BroadcastChannel|null} channel Nova instância ou nulo para fechar.
 */
export function setBroadcastChannel(channel) {
  broadcastChannel = channel;
}

/**
 * Envia uma mensagem pelo BroadcastChannel local, se aberto.
 * @param {object} payload Mensagem a enviar.
 */
export function postBroadcastChannel(payload) {
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage(payload);
    } catch {}
  }
}

/**
 * Repassa uma mensagem aos demais canais da malha evitando eco para a origem da mensagem.
 * @param {object} payload Mensagem a repassar.
 * @param {string} [source="rtc"] Origem da mensagem (`"rtc"` ou `"broadcast"`).
 */
export function relayToMesh(payload, source = "rtc") {
  if (source !== "broadcast") {
    postBroadcastChannel(payload);
  }
  if (source !== "rtc") {
    webrtcPeer.broadcastRtcMessage(payload);
  }
}

/**
 * Anuncia uma mensagem simultaneamente para todas as abas locais e todos os pares WebRTC conectados.
 * @param {object} payload Mensagem a ser propagada.
 */
export function broadcastToMesh(payload) {
  postBroadcastChannel(payload);
  webrtcPeer.broadcastRtcMessage(payload);
}

/**
 * Entrega um envelope de DM pelo melhor caminho: canal de DM WebRTC com a conta, senão outra aba.
 * @param {string} toAddress Conta de destino.
 * @param {object} envelope Envelope cifrado.
 * @returns {"rtc"|"broadcast"|null} Caminho usado, ou null se nenhum estava disponível.
 */
export function sendDirectMessageTransport(toAddress, envelope) {
  if (webrtcPeer.sendDmRtc(toAddress, envelope)) {
    return "rtc";
  }
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage({ type: "DM", envelope });
      return "broadcast";
    } catch {}
  }
  return null;
}

/**
 * Situação do WebRTC para a tela de rede.
 * @returns {{remotePeersConnected: number, myPeerId: string, signalingDown: boolean}} Pares abertos, id deste aparelho e se a sinalização caiu.
 */
export function getRtcStatus() {
  return {
    remotePeersConnected: webrtcPeer.getConnectedRtcPeersCount(),
    myPeerId,
    signalingDown: webrtcPeer.isSignalingDown(),
  };
}
