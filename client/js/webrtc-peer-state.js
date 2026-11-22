/**
 * @file Estado compartilhado do módulo WebRTC (singleton; evita ciclos de import).
 * @module webrtc-peer-state
 */
import { createSignalingHealth } from "./honest-errors.js";
import { createTurnFallback } from "./turn-credentials.js";
import { createMachine } from "./shared/state-machine.js";

/** @type {WebSocket|null} */
let signalingWs = null;
/** @type {string|null} */
let currentPeerId = null;
let currentAddress = "";
/** @type {object|null} */
let currentDmPub = null;
/** @type {string|null} */
let customSignalingUrl = null;
let isWebRtcEnabled = false;
/** @type {Function|null} */
let messageHandler = null;
/** @type {Function|null} */
let dmMessageHandler = null;
/** @type {Function|null} */
let identityHandler = null;
/** @type {ReturnType<typeof setTimeout>|null} */
let reconnectTimer = null;
let reconnectAttempts = 0;
/** @type {object|null} */
let configCache = null;
/** REV-09: transporte Nostr paralelo. */
/** @type {import("./nostr-transport.js").NostrTransportHandle|null} */
let nostrTransport = null;
/** REV-09: de onde cada par veio ("nostr" | "ws"). @type {Map<string, "nostr"|"ws">} */
export const peerTransport = new Map();
let sessionStartedAt = 0;
let recordedFirstPeer = false;
/** @type {((down: boolean) => void)|null} */
let signalingHealthHandler = null;
/** @type {((remotePeerId: string, sendFn: (obj: object) => boolean) => void)|null} */
let peerConnectHandler = null;

/** @type {((remotePeerId: string, isInitiator: boolean) => Promise<unknown>)|null} */
let turnReconnectPeer = null;

const signalingHealth = createSignalingHealth({ onChange: (down) => signalingHealthHandler?.(down) });

/**
 * REV-10: fallback TURN do Worker após falha direta ou no modo "só TURN".
 * @type {ReturnType<typeof createTurnFallback>}
 */
export const turn = createTurnFallback({
  getUrl: () => configCache?.turnCredentialsUrl,
  reconnect: (id) => {
    if (isWebRtcEnabled && !peerConnections.has(id) && currentPeerId < id) {
      void turnReconnectPeer?.(id, true);
    }
  },
});

/** Mapa peerId remoto → entrada de conexão WebRTC. @type {Map<string, object>} */
export const peerConnections = new Map();
/** Mapa conta `vx_` → id do par na malha. @type {Map<string, string>} */
export const addressToPeer = new Map();
/** Mapa conta → chave pública de DM anunciada. @type {Map<string, object>} */
export const dmPubByAddress = new Map();

/** Chave `localStorage` do TURN personalizado. */
export const CUSTOM_TURN_KEY = "vox-custom-turn-config";
/** Tempo máximo de negociação antes de fechar a conexão (ms). */
export const NEGOTIATION_TIMEOUT_MS = 15000;
/** Chave `localStorage` do modo "só TURN". */
export const TURN_ONLY_KEY = "vox-turn-only";

let activeSignalingIndex = 0;

/**
 * Registra quem recria a conexão após TURN (evita ciclo state ↔ connection).
 * @param {(remotePeerId: string, isInitiator: boolean) => Promise<unknown>} fn Factory de `createPeerConnection`.
 */
export function setTurnReconnectPeer(fn) {
  turnReconnectPeer = fn;
}

/** @returns {WebSocket|null} */
export function getSignalingWs() {
  return signalingWs;
}

/** @param {WebSocket|null} ws */
export function setSignalingWs(ws) {
  signalingWs = ws;
}

/** @returns {string|null} */
export function getCurrentPeerId() {
  return currentPeerId;
}

/** @param {string|null} id */
export function setCurrentPeerId(id) {
  currentPeerId = id;
}

/**
 * Conta deste aparelho anunciada na sinalização.
 * @returns {string}
 */
export function getCurrentAddress() {
  return currentAddress;
}

/** @param {string} address */
export function setCurrentAddress(address) {
  currentAddress = address || "";
}

/**
 * Chave pública de DM deste aparelho.
 * @returns {object|null}
 */
export function getCurrentDmPub() {
  return currentDmPub;
}

/** @param {object|null} dmPub */
export function setCurrentDmPub(dmPub) {
  if (dmPub) currentDmPub = dmPub;
}

/**
 * URL de sinalização passada a `initWebRtc` (override da sessão).
 * @returns {string|null}
 */
export function getCustomSignalingUrl() {
  return customSignalingUrl;
}

/** @param {string|null} url */
export function setCustomSignalingUrl(url) {
  customSignalingUrl = url;
}

/**
 * WebRTC ligado nesta sessão (`initWebRtc` sem `disconnectWebRtc`).
 * @returns {boolean}
 */
export function getIsWebRtcEnabled() {
  return isWebRtcEnabled;
}

/** @param {boolean} on */
export function setIsWebRtcEnabled(on) {
  isWebRtcEnabled = on;
}

/**
 * Handler do canal de dados `vox-peer-v0`.
 * @returns {Function|null}
 */
export function getMessageHandler() {
  return messageHandler;
}

/** @param {Function|null} handler */
export function setMessageHandler(handler) {
  messageHandler = handler;
}

/**
 * Handler de envelopes DM recebidos pelo RTC.
 * @returns {Function|null}
 */
export function getDmMessageHandler() {
  return dmMessageHandler;
}

/** @param {Function|null} handler */
export function setDmMessageHandler(handler) {
  dmMessageHandler = handler;
}

/**
 * Handler de chaves de DM anunciadas na sinalização.
 * @returns {Function|null}
 */
export function getIdentityHandler() {
  return identityHandler;
}

/** @param {Function|null} handler */
export function setIdentityHandler(handler) {
  identityHandler = handler;
}

/**
 * Timer de reconexão WebSocket ativo.
 * @returns {ReturnType<typeof setTimeout>|null}
 */
export function getReconnectTimer() {
  return reconnectTimer;
}

/** @param {ReturnType<typeof setTimeout>|null} timer */
export function setReconnectTimer(timer) {
  reconnectTimer = timer;
}

/**
 * Tentativas de reconexão WebSocket na sessão atual.
 * @returns {number}
 */
export function getReconnectAttempts() {
  return reconnectAttempts;
}

/** @param {number} n */
export function setReconnectAttempts(n) {
  reconnectAttempts = n;
}

/**
 * Incrementa o contador de reconexão e devolve o novo valor.
 * @returns {number}
 */
export function incrementReconnectAttempts() {
  reconnectAttempts += 1;
  return reconnectAttempts;
}

/**
 * Configuração de sinalização/ICE em memória após `loadSignalingConfig`.
 * @returns {object|null}
 */
export function getConfigCache() {
  return configCache;
}

/** @param {object|null} config */
export function setConfigCache(config) {
  configCache = config;
}

/**
 * Transporte Nostr de sinalização paralelo.
 * @returns {import("./nostr-transport.js").NostrTransportHandle|null}
 */
export function getNostrTransport() {
  return nostrTransport;
}

/** @param {import("./nostr-transport.js").NostrTransportHandle|null} transport */
export function setNostrTransport(transport) {
  nostrTransport = transport;
}

/**
 * Marca temporal de `initWebRtc` (telemetria do primeiro par).
 * @returns {number}
 */
export function getSessionStartedAt() {
  return sessionStartedAt;
}

/** @param {number} t */
export function setSessionStartedAt(t) {
  sessionStartedAt = t;
}

/**
 * Telemetria do primeiro par já registrada nesta sessão.
 * @returns {boolean}
 */
export function getRecordedFirstPeer() {
  return recordedFirstPeer;
}

/** @param {boolean} v */
export function setRecordedFirstPeer(v) {
  recordedFirstPeer = v;
}

/**
 * Ouvinte de saúde da sinalização (`onSignalingHealth`).
 * @returns {((down: boolean) => void)|null}
 */
export function getSignalingHealthHandler() {
  return signalingHealthHandler;
}

/** @param {((down: boolean) => void)|null} handler */
export function setSignalingHealthHandler(handler) {
  signalingHealthHandler = handler;
}

/**
 * Agregador LAN-21 de saúde WebSocket + Nostr.
 * @returns {ReturnType<typeof createSignalingHealth>}
 */
export function getSignalingHealth() {
  return signalingHealth;
}

/**
 * Handler de abertura do canal de dados (`onPeerConnect`).
 * @returns {((remotePeerId: string, sendFn: (obj: object) => boolean) => void)|null}
 */
export function getPeerConnectHandler() {
  return peerConnectHandler;
}

/** @param {((remotePeerId: string, sendFn: (obj: object) => boolean) => void)|null} handler */
export function setPeerConnectHandler(handler) {
  peerConnectHandler = handler;
}

/**
 * Índice do endereço de sinalização WebSocket em uso no rodízio.
 * @returns {number}
 */
export function getActiveSignalingIndex() {
  return activeSignalingIndex;
}

/** @param {number} idx */
export function setActiveSignalingIndex(idx) {
  activeSignalingIndex = idx;
}

const signalingMachine = createMachine({
  initial: "idle",
  states: {
    idle: { on: { DIAL: "connecting", STOP: "idle" } },
    connecting: { on: { OPEN: "open", BACKOFF: "backoff", STOP: "idle" } },
    open: { on: { BACKOFF: "backoff", DIAL: "connecting", STOP: "idle" } },
    backoff: { on: { DIAL: "connecting", OPEN: "open", STOP: "idle" } },
  },
});

/**
 * Máquina de estados da conexão WebSocket de sinalização (`idle`, `connecting`, `open`, `backoff`).
 * @returns {ReturnType<typeof createMachine>} Máquina reativa de sinalização.
 */
export function getSignalingMachine() {
  return signalingMachine;
}

/**
 * Estado atual da sinalização WebSocket (`idle` | `connecting` | `open` | `backoff`).
 * @returns {string} Nome do estado atual.
 */
export function getSignalingState() {
  return signalingMachine.state.peek();
}