/**
 * @file Escolha do transporte da Mesa (SUB-08, fatia 2c): `BroadcastChannel` (mesma origem, o padrão) ou rede
 * (WebRTC + sinalização), esta só atrás da flag de laboratório `vox.lab.mesa-rede` e com o endereço do nó em
 * `vox.lab.mesa-rede.url`. Qualquer falha ao montar a rede cai para `BroadcastChannel`, dizendo o motivo na tela. O
 * transporte de rede e a sinalização carregam sob demanda (`import()`), fora do shell. Também resume o estado da conexão
 * (`connecting`, `waiting_peer`, `open`, `error`) e o desenha com texto acessível (`aria-live`).
 * @module dungeon/vtt-rede-escolha
 */
import { createBroadcastChannelTransport } from "./vtt-sync.js";

/** Flag de laboratório: `"1"` liga a Mesa pela rede neste aparelho. */
export const MESA_REDE_LAB_KEY = "vox.lab.mesa-rede";
/** Endereço `ws://` ou `wss://` do nó de sinalização usado pela Mesa em rede. */
export const MESA_REDE_URL_KEY = "vox.lab.mesa-rede.url";

/**
 * Carrega sob demanda o transporte da Mesa pela rede (SUB-08); nenhum byte dele entra no shell.
 * @returns {Promise<typeof import("./vtt-rtc-transport.js")>} Módulo do transporte WebRTC.
 */
export const loadRtcVttTransport = () => import("./vtt-rtc-transport.js");

/**
 * Carrega sob demanda o cliente de sinalização da Mesa (SUB-08); fora do shell, como o transporte.
 * @returns {Promise<typeof import("./vtt-signaling-client.js")>} Módulo do cliente de sinalização.
 */
export const loadVttSignalingClient = () => import("./vtt-signaling-client.js");

function readKey(storage, key) {
  try {
    return storage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

/**
 * A Mesa em rede está ligada neste aparelho?
 * @param {Storage|null} [storage] Armazenamento local (padrão `globalThis.localStorage`).
 * @returns {boolean} `true` só com a flag `"1"`.
 */
export function isMesaRedeLabEnabled(storage = globalThis.localStorage) {
  return readKey(storage, MESA_REDE_LAB_KEY) === "1";
}

/**
 * Endereço do nó de sinalização salvo para a Mesa (só `ws:` ou `wss:`).
 * @param {Storage|null} [storage] Armazenamento local (padrão `globalThis.localStorage`).
 * @returns {string} URL válida ou texto vazio.
 */
export function readMesaRedeUrl(storage = globalThis.localStorage) {
  const raw = String(readKey(storage, MESA_REDE_URL_KEY) || "").trim();
  return /^wss?:\/\/[^\s]+$/i.test(raw) && raw.length <= 512 ? raw : "";
}

/**
 * Junta o estado do nó e dos elos num estado só. Quem inicia (jogador) só está `open` com um elo aberto; o Mestre, com o nó.
 * @param {{signaling: string, links: Record<string, string>, initiate: boolean}} parts Estados parciais.
 * @returns {"connecting"|"waiting_peer"|"open"|"error"} Estado resumido.
 */
export function summarizeConnection({ signaling, links, initiate }) {
  if (signaling === "error" || signaling === "closed") return "error";
  if (signaling !== "open") return "connecting";
  const states = Object.values(links);
  if (!initiate || states.includes("open")) return "open";
  return states.includes("waiting_peer") ? "waiting_peer" : "connecting";
}

const TEXTS = {
  connecting: "Conectando à Mesa pela rede…",
  waiting_peer: "Aguardando o Mestre entrar na Mesa…",
  open: "Conectado à Mesa pela rede.",
  error: "Sem conexão com o nó de sinalização. A Mesa pela rede não está disponível.",
};
const FALLBACK_TEXT = "Mesa pela rede indisponível neste aparelho; usando a mesma origem (outra aba).";

/**
 * Texto leigo do estado da conexão.
 * @param {{transport?: string, status?: string, fallback?: boolean}|undefined} conn Estado de conexão da sessão.
 * @returns {string} Texto, ou vazio quando não há o que dizer.
 */
export function connectionText(conn) {
  if (conn?.transport === "mesma_origem") return conn.fallback ? FALLBACK_TEXT : "";
  return conn?.transport === "rede" ? TEXTS[conn.status] || "" : "";
}

/**
 * Bloco de estado da conexão (região `aria-live` educada); vazio quando a Mesa usa só a mesma origem sem queda.
 * @param {object} state Estado da sessão (`vttConnection`).
 * @returns {string} HTML.
 */
export function renderVttConnection(state) {
  const conn = state?.vttConnection;
  const text = connectionText(conn);
  if (!text) return "";
  const kind = conn.transport === "rede" ? conn.status : "fallback";
  return `<p class="dungeon-vtt-connection is-${kind}" role="status" aria-live="polite">${text}</p>`;
}

function broadcastResult(opts, fallback) {
  const make = opts.createBroadcast || createBroadcastChannelTransport;
  if (typeof (opts.BroadcastChannelImpl !== undefined ? opts.BroadcastChannelImpl : globalThis.BroadcastChannel) !== "function") return null;
  opts.onConnection?.({ transport: "mesma_origem", status: "open", fallback });
  return { kind: "mesma_origem", transport: make(opts.tableId, opts.peerId), fallback };
}

async function buildNetwork(opts, url) {
  const [rtc, sig] = await Promise.all([(opts.loadRtc || loadRtcVttTransport)(), (opts.loadSignaling || loadVttSignalingClient)()]);
  const parts = { signaling: "connecting", links: {}, initiate: Boolean(opts.initiate) };
  const publish = () => opts.onConnection?.({ transport: "rede", status: summarizeConnection(parts) });
  const signaling = sig.createVttSignalingClient({ url, peerId: opts.peerId, WebSocketImpl: opts.WebSocketImpl, onStatus: (s) => { parts.signaling = s; publish(); } });
  const transport = rtc.createRtcVttTransport({
    peerId: opts.peerId, initiate: opts.initiate, signaling, createPeerConnection: opts.createPeerConnection,
    onStatus: (id, s) => { parts.links[id] = s; publish(); },
  });
  publish();
  const close = () => { transport.close(); signaling.close(); };
  return { kind: "rede", transport: Object.assign(Object.create(transport), { close }), fallback: false };
}

/**
 * Escolhe e monta o transporte da Mesa. Com a flag e o endereço do nó, usa a rede; sem eles, ou se a rede falhar ao montar,
 * usa `BroadcastChannel`. `onConnection` recebe `{transport, status, fallback}` a cada mudança.
 * @param {object} opts Opções.
 * @param {string} opts.tableId Id da mesa (sala do `BroadcastChannel`).
 * @param {string} opts.peerId `routeId` local.
 * @param {boolean} opts.initiate `true` no jogador (oferta), `false` no Mestre.
 * @param {Storage|null} [opts.storage] Onde ler a flag e o endereço (padrão `localStorage`).
 * @param {(conn: object) => void} [opts.onConnection] Ouvinte do estado de conexão.
 * @param {Function} [opts.loadRtc] Carregador do transporte de rede (testes).
 * @param {Function} [opts.loadSignaling] Carregador da sinalização (testes).
 * @param {typeof WebSocket} [opts.WebSocketImpl] WebSocket (testes).
 * @param {Function} [opts.createPeerConnection] Fábrica de `RTCPeerConnection` (testes).
 * @param {Function} [opts.createBroadcast] Fábrica do transporte local (testes).
 * @returns {Promise<{kind: "rede"|"mesma_origem", transport: object, fallback: boolean}|null>} Escolha; `null` sem nenhum transporte possível.
 */
export async function chooseVttTransport(opts) {
  const storage = opts.storage ?? globalThis.localStorage;
  if (!isMesaRedeLabEnabled(storage)) return broadcastResult(opts, false);
  const url = readMesaRedeUrl(storage);
  if (!url) return broadcastResult(opts, true);
  try {
    return await buildNetwork(opts, url);
  } catch {
    return broadcastResult(opts, true);
  }
}
