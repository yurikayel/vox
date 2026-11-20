/**
 * @file Fachada WebRTC do Vox — conexão P2P, sinalização e mensagens (re-exporta módulos focados).
 *
 * Conexão peer-to-peer entre dispositivos via RTCDataChannel ("vox-peer-v0").
 * Troca de mensagens WANT/HAVE/BLOB com sinalização WebSocket opcional e autohospedada.
 *
 * @module webrtc-peer
 */
export {
  loadSignalingConfig,
  isTurnOnly,
  setTurnOnly,
  getCustomTurnConfig,
  saveCustomTurnConfig,
  getSignalingCandidates,
  resetSignalingIndex,
  getWebTorrentTrackers,
  getNostrRelays,
  getNostrSignalingRelays,
  getDecentralizedSignalingMesh,
  getSignalingUrl,
  rotateSignalingUrl,
  createRtcConfig,
} from "./webrtc-signaling-config.js";
export { getActiveSignalingIndex } from "./webrtc-peer-state.js";
export { initWebRtc, disconnectWebRtc, handleSignalingMessage } from "./webrtc-signaling-ws.js";
export { closePeerConnection } from "./webrtc-connection.js";
export {
  onVoxMessage,
  onDmMessage,
  onSignalingHealth,
  isSignalingDown,
  onPeerIdentity,
  onPeerConnect,
  announceIdentity,
  registerAddressMapping,
  listKnownPeerAddresses,
  getPeerDmPub,
  isAddressConnectedRtc,
  getConnectedRtcPeersCount,
  listOpenRtcPeerIds,
  sendDmRtc,
  sendVoxMessage,
  broadcastRtcMessage,
} from "./webrtc-messaging.js";