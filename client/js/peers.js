import * as cacheNode from "./cache-node.js";

const PEER_SETTINGS_KEY = "vox-peer-settings";
const PEER_METRICS_KEY = "vox-peer-metrics";
const DAILY_USAGE_KEY = "vox-daily-usage";
const CHANNEL_NAME = "vox-peer-v0";

const myPeerId = "peer_" + Math.random().toString(36).substring(2, 9);
let broadcastChannel = null;
const pendingRequests = new Map(); // txId -> Array of resolver functions

export function getPeerSettings() {
  try {
    const raw = localStorage.getItem(PEER_SETTINGS_KEY);
    if (!raw) {
      // Fase 3.1: default-on (ativo por padrão)
      return {
        enabled: true,
        maxMb: 25,
        wifiOnly: true,
        commOnly: false,
        backgroundRelay: false,
        dailyCapMb: 50,
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
    };
  } catch {
    return {
      enabled: true,
      maxMb: 25,
      wifiOnly: true,
      commOnly: false,
      backgroundRelay: false,
      dailyCapMb: 50,
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
      return { blobsServed: 0, bytesServed: 0, blobsReceived: 0, bytesReceived: 0 };
    }
    return JSON.parse(raw);
  } catch {
    return { blobsServed: 0, bytesServed: 0, blobsReceived: 0, bytesReceived: 0 };
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
  if (!conn) return true; // desktop ou navegador sem API NetworkInformation
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

export function initPeerChannel() {
  const settings = getPeerSettings();
  if (broadcastChannel) {
    if (!settings.enabled) {
      broadcastChannel.close();
      broadcastChannel = null;
      return;
    }
  } else if (settings.enabled && window.BroadcastChannel) {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    broadcastChannel.onmessage = async (event) => {
      const msg = event.data;
      if (!msg || typeof msg !== "object") return;

      // Responde a pedidos WANT se tivermos em cache, respeitando Wi-Fi e teto diário
      if (msg.type === "WANT" && msg.txId && msg.fromPeer !== myPeerId) {
        if (isDailyCapReached()) return;
        if (settings.wifiOnly && !isWifiOrUnlimited()) return;

        const cached = await cacheNode.getCachedTx(msg.txId);
        if (cached && broadcastChannel) {
          const payload = {
            type: "BLOB",
            txId: msg.txId,
            data: cached,
            fromPeer: myPeerId,
          };
          broadcastChannel.postMessage(payload);
          const size = JSON.stringify(cached).length;
          updateMetrics("blobsServed", 1);
          updateMetrics("bytesServed", size);
          recordBytesServed(size);
        }
      }

      // Recebe BLOB atendendo a requisição pendente
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
    };
  }
}

export async function requestTxFromPeers(txId, timeoutMs = 1200) {
  const settings = getPeerSettings();
  if (!settings.enabled || !broadcastChannel) return null;

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

    // Envia requisição WANT
    try {
      broadcastChannel.postMessage({
        type: "WANT",
        txId,
        fromPeer: myPeerId,
      });
    } catch {
      // Ignora erro de postMessage
    }

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
