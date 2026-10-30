/**
 * Módulo WebRTC do Vox (Fase 3.2)
 * Conexão peer-to-peer entre dispositivos via RTCDataChannel ("vox-peer-v0").
 * Troca de mensagens WANT/HAVE/BLOB com sinalização WebSocket opcional e autohospedada.
 */

let signalingWs = null;
let currentPeerId = null;
let currentAddress = "";
let currentDmPub = null;
let customSignalingUrl = null;
let isWebRtcEnabled = false;
let messageHandler = null;
let dmMessageHandler = null;
let identityHandler = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let configCache = null;

// Mapa de peerId remoto -> { pc: RTCPeerConnection, dc: RTCDataChannel, dmDc: RTCDataChannel }
const peerConnections = new Map();
const addressToPeer = new Map();
const dmPubByAddress = new Map();

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
const NEGOTIATION_TIMEOUT_MS = 15000;

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

export function onDmMessage(handler) {
  dmMessageHandler = handler;
}

export function onPeerIdentity(handler) {
  identityHandler = handler;
}

export function announceIdentity(address, dmPub = null) {
  currentAddress = address || "";
  if (dmPub) currentDmPub = dmPub;
  if (signalingWs && signalingWs.readyState === WebSocket.OPEN && currentPeerId) {
    sendSignaling({
      type: "register",
      peerId: currentPeerId,
      address: currentAddress,
      dmPub: currentDmPub,
    });
  }
}

export function registerAddressMapping(address, peerId, dmPub = null) {
  if (!address || !peerId) return;
  addressToPeer.set(address, peerId);
  if (dmPub) {
    dmPubByAddress.set(address, dmPub);
    if (identityHandler) identityHandler(address, dmPub);
  }
}

export function getPeerDmPub(address) {
  return dmPubByAddress.get(address) || null;
}

export function isAddressConnectedRtc(address) {
  const pid = addressToPeer.get(address);
  if (!pid) return false;
  const entry = peerConnections.get(pid);
  return Boolean(entry?.dmDc && entry.dmDc.readyState === "open");
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

export function listOpenRtcPeerIds() {
  const openPeers = [];
  for (const [peerId, entry] of peerConnections.entries()) {
    if (entry.dc && entry.dc.readyState === "open") {
      openPeers.push(peerId);
    }
  }
  return openPeers;
}

let activeSignalingIndex = 0;

export function getSignalingCandidates(config) {
  if (customSignalingUrl) return [customSignalingUrl];
  const stored = (localStorage.getItem("vox-custom-signaling-url") || "").trim();
  if (stored) return [stored];
  const urls = Array.isArray(config?.signalingUrls)
    ? config.signalingUrls.map((u) => String(u || "").trim()).filter(Boolean)
    : [];
  return urls.length > 0 ? urls : ["ws://127.0.0.1:3921"];
}

export function getActiveSignalingIndex() {
  return activeSignalingIndex;
}

export function resetSignalingIndex() {
  activeSignalingIndex = 0;
}

export function getSignalingUrl(config) {
  const candidates = getSignalingCandidates(config);
  return candidates[activeSignalingIndex % candidates.length];
}

export function rotateSignalingUrl(config) {
  const candidates = getSignalingCandidates(config);
  activeSignalingIndex = (activeSignalingIndex + 1) % candidates.length;
  return candidates[activeSignalingIndex];
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
  resetSignalingIndex();
}

async function connectSignaling() {
  if (!isWebRtcEnabled || !currentPeerId) return;
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") return;
  const config = await loadSignalingConfig();
  const url = getSignalingUrl(config);

  try {
    signalingWs = new WebSocket(url);
    bindSignalingSocket(signalingWs, config);
  } catch {
    rotateSignalingUrl(config);
    scheduleReconnect(true);
  }
}

function handleSignalingSocketClose(config, wasOpened) {
  signalingWs = null;
  const candidates = getSignalingCandidates(config);
  if (!wasOpened && candidates.length > 1) {
    const prevIndex = activeSignalingIndex;
    rotateSignalingUrl(config);
    const wrappedAround = activeSignalingIndex <= prevIndex;
    scheduleReconnect(!wrappedAround);
  } else {
    scheduleReconnect(false);
  }
}

function bindSignalingSocket(ws, config) {
  let wasOpened = false;
  ws.onopen = () => {
    wasOpened = true;
    reconnectAttempts = 0;
    ws.send(
      JSON.stringify({
        type: "register",
        peerId: currentPeerId,
        address: currentAddress,
        dmPub: currentDmPub,
      })
    );
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleSignalingMessage(msg);
    } catch {}
  };

  ws.onerror = () => {
    try {
      ws.close();
    } catch {}
  };

  ws.onclose = () => handleSignalingSocketClose(config, wasOpened);
}

function scheduleReconnect(immediate = false) {
  if (!isWebRtcEnabled || reconnectTimer) return;
  const delay = immediate
    ? 300
    : Math.min(30000, 1000 * Math.pow(1.5, reconnectAttempts++));
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectSignaling();
  }, delay);
}

async function handleSignalingMessage(msg) {
  const mtype = msg.type;
  if (mtype === "registered") {
    if (msg.addressMap && typeof msg.addressMap === "object") {
      for (const [addr, info] of Object.entries(msg.addressMap)) {
        registerAddressMapping(addr, info.peerId, info.dmPub);
      }
    }
    handleRegisteredPeers(msg.peers || []);
  } else if (mtype === "peer-joined") {
    if (msg.address) {
      registerAddressMapping(msg.address, msg.peerId, msg.dmPub);
    }
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

let peerConnectHandler = null;

export function onPeerConnect(handler) {
  peerConnectHandler = handler;
}

function startNegotiationTimer(remotePeerId) {
  return setTimeout(() => {
    const entry = peerConnections.get(remotePeerId);
    if (!entry) return;
    const isReady = Boolean(entry.dc && entry.dc.readyState === "open");
    if (!isReady) {
      closePeerConnection(remotePeerId);
    }
  }, NEGOTIATION_TIMEOUT_MS);
}

function setupDataChannelEvents(dc, remotePeerId) {
  dc.onopen = () => {
    const entry = peerConnections.get(remotePeerId);
    if (entry?.timeoutId) {
      clearTimeout(entry.timeoutId);
      entry.timeoutId = null;
    }
    if (typeof peerConnectHandler === "function") {
      peerConnectHandler(remotePeerId, (obj) => sendVoxMessage(remotePeerId, obj));
    }
  };
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

function setupDmChannelEvents(dmDc, remotePeerId) {
  dmDc.onmessage = (event) => {
    if (!dmMessageHandler) return;
    try {
      const parsed = JSON.parse(event.data);
      if (parsed?.type === "DM" && parsed.envelope) {
        dmMessageHandler(parsed.envelope, remotePeerId);
      }
    } catch {}
  };
}

function initInitiatorChannels(pc, remotePeerId) {
  const dc = pc.createDataChannel("vox-peer-v0");
  setupDataChannelEvents(dc, remotePeerId);
  const dmDc = pc.createDataChannel("vox-dm-v0");
  setupDmChannelEvents(dmDc, remotePeerId);
  return { dc, dmDc };
}

function bindPeerDataChannelListener(pc, remotePeerId) {
  pc.ondatachannel = (event) => {
    const ch = event.channel;
    const entry = peerConnections.get(remotePeerId);
    if (ch.label === "vox-dm-v0") {
      setupDmChannelEvents(ch, remotePeerId);
      if (entry) entry.dmDc = ch;
    } else {
      setupDataChannelEvents(ch, remotePeerId);
      if (entry) entry.dc = ch;
    }
  };
}

async function negotiateInitiatorOffer(pc, remotePeerId) {
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignaling({ type: "offer", to: remotePeerId, sdp: pc.localDescription });
  } catch {
    closePeerConnection(remotePeerId);
  }
}

async function createPeerConnection(remotePeerId, isInitiator) {
  if (peerConnections.has(remotePeerId)) return peerConnections.get(remotePeerId);

  const pc = new RTCPeerConnection(createRtcConfig());
  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    if (state === "failed" || state === "closed" || state === "disconnected") {
      closePeerConnection(remotePeerId);
    }
  };
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      sendSignaling({ type: "ice", to: remotePeerId, candidate: event.candidate });
    }
  };

  const { dc, dmDc } = isInitiator
    ? initInitiatorChannels(pc, remotePeerId)
    : (bindPeerDataChannelListener(pc, remotePeerId), { dc: null, dmDc: null });

  const timeoutId = startNegotiationTimer(remotePeerId);
  peerConnections.set(remotePeerId, { pc, dc, dmDc, timeoutId });

  if (isInitiator) {
    await negotiateInitiatorOffer(pc, remotePeerId);
  }
  return { pc, dc, dmDc };
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

function disposePeerChannels(entry) {
  if (entry.dc) {
    entry.dc.onopen = null;
    entry.dc.onmessage = null;
    entry.dc.onclose = null;
    entry.dc.onerror = null;
    entry.dc.close();
  }
  if (entry.dmDc) {
    entry.dmDc.onmessage = null;
    entry.dmDc.close();
  }
  if (entry.pc) {
    entry.pc.onicecandidate = null;
    entry.pc.ondatachannel = null;
    entry.pc.onconnectionstatechange = null;
    entry.pc.close();
  }
}

export function closePeerConnection(remotePeerId) {
  const entry = peerConnections.get(remotePeerId);
  if (!entry) return;
  if (entry.timeoutId) {
    clearTimeout(entry.timeoutId);
    entry.timeoutId = null;
  }
  try {
    disposePeerChannels(entry);
  } catch {}
  peerConnections.delete(remotePeerId);
  for (const [addr, pid] of addressToPeer.entries()) {
    if (pid === remotePeerId) {
      addressToPeer.delete(addr);
    }
  }
}

export function sendDmRtc(toAddress, envelope) {
  const pid = addressToPeer.get(toAddress);
  if (!pid) return false;
  const entry = peerConnections.get(pid);
  if (!entry?.dmDc || entry.dmDc.readyState !== "open") return false;
  try {
    entry.dmDc.send(JSON.stringify({ type: "DM", envelope }));
    return true;
  } catch {
    return false;
  }
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
