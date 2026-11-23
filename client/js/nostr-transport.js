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
import {
  finalizeEvent, verifyEvent, isFreshEvent, createSeenWindow, generateSecretKey, getPublicKey, getSharedSecret, bytesToHex, sha256,
} from "./nostr-event.js";
import { randomBase36 } from "./shared/html.js";

/** Tipo de evento efêmero Nostr usado na sinalização WebRTC do Vox. */
export const SIGNAL_KIND = 25050;
/** Sala padrão de descoberta WebRTC nos relays Nostr. */
export const DEFAULT_ROOM = "vox-brasil-v1";
const KEY_LABEL = new TextEncoder().encode("vox-nostr-signal-v1");
const HEX64 = /^[0-9a-f]{64}$/;
const SIGNAL_TYPES = new Set(["offer", "answer", "ice"]);
/** Tetos de entrada vinda da rede: o relay não limita por nós. */
const MAX_CONTENT_CHARS = 128 * 1024;
const MAX_PEER_ID_CHARS = 128;
const MAX_ADDRESS_CHARS = 256;
const MAX_DMPUB_JSON_CHARS = 4096;
const HELLO_INTERVAL_MS = 120000;
/** PM-17: reconexão com espera crescente e troca de relay depois de falhas seguidas. */
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 60000;
const MAX_FAILURES = 3;

/** Base64 em blocos: `String.fromCharCode(...bytes)` estoura a pilha com payload grande. */
const b64 = (bytes) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
/**
 * Decodifica base64 em bytes.
 * @param {string} str Texto base64
 * @returns {Uint8Array} Bytes.
 */
const unb64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));

/**
 * Deriva a chave AES-GCM do segredo compartilhado com o outro par.
 * @param {Uint8Array} secretKey Chave secreta local
 * @param {string} theirPubHex Chave pública do outro par (hex)
 * @returns {Promise<CryptoKey>} Chave AES.
 */
async function deriveKey(secretKey, theirPubHex) {
  const shared = getSharedSecret(secretKey, theirPubHex);
  const raw = await sha256(new Uint8Array([...KEY_LABEL, ...shared]));
  return globalThis.crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/**
 * Cifra um objeto JSON para outro par usando ECDH secp256k1 + AES-GCM.
 * @param {Uint8Array} secretKey Chave secreta Nostr efêmera local.
 * @param {string} theirPubHex Chave pública hexadecimal do destinatário.
 * @param {object} obj Payload JSON a cifrar.
 * @returns {Promise<string>} Texto cifrado em Base64 (`iv || ciphertext`).
 */
export async function encryptFor(secretKey, theirPubHex, obj) {
  const key = await deriveKey(secretKey, theirPubHex);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
  return b64(new Uint8Array([...iv, ...ct]));
}

/**
 * Decifra conteúdo Base64 recebido via evento Nostr direcionado.
 * @param {Uint8Array} secretKey Chave secreta Nostr efêmera local.
 * @param {string} theirPubHex Chave pública hexadecimal do remetente.
 * @param {string} content Conteúdo cifrado em Base64.
 * @returns {Promise<object>} Objeto JSON decifrado.
 */
export async function decryptFrom(secretKey, theirPubHex, content) {
  const bytes = unb64(content);
  const key = await deriveKey(secretKey, theirPubHex);
  const plain = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12));
  return JSON.parse(new TextDecoder().decode(plain));
}

/**
 * Valor da primeira tag com o nome dado; evento sem lista de tags (ou com tag que não é lista) dá "".
 * @param {{tags?: unknown}|null|undefined} event Evento recebido do relay, sem confiança no formato.
 * @param {string} name Nome da tag (ex.: "p", "t").
 * @returns {string} Valor da tag ou string vazia.
 */
const tagValue = (event, name) => {
  const tags = Array.isArray(event?.tags) ? event.tags : [];
  return tags.find((t) => Array.isArray(t) && t[0] === name)?.[1] || "";
};

/**
 * Publica o evento em todos os relays conectados.
 * @param {object} ctx Contexto do transporte
 * @param {object} event Evento assinado
 */
function publish(ctx, event) {
  const frame = JSON.stringify(["EVENT", event]);
  for (const ws of ctx.sockets) {
    if (ws.readyState === 1) ws.send(frame);
  }
}

/**
 * Anuncia a presença na sala com um evento `hello`.
 * @param {object} ctx Contexto do transporte
 * @returns {Promise<void>} Conclui após publicar.
 */
async function sendHello(ctx) {
  const content = JSON.stringify({ type: "hello", from: ctx.peerId });
  publish(ctx, await finalizeEvent({ kind: SIGNAL_KIND, tags: [["t", ctx.room]], content }, ctx.sk));
}

/**
 * Envia uma mensagem cifrada a um par.
 * @param {object} ctx Contexto do transporte
 * @param {string} theirPub Chave pública do par
 * @param {object} payload Conteúdo
 * @returns {Promise<void>} Conclui após publicar.
 */
async function sendDirected(ctx, theirPub, payload) {
  const content = await encryptFor(ctx.sk, theirPub, { ...payload, from: ctx.peerId });
  publish(ctx, await finalizeEvent({ kind: SIGNAL_KIND, tags: [["p", theirPub], ["t", ctx.room]], content }, ctx.sk));
}

/**
 * Envia os dados do próprio par a um par remoto (uma vez por par).
 * @param {object} ctx Contexto do transporte
 * @param {string} remotePeerId Par de destino
 * @param {boolean} reply Se é resposta a um `hello`
 * @returns {Promise<void>} Conclui após enviar.
 */
async function sendPeerInfo(ctx, remotePeerId, reply) {
  const theirPub = ctx.pubByPeer.get(remotePeerId);
  if (!theirPub || ctx.infoSent.has(remotePeerId)) return;
  ctx.infoSent.add(remotePeerId);
  const { address = "", dmPub = null } = ctx.identity();
  await sendDirected(ctx, theirPub, { type: "peer-info", address, dmPub, reply });
}

/**
 * Diz se o valor é um texto de 64 caracteres hexadecimais.
 * @param {*} v Valor
 * @returns {boolean} `true` se for.
 */
const isHex64 = (v) => typeof v === "string" && HEX64.test(v);
/**
 * Diz se o valor é um id de par válido (texto não vazio, dentro do limite).
 * @param {*} v Valor
 * @returns {boolean} `true` se for.
 */
const isPeerId = (v) => typeof v === "string" && v.length > 0 && v.length <= MAX_PEER_ID_CHARS;
/**
 * Diz se o valor é um objeto simples (não nulo, não lista).
 * @param {*} v Valor
 * @returns {boolean} `true` se for.
 */
const isPlainObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Primeiro pubkey que reivindica um peerId fica com ele; quem chega depois com outra chave é recusado.
 * @returns {"new"|"same"|"conflict"} Situação do par diante do pubkey que o reivindicou agora.
 */
function claimPeer(ctx, peerId, pubkey) {
  const known = ctx.pubByPeer.get(peerId);
  if (known === undefined) {
    ctx.pubByPeer.set(peerId, pubkey);
    return "new";
  }
  return known === pubkey ? "same" : "conflict";
}

/** Endereço e chave de DM de um `peer-info`: tipo e tamanho conferidos; `null` se algum campo é inválido. */
function sanitizePeerInfo(msg) {
  const address = msg.address ?? "";
  const dmPub = msg.dmPub ?? null;
  const addressOk = typeof address === "string" && address.length <= MAX_ADDRESS_CHARS;
  const dmPubOk = dmPub === null || (isPlainObject(dmPub) && JSON.stringify(dmPub).length <= MAX_DMPUB_JSON_CHARS);
  return addressOk && dmPubOk ? { address, dmPub } : null;
}

/**
 * Trata um `hello` de outro par.
 * @param {object} ctx Contexto do transporte
 * @param {object} event Evento
 * @param {object} body Conteúdo
 * @returns {Promise<void>} Conclui após tratar.
 */
async function onHello(ctx, event, body) {
  if (!isPeerId(body?.from) || body.from === ctx.peerId) return;
  if (claimPeer(ctx, body.from, event.pubkey) !== "new") return;
  await sendPeerInfo(ctx, body.from, true);
}

/**
 * Trata os dados de par recebidos e avisa que ele entrou.
 * @param {object} ctx Contexto do transporte
 * @param {object} event Evento
 * @param {object} msg Mensagem
 * @returns {Promise<void>} Conclui após tratar.
 */
async function onPeerInfo(ctx, event, msg) {
  const info = sanitizePeerInfo(msg);
  if (!info || claimPeer(ctx, msg.from, event.pubkey) === "conflict") return;
  ctx.onMessage({ type: "peer-joined", peerId: msg.from, address: info.address, dmPub: info.dmPub });
  if (msg.reply) await sendPeerInfo(ctx, msg.from, false);
}

/**
 * Trata uma mensagem cifrada endereçada a este par.
 * @param {object} ctx Contexto do transporte
 * @param {object} event Evento
 * @returns {Promise<void>} Conclui após tratar.
 */
async function onDirected(ctx, event) {
  const msg = await decryptFrom(ctx.sk, event.pubkey, event.content);
  if (!isPeerId(msg?.from) || msg.from === ctx.peerId) return;
  if (msg.type === "peer-info") return onPeerInfo(ctx, event, msg);
  if (!SIGNAL_TYPES.has(msg.type) || claimPeer(ctx, msg.from, event.pubkey) === "conflict") return;
  ctx.onMessage(msg);
}

/** Checagens baratas, antes da verificação Schnorr (cara em JS puro): formato, sala, destinatário e frescor. */
function isCandidate(ctx, event) {
  if (!isPlainObject(event) || !isHex64(event.id) || !isHex64(event.pubkey)) return false;
  if (event.kind !== SIGNAL_KIND || event.pubkey === ctx.pub) return false;
  if (typeof event.content !== "string" || event.content.length > MAX_CONTENT_CHARS) return false;
  if (tagValue(event, "t") !== ctx.room) return false;
  const to = tagValue(event, "p");
  return (!to || to === ctx.pub) && isFreshEvent(event);
}

/**
 * Nenhum efeito antes de id e assinatura conferirem; só evento verificado entra na janela de replay.
 * O `hello` não leva campo novo: a assinatura do próprio evento cobre pubkey, sala (tag t), peerId e data.
 */
async function handleEvent(ctx, event) {
  if (!isCandidate(ctx, event) || ctx.seen.has(event.id)) return;
  if (!(await verifyEvent(event)) || !ctx.seen.add(event.id)) return;
  try {
    if (!tagValue(event, "p")) await onHello(ctx, event, JSON.parse(event.content));
    else await onDirected(ctx, event);
  } catch {
    /* evento malformado ou não destinado a nós */
  }
}

/**
 * Abre a conexão com um relay e liga os tratadores.
 * @param {object} ctx Contexto do transporte
 * @param {object} slot Vaga do relay
 */
function openRelay(ctx, slot) {
  let ws;
  try {
    ws = new ctx.WS(slot.url);
  } catch {
    ctx.onRelayAttempt?.({ ok: false, durationMs: 0 });
    scheduleReconnect(ctx, slot, false);
    return;
  }
  const subId = `vox-${randomBase36(6)}`;
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
  const startedAt = Date.now();
  ctx.pending += 1;
  notifyStatus(ctx);
  ws.onopen = () => {
    phase = "open";
    ctx.pending -= 1;
    ctx.open += 1;
    ctx.onRelayAttempt?.({ ok: true, durationMs: Date.now() - startedAt });
    notifyStatus(ctx);
    onOpen();
  };
  ws.onclose = () => {
    const wasOpen = phase === "open";
    if (wasOpen) ctx.open -= 1;
    else if (phase === "pending") {
      ctx.pending -= 1;
      ctx.onRelayAttempt?.({ ok: false, durationMs: Date.now() - startedAt });
    }
    phase = "closed";
    notifyStatus(ctx);
    onClosed?.(wasOpen);
  };
}

/** LAN-21: avisa quantos relays estão abertos e quantos ainda tentam abrir. */
function notifyStatus(ctx) {
  ctx.onStatus?.({ open: ctx.open, pending: ctx.pending });
}

/**
 * Encerra o transporte: para o relógio e fecha os relays.
 * @param {object} ctx Contexto do transporte
 */
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

/**
 * Envia um sinal a um par conhecido.
 * @param {object} ctx Contexto do transporte
 * @param {object} msg Mensagem (`to` é o par de destino)
 * @returns {boolean} `true` se o par é conhecido e o envio foi iniciado.
 */
function sendSignal(ctx, msg) {
  const theirPub = ctx.pubByPeer.get(msg?.to);
  if (!theirPub) return false;
  const payload = { ...msg };
  delete payload.to;
  void sendDirected(ctx, theirPub, payload);
  return true;
}

/**
 * Cria o contexto do transporte com chave nova e a lista de relays.
 * @param {object} opts Opções (`relays`, sala, id do par, etc.)
 * @returns {object} Contexto.
 */
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
    onRelayAttempt: opts.onRelayAttempt,
    open: 0,
    pending: 0,
    identity: () => (typeof opts.getIdentity === "function" ? opts.getIdentity() || {} : {}),
    sockets: [],
    pubByPeer: new Map(),
    infoSent: new Set(),
    seen: createSeenWindow(),
    timer: null,
  };
}

/**
 * Cria o transporte de sinalização WebRTC sobre relays Nostr.
 * @param {{ relays: string[], room?: string, peerId: string, getIdentity?: () => ({address?: string, dmPub?: any}),
 *   onMessage: (msg: object) => void, onStatus?: (s: {open: number, pending: number}) => void,
 *   WebSocketImpl?: any, maxRelays?: number, reconnectBaseMs?: number }} opts Opções de conexão e callbacks.
 * @returns {{ publicKey: string, start: () => void, stop: () => void, knows: (peerId: string) => boolean, status: () => { open: number, pending: number }, relays: () => string[], send: (msg: object) => boolean, _handleEvent: (event: object) => Promise<void> }} Controlador do transporte.
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
