/**
 * Módulo WebRTC do Vox (Fase 3.2)
 * Conexão peer-to-peer entre dispositivos via RTCDataChannel ("vox-peer-v0").
 * Troca de mensagens WANT/HAVE/BLOB com sinalização WebSocket opcional e autohospedada.
 */
import { buildNostrSignalingCandidates } from "./nostr-signaling.js";
import { createNostrTransport, DEFAULT_ROOM } from "./nostr-transport.js";
import { createSignalingHealth } from "./honest-errors.js";
import {
  recordSignalingDial,
  recordPeerPathOutcome,
  recordFirstPeerLatency,
} from "./signaling-telemetry.js";

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
/** REV-09: transporte Nostr paralelo e de onde cada par veio ("nostr" | "ws"). */
let nostrTransport = null;
const peerTransport = new Map();
let sessionStartedAt = 0;
let recordedFirstPeer = false;
/** LAN-21: "sinalização caída" só quando WebSocket e Nostr falham juntos por mais que a carência. */
let signalingHealthHandler = null;
const signalingHealth = createSignalingHealth({ onChange: (down) => signalingHealthHandler?.(down) });

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
    webtorrentTrackers: [
      "wss://tracker.openwebtorrent.com",
      "wss://tracker.btorrent.xyz",
      "wss://tracker.webtorrent.dev",
    ],
    nostrRelays: [
      "wss://relay.damus.io",
      "wss://nos.lol",
      "wss://relay.snort.social",
    ],
    maxRtcPeers: 8,
  };
  return configCache;
}

const CUSTOM_TURN_KEY = "vox-custom-turn-config";
const NEGOTIATION_TIMEOUT_MS = 15000;

const TURN_ONLY_KEY = "vox-turn-only";

/** LAN-19: modo "só TURN" — pares não veem o IP real; tráfego passa pelo servidor TURN. */
export function isTurnOnly() {
  try {
    return localStorage.getItem(TURN_ONLY_KEY) === "1";
  } catch {
    return false;
  }
}

export function setTurnOnly(on) {
  try {
    if (on) localStorage.setItem(TURN_ONLY_KEY, "1");
    else localStorage.removeItem(TURN_ONLY_KEY);
  } catch {
    /* sem storage: fica desligado */
  }
}

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

/** `handler(down)` na virada: true quando a sinalização cai, false quando volta. */
export function onSignalingHealth(handler) {
  signalingHealthHandler = handler;
}

export function isSignalingDown() {
  return signalingHealth.isDown();
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

function isBeaconIdentity(address, peerId) {
  return (
    address === "vx_zero_memory_beacon" ||
    String(peerId || "").startsWith("peer_zero_memory")
  );
}

export function registerAddressMapping(address, peerId, dmPub = null) {
  if (!address || !peerId) return;
  if (dmPub && identityHandler) {
    identityHandler(address, dmPub);
  }
  if (isBeaconIdentity(address, peerId)) return;
  addressToPeer.set(address, peerId);
  if (dmPub) {
    dmPubByAddress.set(address, dmPub);
  }
}

export function listKnownPeerAddresses() {
  return Array.from(addressToPeer.keys()).filter(
    (a) => String(a || "").startsWith("vx_") && a !== "vx_zero_memory_beacon",
  );
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

export function getWebTorrentTrackers(config) {
  const trackers = Array.isArray(config?.webtorrentTrackers)
    ? config.webtorrentTrackers.map((t) => String(t || "").trim()).filter(Boolean)
    : [];
  return trackers.length > 0
    ? trackers
    : ["wss://tracker.openwebtorrent.com", "wss://tracker.btorrent.xyz"];
}

export function getNostrRelays(config) {
  const relays = Array.isArray(config?.nostrRelays)
    ? config.nostrRelays.map((r) => String(r || "").trim()).filter(Boolean)
    : [];
  return relays.length > 0
    ? relays
    : ["wss://relay.damus.io", "wss://nos.lol"];
}

export function getDecentralizedSignalingMesh(config) {
  const baseUrls = getSignalingCandidates(config);
  const trackers = getWebTorrentTrackers(config);
  const nostr = getNostrRelays(config);
  return {
    baseUrls,
    webtorrentTrackers: trackers,
    nostrRelays: buildNostrSignalingCandidates(nostr),
    totalEndpoints: baseUrls.length + trackers.length + nostr.length,
  };
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
  sessionStartedAt = Date.now();
  recordedFirstPeer = false;

  if (typeof RTCPeerConnection === "undefined") {
    return false;
  }
  connectSignaling();
  void startNostrSignaling();
  return true;
}

function isNostrSignalingEnabled(config) {
  return config?.nostrSignaling?.enabled !== false && getNostrRelays(config).length > 0;
}

function onNostrSignalingMessage(msg) {
  const remote = msg.from || msg.peerId;
  if (remote && !peerTransport.has(remote)) peerTransport.set(remote, "nostr");
  handleSignalingMessage(msg);
}

/** REV-09: sinalização por relays Nostr em paralelo ao WebSocket (desligável em signaling.json). */
async function startNostrSignaling() {
  if (nostrTransport || !isWebRtcEnabled || !currentPeerId) return;
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") return;
  const config = await loadSignalingConfig();
  if (!isNostrSignalingEnabled(config) || typeof WebSocket === "undefined") return;
  nostrTransport = createNostrTransport({
    relays: getNostrRelays(config),
    room: config.nostrSignaling?.room || DEFAULT_ROOM,
    maxRelays: config.nostrSignaling?.maxRelays || 3,
    peerId: currentPeerId,
    getIdentity: () => ({ address: currentAddress, dmPub: currentDmPub }),
    onMessage: onNostrSignalingMessage,
    onStatus: ({ open, pending }) => signalingHealth.update({ nostrOpen: open, nostrPending: pending }),
    onRelayAttempt: (ev) => recordSignalingDial("nostr", ev),
  });
  nostrTransport.start();
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
  nostrTransport?.stop();
  nostrTransport = null;
  peerTransport.clear();
  signalingHealth.reset();
  for (const remoteId of Array.from(peerConnections.keys())) {
    closePeerConnection(remoteId, true);
  }
  resetSignalingIndex();
}

async function connectSignaling() {
  if (!isWebRtcEnabled || !currentPeerId) return;
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") return;
  const config = await loadSignalingConfig();
  const url = getSignalingUrl(config);

  const startedAt = Date.now();
  try {
    signalingWs = new WebSocket(url);
    bindSignalingSocket(signalingWs, config, startedAt);
  } catch {
    recordSignalingDial("ws", { ok: false, durationMs: Date.now() - startedAt });
    signalingHealth.update({ wsOpen: false, wsGaveUp: true });
    rotateSignalingUrl(config);
    scheduleReconnect(true);
  }
}

function handleSignalingSocketClose(config, wasOpened) {
  signalingWs = null;
  if (!wasOpened) recordSignalingDial("ws", { ok: false });
  const candidates = getSignalingCandidates(config);
  if (!wasOpened && candidates.length > 1) {
    const prevIndex = activeSignalingIndex;
    rotateSignalingUrl(config);
    const wrappedAround = activeSignalingIndex <= prevIndex;
    // Só desistiu quando a volta pela lista de nós terminou sem nenhum abrir.
    signalingHealth.update(wrappedAround ? { wsOpen: false, wsGaveUp: true } : { wsOpen: false });
    scheduleReconnect(!wrappedAround);
  } else {
    signalingHealth.update({ wsOpen: false, wsGaveUp: true });
    scheduleReconnect(false);
  }
}

function handleWsSignalingPayload(raw) {
  try {
    const msg = JSON.parse(raw);
    const remote = msg.from || msg.peerId;
    if (remote && !peerTransport.has(remote)) peerTransport.set(remote, "ws");
    handleSignalingMessage(msg);
  } catch {}
}

function bindSignalingSocket(ws, config, startedAt = Date.now()) {
  let wasOpened = false;
  ws.onopen = () => {
    wasOpened = true;
    reconnectAttempts = 0;
    recordSignalingDial("ws", { ok: true, durationMs: Date.now() - startedAt });
    signalingHealth.update({ wsOpen: true, wsGaveUp: false });
    ws.send(JSON.stringify({ type: "register", peerId: currentPeerId, address: currentAddress, dmPub: currentDmPub }));
  };
  ws.onmessage = (event) => handleWsSignalingPayload(event.data);
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

function unregisterPeerAddress(remotePeerId) {
  for (const [addr, pid] of addressToPeer.entries()) {
    if (pid === remotePeerId) {
      addressToPeer.delete(addr);
    }
  }
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
    unregisterPeerAddress(msg.peerId);
    closePeerConnection(msg.peerId);
  }
}

function handleRegisteredPeers(peersList) {
  const maxPeers = configCache?.maxRtcPeers || 8;
  for (const remoteId of peersList) {
    if (peerConnections.size >= maxPeers) break;
    if (remoteId && remoteId !== currentPeerId && !isBeaconIdentity("", remoteId)) {
      createPeerConnection(remoteId, true);
    }
  }
}

function handlePeerJoined(remoteId) {
  if (!remoteId || isBeaconIdentity("", remoteId) || peerConnections.has(remoteId)) return;
  const maxPeers = configCache?.maxRtcPeers || 8;
  if (peerConnections.size < maxPeers && currentPeerId < remoteId) {
    createPeerConnection(remoteId, true);
  }
}

function sendSignaling(data) {
  const viaNostr = peerTransport.get(data?.to) === "nostr";
  const wsOpen = signalingWs && signalingWs.readyState === WebSocket.OPEN;
  if ((viaNostr || !wsOpen) && nostrTransport?.send(data)) return;
  if (wsOpen) signalingWs.send(JSON.stringify(data));
}

function collectIceServers(config) {
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
  return iceServers;
}

const isTurnUrl = (u) => /^turns?:/i.test(String(u));

export function createRtcConfig(config = configCache, { turnOnly = isTurnOnly() } = {}) {
  const iceServers = collectIceServers(config);
  if (turnOnly) {
    // Sem STUN e com política "relay": o navegador nunca expõe candidatos host/srflx (IP real).
    // Sem servidor TURN configurado, nenhuma conexão direta acontece — é a promessa de privacidade.
    const relays = iceServers.filter((s) => [].concat(s.urls).some(isTurnUrl));
    return { iceServers: relays, iceTransportPolicy: "relay" };
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

function markPeerConnected(remotePeerId) {
  const entry = peerConnections.get(remotePeerId);
  if (!entry) return;
  if (entry.timeoutId) {
    clearTimeout(entry.timeoutId);
    entry.timeoutId = null;
  }
  if (entry.outcomeRecorded) return;
  entry.outcomeRecorded = true;
  const now = Date.now();
  recordPeerPathOutcome(entry.transport, { ok: true, durationMs: now - entry.startedAt }, undefined, now);
  if (!recordedFirstPeer && sessionStartedAt > 0) {
    recordedFirstPeer = true;
    recordFirstPeerLatency(now - sessionStartedAt, undefined, now);
  }
}

function setupDataChannelEvents(dc, remotePeerId) {
  dc.onopen = () => {
    markPeerConnected(remotePeerId);
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

function attachPeerConnectionEvents(pc, remotePeerId) {
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
}

async function createPeerConnection(remotePeerId, isInitiator) {
  if (peerConnections.has(remotePeerId)) return peerConnections.get(remotePeerId);

  const pc = new RTCPeerConnection(createRtcConfig());
  attachPeerConnectionEvents(pc, remotePeerId);

  const { dc, dmDc } = isInitiator
    ? initInitiatorChannels(pc, remotePeerId)
    : (bindPeerDataChannelListener(pc, remotePeerId), { dc: null, dmDc: null });

  const timeoutId = startNegotiationTimer(remotePeerId);
  peerConnections.set(remotePeerId, {
    pc,
    dc,
    dmDc,
    timeoutId,
    startedAt: Date.now(),
    transport: peerTransport.get(remotePeerId) || "ws",
    outcomeRecorded: false,
  });

  if (isInitiator) {
    await negotiateInitiatorOffer(pc, remotePeerId);
  }
  return { pc, dc, dmDc };
}

async function handleIncomingOffer(fromPeer, sdp) {
  const existing = peerConnections.get(fromPeer);
  if (existing && existing.pc && existing.pc.signalingState !== "stable") {
    if (currentPeerId < fromPeer) return;
    closePeerConnection(fromPeer);
  }
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

export function closePeerConnection(remotePeerId, skipFailureRecord = false) {
  const entry = peerConnections.get(remotePeerId);
  if (!entry) return;
  if (!skipFailureRecord && !entry.outcomeRecorded) {
    entry.outcomeRecorded = true;
    recordPeerPathOutcome(entry.transport, { ok: false, durationMs: Date.now() - entry.startedAt });
  }
  if (entry.timeoutId) {
    clearTimeout(entry.timeoutId);
    entry.timeoutId = null;
  }
  try {
    disposePeerChannels(entry);
  } catch {}
  peerConnections.delete(remotePeerId);
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
