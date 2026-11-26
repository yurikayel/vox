/**
 * @file Sinalização WebSocket e Nostr: conexão, reconexão e despacho de mensagens.
 * @module webrtc-signaling-ws
 */
import { createNostrTransport, DEFAULT_ROOM } from "./nostr-transport.js";
import { recordSignalingDial } from "./signaling-telemetry.js";
import {
  loadSignalingConfig,
  getSignalingUrl,
  getSignalingCandidates,
  rotateSignalingUrl,
  resetSignalingIndex,
  getNostrSignalingRelays,
  isTurnOnly,
} from "./webrtc-signaling-config.js";
import {
  addressToPeer,
  peerConnections,
  peerTransport,
  turn,
  getSignalingWs,
  setSignalingWs,
  getCurrentPeerId,
  setCurrentPeerId,
  getCurrentAddress,
  getCurrentDmPub,
  setCustomSignalingUrl,
  setIsWebRtcEnabled,
  getIsWebRtcEnabled,
  getReconnectTimer,
  setReconnectTimer,
  setReconnectAttempts,
  incrementReconnectAttempts,
  getNostrTransport,
  setNostrTransport,
  setSessionStartedAt,
  setRecordedFirstPeer,
  getSignalingHealth,
  getActiveSignalingIndex,
  getConfigCache,
  getSignalingMachine,
} from "./webrtc-peer-state.js";
import { registerAddressMapping, isBeaconIdentity } from "./webrtc-messaging.js";
import {
  createPeerConnection,
  closePeerConnection,
  handleIncomingOffer,
  handleIncomingAnswer,
  handleIncomingIce,
} from "./webrtc-connection.js";

/**
 * Liga o WebRTC: conecta à sinalização WebSocket e à Nostr em paralelo.
 * @param {string} peerId
 * @param {string|null} [customUrl=null]
 * @returns {Promise<boolean>}
 */
export async function initWebRtc(peerId, customUrl = null) {
  setCurrentPeerId(peerId);
  setCustomSignalingUrl(customUrl);
  setIsWebRtcEnabled(true);
  setSessionStartedAt(Date.now());
  setRecordedFirstPeer(false);

  if (typeof RTCPeerConnection === "undefined") {
    return false;
  }
  connectSignaling();
  void startNostrSignaling();
  if (isTurnOnly()) void loadSignalingConfig().then(() => turn.prefetch());
  return true;
}

/** Desliga o WebRTC: fecha sinalização, conexões e zera o rodízio. */
export function disconnectWebRtc() {
  setIsWebRtcEnabled(false);
  getSignalingMachine().send("STOP");
  const timer = getReconnectTimer();
  if (timer) {
    clearTimeout(timer);
    setReconnectTimer(null);
  }
  const ws = getSignalingWs();
  if (ws) {
    try {
      ws.close();
    } catch {}
    setSignalingWs(null);
  }
  getNostrTransport()?.stop();
  setNostrTransport(null);
  peerTransport.clear();
  getSignalingHealth().reset();
  for (const remoteId of Array.from(peerConnections.keys())) {
    closePeerConnection(remoteId, true);
  }
  resetSignalingIndex();
}

/**
 * Diz se a sinalização por Nostr está habilitada e tem relays.
 * @param {object} config Configuração de sinalização
 * @returns {boolean} `true` se habilitada.
 */
function isNostrSignalingEnabled(config) {
  return config?.nostrSignaling?.enabled !== false && getNostrSignalingRelays(config).length > 0;
}

/**
 * Trata uma mensagem de sinalização vinda do Nostr.
 * @param {object} msg Mensagem
 */
function onNostrSignalingMessage(msg) {
  const remote = msg.from || msg.peerId;
  if (remote && !peerTransport.has(remote)) peerTransport.set(remote, "nostr");
  void handleSignalingMessage(msg);
}

/**
 * Inicia a sinalização por Nostr.
 * @returns {Promise<void>} Conclui quando iniciada.
 */
async function startNostrSignaling() {
  if (getNostrTransport() || !getIsWebRtcEnabled() || !getCurrentPeerId()) return;
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") return;
  const config = await loadSignalingConfig();
  if (!isNostrSignalingEnabled(config) || typeof WebSocket === "undefined") return;
  const transport = createNostrTransport({
    relays: getNostrSignalingRelays(config),
    room: config.nostrSignaling?.room || DEFAULT_ROOM,
    maxRelays: config.nostrSignaling?.maxRelays || 3,
    peerId: getCurrentPeerId(),
    getIdentity: () => ({ address: getCurrentAddress(), dmPub: getCurrentDmPub() }),
    onMessage: onNostrSignalingMessage,
    onStatus: ({ open, pending }) => getSignalingHealth().update({ nostrOpen: open, nostrPending: pending }),
    onRelayAttempt: (ev) => recordSignalingDial("nostr", ev),
  });
  setNostrTransport(transport);
  transport.start();
}

/**
 * Reaproveita o socket de sinalização vivo ou o solta.
 * @param {string} url Endereço do servidor
 * @returns {boolean} `true` se pode abrir uma nova conexão.
 */
function reuseOrReleaseSignalingSocket(url) {
  const ws = getSignalingWs();
  if (!ws) return true;
  const live = ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN;
  if (live && ws.url === url) return false;
  ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
  try {
    ws.close();
  } catch {}
  setSignalingWs(null);
  return true;
}

/**
 * Conecta ao servidor de sinalização por WebSocket.
 * @returns {Promise<void>} Conclui quando a conexão foi iniciada.
 */
async function connectSignaling() {
  if (!getIsWebRtcEnabled() || !getCurrentPeerId()) return;
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") return;
  const config = await loadSignalingConfig();
  const url = getSignalingUrl(config);
  if (!getIsWebRtcEnabled() || !reuseOrReleaseSignalingSocket(url)) return;

  const startedAt = Date.now();
  getSignalingMachine().send("DIAL");
  try {
    const ws = new WebSocket(url);
    setSignalingWs(ws);
    bindSignalingSocket(ws, config, startedAt);
  } catch {
    recordSignalingDial("ws", { ok: false, durationMs: Date.now() - startedAt });
    getSignalingHealth().update({ wsOpen: false, wsGaveUp: true });
    rotateSignalingUrl(config);
    scheduleReconnect(true);
  }
}

/**
 * Trata o fechamento do socket de sinalização, tentando outro candidato.
 * @param {object} config Configuração de sinalização
 * @param {boolean} wasOpened Se o socket chegou a abrir
 */
function handleSignalingSocketClose(config, wasOpened) {
  setSignalingWs(null);
  if (!wasOpened) recordSignalingDial("ws", { ok: false });
  const candidates = getSignalingCandidates(config);
  if (!wasOpened && candidates.length > 1) {
    const prevIndex = getActiveSignalingIndex();
    rotateSignalingUrl(config);
    const wrappedAround = getActiveSignalingIndex() <= prevIndex;
    getSignalingHealth().update(wrappedAround ? { wsOpen: false, wsGaveUp: true } : { wsOpen: false });
    scheduleReconnect(!wrappedAround);
  } else {
    getSignalingHealth().update({ wsOpen: false, wsGaveUp: true });
    scheduleReconnect(false);
  }
}

/**
 * Trata uma mensagem recebida pelo socket de sinalização.
 * @param {string} raw Texto recebido
 */
function handleWsSignalingPayload(raw) {
  try {
    const msg = JSON.parse(raw);
    const remote = msg.from || msg.peerId;
    if (remote && !peerTransport.has(remote)) peerTransport.set(remote, "ws");
    void handleSignalingMessage(msg);
  } catch {}
}

/**
 * Liga os tratadores de eventos do socket de sinalização.
 * @param {WebSocket} ws Socket
 * @param {object} config Configuração de sinalização
 * @param {number} [startedAt=Date.now()] Início da conexão (ms)
 */
function bindSignalingSocket(ws, config, startedAt = Date.now()) {
  let wasOpened = false;
  ws.onopen = () => {
    wasOpened = true;
    getSignalingMachine().send("OPEN");
    setReconnectAttempts(0);
    recordSignalingDial("ws", { ok: true, durationMs: Date.now() - startedAt });
    getSignalingHealth().update({ wsOpen: true, wsGaveUp: false });
    ws.send(JSON.stringify({
      type: "register",
      peerId: getCurrentPeerId(),
      address: getCurrentAddress(),
      dmPub: getCurrentDmPub(),
    }));
  };
  ws.onmessage = (event) => handleWsSignalingPayload(event.data);
  ws.onerror = () => {
    try {
      ws.close();
    } catch {}
  };
  ws.onclose = () => handleSignalingSocketClose(config, wasOpened);
}

/**
 * Agenda a reconexão com espera crescente.
 * @param {boolean} [immediate=false] Se tenta sem esperar
 */
function scheduleReconnect(immediate = false) {
  if (!getIsWebRtcEnabled() || getReconnectTimer()) return;
  getSignalingMachine().send("BACKOFF");
  const delay = immediate
    ? 300
    : Math.min(30000, 1000 * Math.pow(1.5, incrementReconnectAttempts()));
  const timer = setTimeout(() => {
    setReconnectTimer(null);
    connectSignaling();
  }, delay);
  setReconnectTimer(timer);
}

/**
 * Esquece o endereço registrado do par.
 * @param {string} remotePeerId Par remoto
 */
function unregisterPeerAddress(remotePeerId) {
  for (const [addr, pid] of addressToPeer.entries()) {
    if (pid === remotePeerId) {
      addressToPeer.delete(addr);
    }
  }
}

/**
 * Trata a lista de pares registrados no servidor, abrindo conexões até o limite.
 * @param {string[]} peersList Pares registrados
 */
function handleRegisteredPeers(peersList) {
  const maxPeers = getConfigCache()?.maxRtcPeers || 8;
  const currentPeerId = getCurrentPeerId();
  for (const remoteId of peersList) {
    if (peerConnections.size >= maxPeers) break;
    if (remoteId && remoteId !== currentPeerId && !isBeaconIdentity("", remoteId)) {
      void createPeerConnection(remoteId, true);
    }
  }
}

/**
 * Trata a entrada de um par novo.
 * @param {string} remoteId Par que entrou
 */
function handlePeerJoined(remoteId) {
  if (!remoteId || isBeaconIdentity("", remoteId) || peerConnections.has(remoteId)) return;
  const maxPeers = getConfigCache()?.maxRtcPeers || 8;
  const currentPeerId = getCurrentPeerId();
  if (peerConnections.size < maxPeers && currentPeerId < remoteId) {
    void createPeerConnection(remoteId, true);
  }
}

/**
 * Despacha mensagem de sinalização recebida pelo WebSocket ou pelo relay Nostr.
 * @param {object} msg
 */
export async function handleSignalingMessage(msg) {
  const mtype = msg.type;
  if (mtype === "registered") {
    if (msg.addressMap && typeof msg.addressMap === "object") {
      for (const [addr, info] of Object.entries(msg.addressMap)) {
        await registerAddressMapping(addr, info.peerId, info.dmPub);
      }
    }
    handleRegisteredPeers(msg.peers || []);
  } else if (mtype === "peer-joined") {
    if (msg.address) {
      await registerAddressMapping(msg.address, msg.peerId, msg.dmPub);
    }
    handlePeerJoined(msg.peerId);
  } else if (mtype === "offer") {
    await handleIncomingOffer(msg.from, msg.sdp);
  } else if (mtype === "answer") {
    await handleIncomingAnswer(msg.from, msg.sdp);
  } else if (mtype === "ice") {
    await handleIncomingIce(msg.from, msg.candidate);
  } else if (mtype === "peer-left") {
    unregisterPeerAddress(msg.peerId);
    closePeerConnection(msg.peerId);
  }
}