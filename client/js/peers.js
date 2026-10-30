import * as cacheNode from "./cache-node.js";
import * as webrtcPeer from "./webrtc-peer.js";
import * as localAccount from "./local-account.js";
import * as manifestMesh from "./peers-cache-manifest.js";
import * as blobAffinity from "./peers-blob-affinity.js";
import * as moderation from "./moderation.js";
import * as profileCard from "./profile-card.js";
import * as gossipProfile from "./peers-gossip-profile.js";
import * as profileDirectory from "./profile-directory.js";
import { getRelayHttpUrls } from "./inbox.js";

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

const PEER_SETTINGS_KEY = "vox-peer-settings";
const PEER_METRICS_KEY = "vox-peer-metrics";
const DAILY_USAGE_KEY = "vox-daily-usage";
const CHANNEL_NAME = "vox-peer-v0";

const myPeerId = "peer_" + Math.random().toString(36).substring(2, 9);
let broadcastChannel = null;
const pendingRequests = new Map(); // txId -> Array of resolver functions
const dmListeners = new Set();
const gossipListeners = new Set();

export function onDirectMessage(listener) {
  dmListeners.add(listener);
  return () => dmListeners.delete(listener);
}

function dispatchDirectMessage(envelope, source = "rtc") {
  if (!envelope) return;
  for (const fn of dmListeners) {
    try {
      fn(envelope, source);
    } catch {}
  }
}

const gossipTombstoneListeners = new Set();

export function onGossipPost(listener) {
  gossipListeners.add(listener);
  return () => gossipListeners.delete(listener);
}

function dispatchGossipPost(item, source = "rtc") {
  if (!item) return;
  for (const fn of gossipListeners) {
    try {
      fn(item, source);
    } catch {}
  }
}

export function onGossipTombstone(listener) {
  gossipTombstoneListeners.add(listener);
  return () => gossipTombstoneListeners.delete(listener);
}

function dispatchGossipTombstone(tombstone, source = "rtc") {
  if (!tombstone) return;
  for (const fn of gossipTombstoneListeners) {
    try {
      fn(tombstone, source);
    } catch {}
  }
}

export function getMyPeerId() {
  return myPeerId;
}

const DEFAULT_PEER_SETTINGS = Object.freeze({
  enabled: true,
  maxMb: 25,
  wifiOnly: true,
  commOnly: false,
  backgroundRelay: false,
  dailyCapMb: 50,
  webrtcEnabled: true,
});

export function getPeerSettings() {
  try {
    const raw = localStorage.getItem(PEER_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_PEER_SETTINGS };
    const p = JSON.parse(raw);
    return {
      enabled: p.enabled !== undefined ? p.enabled : DEFAULT_PEER_SETTINGS.enabled,
      maxMb: p.maxMb || DEFAULT_PEER_SETTINGS.maxMb,
      wifiOnly: p.wifiOnly !== undefined ? p.wifiOnly : DEFAULT_PEER_SETTINGS.wifiOnly,
      commOnly: p.commOnly !== undefined ? p.commOnly : DEFAULT_PEER_SETTINGS.commOnly,
      backgroundRelay: p.backgroundRelay !== undefined ? p.backgroundRelay : DEFAULT_PEER_SETTINGS.backgroundRelay,
      dailyCapMb: p.dailyCapMb || DEFAULT_PEER_SETTINGS.dailyCapMb,
      webrtcEnabled: p.webrtcEnabled !== undefined ? p.webrtcEnabled : DEFAULT_PEER_SETTINGS.webrtcEnabled,
    };
  } catch {
    return { ...DEFAULT_PEER_SETTINGS };
  }
}

export function savePeerSettings(settings) {
  localStorage.setItem(PEER_SETTINGS_KEY, JSON.stringify(settings));
  initPeerChannel();
  updateServiceWorkerRelay(settings);
}

export function getPeerMetrics() {
  try {
    const raw = localStorage.getItem(PEER_METRICS_KEY);
    if (!raw) {
      return {
        blobsServed: 0,
        bytesServed: 0,
        blobsReceived: 0,
        bytesReceived: 0,
        blobsServedRtc: 0,
      };
    }
    const parsed = JSON.parse(raw);
    return {
      blobsServed: parsed.blobsServed || 0,
      bytesServed: parsed.bytesServed || 0,
      blobsReceived: parsed.blobsReceived || 0,
      bytesReceived: parsed.bytesReceived || 0,
      blobsServedRtc: parsed.blobsServedRtc || 0,
    };
  } catch {
    return {
      blobsServed: 0,
      bytesServed: 0,
      blobsReceived: 0,
      bytesReceived: 0,
      blobsServedRtc: 0,
    };
  }
}

function updateMetrics(field, amount = 1) {
  const metrics = getPeerMetrics();
  metrics[field] = (metrics[field] || 0) + amount;
  localStorage.setItem(PEER_METRICS_KEY, JSON.stringify(metrics));
}

export function getDailyUsage() {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const raw = localStorage.getItem(DAILY_USAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.date === today) return data;
    }
  } catch {}
  return { date: today, bytesServedToday: 0 };
}

export function recordBytesServed(bytes) {
  const usage = getDailyUsage();
  usage.bytesServedToday += bytes;
  localStorage.setItem(DAILY_USAGE_KEY, JSON.stringify(usage));
}

export function isDailyCapReached() {
  const settings = getPeerSettings();
  const usage = getDailyUsage();
  const capBytes = (settings.dailyCapMb || 50) * 1024 * 1024;
  return usage.bytesServedToday >= capBytes;
}

export function isWifiOrUnlimited() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return true;
  if (conn.saveData) return false;
  if (conn.type && conn.type === "cellular") return false;
  return true;
}

export async function requestNotificationPermission() {
  if (typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "default") {
      return await Notification.requestPermission();
    }
    return Notification.permission;
  }
  return "denied";
}

function updateServiceWorkerRelay(settings) {
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "VOX_SETTINGS_UPDATED",
      settings,
    });
  }
}

/** Comunidades onde o usuário local é membro ou dono (escopo commOnly). */
export async function collectUserCommunityIds() {
  const account = await localAccount.ensureLocalAccount();
  const routeId = account?.routeId || "";
  const ids = new Set();
  if (!routeId) return ids;

  const memberships = await cacheNode.getLocalPosts({ type: "membership" });
  for (const m of memberships) {
    if (m.author === routeId && m.communityId) ids.add(m.communityId);
  }

  const communities = await cacheNode.getLocalCommunities();
  for (const c of communities) {
    const cid = c.communityId || c.id;
    if (cid && c.owner === routeId) ids.add(cid);
  }
  return ids;
}

async function resolveTxCommunityId(txId, cachedData) {
  if (cachedData && typeof cachedData === "object" && cachedData.communityId) {
    return cachedData.communityId;
  }
  const local = await cacheNode.getLocalPost(txId);
  if (local?.communityId) return local.communityId;
  if (local?.replyTo) {
    const parent = await cacheNode.getLocalPost(local.replyTo);
    if (parent?.communityId) return parent.communityId;
  }
  return null;
}

export async function isTxInUserCommunityScope(txId, cachedData) {
  const scope = await collectUserCommunityIds();
  if (scope.size === 0) return false;
  const commId = await resolveTxCommunityId(txId, cachedData);
  if (!commId) return false;
  return scope.has(commId);
}

const MAX_PROFILE_CARD_SIZE = 65536; // 64 KB max profile card
const TXID_REGEX = /^[a-zA-Z0-9_-]{3,128}$/;

function isValidTxId(txId) {
  return typeof txId === "string" && TXID_REGEX.test(txId);
}

async function handleProfileCardHello(card) {
  if (!card || typeof card !== "object" || !card.pubKey || !card.sig || !card.author) return;
  if (moderation.shouldDropGossip(card.author)) return;
  try {
    if (JSON.stringify(card).length > MAX_PROFILE_CARD_SIZE) return;
  } catch {
    return;
  }
  const valid = await localAccount.verifyPayload(card);
  if (valid) {
    await gossipProfile.applyVerifiedProfileCardItem(card);
  }
}

async function handleWantMessage(msg, replyFn, settings, source) {
  if (!isValidTxId(msg.txId) || msg.fromPeer === myPeerId) return;
  if (isDailyCapReached()) return;
  if (settings.wifiOnly && !isWifiOrUnlimited()) return;

  const cached = await cacheNode.getCachedTx(msg.txId);
  if (!cached || typeof replyFn !== "function") return;

  const inScope = !settings.commOnly || (await isTxInUserCommunityScope(msg.txId, cached));
  if (!inScope) return;

  const payload = {
    type: "BLOB",
    txId: msg.txId,
    data: cached,
    fromPeer: myPeerId,
  };
  replyFn(payload);
  const size = JSON.stringify(cached).length;
  updateMetrics("blobsServed", 1);
  updateMetrics("bytesServed", size);
  if (source === "rtc") {
    updateMetrics("blobsServedRtc", 1);
  }
  recordBytesServed(size);
}

function handleBlobMessage(msg) {
  if (!isValidTxId(msg.txId) || !msg.data) return;
  const resolvers = pendingRequests.get(msg.txId);
  if (!resolvers || !resolvers.length) return;

  if (msg.fromPeer && blobAffinity.isBlobPeerSoftPriorityEnabled()) {
    blobAffinity.bumpAffinity(msg.fromPeer);
  }
  const size = JSON.stringify(msg.data).length;
  updateMetrics("blobsReceived", 1);
  updateMetrics("bytesReceived", size);
  for (const resolve of resolvers) {
    resolve(msg.data);
  }
  pendingRequests.delete(msg.txId);
}

const VOX_MESSAGE_HANDLERS = {
  PROFILE_CARD_HELLO: (msg) => handleProfileCardHello(msg.card),
  WANT: (msg, replyFn, settings, source) => handleWantMessage(msg, replyFn, settings, source),
  BLOB: (msg) => handleBlobMessage(msg),
  DM: (msg, _replyFn, _settings, source) => {
    if (msg.envelope) dispatchDirectMessage(msg.envelope, source);
  },
  GOSSIP: (msg, _replyFn, _settings, source) => (msg.item ? handleGossipMessage(msg.item, source) : null),
  GOSSIP_UPDATE: (msg, _replyFn, _settings, source) => (msg.item ? handleGossipUpdateMessage(msg.item, source) : null),
  GOSSIP_DELETE: (msg, _replyFn, _settings, source) => {
    const target = msg.tombstone || msg.item;
    return target ? handleGossipDeleteMessage(target, source) : null;
  },
  CACHE_MANIFEST: (msg, _replyFn, _settings, source) => (msg.item ? handleCacheManifestMessage(msg.item, source) : null),
};

export async function handleVoxMessage(msg, replyFn, source = "broadcast") {
  if (!msg || typeof msg !== "object") return;
  const settings = getPeerSettings();
  if (!settings.enabled) return;

  const handler = VOX_MESSAGE_HANDLERS[msg.type];
  if (handler) {
    await handler(msg, replyFn, settings, source);
  }
}

function relayToMesh(payload, source = "rtc") {
  if (source !== "broadcast" && broadcastChannel) {
    try {
      broadcastChannel.postMessage(payload);
    } catch {}
  }
  if (source !== "rtc") {
    webrtcPeer.broadcastRtcMessage(payload);
  }
}

async function handleCacheManifestMessage(item, source = "rtc") {
  const result = await manifestMesh.ingestSignedCacheManifestItem(item, localAccount.verifyPayload);
  if (!result.ok || result.skipped) return;
  relayToMesh({ type: "CACHE_MANIFEST", item, fromPeer: myPeerId }, source);
}

async function isGossipItemSuperseded(item) {
  const incomingTime = item.editedAt || item.ts || 0;
  const tombstone = await cacheNode.getTombstone(item.id);
  if (tombstone && (tombstone.editedAt || 0) >= incomingTime) return true;

  const existing = await cacheNode.getLocalPost(item.id);
  if (existing) {
    const existingTime = existing.editedAt || existing.ts || 0;
    if (existingTime >= incomingTime) return true;
    if (existing.author && item.author && existing.author !== item.author) return true;
  }
  return false;
}

function syncProfileDirectoryFromGossip(item) {
  if (item.author && (item.authorDisplay || item.authorAvatar || item.authorHandle)) {
    profileDirectory.setProfileCard(item.author, {
      name: item.authorDisplay || "",
      avatarUrl: item.authorAvatar || "",
      handle: item.authorHandle || "",
    });
  }
}

async function handleGossipMessage(item, source = "rtc") {
  if (!item?.id || !item?.sig) return;
  if (moderation.shouldDropGossip(item.author)) return;
  if (await isGossipItemSuperseded(item)) return;

  const valid = await localAccount.verifyPayload(item);
  if (!valid) return;

  if (item.type === profileCard.PROFILE_CARD_TYPE) {
    await gossipProfile.applyVerifiedProfileCardItem(item);
    relayToMesh({ type: "GOSSIP", item, fromPeer: myPeerId }, source);
    return;
  }

  syncProfileDirectoryFromGossip(item);
  await cacheNode.saveLocalPost(item);
  dispatchGossipPost(item, source);
  relayToMesh({ type: "GOSSIP", item, fromPeer: myPeerId }, source);
}

async function isGossipUpdateSuperseded(item) {
  const tombstone = await cacheNode.getTombstone(item.id);
  if (tombstone && (tombstone.editedAt || 0) >= item.editedAt) return true;

  const existing = await cacheNode.getLocalPost(item.id);
  if (existing) {
    if (existing.author && existing.author !== item.author) return true;
    const existingTime = existing.editedAt || existing.ts || 0;
    if (item.editedAt <= existingTime) return true;
  }
  return false;
}

async function handleGossipUpdateMessage(item, source = "rtc") {
  if (!item?.id || !item?.sig || !item?.author) return;
  if (moderation.shouldDropGossip(item.author)) return;
  if (!item.editedAt || item.editedAt <= 0) return;
  if (await isGossipUpdateSuperseded(item)) return;

  const valid = await localAccount.verifyPayload(item);
  if (!valid) return;

  if (item.type === profileCard.PROFILE_CARD_TYPE) {
    await gossipProfile.applyVerifiedProfileCardItem(item);
    relayToMesh({ type: "GOSSIP_UPDATE", item, fromPeer: myPeerId }, source);
    return;
  }

  await cacheNode.saveLocalPost(item);
  dispatchGossipPost(item, source);
  relayToMesh({ type: "GOSSIP_UPDATE", item, fromPeer: myPeerId }, source);
}

async function isTombstoneSuperseded(tombstone) {
  const deleteTime = tombstone.editedAt || tombstone.ts || 0;
  const existingTombstone = await cacheNode.getTombstone(tombstone.id);
  if (existingTombstone) {
    const existingDeleteTime = existingTombstone.editedAt || existingTombstone.ts || 0;
    if (existingDeleteTime >= deleteTime) return true;
  }

  const existingPost = await cacheNode.getLocalPost(tombstone.id);
  if (existingPost) {
    if (existingPost.author && existingPost.author !== tombstone.author) return true;
    const postTime = existingPost.editedAt || existingPost.ts || 0;
    if (deleteTime < postTime) return true;
  }
  return false;
}

async function handleGossipDeleteMessage(tombstone, source = "rtc") {
  if (!tombstone?.id || !tombstone?.sig || !tombstone?.author) return;
  if (moderation.shouldDropGossip(tombstone.author)) return;
  const deleteTime = tombstone.editedAt || tombstone.ts || 0;
  if (!deleteTime) return;
  if (await isTombstoneSuperseded(tombstone)) return;

  const valid = await localAccount.verifyPayload(tombstone);
  if (!valid) return;

  const cardRoute = gossipProfile.routeIdFromProfileCardId(tombstone.id);
  if (cardRoute) {
    profileDirectory.removeProfileCard(cardRoute);
    relayToMesh(
      { type: "GOSSIP_DELETE", item: tombstone, tombstone, fromPeer: myPeerId },
      source,
    );
    return;
  }

  await cacheNode.saveTombstone(tombstone);
  dispatchGossipTombstone(tombstone, source);
  relayToMesh({ type: "GOSSIP_DELETE", item: tombstone, tombstone, fromPeer: myPeerId }, source);
}

export function broadcastGossip(item) {
  if (!item?.id) return;
  const payload = { type: "GOSSIP", item, fromPeer: myPeerId };
  if (broadcastChannel) {
    try { broadcastChannel.postMessage(payload); } catch {}
  }
  webrtcPeer.broadcastRtcMessage(payload);
}

export function broadcastGossipUpdate(item) {
  if (!item?.id) return;
  const payload = { type: "GOSSIP_UPDATE", item, fromPeer: myPeerId };
  if (broadcastChannel) {
    try { broadcastChannel.postMessage(payload); } catch {}
  }
  webrtcPeer.broadcastRtcMessage(payload);
}

export function broadcastGossipDelete(tombstone) {
  if (!tombstone?.id) return;
  const payload = { type: "GOSSIP_DELETE", item: tombstone, tombstone, fromPeer: myPeerId };
  if (broadcastChannel) {
    try { broadcastChannel.postMessage(payload); } catch {}
  }
  webrtcPeer.broadcastRtcMessage(payload);
}

export function broadcastProfileCard(item) {
  if (item?.type !== profileCard.PROFILE_CARD_TYPE) return;
  broadcastGossip(item);
}

export function broadcastProfileCardUpdate(item) {
  if (item?.type !== profileCard.PROFILE_CARD_TYPE) return;
  broadcastGossipUpdate(item);
}

export function broadcastCacheManifest(item) {
  if (!item?.id || item.type !== "cache-manifest") return;
  const payload = { type: "CACHE_MANIFEST", item, fromPeer: myPeerId };
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage(payload);
    } catch {}
  }
  webrtcPeer.broadcastRtcMessage(payload);
}

export async function publishSignedCacheManifest(manifestBody) {
  const draft = manifestMesh.buildCacheManifestGossipDraft({
    communityId: manifestBody?.communityId,
    manifest: manifestBody,
  });
  const signed = await localAccount.signPayload(draft);
  await manifestMesh.ingestSignedCacheManifestItem(signed, localAccount.verifyPayload);
  broadcastCacheManifest(signed);
  return signed;
}

export function initPeerChannel() {
  const settings = getPeerSettings();

  if (broadcastChannel) {
    if (!settings.enabled) {
      broadcastChannel.close();
      broadcastChannel = null;
    }
  } else if (settings.enabled && (typeof window !== "undefined" ? window.BroadcastChannel : globalThis.BroadcastChannel)) {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    if (typeof broadcastChannel.unref === "function") broadcastChannel.unref();
    broadcastChannel.onmessage = (event) => {
      handleVoxMessage(
        event.data,
        (reply) => {
          if (broadcastChannel) broadcastChannel.postMessage(reply);
        },
        "broadcast"
      );
    };
  }

  if (settings.enabled && settings.webrtcEnabled) {
    webrtcPeer.initWebRtc(myPeerId);
  } else {
    webrtcPeer.disconnectWebRtc();
  }
}

webrtcPeer.onVoxMessage((msg, replyFn, source) => {
  handleVoxMessage(msg, replyFn, source);
});

webrtcPeer.onDmMessage((envelope) => {
  dispatchDirectMessage(envelope, "rtc");
});

webrtcPeer.onPeerConnect(async (remotePeerId, sendFn) => {
  try {
    const card = await profileCard.buildSignedProfileCard();
    sendFn({ type: "PROFILE_CARD_HELLO", card });
  } catch {}
});

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

export const announceIdentity = webrtcPeer.announceIdentity;
export const isAddressConnectedRtc = webrtcPeer.isAddressConnectedRtc;
export const getPeerDmPub = webrtcPeer.getPeerDmPub;

function requestWithTransport(txId, sendFn, timeoutMs) {
  return new Promise((resolve) => {
    let timer = null;
    const onResolve = (data) => {
      if (timer) clearTimeout(timer);
      resolve(data);
    };

    if (!pendingRequests.has(txId)) {
      pendingRequests.set(txId, []);
    }
    pendingRequests.get(txId).push(onResolve);

    try {
      sendFn();
    } catch {}

    timer = setTimeout(() => {
      const list = pendingRequests.get(txId);
      if (list) {
        const idx = list.indexOf(onResolve);
        if (idx !== -1) list.splice(idx, 1);
        if (list.length === 0) pendingRequests.delete(txId);
      }
      resolve(null);
    }, timeoutMs);
  });
}

function requestFromBroadcast(txId, timeoutMs = 600) {
  return requestWithTransport(
    txId,
    () => {
      if (broadcastChannel) {
        broadcastChannel.postMessage({ type: "WANT", txId, fromPeer: myPeerId });
      }
    },
    timeoutMs
  );
}

function requestFromRtc(txId, timeoutMs = 2000) {
  return requestWithTransport(
    txId,
    () => {
      webrtcPeer.broadcastRtcMessage({ type: "WANT", txId, fromPeer: myPeerId });
    },
    timeoutMs
  );
}

async function requestFromAffinityPeers(txId) {
  const openPeers = webrtcPeer.listOpenRtcPeerIds ? webrtcPeer.listOpenRtcPeerIds() : [];
  const ranked = blobAffinity.rankAffinity(openPeers);
  for (const peerId of ranked) {
    const result = await requestWithTransport(
      txId,
      () => webrtcPeer.sendVoxMessage(peerId, { type: "WANT", txId, fromPeer: myPeerId }),
      450,
    );
    if (result) return result;
  }
  return null;
}

async function requestFromLocalBroadcast(txId, priority) {
  if (!broadcastChannel) return null;
  return requestFromBroadcast(txId, priority ? 900 : 600);
}

async function requestFromMeshRtc(txId, priority, hasRtc) {
  if (!hasRtc) return null;
  return requestFromRtc(txId, priority ? 2500 : 2000);
}

export async function requestTxFromPeers(txId, opts = {}) {
  const settings = getPeerSettings();
  if (!settings.enabled) return null;

  const priority = Boolean(opts.priority) || manifestMesh.isManifestPriorityTx(txId);
  const hasRtc = Boolean(settings.webrtcEnabled && webrtcPeer.getConnectedRtcPeersCount() > 0);

  if (settings.webrtcEnabled && blobAffinity.isBlobPeerSoftPriorityEnabled()) {
    const affinityResult = await requestFromAffinityPeers(txId);
    if (affinityResult) return affinityResult;
  }

  if (priority) {
    const rtcFirst = await requestFromMeshRtc(txId, true, hasRtc);
    if (rtcFirst) return rtcFirst;
  }

  const broadcastResult = await requestFromLocalBroadcast(txId, priority);
  if (broadcastResult) return broadcastResult;

  if (!priority) {
    const rtcFallback = await requestFromMeshRtc(txId, false, hasRtc);
    if (rtcFallback) return rtcFallback;
  }

  return null;
}

export function getRtcStatus() {
  return {
    remotePeersConnected: webrtcPeer.getConnectedRtcPeersCount(),
    myPeerId,
  };
}

export const getCustomTurnConfig = webrtcPeer.getCustomTurnConfig;
export const saveCustomTurnConfig = webrtcPeer.saveCustomTurnConfig;

export async function checkDesktopRelay(url = null) {
  const targets = url ? [url] : getRelayHttpUrls();
  for (const root of targets) {
    const healthUrl = `${root.replace(/\/+$/, "")}/health`;
    try {
      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(450) });
      if (!res.ok) continue;
      const data = await res.json();
      return { online: true, data, activeUrl: root };
    } catch {}
  }
  return { online: false };
}

export async function fetchFromDesktopRelay(txId, url = null) {
  const targets = url ? [url] : getRelayHttpUrls();
  for (const root of targets) {
    try {
      const res = await fetch(`${root.replace(/\/+$/, "")}/tx/${encodeURIComponent(txId)}`, {
        signal: AbortSignal.timeout(800),
      });
      if (!res.ok) continue;
      const text = await res.text();
      let parsed = { body: text, raw: text };
      try {
        const json = JSON.parse(text);
        if (typeof json === "object" && json !== null) {
          parsed.body = json.body || json.content || json.text || text;
          parsed.title = json.title || "";
        }
      } catch {}
      return parsed;
    } catch {
      continue;
    }
  }
  return null;
}

// Inicializa canal (ativo por padrão)
initPeerChannel();
