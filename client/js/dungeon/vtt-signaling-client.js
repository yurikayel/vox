/**
 * @file Cliente de sinalização WebSocket só da Mesa entre aparelhos (SUB-08, fatia 2): registra o `routeId` no nó de
 * sinalização atual (D5) e entrega ao transporte (`createRtcVttTransport`) apenas oferta, resposta e ICE. Não usa o
 * estado global da malha (`webrtc-peer-state`) e não carrega nada da mesa: o conteúdo viaja só no canal de dados.
 * Carregado sob demanda (`import()`), fora de `SHELL_ASSETS`.
 * @module dungeon/vtt-signaling-client
 */

/** Tipos que a Mesa aceita da sinalização (o resto, como `registered` e `peer-joined`, só informa o estado). */
const SIGNAL_TYPES = new Set(["offer", "answer", "ice"]);
/** Teto de um quadro de sinalização recebido (SDP e ICE são pequenos; o relay aceita até 1 MB). */
export const VTT_MAX_SIGNAL_CHARS = 64 * 1024;
/** Teto de mensagens guardadas até o nó confirmar o registro (a oferta e alguns candidatos ICE). */
const MAX_PENDING = 32;
/** Quanto esperar o `registered` do nó antes de declarar erro de conexão. */
export const VTT_REGISTER_TIMEOUT_MS = 10_000;
const MAX_PEER_ID = 256;
/** Teto de pares lembrados como presentes; acompanha o `DEFAULT_MAX_CONNECTIONS` (64) do relay, que é configurável por `VOX_SIGNAL_MAX_CONNECTIONS`. */
const MAX_ONLINE = 64;

function parseFrame(raw) {
  if (typeof raw !== "string" || raw.length > VTT_MAX_SIGNAL_CHARS) return null;
  try {
    const data = JSON.parse(raw);
    return data && typeof data === "object" && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

/** Só estes campos saem para o nó (lista fechada): conteúdo da mesa ou qualquer outro campo nunca viaja pela sinalização. */
function pickFields(data) {
  return data.type === "ice" ? { type: "ice", to: data.to, candidate: data.candidate } : { type: data.type, to: data.to, sdp: data.sdp };
}

const validId = (id) => typeof id === "string" && id.length > 0 && id.length <= MAX_PEER_ID;

function notifyJoined(ctx, id) {
  ctx.joinHandlers.forEach((fn) => { try { fn(id); } catch { /* ouvinte ruim */ } });
}

/** `registered`: quem já estava no nó conta como presente e os ouvintes são avisados (o nó não manda `peer-joined` deles). */
function trackRegistered(ctx, data) {
  const ids = (Array.isArray(data.peers) ? data.peers : []).filter((id) => validId(id) && id !== ctx.opts.peerId).slice(0, MAX_ONLINE);
  ctx.online = new Set(ids);
  ids.forEach((id) => notifyJoined(ctx, id));
}

/** Presença no nó: quem já estava (`registered`), quem entrou e quem saiu; avisa os ouvintes de `onPeerJoined`. */
function trackPresence(ctx, data) {
  if (data.type === "registered" && data.peerId === ctx.opts.peerId) trackRegistered(ctx, data);
  else if (data.type === "peer-left") ctx.online.delete(data.peerId);
  else if (data.type === "peer-joined" && validId(data.peerId) && data.peerId !== ctx.opts.peerId) {
    if (!ctx.online.has(data.peerId) && ctx.online.size >= MAX_ONLINE) return;
    ctx.online.add(data.peerId);
    notifyJoined(ctx, data.peerId);
  }
}

/** O nó confirmou o registro: o enlace abre e a fila sai. */
function confirmRegistration(ctx, data) {
  if (data.type !== "registered" || data.peerId !== ctx.opts.peerId || ctx.state !== "connecting") return;
  ctx.cancel(ctx.timer);
  ctx.setState("open");
  ctx.pending.splice(0).forEach(ctx.transmit);
}

function onFrame(ctx, raw) {
  if (ctx.state === "closed" || ctx.state === "error") return;
  const data = parseFrame(raw);
  if (!data) return;
  confirmRegistration(ctx, data);
  trackPresence(ctx, data);
  if (!SIGNAL_TYPES.has(data.type)) return;
  ctx.handlers.forEach((fn) => { try { fn(data); } catch { /* um ouvinte ruim não derruba a sinalização */ } });
}

/** Liga os eventos do WebSocket: registra o par ao abrir; falha antes do registro vira `error`, depois vira `closed`. */
function wireSocket(ws, ctx) {
  ws.onopen = () => {
    if (ctx.state === "closed") ws.close();
    else ws.send(JSON.stringify({ type: "register", peerId: ctx.opts.peerId }));
  };
  const lost = () => ctx.setState(ctx.state === "connecting" ? "error" : "closed");
  ws.onclose = lost;
  ws.onerror = lost;
  ws.onmessage = (ev) => onFrame(ctx, ev.data);
}

/** Envia na hora quando aberto, guarda (com teto) enquanto conecta, recusa quando fechado, com erro ou fora do formato. */
function sendSignal(ctx, data) {
  const ended = ctx.state === "closed" || ctx.state === "error";
  if (!SIGNAL_TYPES.has(data?.type) || typeof data.to !== "string" || ended) return false;
  if (ctx.state === "open") ctx.transmit(data);
  else if (ctx.pending.length < MAX_PENDING) ctx.pending.push(data);
  else return false;
  return true;
}

function newContext(opts, ws) {
  const ctx = {
    opts, handlers: new Set(), joinHandlers: new Set(), online: new Set(), pending: [], state: "connecting",
    transmit: (data) => ws.send(JSON.stringify(pickFields(data))),
    cancel: opts.cancel || ((handle) => clearTimeout(handle)),
  };
  ctx.setState = (next) => {
    if (ctx.state === next || ctx.state === "closed") return;
    ctx.state = next;
    if (next !== "open") { ctx.cancel(ctx.timer); ctx.pending.length = 0; }
    opts.onStatus?.(next);
  };
  const schedule = opts.schedule || ((fn, ms) => setTimeout(fn, ms));
  ctx.timer = schedule(() => { if (ctx.state === "connecting") { ctx.setState("error"); try { ws.close(); } catch { /* já fechado */ } } }, opts.registerTimeoutMs ?? VTT_REGISTER_TIMEOUT_MS);
  return ctx;
}

/**
 * Abre a sinalização da Mesa.
 * @param {object} opts Opções.
 * @param {string} opts.url Endereço `ws://` ou `wss://` do nó de sinalização.
 * @param {string} opts.peerId `routeId` local, registrado no nó.
 * @param {typeof WebSocket} [opts.WebSocketImpl] Implementação de WebSocket (testes); padrão: a global.
 * @param {number} [opts.registerTimeoutMs] Espera máxima pelo `registered` (padrão `VTT_REGISTER_TIMEOUT_MS`); estourou, estado `error`.
 * @param {(fn: Function, ms: number) => unknown} [opts.schedule] Agendador do prazo (testes); padrão `setTimeout`.
 * @param {(handle: unknown) => void} [opts.cancel] Cancela o prazo (testes); padrão `clearTimeout`.
 * @param {(state: "connecting"|"open"|"closed"|"error") => void} [opts.onStatus] Estado do enlace: `open` só depois de o nó
 *   confirmar o registro; `error` quando o nó não responde a tempo ou cai antes de registrar.
 * @returns {{ send: Function, onMessage: Function, onPeerJoined: Function, isPeerOnline: Function, close: Function, state: Function }}
 *   Objeto no formato que `createRtcVttTransport` espera em `signaling` (com presença: `isPeerOnline` e `onPeerJoined`).
 */
export function createVttSignalingClient(opts) {
  const Impl = opts.WebSocketImpl || globalThis.WebSocket;
  if (typeof Impl !== "function") throw new Error("WebSocket indisponível neste navegador.");
  const ws = new Impl(opts.url);
  const ctx = newContext(opts, ws);
  wireSocket(ws, ctx);
  return {
    state: () => ctx.state,
    isPeerOnline: (id) => ctx.online.has(id),
    onMessage(fn) { ctx.handlers.add(fn); return () => ctx.handlers.delete(fn); },
    onPeerJoined(fn) { ctx.joinHandlers.add(fn); return () => ctx.joinHandlers.delete(fn); },
    send: (data) => sendSignal(ctx, data),
    close() {
      ctx.handlers.clear();
      ctx.joinHandlers.clear();
      ctx.setState("closed");
      try { ws.close(); } catch { /* já fechado */ }
    },
  };
}
