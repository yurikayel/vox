/**
 * REV-09 — sinalização WebRTC por relays Nostr públicos (eventos efêmeros kind 25050).
 *
 * Roda em paralelo ao servidor WebSocket (Render) e entrega ao webrtc-peer.js as MESMAS mensagens
 * que o servidor entrega: peer-joined, offer, answer, ice. Assim o resto do código não muda.
 *
 * Privacidade:
 * - o "hello" público leva só um peerId aleatório da sessão e uma chave Nostr descartável;
 * - endereço, chave de DM, SDP e candidatos ICE vão CIFRADOS para o outro par
 *   (ECDH secp256k1 → SHA-256 → AES-GCM). Decifrar com sucesso autentica o remetente.
 * Pool de relays validado pelo teste de fumaça (REV-19, scripts/nostr-smoke.mjs).
 */
import { finalizeEvent, generateSecretKey, getPublicKey, getSharedSecret, bytesToHex, sha256 } from "./nostr-event.js";

export const SIGNAL_KIND = 25050;
export const DEFAULT_ROOM = "vox-brasil-v1";
const KEY_LABEL = new TextEncoder().encode("vox-nostr-signal-v1");
const SEEN_LIMIT = 2000;
const HELLO_INTERVAL_MS = 120000;
/** PM-17: reconexão com espera crescente e troca de relay depois de falhas seguidas. */
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 60000;
const MAX_FAILURES = 3;

const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));

async function deriveKey(secretKey, theirPubHex) {
  const shared = getSharedSecret(secretKey, theirPubHex);
  const raw = await sha256(new Uint8Array([...KEY_LABEL, ...shared]));
  return globalThis.crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptFor(secretKey, theirPubHex, obj) {
  const key = await deriveKey(secretKey, theirPubHex);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
  return b64(new Uint8Array([...iv, ...ct]));
}

export async function decryptFrom(secretKey, theirPubHex, content) {
  const bytes = unb64(content);
  const key = await deriveKey(secretKey, theirPubHex);
  const plain = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12));
  return JSON.parse(new TextDecoder().decode(plain));
}

const tagValue = (event, name) => (event.tags || []).find((t) => t[0] === name)?.[1] || "";

function publish(ctx, event) {
  const frame = JSON.stringify(["EVENT", event]);
  for (const ws of ctx.sockets) {
    if (ws.readyState === 1) ws.send(frame);
  }
}

async function sendHello(ctx) {
  const content = JSON.stringify({ type: "hello", from: ctx.peerId });
  publish(ctx, await finalizeEvent({ kind: SIGNAL_KIND, tags: [["t", ctx.room]], content }, ctx.sk));
}

async function sendDirected(ctx, theirPub, payload) {
  const content = await encryptFor(ctx.sk, theirPub, { ...payload, from: ctx.peerId });
  publish(ctx, await finalizeEvent({ kind: SIGNAL_KIND, tags: [["p", theirPub], ["t", ctx.room]], content }, ctx.sk));
}

async function sendPeerInfo(ctx, remotePeerId, reply) {
  const theirPub = ctx.pubByPeer.get(remotePeerId);
  if (!theirPub || ctx.infoSent.has(remotePeerId)) return;
  ctx.infoSent.add(remotePeerId);
  const { address = "", dmPub = null } = ctx.identity();
  await sendDirected(ctx, theirPub, { type: "peer-info", address, dmPub, reply });
}

async function onHello(ctx, event, body) {
  if (!body?.from || body.from === ctx.peerId || ctx.pubByPeer.has(body.from)) return;
  ctx.pubByPeer.set(body.from, event.pubkey);
  await sendPeerInfo(ctx, body.from, true);
}

async function onPeerInfo(ctx, event, msg) {
  if (!ctx.pubByPeer.has(msg.from)) ctx.pubByPeer.set(msg.from, event.pubkey);
  ctx.onMessage({ type: "peer-joined", peerId: msg.from, address: msg.address || "", dmPub: msg.dmPub || null });
  if (msg.reply) await sendPeerInfo(ctx, msg.from, false);
}

async function onDirected(ctx, event) {
  const msg = await decryptFrom(ctx.sk, event.pubkey, event.content);
  if (!msg?.from || msg.from === ctx.peerId) return;
  if (msg.type === "peer-info") return onPeerInfo(ctx, event, msg);
  if (["offer", "answer", "ice"].includes(msg.type)) {
    ctx.pubByPeer.set(msg.from, event.pubkey);
    ctx.onMessage(msg);
  }
}

function remember(ctx, id) {
  if (ctx.seen.has(id)) return false;
  ctx.seen.add(id);
  if (ctx.seen.size > SEEN_LIMIT) ctx.seen.delete(ctx.seen.values().next().value);
  return true;
}

async function handleEvent(ctx, event) {
  if (!event?.id || event.pubkey === ctx.pub || !remember(ctx, event.id)) return;
  if (tagValue(event, "t") !== ctx.room) return;
  const to = tagValue(event, "p");
  try {
    if (!to) await onHello(ctx, event, JSON.parse(event.content));
    else if (to === ctx.pub) await onDirected(ctx, event);
  } catch {
    /* evento malformado ou não destinado a nós */
  }
}

function openRelay(ctx, slot) {
  let ws;
  try {
    ws = new ctx.WS(slot.url);
  } catch {
    scheduleReconnect(ctx, slot, false);
    return;
  }
  const subId = `vox-${Math.random().toString(36).slice(2, 8)}`;
  trackRelayStatus(ctx, ws, () => {
    slot.failures = 0;
    ws.send(JSON.stringify(["REQ", subId, { kinds: [SIGNAL_KIND], "#t": [ctx.room], since: Math.floor(Date.now() / 1000) - 30 }]));
    void sendHello(ctx);
  }, (wasOpen) => {
    ctx.sockets = ctx.sockets.filter((s) => s !== ws);
    scheduleReconnect(ctx, slot, wasOpen);
  });
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (Array.isArray(msg) && msg[0] === "EVENT" && msg[1] === subId) void handleEvent(ctx, msg[2]);
    } catch {}
  };
  ws.onerror = () => {};
  ctx.sockets.push(ws);
}

/** PM-17: próximo relay do pool que não está em nenhuma vaga (ou o mesmo, se o pool acabou). */
function nextSpareRelay(ctx, slot) {
  const inUse = new Set(ctx.slots.map((s) => s.url));
  const start = ctx.pool.indexOf(slot.url);
  for (let i = 1; i <= ctx.pool.length; i++) {
    const candidate = ctx.pool[(start + i) % ctx.pool.length];
    if (!inUse.has(candidate)) return candidate;
  }
  return slot.url;
}

/**
 * PM-17: relay que cai volta sozinho, com espera crescente (1 s, 2 s, 4 s… até 60 s).
 * Depois de MAX_FAILURES tentativas sem abrir, a vaga troca para outro relay do pool.
 */
function scheduleReconnect(ctx, slot, wasOpen) {
  if (ctx.stopped) return;
  slot.failures = wasOpen ? 0 : slot.failures + 1;
  if (slot.failures >= MAX_FAILURES) {
    slot.url = nextSpareRelay(ctx, slot);
    slot.failures = 0;
  }
  const delay = Math.min(RECONNECT_MAX_MS, ctx.reconnectBaseMs * 2 ** slot.failures);
  clearTimeout(slot.timer);
  slot.timer = setTimeout(() => {
    slot.timer = null;
    if (!ctx.stopped) openRelay(ctx, slot);
  }, delay);
}

/** LAN-21: conta o relay como "abrindo" até abrir ou fechar; cada socket conta uma vez. */
function trackRelayStatus(ctx, ws, onOpen, onClosed) {
  let phase = "pending";
  ctx.pending += 1;
  notifyStatus(ctx);
  ws.onopen = () => {
    phase = "open";
    ctx.pending -= 1;
    ctx.open += 1;
    notifyStatus(ctx);
    onOpen();
  };
  ws.onclose = () => {
    const wasOpen = phase === "open";
    if (wasOpen) ctx.open -= 1;
    else if (phase === "pending") ctx.pending -= 1;
    phase = "closed";
    notifyStatus(ctx);
    onClosed?.(wasOpen);
  };
}

/** LAN-21: avisa quantos relays estão abertos e quantos ainda tentam abrir. */
function notifyStatus(ctx) {
  ctx.onStatus?.({ open: ctx.open, pending: ctx.pending });
}

function stopTransport(ctx) {
  ctx.stopped = true;
  clearInterval(ctx.timer);
  for (const slot of ctx.slots) {
    clearTimeout(slot.timer);
    slot.timer = null;
  }
  for (const ws of ctx.sockets) {
    ws.onclose = null;
    try {
      ws.close();
    } catch {}
  }
  ctx.sockets = [];
  ctx.open = 0;
  ctx.pending = 0;
}

function sendSignal(ctx, msg) {
  const theirPub = ctx.pubByPeer.get(msg?.to);
  if (!theirPub) return false;
  const payload = { ...msg };
  delete payload.to;
  void sendDirected(ctx, theirPub, payload);
  return true;
}

function createContext(opts) {
  const sk = generateSecretKey();
  const pool = [...new Set((opts.relays || []).filter(Boolean))];
  return {
    sk,
    pub: bytesToHex(getPublicKey(sk)),
    peerId: opts.peerId,
    room: opts.room || DEFAULT_ROOM,
    pool,
    slots: pool.slice(0, opts.maxRelays || 3).map((url) => ({ url, failures: 0, timer: null })),
    reconnectBaseMs: opts.reconnectBaseMs || RECONNECT_BASE_MS,
    stopped: false,
    WS: opts.WebSocketImpl || globalThis.WebSocket,
    onMessage: opts.onMessage,
    onStatus: opts.onStatus,
    open: 0,
    pending: 0,
    identity: () => (typeof opts.getIdentity === "function" ? opts.getIdentity() || {} : {}),
    sockets: [],
    pubByPeer: new Map(),
    infoSent: new Set(),
    seen: new Set(),
    timer: null,
  };
}

/**
 * @param {{ relays: string[], room?: string, peerId: string, getIdentity?: () => ({address?: string, dmPub?: any}),
 *   onMessage: (msg: object) => void, onStatus?: (s: {open: number, pending: number}) => void,
 *   WebSocketImpl?: any, maxRelays?: number, reconnectBaseMs?: number }} opts
 */
export function createNostrTransport(opts) {
  const ctx = createContext(opts);
  return {
    publicKey: ctx.pub,
    start() {
      ctx.stopped = false;
      ctx.slots.forEach((slot) => openRelay(ctx, slot));
      ctx.timer = setInterval(() => void sendHello(ctx), HELLO_INTERVAL_MS);
    },
    stop: () => stopTransport(ctx),
    knows: (peerId) => ctx.pubByPeer.has(peerId),
    /** Relays abertos e ainda abrindo (LAN-21). */
    status: () => ({ open: ctx.open, pending: ctx.pending }),
    /** Relays nas vagas agora (PM-17: muda quando um relay é trocado). */
    relays: () => ctx.slots.map((s) => s.url),
    /** Envia offer/answer/ice para `msg.to` (peerId). Retorna false se o par não é conhecido por Nostr. */
    send: (msg) => sendSignal(ctx, msg),
    _handleEvent: (event) => handleEvent(ctx, event),
  };
}
