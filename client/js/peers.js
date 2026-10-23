import * as cacheNode from "./cache-node.js";
import * as webrtcPeer from "./webrtc-peer.js";
import * as localAccount from "./local-account.js";
import { getRelayHttpUrl } from "./inbox.js";

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

export function getPeerSettings() {
  try {
    const raw = localStorage.getItem(PEER_SETTINGS_KEY);
    if (!raw) {
      return {
        enabled: true,
        maxMb: 25,
        wifiOnly: true,
        commOnly: false,
        backgroundRelay: false,
        dailyCapMb: 50,
        webrtcEnabled: true,
      };
    }
    const parsed = JSON.parse(raw);
    return {
      enabled: parsed.enabled !== undefined ? parsed.enabled : true,
      maxMb: parsed.maxMb || 25,
      wifiOnly: parsed.wifiOnly !== undefined ? parsed.wifiOnly : true,
      commOnly: parsed.commOnly !== undefined ? parsed.commOnly : false,
      backgroundRelay: parsed.backgroundRelay !== undefined ? parsed.backgroundRelay : false,
      dailyCapMb: parsed.dailyCapMb || 50,
      webrtcEnabled: parsed.webrtcEnabled !== undefined ? parsed.webrtcEnabled : true,
    };
  } catch {
    return {
      enabled: true,
      maxMb: 25,
      wifiOnly: true,
      commOnly: false,
      backgroundRelay: false,
      dailyCapMb: 50,
      webrtcEnabled: true,
    };
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
  if ("Notification" in window) {
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

export async function handleVoxMessage(msg, replyFn, source = "broadcast") {
  if (!msg || typeof msg !== "object") return;
  const settings = getPeerSettings();
  if (!settings.enabled) return;

  if (msg.type === "WANT" && msg.txId && msg.fromPeer !== myPeerId) {
    if (isDailyCapReached()) return;
    if (settings.wifiOnly && !isWifiOrUnlimited()) return;

    const cached = await cacheNode.getCachedTx(msg.txId);
    if (cached && typeof replyFn === "function") {
      const inScope =
        !settings.commOnly || (await isTxInUserCommunityScope(msg.txId, cached));
      if (inScope) {
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
    }
  }

  if (msg.type === "BLOB" && msg.txId && msg.data) {
    const resolvers = pendingRequests.get(msg.txId);
    if (resolvers && resolvers.length) {
      const size = JSON.stringify(msg.data).length;
      updateMetrics("blobsReceived", 1);
      updateMetrics("bytesReceived", size);
      for (const resolve of resolvers) {
        resolve(msg.data);
      }
      pendingRequests.delete(msg.txId);
    }
  }

  if (msg.type === "DM" && msg.envelope) {
    // DMs E2E ponta-a-ponta não contam no teto de banda do cache público
    dispatchDirectMessage(msg.envelope, source);
  }

  if (msg.type === "GOSSIP" && msg.item) {
    await handleGossipMessage(msg.item, source);
  }

  if (msg.type === "GOSSIP_UPDATE" && msg.item) {
    await handleGossipUpdateMessage(msg.item, source);
  }

  if (msg.type === "GOSSIP_DELETE" && (msg.item || msg.tombstone)) {
    await handleGossipDeleteMessage(msg.tombstone || msg.item, source);
  }
}

async function handleGossipMessage(item, source = "rtc") {
  if (!item?.id || !item?.sig) return;
  const tombstone = await cacheNode.getTombstone(item.id);
  if (tombstone && (tombstone.editedAt || 0) >= (item.editedAt || item.ts || 0)) {
    return;
  }

  const existing = await cacheNode.getLocalPost(item.id);
  if (existing) {
    const existingTime = existing.editedAt || existing.ts || 0;
    const incomingTime = item.editedAt || item.ts || 0;
    if (existingTime >= incomingTime) return;
    if (existing.author && item.author && existing.author !== item.author) return;
  }

  const valid = await localAccount.verifyPayload(item);
  if (!valid) return;

  await cacheNode.saveLocalPost(item);
  dispatchGossipPost(item, source);

  const payload = { type: "GOSSIP", item, fromPeer: myPeerId };
  if (source !== "broadcast" && broadcastChannel) {
    try { broadcastChannel.postMessage(payload); } catch {}
  }
  if (source !== "rtc") {
    webrtcPeer.broadcastRtcMessage(payload);
  }
}

async function handleGossipUpdateMessage(item, source = "rtc") {
  if (!item?.id || !item?.sig || !item?.author) return;
  if (!item.editedAt || item.editedAt <= 0) return;

  const tombstone = await cacheNode.getTombstone(item.id);
  if (tombstone && (tombstone.editedAt || 0) >= item.editedAt) {
    return;
  }

  const existing = await cacheNode.getLocalPost(item.id);
  if (existing) {
    if (existing.author && existing.author !== item.author) return;
    const existingTime = existing.editedAt || existing.ts || 0;
    if (item.editedAt <= existingTime) return;
  }

  const valid = await localAccount.verifyPayload(item);
  if (!valid) return;

  await cacheNode.saveLocalPost(item);
  dispatchGossipPost(item, source);

  const payload = { type: "GOSSIP_UPDATE", item, fromPeer: myPeerId };
  if (source !== "broadcast" && broadcastChannel) {
    try { broadcastChannel.postMessage(payload); } catch {}
  }
  if (source !== "rtc") {
    webrtcPeer.broadcastRtcMessage(payload);
  }
}

async function handleGossipDeleteMessage(tombstone, source = "rtc") {
  if (!tombstone?.id || !tombstone?.sig || !tombstone?.author) return;
  const deleteTime = tombstone.editedAt || tombstone.ts || 0;
  if (!deleteTime) return;

  const existingTombstone = await cacheNode.getTombstone(tombstone.id);
  if (existingTombstone) {
    const existingDeleteTime = existingTombstone.editedAt || existingTombstone.ts || 0;
    if (existingDeleteTime >= deleteTime) return;
  }

  const existingPost = await cacheNode.getLocalPost(tombstone.id);
  if (existingPost) {
    if (existingPost.author && existingPost.author !== tombstone.author) return;
    const postTime = existingPost.editedAt || existingPost.ts || 0;
    if (deleteTime < postTime) return;
  }

  const valid = await localAccount.verifyPayload(tombstone);
  if (!valid) return;

  await cacheNode.saveTombstone(tombstone);
  dispatchGossipTombstone(tombstone, source);

  const payload = { type: "GOSSIP_DELETE", item: tombstone, tombstone, fromPeer: myPeerId };
  if (source !== "broadcast" && broadcastChannel) {
    try { broadcastChannel.postMessage(payload); } catch {}
  }
  if (source !== "rtc") {
    webrtcPeer.broadcastRtcMessage(payload);
  }
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

export function initPeerChannel() {
  const settings = getPeerSettings();

  if (broadcastChannel) {
    if (!settings.enabled) {
      broadcastChannel.close();
      broadcastChannel = null;
    }
  } else if (settings.enabled && window.BroadcastChannel) {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
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

export async function requestTxFromPeers(txId) {
  const settings = getPeerSettings();
  if (!settings.enabled) return null;

  // 1. Tenta BroadcastChannel local (timeout 600ms)
  if (broadcastChannel) {
    const localResult = await requestFromBroadcast(txId, 600);
    if (localResult) return localResult;
  }

  // 2. Tenta WebRTC DataChannel se houver pares remotos conectados (timeout 2000ms)
  if (settings.webrtcEnabled && webrtcPeer.getConnectedRtcPeersCount() > 0) {
    const rtcResult = await requestFromRtc(txId, 2000);
    if (rtcResult) return rtcResult;
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
  const healthUrl = url || `${getRelayHttpUrl()}/health`;
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(350) });
    if (!res.ok) return { online: false };
    const data = await res.json();
    return { online: true, data };
  } catch {
    return { online: false };
  }
}

export async function fetchFromDesktopRelay(txId) {
  try {
    const res = await fetch(`${getRelayHttpUrl()}/tx/${encodeURIComponent(txId)}`, {
      signal: AbortSignal.timeout(800),
    });
    if (!res.ok) return null;
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
    return null;
  }
}

// Inicializa canal (ativo por padrão)
initPeerChannel();
