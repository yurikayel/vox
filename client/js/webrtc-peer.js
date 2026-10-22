/**
 * Módulo WebRTC do Vox (Fase 3.2)
 * Conexão peer-to-peer entre dispositivos via RTCDataChannel ("vox-peer-v0").
 * Troca de mensagens WANT/HAVE/BLOB com sinalização WebSocket opcional e autohospedada.
 */

let signalingWs = null;
let currentPeerId = null;
let customSignalingUrl = null;
let isWebRtcEnabled = false;
let messageHandler = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let configCache = null;

// Mapa de peerId remoto -> { pc: RTCPeerConnection, dc: RTCDataChannel }
const peerConnections = new Map();

export async function loadSignalingConfig() {
  if (configCache) return configCache;
  try {
    const res = await fetch("config/signaling.json");
    if (res.ok) {
      configCache = await res.json();
      return configCache;
    }
  } catch {}
  configCache = {
    stun: ["stun:stun.l.google.com:19302"],
    turn: [],
    signalingUrls: ["ws://127.0.0.1:3921"],
    maxRtcPeers: 8,
  };
  return configCache;
}

const CUSTOM_TURN_KEY = "vox-custom-turn-config";

export function getCustomTurnConfig() {
  try {
    const raw = localStorage.getItem(CUSTOM_TURN_KEY);
    if (!raw) return { urls: "", username: "", credential: "" };
    const parsed = JSON.parse(raw);
    return {
      urls: (parsed.urls || "").trim(),
      username: (parsed.username || "").trim(),
      credential: parsed.credential || "",
    };
  } catch {
    return { urls: "", username: "", credential: "" };
  }
}

export function saveCustomTurnConfig({ urls = "", username = "", credential = "" } = {}) {
  const clean = {
    urls: String(urls || "").trim(),
    username: String(username || "").trim(),
    credential: String(credential || ""),
  };
  localStorage.setItem(CUSTOM_TURN_KEY, JSON.stringify(clean));
}

export function onVoxMessage(handler) {
  messageHandler = handler;
}

export function getConnectedRtcPeersCount() {
  let count = 0;
  for (const entry of peerConnections.values()) {
    if (entry.dc && entry.dc.readyState === "open") {
      count++;
    }
  }
  return count;
}

export function getSignalingUrl(config) {
  if (customSignalingUrl) return customSignalingUrl;
  const stored = localStorage.getItem("vox-custom-signaling-url");
  if (stored) return stored.trim();
  return config.signalingUrls?.[0] || "ws://127.0.0.1:3921";
}

export async function initWebRtc(peerId, customUrl = null) {
  currentPeerId = peerId;
  customSignalingUrl = customUrl;
  isWebRtcEnabled = true;

  if (typeof RTCPeerConnection === "undefined") {
    return false;
  }
  connectSignaling();
  return true;
}

export function disconnectWebRtc() {
  isWebRtcEnabled = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (signalingWs) {
    try {
      signalingWs.close();
    } catch {}
    signalingWs = null;
  }
  for (const remoteId of Array.from(peerConnections.keys())) {
    closePeerConnection(remoteId);
  }
}

async function connectSignaling() {
  if (!isWebRtcEnabled || !currentPeerId) return;
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") return;
  const config = await loadSignalingConfig();
  const url = getSignalingUrl(config);

  try {
    signalingWs = new WebSocket(url);
    bindSignalingSocket(signalingWs);
  } catch {
    scheduleReconnect();
  }
}

function bindSignalingSocket(ws) {
  ws.onopen = () => {
    reconnectAttempts = 0;
    ws.send(JSON.stringify({ type: "register", peerId: currentPeerId }));
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleSignalingMessage(msg);
    } catch {}
  };

  ws.onerror = () => ws.close();
  ws.onclose = () => {
    signalingWs = null;
    scheduleReconnect();
  };
}

function scheduleReconnect() {
  if (!isWebRtcEnabled || reconnectTimer) return;
  const delay = Math.min(30000, 1000 * Math.pow(1.5, reconnectAttempts++));
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectSignaling();
  }, delay);
}

async function handleSignalingMessage(msg) {
  const mtype = msg.type;
  if (mtype === "registered") {
    handleRegisteredPeers(msg.peers || []);
  } else if (mtype === "peer-joined") {
    handlePeerJoined(msg.peerId);
  } else if (mtype === "offer") {
    handleIncomingOffer(msg.from, msg.sdp);
  } else if (mtype === "answer") {
    handleIncomingAnswer(msg.from, msg.sdp);
  } else if (mtype === "ice") {
    handleIncomingIce(msg.from, msg.candidate);
  } else if (mtype === "peer-left") {
    closePeerConnection(msg.peerId);
  }
}

function handleRegisteredPeers(peersList) {
  const maxPeers = configCache?.maxRtcPeers || 8;
  for (const remoteId of peersList) {
    if (peerConnections.size >= maxPeers) break;
    if (currentPeerId < remoteId) {
      createPeerConnection(remoteId, true);
    }
  }
}

function handlePeerJoined(remoteId) {
  const maxPeers = configCache?.maxRtcPeers || 8;
  if (peerConnections.size < maxPeers && currentPeerId < remoteId) {
    createPeerConnection(remoteId, true);
  }
}

function sendSignaling(data) {
  if (signalingWs && signalingWs.readyState === WebSocket.OPEN) {
    signalingWs.send(JSON.stringify(data));
  }
}

export function createRtcConfig(config = configCache) {
  const stunList = config?.stun || ["stun:stun.l.google.com:19302"];
  const iceServers = stunList.map((url) => ({ urls: url }));

  const turnList = Array.isArray(config?.turn) ? config.turn : [];
  for (const t of turnList) {
    if (typeof t === "string" && t.trim()) {
      iceServers.push({ urls: t.trim() });
    } else if (t && typeof t === "object" && t.urls) {
      iceServers.push(t);
    }
  }

  const customTurn = getCustomTurnConfig();
  if (customTurn.urls) {
    const entry = { urls: customTurn.urls };
    if (customTurn.username) entry.username = customTurn.username;
    if (customTurn.credential) entry.credential = customTurn.credential;
    iceServers.push(entry);
  }

  return { iceServers };
}

function setupDataChannelEvents(dc, remotePeerId) {
  dc.onmessage = (event) => {
    if (!messageHandler) return;
    try {
      const parsed = JSON.parse(event.data);
      messageHandler(parsed, (replyObj) => {
        sendVoxMessage(remotePeerId, replyObj);
      }, "rtc");
    } catch {}
  };

  dc.onclose = () => closePeerConnection(remotePeerId);
  dc.onerror = () => closePeerConnection(remotePeerId);
}

async function createPeerConnection(remotePeerId, isInitiator) {
  if (peerConnections.has(remotePeerId)) return peerConnections.get(remotePeerId);

  const pc = new RTCPeerConnection(createRtcConfig());
  let dc = null;

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      sendSignaling({ type: "ice", to: remotePeerId, candidate: event.candidate });
    }
  };

  if (isInitiator) {
    dc = pc.createDataChannel("vox-peer-v0");
    setupDataChannelEvents(dc, remotePeerId);
  } else {
    pc.ondatachannel = (event) => {
      dc = event.channel;
      setupDataChannelEvents(dc, remotePeerId);
      const entry = peerConnections.get(remotePeerId);
      if (entry) entry.dc = dc;
    };
  }

  peerConnections.set(remotePeerId, { pc, dc });

  if (isInitiator) {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignaling({ type: "offer", to: remotePeerId, sdp: pc.localDescription });
    } catch {
      closePeerConnection(remotePeerId);
    }
  }

  return { pc, dc };
}

async function handleIncomingOffer(fromPeer, sdp) {
  const { pc } = await createPeerConnection(fromPeer, false);
  try {
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendSignaling({ type: "answer", to: fromPeer, sdp: pc.localDescription });
  } catch {
    closePeerConnection(fromPeer);
  }
}

async function handleIncomingAnswer(fromPeer, sdp) {
  const entry = peerConnections.get(fromPeer);
  if (!entry) return;
  try {
    await entry.pc.setRemoteDescription(new RTCSessionDescription(sdp));
  } catch {
    closePeerConnection(fromPeer);
  }
}

async function handleIncomingIce(fromPeer, candidate) {
  const entry = peerConnections.get(fromPeer);
  if (!entry || !candidate) return;
  try {
    await entry.pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch {}
}

export function closePeerConnection(remotePeerId) {
  const entry = peerConnections.get(remotePeerId);
  if (!entry) return;
  try {
    if (entry.dc) entry.dc.close();
    entry.pc.close();
  } catch {}
  peerConnections.delete(remotePeerId);
}

export function sendVoxMessage(remotePeerId, obj) {
  const entry = peerConnections.get(remotePeerId);
  if (entry && entry.dc && entry.dc.readyState === "open") {
    try {
      entry.dc.send(JSON.stringify(obj));
      return true;
    } catch {}
  }
  return false;
}

export function broadcastRtcMessage(obj) {
  const payload = JSON.stringify(obj);
  let sentCount = 0;
  for (const entry of peerConnections.values()) {
    if (entry.dc && entry.dc.readyState === "open") {
      try {
        entry.dc.send(payload);
        sentCount++;
      } catch {}
    }
  }
  return sentCount;
}
