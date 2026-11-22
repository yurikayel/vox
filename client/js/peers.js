/**
 * @file Malha de pares do aparelho: troca de mensagens com outras abas (BroadcastChannel `vox-peer-v0`) e com outros
 * aparelhos (WebRTC, via `webrtc-peer.js`). Fachada pública que reexporta os submódulos da malha mantendo compatibilidade.
 */

import * as webrtcPeer from "./webrtc-peer.js";
import { initPeerChannel } from "./peers-channel.js";

export {
  getGossipDropCounts,
  MAX_GOSSIP_ITEM_BYTES,
  MAX_GOSSIP_MESSAGE_BYTES,
  MAX_PROFILE_CARD_BYTES,
} from "./peers-gossip-profile.js";

export {
  collectPriorityPinTxIds,
  getLatestManifestForCommunity,
  isManifestPriorityTx,
  listKnownManifests,
  buildCacheManifestGossipDraft,
} from "./peers-cache-manifest.js";

export {
  isBlobPeerSoftPriorityEnabled,
  setBlobPeerSoftPriorityEnabled,
  bumpAffinity,
  getPeerAffinity,
  rankAffinity,
  clearAffinity,
  getAffinityEntries,
} from "./peers-blob-affinity.js";

export {
  onDirectMessage,
  onGossipPost,
  onGossipTombstone,
} from "./peers-events.js";

export {
  CELLULAR_CAP_MIN_MB,
  CELLULAR_CAP_MAX_MB,
  clampCellularCapMb,
  getPeerSettings,
  savePeerSettings,
  getPeerMetrics,
  getDailyUsage,
  recordBytesServed,
  canServeNow,
  isDailyCapReached,
  isWifiOrUnlimited,
  requestNotificationPermission,
} from "./peers-settings.js";

export {
  collectUserCommunityIds,
  isTxInUserCommunityScope,
  requestTxFromPeers,
} from "./peers-transfer.js";

export {
  broadcastGossip,
  broadcastGossipUpdate,
  broadcastGossipDelete,
  broadcastProfileCard,
  broadcastProfileCardUpdate,
  broadcastCacheManifest,
  publishSignedCacheManifest,
} from "./peers-gossip.js";

export {
  sendDirectMessageTransport,
  getRtcStatus,
} from "./peers-transport.js";

export {
  handleVoxMessage,
  initPeerChannel,
} from "./peers-channel.js";

export {
  checkDesktopRelay,
  fetchFromDesktopRelay,
} from "./peers-relay.js";

/** Anuncia conta e chave de DM deste aparelho à sinalização (ver `webrtc-peer.js`). */
export const announceIdentity = webrtcPeer.announceIdentity;

/** Indica se há canal de DM WebRTC aberto com a conta (ver `webrtc-peer.js`). */
export const isAddressConnectedRtc = webrtcPeer.isAddressConnectedRtc;

/** Chave pública de DM que o par da conta anunciou (ver `webrtc-peer.js`). */
export const getPeerDmPub = webrtcPeer.getPeerDmPub;

/** LAN-21: avisa quando a sinalização cai (WebSocket e Nostr juntos) e quando volta. */
export const onSignalingHealth = webrtcPeer.onSignalingHealth;

/** TURN próprio configurado pela pessoa (ver `webrtc-peer.js`). */
export const getCustomTurnConfig = webrtcPeer.getCustomTurnConfig;

/** Grava o TURN próprio da pessoa (ver `webrtc-peer.js`). */
export const saveCustomTurnConfig = webrtcPeer.saveCustomTurnConfig;

// Inicializa canal (ativo por padrão)
initPeerChannel();
