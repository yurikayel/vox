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
import { createTurnFallback } from "./turn-credentials.js";

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
/** REV-10: TURN do Worker só depois de uma falha direta (quem inicia reconecta) ou no modo "só TURN". */
const turn = createTurnFallback({
  getUrl: () => configCache?.turnCredentialsUrl,
  reconnect: (id) => {
    if (isWebRtcEnabled && !peerConnections.has(id) && currentPeerId < id) void createPeerConnection(id, true);
  },
});
let sessionStartedAt = 0;
let recordedFirstPeer = false;
/** LAN-21: "sinalização caída" só quando WebSocket e Nostr falham juntos por mais que a carência. */
let signalingHealthHandler = null;
const signalingHealth = createSignalingHealth({ onChange: (down) => signalingHealthHandler?.(down) });

// Mapa de peerId remoto -> { pc: RTCPeerConnection, dc: RTCDataChannel, dmDc: RTCDataChannel }
const peerConnections = new Map();
const addressToPeer = new Map();
const dmPubByAddress = new Map();

/**
 * Configuração de sinalização e ICE (`config/signaling.json`), lida uma vez e guardada em memória. Se o arquivo
 * falhar, usa a configuração embutida (STUN público, sinalização local, trackers WebTorrent e relays Nostr).
 * @returns {Promise<object>} Configuração com `stun`, `turn`, `signalingUrls`, `webtorrentTrackers`, `nostrRelays` e `maxRtcPeers`.
 */
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

/**
 * LAN-19: modo "só TURN" — pares não veem o IP real; tráfego passa pelo servidor TURN.
 * @returns {boolean} Verdadeiro se ligado; falso também sem armazenamento.
 */
export function isTurnOnly() {
  try {
    return localStorage.getItem(TURN_ONLY_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * LAN-19: liga ou desliga o modo "só TURN" (vale para as próximas conexões). Sem armazenamento, fica desligado.
 * @param {boolean} on Ligar ou desligar.
 */
export function setTurnOnly(on) {
  try {
    if (on) localStorage.setItem(TURN_ONLY_KEY, "1");
    else localStorage.removeItem(TURN_ONLY_KEY);
  } catch {
    /* sem storage: fica desligado */
  }
}

/**
 * TURN próprio configurado pela pessoa.
 * @returns {{urls: string, username: string, credential: string}} Campos aparados; vazios se não houver ou falhar a leitura.
 */
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

/**
 * Grava o TURN próprio da pessoa (endereço e usuário aparados; a credencial como veio).
 * @param {{urls?: string, username?: string, credential?: string}} [config] Servidor TURN, usuário e credencial.
 */
export function saveCustomTurnConfig({ urls = "", username = "", credential = "" } = {}) {
  const clean = {
    urls: String(urls || "").trim(),
    username: String(username || "").trim(),
    credential: String(credential || ""),
  };
  localStorage.setItem(CUSTOM_TURN_KEY, JSON.stringify(clean));
}

/**
 * Define quem trata as mensagens do canal de dados `vox-peer-v0` (substitui o anterior).
 * @param {(msg: object, replyFn: (reply: object) => void, source: "rtc") => void} handler Recebe a mensagem, a resposta ao par e a origem.
 */
export function onVoxMessage(handler) {
  messageHandler = handler;
}

/**
 * Define quem trata os envelopes que chegam pelo canal de DM (substitui o anterior).
 * @param {(envelope: object, remotePeerId: string) => void} handler Recebe o envelope cifrado e o par que mandou.
 */
export function onDmMessage(handler) {
  dmMessageHandler = handler;
}

/**
 * `handler(down)` na virada: true quando a sinalização cai, false quando volta.
 * @param {(down: boolean) => void} handler Ouvinte (substitui o anterior).
 */
export function onSignalingHealth(handler) {
  signalingHealthHandler = handler;
}

/**
 * LAN-21: indica se a sinalização está caída (WebSocket e Nostr juntos, além da carência).
 * @returns {boolean} Verdadeiro enquanto caída.
 */
export function isSignalingDown() {
  return signalingHealth.isDown();
}

/**
 * Define quem recebe a chave de DM anunciada por um par na sinalização (substitui o anterior).
 * @param {(address: string, dmPub: object) => void} handler Recebe a conta e a chave pública de DM.
 */
export function onPeerIdentity(handler) {
  identityHandler = handler;
}

/**
 * Guarda a conta e a chave de DM deste aparelho e, com a sinalização aberta, se registra nela com elas.
 * @param {string} address Conta deste aparelho.
 * @param {object|null} [dmPub=null] Chave pública de DM (sem ela, mantém a anterior).
 */
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

/**
 * Associa a conta de um par ao seu id na malha (e guarda a chave de DM, se veio). O farol de memória pública só
 * entrega a chave ao ouvinte de identidade e não entra no mapa.
 * @param {string} address Conta do par.
 * @param {string} peerId Id do par na malha.
 * @param {object|null} [dmPub=null] Chave pública de DM anunciada.
 */
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

/**
 * Contas `vx_` de pares conhecidos pela sinalização (sem o farol de memória).
 * @returns {string[]} Contas.
 */
export function listKnownPeerAddresses() {
  return Array.from(addressToPeer.keys()).filter(
    (a) => String(a || "").startsWith("vx_") && a !== "vx_zero_memory_beacon",
  );
}

/**
 * Chave pública de DM que o par da conta anunciou.
 * @param {string} address Conta do par.
 * @returns {object|null} A chave, ou null se não for conhecida.
 */
export function getPeerDmPub(address) {
  return dmPubByAddress.get(address) || null;
}

/**
 * Indica se há canal de DM WebRTC aberto com a conta.
 * @param {string} address Conta do par.
 * @returns {boolean} Verdadeiro com o canal de DM aberto.
 */
export function isAddressConnectedRtc(address) {
  const pid = addressToPeer.get(address);
  if (!pid) return false;
  const entry = peerConnections.get(pid);
  return Boolean(entry?.dmDc && entry.dmDc.readyState === "open");
}

/**
 * Quantos pares têm o canal de dados aberto.
 * @returns {number} Pares conectados.
 */
export function getConnectedRtcPeersCount() {
  let count = 0;
  for (const entry of peerConnections.values()) {
    if (entry.dc && entry.dc.readyState === "open") {
      count++;
    }
  }
  return count;
}

/**
 * Ids dos pares com o canal de dados aberto.
 * @returns {string[]} Ids na malha.
 */
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

/**
 * Endereços de sinalização WebSocket a tentar. O endereço passado a `initWebRtc` ou guardado pela pessoa
 * (`vox-custom-signaling-url`) vence a lista da configuração.
 * @param {object} config Configuração de `loadSignalingConfig`.
 * @returns {string[]} Endereços; sem nenhum, a sinalização local `ws://127.0.0.1:3921`.
 */
export function getSignalingCandidates(config) {
  if (customSignalingUrl) return [customSignalingUrl];
  const stored = (localStorage.getItem("vox-custom-signaling-url") || "").trim();
  if (stored) return [stored];
  const urls = Array.isArray(config?.signalingUrls)
    ? config.signalingUrls.map((u) => String(u || "").trim()).filter(Boolean)
    : [];
  return urls.length > 0 ? urls : ["ws://127.0.0.1:3921"];
}

/**
 * Posição do endereço de sinalização em uso na lista de candidatos.
 * @returns {number} Índice atual.
 */
export function getActiveSignalingIndex() {
  return activeSignalingIndex;
}

/** Volta ao primeiro endereço de sinalização. */
export function resetSignalingIndex() {
  activeSignalingIndex = 0;
}

/**
 * Trackers WebTorrent da configuração.
 * @param {object} config Configuração de `loadSignalingConfig`.
 * @returns {string[]} Endereços aparados; sem nenhum, dois trackers públicos.
 */
export function getWebTorrentTrackers(config) {
  const trackers = Array.isArray(config?.webtorrentTrackers)
    ? config.webtorrentTrackers.map((t) => String(t || "").trim()).filter(Boolean)
    : [];
  return trackers.length > 0
    ? trackers
    : ["wss://tracker.openwebtorrent.com", "wss://tracker.btorrent.xyz"];
}

/**
 * Relays Nostr da configuração.
 * @param {object} config Configuração de `loadSignalingConfig`.
 * @returns {string[]} Endereços aparados; sem nenhum, dois relays públicos.
 */
export function getNostrRelays(config) {
  const relays = Array.isArray(config?.nostrRelays)
    ? config.nostrRelays.map((r) => String(r || "").trim()).filter(Boolean)
    : [];
  return relays.length > 0
    ? relays
    : ["wss://relay.damus.io", "wss://nos.lol"];
}

/**
 * Relays Nostr seguros para sinalização (só `wss://`, via `buildNostrSignalingCandidates`).
 * @param {object} config Configuração de `loadSignalingConfig`.
 * @returns {string[]} Candidatos filtrados para o transporte e a malha.
 */
export function getNostrSignalingRelays(config) {
  return buildNostrSignalingCandidates(getNostrRelays(config));
}

/**
 * Todos os caminhos de sinalização conhecidos, para a tela de rede.
 * @param {object} config Configuração de `loadSignalingConfig`.
 * @returns {{baseUrls: string[], webtorrentTrackers: string[], nostrRelays: string[], totalEndpoints: number}}
 *   Sinalização WebSocket, trackers, relays Nostr (os da configuração mais os padrões, sem repetir) e o total de
 *   endereços (contando os relays de `getNostrRelays`).
 */
export function getDecentralizedSignalingMesh(config) {
  const baseUrls = getSignalingCandidates(config);
  const trackers = getWebTorrentTrackers(config);
  const nostrRelays = getNostrSignalingRelays(config);
  return {
    baseUrls,
    webtorrentTrackers: trackers,
    nostrRelays,
    totalEndpoints: baseUrls.length + trackers.length + nostrRelays.length,
  };
}

/**
 * Endereço de sinalização em uso.
 * @param {object} config Configuração de `loadSignalingConfig`.
 * @returns {string} O candidato da posição atual (em rodízio).
 */
export function getSignalingUrl(config) {
  const candidates = getSignalingCandidates(config);
  return candidates[activeSignalingIndex % candidates.length];
}

/**
 * Passa ao próximo endereço de sinalização (em rodízio).
 * @param {object} config Configuração de `loadSignalingConfig`.
 * @returns {string} O novo endereço em uso.
 */
export function rotateSignalingUrl(config) {
  const candidates = getSignalingCandidates(config);
  activeSignalingIndex = (activeSignalingIndex + 1) % candidates.length;
  return candidates[activeSignalingIndex];
}

/**
 * Liga o WebRTC: conecta à sinalização WebSocket e à Nostr em paralelo e, no modo "só TURN", já pede credencial.
 * @param {string} peerId Id deste aparelho na malha.
 * @param {string|null} [customUrl=null] Sinalização a usar no lugar da configuração.
 * @returns {Promise<boolean>} Falso se o navegador não tem `RTCPeerConnection`.
 */
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
  // Modo "só TURN": sem credencial nenhuma conexão acontece, então pede logo ao abrir.
  if (isTurnOnly()) void loadSignalingConfig().then(() => turn.prefetch());
  return true;
}

function isNostrSignalingEnabled(config) {
  return config?.nostrSignaling?.enabled !== false && getNostrSignalingRelays(config).length > 0;
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
    relays: getNostrSignalingRelays(config),
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

/** Desliga o WebRTC: fecha a sinalização (WebSocket e Nostr), todas as conexões com pares e zera o rodízio. */
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

/**
 * Evita sockets de sinalização empilhados: reaproveita o vivo se a URL é a mesma; senão solta e fecha o antigo.
 * @param {string} url URL desejada.
 * @returns {boolean} Verdadeiro se é preciso abrir um socket novo.
 */
function reuseOrReleaseSignalingSocket(url) {
  const ws = signalingWs;
  if (!ws) return true;
  const live = ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN;
  if (live && ws.url === url) return false;
  ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
  try {
    ws.close();
  } catch {}
  signalingWs = null;
  return true;
}

async function connectSignaling() {
  if (!isWebRtcEnabled || !currentPeerId) return;
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") return;
  const config = await loadSignalingConfig();
  const url = getSignalingUrl(config);
  if (!isWebRtcEnabled || !reuseOrReleaseSignalingSocket(url)) return;

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

/**
 * Despacha mensagem de sinalização recebida pelo WebSocket ou pelo relay Nostr.
 * @param {object} msg Mensagem de sinalização decodificada.
 */
export async function handleSignalingMessage(msg) {
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
  iceServers.push(...turn.iceServers());
  return iceServers;
}

const isTurnUrl = (u) => /^turns?:/i.test(String(u));

/**
 * Configuração da `RTCPeerConnection`: STUN, TURN da configuração, TURN próprio e TURN do Worker. No modo
 * "só TURN", só servidores TURN e política `relay`, para o navegador nunca expor o IP real.
 * @param {object} [config] Configuração de `loadSignalingConfig` (padrão: a já carregada).
 * @param {{turnOnly?: boolean}} [options] `turnOnly` (padrão: `isTurnOnly()`).
 * @returns {RTCConfiguration} `{iceServers}`, mais `iceTransportPolicy: "relay"` no modo "só TURN".
 */
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

/**
 * Define quem é chamado quando o canal de dados com um par abre (substitui o anterior).
 * @param {(remotePeerId: string, sendFn: (obj: object) => boolean) => void} handler Recebe o par e a função que manda a ele.
 */
export function onPeerConnect(handler) {
  peerConnectHandler = handler;
}

function isActivePc(remotePeerId, pc) {
  return peerConnections.get(remotePeerId)?.pc === pc;
}

function closeIfSameConnection(remotePeerId, pc, skipFailureRecord = false) {
  if (isActivePc(remotePeerId, pc)) {
    closePeerConnection(remotePeerId, skipFailureRecord);
  }
}

function startNegotiationTimer(remotePeerId, pc) {
  return setTimeout(() => {
    const entry = peerConnections.get(remotePeerId);
    if (!entry || entry.pc !== pc) return;
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

function setupDataChannelEvents(dc, remotePeerId, pc) {
  dc.onopen = () => {
    if (peerConnections.get(remotePeerId)?.pc !== pc) return;
    markPeerConnected(remotePeerId);
    if (typeof peerConnectHandler === "function") {
      peerConnectHandler(remotePeerId, (obj) => sendVoxMessage(remotePeerId, obj));
    }
  };
  dc.onmessage = (event) => {
    if (!messageHandler || peerConnections.get(remotePeerId)?.pc !== pc) return;
    try {
      const parsed = JSON.parse(event.data);
      messageHandler(parsed, (replyObj) => {
        sendVoxMessage(remotePeerId, replyObj);
      }, "rtc");
    } catch {}
  };

  dc.onclose = () => closeIfSameConnection(remotePeerId, pc);
  dc.onerror = () => closeIfSameConnection(remotePeerId, pc);
}

function setupDmChannelEvents(dmDc, remotePeerId, pc) {
  dmDc.onmessage = (event) => {
    if (!dmMessageHandler || peerConnections.get(remotePeerId)?.pc !== pc) return;
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
  setupDataChannelEvents(dc, remotePeerId, pc);
  const dmDc = pc.createDataChannel("vox-dm-v0");
  setupDmChannelEvents(dmDc, remotePeerId, pc);
  return { dc, dmDc };
}

function bindPeerDataChannelListener(pc, remotePeerId) {
  pc.ondatachannel = (event) => {
    const entry = peerConnections.get(remotePeerId);
    if (!entry || entry.pc !== pc) return;
    const ch = event.channel;
    if (ch.label === "vox-dm-v0") {
      setupDmChannelEvents(ch, remotePeerId, pc);
      entry.dmDc = ch;
    } else {
      setupDataChannelEvents(ch, remotePeerId, pc);
      entry.dc = ch;
    }
  };
}

async function negotiateInitiatorOffer(entry) {
  const { pc, remotePeerId } = entry;
  entry.makingOffer = true;
  try {
    const offer = await pc.createOffer();
    if (peerConnections.get(remotePeerId)?.pc !== pc) return;
    await pc.setLocalDescription(offer);
    if (peerConnections.get(remotePeerId)?.pc !== pc) return;
    sendSignaling({ type: "offer", to: remotePeerId, sdp: pc.localDescription });
  } catch {
    closeIfSameConnection(remotePeerId, pc);
  } finally {
    entry.makingOffer = false;
  }
}

function attachPeerConnectionEvents(pc, remotePeerId) {
  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    if (state === "failed" || state === "closed" || state === "disconnected") {
      const hadTurn = Boolean(peerConnections.get(remotePeerId)?.withTurn);
      closeIfSameConnection(remotePeerId, pc);
      if (state === "failed") void turn.onFailed(remotePeerId, hadTurn);
    }
  };
  pc.onicecandidate = (event) => {
    if (event.candidate && peerConnections.get(remotePeerId)?.pc === pc) {
      sendSignaling({ type: "ice", to: remotePeerId, candidate: event.candidate });
    }
  };
}

async function createPeerConnection(remotePeerId, isInitiator) {
  if (peerConnections.has(remotePeerId)) return peerConnections.get(remotePeerId);

  const rtcConfig = createRtcConfig();
  const pc = new RTCPeerConnection(rtcConfig);
  attachPeerConnectionEvents(pc, remotePeerId);

  const { dc, dmDc } = isInitiator
    ? initInitiatorChannels(pc, remotePeerId)
    : (bindPeerDataChannelListener(pc, remotePeerId), { dc: null, dmDc: null });

  const entry = {
    remotePeerId,
    pc,
    dc,
    dmDc,
    timeoutId: startNegotiationTimer(remotePeerId, pc),
    startedAt: Date.now(),
    transport: peerTransport.get(remotePeerId) || "ws",
    outcomeRecorded: false,
    makingOffer: false,
    pendingIceCandidates: [],
    withTurn: rtcConfig.iceServers.some((s) => [].concat(s.urls).some(isTurnUrl)),
  };
  peerConnections.set(remotePeerId, entry);

  if (isInitiator) {
    await negotiateInitiatorOffer(entry);
  }
  return entry;
}

async function flushPendingIceCandidates(entry) {
  const pending = entry.pendingIceCandidates;
  if (!pending?.length) return;
  entry.pendingIceCandidates = [];
  for (const candidate of pending) {
    if (!isActivePc(entry.remotePeerId, entry.pc)) return;
    try { await entry.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
  }
}

async function applyRemoteDescription(entry, remotePeerId, sdp) {
  await entry.pc.setRemoteDescription(new RTCSessionDescription(sdp));
  if (!isActivePc(remotePeerId, entry.pc)) return false;
  await flushPendingIceCandidates(entry);
  return isActivePc(remotePeerId, entry.pc);
}

async function respondWithAnswer(entry, fromPeer, sdp) {
  const { pc } = entry;
  const ready = await applyRemoteDescription(entry, fromPeer, sdp);
  if (!ready) return;
  const answer = await pc.createAnswer();
  if (!isActivePc(fromPeer, pc)) return;
  await pc.setLocalDescription(answer);
  if (!isActivePc(fromPeer, pc)) return;
  sendSignaling({ type: "answer", to: fromPeer, sdp: pc.localDescription });
}

function hasOfferCollision(existing) {
  return Boolean(existing?.pc && (existing.makingOffer || existing.pc.signalingState !== "stable"));
}

async function handleIncomingOffer(fromPeer, sdp) {
  if (!fromPeer || fromPeer === currentPeerId) return;
  const existing = peerConnections.get(fromPeer);
  if (hasOfferCollision(existing) && currentPeerId < fromPeer) return;
  if (existing) closePeerConnection(fromPeer, true);

  const entry = await createPeerConnection(fromPeer, false);
  try {
    await respondWithAnswer(entry, fromPeer, sdp);
  } catch {
    closeIfSameConnection(fromPeer, entry.pc);
  }
}

async function handleIncomingAnswer(fromPeer, sdp) {
  const entry = peerConnections.get(fromPeer);
  if (!entry) return;
  try {
    await applyRemoteDescription(entry, fromPeer, sdp);
  } catch {
    closeIfSameConnection(fromPeer, entry.pc);
  }
}

async function handleIncomingIce(fromPeer, candidate) {
  const entry = peerConnections.get(fromPeer);
  if (!entry || !candidate) return;
  if (!entry.pc.remoteDescription) {
    entry.pendingIceCandidates.push(candidate);
    return;
  }
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

/**
 * Fecha a conexão com o par e seus canais. Conta como falha na telemetria se nunca chegou a abrir.
 * @param {string} remotePeerId Id do par.
 * @param {boolean} [skipFailureRecord=false] Não registrar falha (desligamento pedido).
 */
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

/**
 * Manda um envelope de DM pelo canal de DM aberto com a conta.
 * @param {string} toAddress Conta de destino.
 * @param {object} envelope Envelope cifrado.
 * @returns {boolean} Verdadeiro se foi enviado; falso sem par conhecido, sem canal aberto ou com erro.
 */
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

/**
 * Manda uma mensagem a um par pelo canal de dados.
 * @param {string} remotePeerId Id do par.
 * @param {object} obj Mensagem (vai em JSON).
 * @returns {boolean} Verdadeiro se foi enviada.
 */
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

/**
 * Manda a mesma mensagem a todos os pares com o canal de dados aberto.
 * @param {object} obj Mensagem (vai em JSON).
 * @returns {number} Para quantos pares foi enviada.
 */
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
