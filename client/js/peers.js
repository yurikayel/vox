import * as cacheNode from "./cache-node.js";
import * as webrtcPeer from "./webrtc-peer.js";

const PEER_SETTINGS_KEY = "vox-peer-settings";
const PEER_METRICS_KEY = "vox-peer-metrics";
const DAILY_USAGE_KEY = "vox-daily-usage";
const CHANNEL_NAME = "vox-peer-v0";

const myPeerId = "peer_" + Math.random().toString(36).substring(2, 9);
let broadcastChannel = null;
const pendingRequests = new Map(); // txId -> Array of resolver functions
const dmListeners = new Set();

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

export async function handleVoxMessage(msg, replyFn, source = "broadcast") {
  if (!msg || typeof msg !== "object") return;
  const settings = getPeerSettings();
  if (!settings.enabled) return;

  if (msg.type === "WANT" && msg.txId && msg.fromPeer !== myPeerId) {
    if (isDailyCapReached()) return;
    if (settings.wifiOnly && !isWifiOrUnlimited()) return;

    const cached = await cacheNode.getCachedTx(msg.txId);
    if (cached && typeof replyFn === "function") {
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

export async function checkDesktopRelay(url = "http://127.0.0.1:3920/health") {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(350) });
    if (!res.ok) return { online: false };
    const data = await res.json();
    return { online: true, data };
  } catch {
    return { online: false };
  }
}

export async function fetchFromDesktopRelay(txId) {
  try {
    const res = await fetch(`http://127.0.0.1:3920/tx/${txId}`, {
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
