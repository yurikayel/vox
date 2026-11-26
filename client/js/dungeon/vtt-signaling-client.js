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
/** Teto de mensagens guardadas até o WebSocket abrir (a oferta e alguns candidatos ICE). */
const MAX_PENDING = 32;

function parseFrame(raw) {
  if (typeof raw !== "string" || raw.length > VTT_MAX_SIGNAL_CHARS) return null;
  try {
    const data = JSON.parse(raw);
    return data && typeof data === "object" && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

/** Liga os eventos do WebSocket: registra o par ao abrir, solta a fila quando o nó confirma (`registered`) e filtra o que chega. */
function wireSocket(ws, ctx) {
  ws.onopen = () => {
    if (ctx.state === "closed") {
      ws.close();
      return;
    }
    ctx.transmit({ type: "register", peerId: ctx.opts.peerId });
  };
  ws.onclose = () => ctx.setState("closed");
  ws.onerror = () => ctx.setState("closed");
  ws.onmessage = (ev) => {
    const data = parseFrame(ev.data);
    if (data?.type === "registered" && data.peerId === ctx.opts.peerId && ctx.state === "connecting") {
      ctx.setState("open");
      ctx.pending.splice(0).forEach(ctx.transmit);
    }
    if (!data || !SIGNAL_TYPES.has(data.type)) return;
    ctx.handlers.forEach((fn) => { try { fn(data); } catch { /* um ouvinte ruim não derruba a sinalização */ } });
  };
}

/** Envia na hora quando aberto, guarda (com teto) enquanto conecta, recusa quando fechado ou fora do formato. */
function sendSignal(ctx, data) {
  if (!SIGNAL_TYPES.has(data?.type) || typeof data.to !== "string" || ctx.state === "closed") return false;
  if (ctx.state === "open") ctx.transmit(data);
  else if (ctx.pending.length < MAX_PENDING) ctx.pending.push(data);
  else return false;
  return true;
}

/**
 * Abre a sinalização da Mesa.
 * @param {object} opts Opções.
 * @param {string} opts.url Endereço `ws://` ou `wss://` do nó de sinalização.
 * @param {string} opts.peerId `routeId` local, registrado no nó.
 * @param {typeof WebSocket} [opts.WebSocketImpl] Implementação de WebSocket (testes); padrão: a global.
 * @param {(state: "connecting"|"open"|"closed") => void} [opts.onStatus] Estado do enlace; `open` só depois de o nó confirmar o registro.
 * @returns {{ send: (data: object) => boolean, onMessage: (fn: Function) => Function, close: () => void, state: () => string }}
 *   Objeto no formato que `createRtcVttTransport` espera em `signaling`.
 */
export function createVttSignalingClient(opts) {
  const Impl = opts.WebSocketImpl || globalThis.WebSocket;
  if (typeof Impl !== "function") throw new Error("WebSocket indisponível neste navegador.");
  const ws = new Impl(opts.url);
  const ctx = { opts, handlers: new Set(), pending: [], state: "connecting", transmit: (data) => ws.send(JSON.stringify(data)) };
  ctx.setState = (next) => {
    if (ctx.state === next) return;
    ctx.state = next;
    opts.onStatus?.(next);
  };
  wireSocket(ws, ctx);
  return {
    state: () => ctx.state,
    onMessage(fn) { ctx.handlers.add(fn); return () => ctx.handlers.delete(fn); },
    send: (data) => sendSignal(ctx, data),
    close() {
      ctx.pending.length = 0;
      ctx.handlers.clear();
      ctx.setState("closed");
      try { ws.close(); } catch { /* já fechado */ }
    },
  };
}
