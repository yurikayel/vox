/**
 * @file Transporte da Mesa entre aparelhos sobre `RTCDataChannel` (SUB-08, fatia 1): cumpre o contrato de
 * `createVttSyncPeer` (`peerId`, `send`, `onMessage`, `close`) sem alterar o protocolo. Só o canal de dados carrega
 * conteúdo da mesa; a sinalização leva apenas oferta, resposta e candidatos ICE. Sem TURN no v1 (só `stun:`).
 * Carregado sob demanda (`import()`), fora de `SHELL_ASSETS`.
 * @module dungeon/vtt-rtc-transport
 */

/** Rótulo do canal de dados da mesa (distinto de `vox-peer-v0` e `vox-dm-v0` da malha). */
export const VTT_CHANNEL_LABEL = "vox-vtt-v0";
/** Teto de uma mensagem no canal (o protocolo já fatia blobs em 16 KiB; o snapshot é um só). */
export const VTT_MAX_MESSAGE_BYTES = 256 * 1024;
const MAX_QUEUED = 64;
const DEFAULT_STUN = [{ urls: "stun:stun.l.google.com:19302" }];

/**
 * Mantém só servidores `stun:`: o v1 não usa TURN (decisão D4 da spec mesa-rede-v0).
 * @param {Array<{urls: string|string[]}>} servers Servidores ICE candidatos.
 * @returns {Array<{urls: string|string[]}>} Apenas os `stun:`.
 */
export function stunOnly(servers) {
  const isStun = (u) => /^stun:/i.test(String(u));
  return (servers || []).filter((s) => [].concat(s?.urls || []).length && [].concat(s.urls).every(isStun));
}

function byteLength(text) {
  return new TextEncoder().encode(text).length;
}

function resolveFactory(opts) {
  if (opts.createPeerConnection) return opts.createPeerConnection;
  const Ctor = globalThis.RTCPeerConnection;
  if (typeof Ctor !== "function") throw new Error("WebRTC indisponível neste navegador.");
  const iceServers = stunOnly(opts.iceServers).length ? stunOnly(opts.iceServers) : DEFAULT_STUN;
  return () => new Ctor({ iceServers });
}

/**
 * Cria o transporte de rede da mesa.
 * @param {object} opts Opções.
 * @param {string} opts.peerId `routeId` local.
 * @param {{send: (data: object) => void, onMessage: (fn: Function) => Function}} opts.signaling Canal de sinalização (oferta, resposta e ICE).
 * @param {boolean} [opts.initiate] `true` no jogador: abre a conexão ao primeiro `send` para um par desconhecido.
 * @param {Function} [opts.createPeerConnection] Fábrica de `RTCPeerConnection` (testes).
 * @param {Array} [opts.iceServers] Servidores ICE (filtrados para `stun:`).
 * @param {number} [opts.maxMessageBytes] Teto de uma mensagem.
 * @param {(peerId: string, state: string) => void} [opts.onStatus] `connecting`, `open`, `closed`, `oversize` ou `queue_full`.
 * @returns {{peerId: string, send: Function, onMessage: Function, close: Function, connect: Function}} Transporte compatível com `createVttSyncPeer`.
 */
export function createRtcVttTransport(opts) {
  const factory = resolveFactory(opts);
  const links = new Map();
  const handlers = new Set();
  const ctx = { opts, factory, links, handlers, chains: new Map(), closed: false };
  const detach = opts.signaling.onMessage((data) => onSignal(ctx, data));
  return {
    peerId: opts.peerId,
    connect: (remoteId) => { ensureLink(ctx, remoteId, true); },
    send: (to, msg) => sendMessage(ctx, to, msg),
    onMessage(fn) { handlers.add(fn); return () => handlers.delete(fn); },
    close() {
      ctx.closed = true;
      detach();
      handlers.clear();
      ctx.chains.clear();
      [...links.keys()].forEach((id) => dropLink(ctx, id));
    },
  };
}

function status(ctx, remoteId, state) {
  ctx.opts.onStatus?.(remoteId, state);
}

function dropLink(ctx, remoteId) {
  const link = ctx.links.get(remoteId);
  if (!link) return;
  ctx.links.delete(remoteId);
  try { link.channel?.close?.(); link.pc.close?.(); } catch { /* já fechado */ }
  status(ctx, remoteId, "closed");
}

function attachChannel(ctx, remoteId, link, channel) {
  link.channel = channel;
  channel.onopen = () => {
    status(ctx, remoteId, "open");
    try {
      link.queue.splice(0).forEach((text) => channel.send(text));
    } catch {
      dropLink(ctx, remoteId);
    }
  };
  channel.onclose = () => { if (ctx.links.get(remoteId) === link) dropLink(ctx, remoteId); };
  channel.onmessage = (ev) => deliver(ctx, remoteId, ev.data);
}

/** Objeto simples (nem array, nem `null`, nem instância de classe). */
function isPlainObject(value) {
  return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

/** Entrada não confiável: só texto dentro do teto vira JSON; só objeto simples vira mensagem. Nada disso derruba o elo. */
function parseInbound(ctx, raw) {
  const max = ctx.opts.maxMessageBytes ?? VTT_MAX_MESSAGE_BYTES;
  if (typeof raw !== "string" || raw.length > max || byteLength(raw) > max) return null;
  try {
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** O `from` vem do canal, nunca do corpo: o par remoto não escolhe quem diz ser. */
function deliver(ctx, remoteId, raw) {
  const parsed = parseInbound(ctx, raw);
  if (!parsed) return;
  const msg = { ...parsed, from: remoteId };
  ctx.handlers.forEach((fn) => { try { fn(msg); } catch { /* um ouvinte ruim não derruba o canal */ } });
}

function newLink(ctx, remoteId) {
  const pc = ctx.factory();
  const link = { pc, channel: null, queue: [] };
  ctx.links.set(remoteId, link);
  pc.onicecandidate = (ev) => {
    if (ev.candidate) ctx.opts.signaling.send({ type: "ice", to: remoteId, candidate: ev.candidate });
  };
  pc.ondatachannel = (ev) => {
    if (ev.channel?.label === VTT_CHANNEL_LABEL) attachChannel(ctx, remoteId, link, ev.channel);
  };
  pc.onconnectionstatechange = () => {
    if (["failed", "closed"].includes(pc.connectionState)) dropLink(ctx, remoteId);
  };
  status(ctx, remoteId, "connecting");
  return link;
}

async function startOffer(ctx, remoteId, link) {
  const offer = await link.pc.createOffer();
  await link.pc.setLocalDescription(offer);
  ctx.opts.signaling.send({ type: "offer", to: remoteId, sdp: link.pc.localDescription });
}

/** Devolve o elo do par (criando-o na hora); quem inicia abre o canal e manda a oferta sem esperar, para não reordenar o envio. */
function ensureLink(ctx, remoteId, initiator) {
  if (ctx.closed) return null;
  const existing = ctx.links.get(remoteId);
  if (existing) return existing;
  const link = newLink(ctx, remoteId);
  if (!initiator) return link;
  attachChannel(ctx, remoteId, link, link.pc.createDataChannel(VTT_CHANNEL_LABEL));
  startOffer(ctx, remoteId, link).catch(() => dropLink(ctx, remoteId));
  return link;
}

async function answerOffer(ctx, from, sdp) {
  dropLink(ctx, from);
  const link = ensureLink(ctx, from, false);
  if (!link) return;
  await link.pc.setRemoteDescription(sdp);
  const answer = await link.pc.createAnswer();
  await link.pc.setLocalDescription(answer);
  ctx.opts.signaling.send({ type: "answer", to: from, sdp: link.pc.localDescription });
}

async function applySignal(ctx, data) {
  const { type, from } = data;
  if (type === "offer" && !ctx.opts.initiate) return answerOffer(ctx, from, data.sdp);
  const link = ctx.links.get(from);
  if (!link) return undefined;
  if (type === "answer") return link.pc.setRemoteDescription(data.sdp);
  if (type === "ice" && data.candidate) return link.pc.addIceCandidate(data.candidate);
  return undefined;
}

const SIGNAL_TYPES = new Set(["offer", "answer", "ice"]);
const MAX_PEER_ID = 256;

/** Sinalização também é entrada não confiável: tipo conhecido, `from` textual curto e carga do formato certo. */
function isValidSignal(ctx, data) {
  if (!isPlainObject(data) || !SIGNAL_TYPES.has(data.type)) return false;
  if (typeof data.from !== "string" || !data.from || data.from.length > MAX_PEER_ID || data.from === ctx.opts.peerId) return false;
  return data.type === "ice" ? isPlainObject(data.candidate) : isPlainObject(data.sdp);
}

/** Um sinal por vez por par: o ICE só é aplicado depois de a oferta/resposta anterior terminar (há remote description). */
function onSignal(ctx, data) {
  if (ctx.closed || !isValidSignal(ctx, data)) return;
  const prev = ctx.chains.get(data.from) || Promise.resolve();
  const next = prev.then(() => applySignal(ctx, data)).catch(() => dropLink(ctx, data.from));
  ctx.chains.set(data.from, next);
}

/** Entrega ou enfileira; `false` quando a fila de espera está cheia (a mensagem não some em silêncio). */
function sendOnLink(ctx, remoteId, link, text) {
  if (link.channel?.readyState === "open") {
    link.channel.send(text);
    return true;
  }
  if (link.queue.length >= MAX_QUEUED) {
    status(ctx, remoteId, "queue_full");
    return false;
  }
  link.queue.push(text);
  return true;
}

function sendMessage(ctx, to, msg) {
  if (ctx.closed) return false;
  const text = JSON.stringify({ ...msg, from: ctx.opts.peerId });
  if (byteLength(text) > (ctx.opts.maxMessageBytes ?? VTT_MAX_MESSAGE_BYTES)) {
    status(ctx, to, "oversize");
    return false;
  }
  const targets = to === "*" ? [...ctx.links.keys()] : [to];
  return targets.map((id) => {
    const link = ctx.links.get(id) || (ctx.opts.initiate && to !== "*" ? ensureLink(ctx, id, true) : null);
    return link ? sendOnLink(ctx, id, link, text) : true;
  }).every(Boolean);
}
