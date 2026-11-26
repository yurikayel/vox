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
/** Teto de elos simultâneos (uma mesa tem poucos jogadores; a sinalização é pública e não pode esgotar a memória do Mestre). */
export const VTT_MAX_LINKS = 16;
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
  const hostOnly = Array.isArray(opts.iceServers) && opts.iceServers.length === 0;
  const iceServers = hostOnly ? [] : stunOnly(opts.iceServers).length ? stunOnly(opts.iceServers) : DEFAULT_STUN;
  return () => new Ctor({ iceServers });
}

/**
 * Cria o transporte de rede da mesa.
 * @param {object} opts Opções.
 * @param {string} opts.peerId `routeId` local.
 * @param {{send: (data: object) => void, onMessage: (fn: Function) => Function, isPeerOnline?: (id: string) => boolean, onPeerJoined?: (fn: (id: string) => void) => Function}} opts.signaling
 *   Canal de sinalização (oferta, resposta e ICE). Se informar `isPeerOnline`/`onPeerJoined`, o jogador só oferta quando o par está no nó e reoferta quando ele aparece.
 * @param {boolean} [opts.initiate] `true` no jogador: abre a conexão ao primeiro `send` para um par desconhecido.
 * @param {Function} [opts.createPeerConnection] Fábrica de `RTCPeerConnection` (testes).
 * @param {Array} [opts.iceServers] Servidores ICE (filtrados para `stun:`); lista vazia = só candidatos locais (nenhum tráfego externo); ausente = STUN padrão.
 * @param {number} [opts.maxMessageBytes] Teto de uma mensagem.
 * @param {number} [opts.maxLinks] Teto de elos simultâneos (padrão `VTT_MAX_LINKS`); acima dele a oferta é recusada.
 * @param {() => number} [opts.now] Relógio em ms (testes); padrão `Date.now`.
 * @param {(peerId: string, state: string) => void} [opts.onStatus] `connecting`, `waiting_peer`, `open`, `closed`, `oversize`, `queue_full` ou `link_limit`.
 * @returns {{peerId: string, send: Function, onMessage: Function, close: Function, connect: Function}} Transporte compatível com `createVttSyncPeer`.
 */
export function createRtcVttTransport(opts) {
  const factory = resolveFactory(opts);
  const links = new Map();
  const handlers = new Set();
  const ctx = { opts, factory, links, handlers, chains: new Map(), pending: new Map(), closed: false };
  const detach = opts.signaling.onMessage((data) => onSignal(ctx, data));
  const detachJoin = opts.signaling.onPeerJoined?.((id) => resumeOffer(ctx, id)) || (() => {});
  return {
    peerId: opts.peerId,
    connect: (remoteId) => { ensureLink(ctx, remoteId, true); },
    /** Diagnóstico: quantos elos e cadeias de sinalização o transporte guarda (para provar que nada vaza). */
    stats: () => ({ links: links.size, chains: ctx.chains.size }),
    send: (to, msg) => sendMessage(ctx, to, msg),
    onMessage(fn) { handlers.add(fn); return () => handlers.delete(fn); },
    close() {
      ctx.closed = true;
      detach();
      detachJoin();
      handlers.clear();
      ctx.chains.clear();
      [...links.keys()].forEach((id) => dropLink(ctx, id));
    },
  };
}

function status(ctx, remoteId, state) {
  ctx.opts.onStatus?.(remoteId, state);
}

/** Esquece a cadeia de sinais do par quando não há elo nem sinal em andamento (senão um par recusado/caído vazaria memória). */
function pruneChain(ctx, remoteId) {
  if (!ctx.links.has(remoteId) && !ctx.pending.get(remoteId)) ctx.chains.delete(remoteId);
}

function dropLink(ctx, remoteId) {
  const link = ctx.links.get(remoteId);
  if (!link) return;
  ctx.links.delete(remoteId);
  pruneChain(ctx, remoteId);
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
  if (byteLength(raw) > max) return null;
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
  const link = { pc, channel: null, queue: [], offers: 0, awaiting: false, offerAt: 0 };
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
  link.offers += 1;
  link.awaiting = true;
  link.offerAt = nowOf(ctx);
  const offer = await link.pc.createOffer();
  await link.pc.setLocalDescription(offer);
  ctx.opts.signaling.send({ type: "offer", to: remoteId, sdp: link.pc.localDescription });
}

/** Devolve o elo do par (criando-o na hora); quem inicia abre o canal e manda a oferta sem esperar, para não reordenar o envio. */
function ensureLink(ctx, remoteId, initiator) {
  if (ctx.closed) return null;
  const existing = ctx.links.get(remoteId);
  if (existing) return existing;
  if (ctx.links.size >= (ctx.opts.maxLinks ?? VTT_MAX_LINKS)) {
    status(ctx, remoteId, "link_limit");
    return null;
  }
  const link = newLink(ctx, remoteId);
  if (!initiator) return link;
  attachChannel(ctx, remoteId, link, link.pc.createDataChannel(VTT_CHANNEL_LABEL));
  if (ctx.opts.signaling.isPeerOnline && !ctx.opts.signaling.isPeerOnline(remoteId)) status(ctx, remoteId, "waiting_peer");
  else startOffer(ctx, remoteId, link).catch(() => dropLink(ctx, remoteId));
  return link;
}

/**
 * Ofertas por elo (a primeira mais as reofertas) e quanto tempo uma oferta sem resposta ainda conta como em voo.
 * Liveness: esgotadas as ofertas, um Mestre que reinicia só é reofertado quando o app cria um elo novo para ele.
 */
const MAX_OFFERS_PER_LINK = 4;
const OFFER_TTL_MS = 15_000;
const nowOf = (ctx) => (ctx.opts.now ? ctx.opts.now() : Date.now());

/** O par registrou-se no nó (ou voltou): quem ainda não tem canal aberto oferta de novo; a oferta antes disso se perderia no nó. */
function resumeOffer(ctx, remoteId) {
  const link = ctx.links.get(remoteId);
  if (ctx.closed || !ctx.opts.initiate || !link || link.channel?.readyState === "open") return;
  if (link.awaiting && nowOf(ctx) - link.offerAt < OFFER_TTL_MS) return;
  if (link.offers >= MAX_OFFERS_PER_LINK) return;
  startOffer(ctx, remoteId, link).catch(() => dropLink(ctx, remoteId));
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
  if (type === "answer") {
    link.awaiting = false;
    return link.pc.setRemoteDescription(data.sdp);
  }
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
  ctx.pending.set(data.from, (ctx.pending.get(data.from) || 0) + 1);
  next.then(() => {
    const left = ctx.pending.get(data.from) - 1;
    if (left > 0) ctx.pending.set(data.from, left);
    else ctx.pending.delete(data.from);
    pruneChain(ctx, data.from);
  });
}

/** Entrega ou enfileira; `false` quando a fila de espera está cheia (a mensagem não some em silêncio). */
function sendOnLink(ctx, remoteId, link, text) {
  if (link.channel?.readyState === "open") {
    try {
      link.channel.send(text);
      return true;
    } catch {
      dropLink(ctx, remoteId);
      return false;
    }
  }
  if (link.queue.length >= MAX_QUEUED) {
    status(ctx, remoteId, "queue_full");
    return false;
  }
  link.queue.push(text);
  return true;
}

/**
 * Envia `msg` a um par (ou `"*"` para todos os elos).
 * Retorno: `false` se o transporte está fechado, a mensagem passa do teto, a fila do elo está cheia, o canal falhou ou o jogador
 * (`initiate`) não pôde abrir elo (teto). O Mestre (sem `initiate`) devolve `true` para um par sem elo: não há o que
 * entregar e a mesa segue (o par reaparece pela oferta dele).
 * @param {object} ctx Contexto do transporte.
 * @param {string} to `routeId` do destino ou `"*"`.
 * @param {object} msg Mensagem (o `from` é carimbado aqui).
 * @returns {boolean} `true` se entregue ou enfileirada em todos os alvos.
 */
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
    if (link) return sendOnLink(ctx, id, link, text);
    return !ctx.opts.initiate;
  }).every(Boolean);
}
