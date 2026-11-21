/**
 * @file Roteamento de mensagens do protocolo Vox (`handleVoxMessage`), ciclo de vida do BroadcastChannel e conexão WebRTC.
 */

import { myPeerId, CHANNEL_NAME } from "./peers-base.js";
import { getPeerSettings, setOnSettingsSavedListener } from "./peers-settings.js";
import { getBroadcastChannel, setBroadcastChannel } from "./peers-transport.js";
import { dispatchDirectMessage } from "./peers-events.js";
import { handleWantMessage, handleBlobMessage } from "./peers-transfer.js";
import {
  handleProfileCardHello,
  isOversizedItem,
  handleGossipMessage,
  handleGossipUpdateMessage,
  handleGossipDeleteMessage,
  handleCacheManifestMessage,
} from "./peers-gossip.js";
import {
  MAX_GOSSIP_MESSAGE_BYTES,
  exceedsBytes,
  noteGossipDrop,
  applyDirectoryProfileCard,
} from "./peers-gossip-profile.js";
import * as centralMemory from "./central-memory.js";
import * as profileCard from "./profile-card.js";
import * as webrtcPeer from "./webrtc-peer.js";
import { createPeerSync, defaultPeerSyncDeps, SYNC_INV, SYNC_WANT } from "./peer-sync.js";

const peerSync = createPeerSync(defaultPeerSyncDeps(myPeerId));

const VOX_MESSAGE_HANDLERS = new Map(Object.entries({
  PROFILE_CARD_HELLO: (msg) => handleProfileCardHello(msg.card),
  PROFILE_CARD: (msg) => (isOversizedItem(msg.card) ? null : applyDirectoryProfileCard(msg.card)),
  MEMORY_BEACON: (msg) =>
    msg.memoryUrl ? centralMemory.registerDiscoveredMemoryUrl(msg.memoryUrl) : null,
  WANT: (msg, replyFn, settings, source) => handleWantMessage(msg, replyFn, settings, source),
  BLOB: (msg) => handleBlobMessage(msg),
  DM: (msg, _replyFn, _settings, source) => {
    if (msg.envelope) dispatchDirectMessage(msg.envelope, source);
  },
  GOSSIP: (msg, _replyFn, _settings, source) => (msg.item ? handleGossipMessage(msg.item, source, msg.blob) : null),
  GOSSIP_UPDATE: (msg, _replyFn, _settings, source) => (msg.item ? handleGossipUpdateMessage(msg.item, source) : null),
  GOSSIP_DELETE: (msg, _replyFn, _settings, source) => {
    const target = msg.tombstone || msg.item;
    return target ? handleGossipDeleteMessage(target, source) : null;
  },
  CACHE_MANIFEST: (msg, _replyFn, _settings, source) => (msg.item ? handleCacheManifestMessage(msg.item, source) : null),
  [SYNC_INV]: (msg, replyFn, _settings, source) => (source === "rtc" ? peerSync.onInventory(msg, replyFn) : null),
  [SYNC_WANT]: (msg, replyFn, _settings, source) => (source === "rtc" ? peerSync.onWant(msg, replyFn) : null),
}));

/**
 * Despacha uma mensagem da malha para o tratador do seu `type` (WANT, BLOB, DM, GOSSIP, SYNC_INV etc.). Com a ajuda
 * à rede desligada, ou tipo desconhecido, nada acontece.
 * @param {object} msg Mensagem recebida.
 * @param {(reply: object) => void} replyFn Responde a quem mandou.
 * @param {string} [source="broadcast"] Origem: `"broadcast"` (outra aba) ou `"rtc"` (outro aparelho).
 * @returns {Promise<void>} Resolve depois do tratador.
 */
export async function handleVoxMessage(msg, replyFn, source = "broadcast") {
  if (!msg || typeof msg !== "object") return;
  const settings = getPeerSettings();
  if (!settings.enabled) return;

  if (exceedsBytes(msg, MAX_GOSSIP_MESSAGE_BYTES)) return noteGossipDrop("oversizedMessage");
  const handler = typeof msg.type === "string" ? VOX_MESSAGE_HANDLERS.get(msg.type) : undefined;
  if (!handler) return noteGossipDrop("unknownType");
  await handler(msg, replyFn, settings, source);
}

/**
 * Liga ou desliga os canais da malha conforme as preferências: o BroadcastChannel entre abas e o WebRTC entre
 * aparelhos. Roda ao carregar o módulo e a cada `savePeerSettings`.
 */
export function initPeerChannel() {
  const settings = getPeerSettings();
  let ch = getBroadcastChannel();

  if (ch) {
    if (!settings.enabled) {
      ch.close();
      setBroadcastChannel(null);
    }
  } else if (settings.enabled && (typeof window !== "undefined" ? window.BroadcastChannel : globalThis.BroadcastChannel)) {
    ch = new BroadcastChannel(CHANNEL_NAME);
    if (typeof ch.unref === "function") ch.unref();
    ch.onmessage = (event) => {
      handleVoxMessage(
        event.data,
        (reply) => {
          const activeCh = getBroadcastChannel();
          if (activeCh) activeCh.postMessage(reply);
        },
        "broadcast"
      );
    };
    setBroadcastChannel(ch);
  }

  if (settings.enabled && settings.webrtcEnabled) {
    webrtcPeer.initWebRtc(myPeerId);
  } else {
    webrtcPeer.disconnectWebRtc();
  }
}

setOnSettingsSavedListener(initPeerChannel);

webrtcPeer.onVoxMessage((msg, replyFn, source) => {
  handleVoxMessage(msg, replyFn, source);
});

webrtcPeer.onDmMessage((envelope) => {
  dispatchDirectMessage(envelope, "rtc");
});

webrtcPeer.onPeerIdentity((address, dmPub) => {
  if (dmPub && typeof dmPub === "object" && dmPub.memoryUrl) {
    centralMemory.registerDiscoveredMemoryUrl(dmPub.memoryUrl);
  }
});

webrtcPeer.onPeerConnect(async (remotePeerId, sendFn) => {
  try {
    sendFn({ type: "PROFILE_CARD_HELLO", card: await profileCard.buildSignedProfileCard() });
    const memoryUrl = centralMemory.getDiscoveredPublicMemoryUrl();
    if (memoryUrl) sendFn({ type: "MEMORY_BEACON", memoryUrl, fromPeer: myPeerId });
    await peerSync.onConnect(sendFn);
  } catch {}
});
