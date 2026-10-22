import * as cacheNode from "./cache-node.js";

const PEER_SETTINGS_KEY = "vox-peer-settings";
const PEER_METRICS_KEY = "vox-peer-metrics";
const CHANNEL_NAME = "vox-peer-v0";

const myPeerId = "peer_" + Math.random().toString(36).substring(2, 9);
let broadcastChannel = null;
const pendingRequests = new Map(); // txId -> Array of resolver functions

export function getPeerSettings() {
  try {
    const raw = localStorage.getItem(PEER_SETTINGS_KEY);
    if (!raw) {
      return {
        enabled: false,
        maxMb: 25,
        wifiOnly: true,
        commOnly: false,
      };
    }
    return JSON.parse(raw);
  } catch {
    return { enabled: false, maxMb: 25, wifiOnly: true, commOnly: false };
  }
}

export function savePeerSettings(settings) {
  localStorage.setItem(PEER_SETTINGS_KEY, JSON.stringify(settings));
  initPeerChannel();
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

      // Responde a pedidos WANT se tivermos em cache
      if (msg.type === "WANT" && msg.txId && msg.fromPeer !== myPeerId) {
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

// Inicializa canal se opt-in já estiver ativo
initPeerChannel();
