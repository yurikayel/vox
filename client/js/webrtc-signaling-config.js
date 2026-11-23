/**
 * @file Configuração de sinalização, ICE e candidatos WebRTC (puro + cache).
 * @module webrtc-signaling-config
 */
import { buildNostrSignalingCandidates } from "./nostr-signaling.js";
import {
  CUSTOM_TURN_KEY,
  TURN_ONLY_KEY,
  turn,
  getConfigCache,
  setConfigCache,
  getCustomSignalingUrl,
  getActiveSignalingIndex,
  setActiveSignalingIndex,
} from "./webrtc-peer-state.js";

/**
 * Configuração de sinalização e ICE (`config/signaling.json`), lida uma vez e guardada em memória.
 * @returns {Promise<object>} Configuração com `stun`, `turn`, `signalingUrls`, `webtorrentTrackers`, `nostrRelays` e `maxRtcPeers`.
 */
export async function loadSignalingConfig() {
  const cached = getConfigCache();
  if (cached) return cached;
  try {
    const res = await fetch("config/signaling.json");
    if (res.ok) {
      const config = await res.json();
      setConfigCache(config);
      return config;
    }
  } catch {}
  const fallback = {
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
  setConfigCache(fallback);
  return fallback;
}

/**
 * LAN-19: modo "só TURN".
 * @returns {boolean}
 */
export function isTurnOnly() {
  try {
    return localStorage.getItem(TURN_ONLY_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * LAN-19: liga ou desliga o modo "só TURN".
 * @param {boolean} on
 */
export function setTurnOnly(on) {
  try {
    if (on) localStorage.setItem(TURN_ONLY_KEY, "1");
    else localStorage.removeItem(TURN_ONLY_KEY);
  } catch {
    /* sem storage */
  }
}

/**
 * TURN próprio configurado pela pessoa.
 * @returns {{urls: string, username: string, credential: string}}
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
 * Grava o TURN próprio da pessoa.
 * @param {{urls?: string, username?: string, credential?: string}} [config]
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
 * Endereços de sinalização WebSocket a tentar.
 * @param {object} config
 * @returns {string[]}
 */
export function getSignalingCandidates(config) {
  const custom = getCustomSignalingUrl();
  if (custom) return [custom];
  const stored = (localStorage.getItem("vox-custom-signaling-url") || "").trim();
  if (stored) return [stored];
  const urls = Array.isArray(config?.signalingUrls)
    ? config.signalingUrls.map((u) => String(u || "").trim()).filter(Boolean)
    : [];
  return urls.length > 0 ? urls : ["ws://127.0.0.1:3921"];
}

/** Volta ao primeiro endereço de sinalização. */
export function resetSignalingIndex() {
  setActiveSignalingIndex(0);
}

/**
 * Trackers WebTorrent da configuração.
 * @param {object} config
 * @returns {string[]}
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
 * @param {object} config
 * @returns {string[]}
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
 * Relays Nostr seguros para sinalização.
 * @param {object} config
 * @returns {string[]}
 */
export function getNostrSignalingRelays(config) {
  return buildNostrSignalingCandidates(getNostrRelays(config));
}

/**
 * Todos os caminhos de sinalização conhecidos, para a tela de rede.
 * @param {object} config
 * @returns {{baseUrls: string[], webtorrentTrackers: string[], nostrRelays: string[], totalEndpoints: number}}
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
 * @param {object} config
 * @returns {string}
 */
export function getSignalingUrl(config) {
  const candidates = getSignalingCandidates(config);
  return candidates[getActiveSignalingIndex() % candidates.length];
}

/**
 * Passa ao próximo endereço de sinalização (em rodízio).
 * @param {object} config
 * @returns {string}
 */
export function rotateSignalingUrl(config) {
  const candidates = getSignalingCandidates(config);
  const next = (getActiveSignalingIndex() + 1) % candidates.length;
  setActiveSignalingIndex(next);
  return candidates[next];
}

/**
 * @param {unknown} u
 * @returns {boolean}
 */
const isTurnUrl = (u) => /^turns?:/i.test(String(u));

/**
 * Reúne os servidores ICE (STUN e, se houver, TURN) da configuração.
 * @param {object} config Configuração de sinalização
 * @returns {object[]} Servidores ICE.
 */
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

/**
 * Configuração da `RTCPeerConnection`.
 * @param {object} [config]
 * @param {{turnOnly?: boolean}} [options]
 * @returns {RTCConfiguration}
 */
export function createRtcConfig(config = getConfigCache(), { turnOnly = isTurnOnly() } = {}) {
  const iceServers = collectIceServers(config);
  if (turnOnly) {
    const relays = iceServers.filter((s) => [].concat(s.urls).some(isTurnUrl));
    return { iceServers: relays, iceTransportPolicy: "relay" };
  }
  return { iceServers };
}