/**
 * @file Relay Nostr NIP-01 mínimo em memória para testes E2E locais (PM-99).
 * Suporta WebSocket RFC 6455 sem dependências externas e repassa eventos
 * efêmeros (kind 25050) entre assinantes ativos sem gravar nada em disco.
 */
import http from "node:http";
import crypto from "node:crypto";

const WS_MAGIC_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

/** Codifica um texto UTF-8 como quadro WebSocket não mascarado (servidor -> cliente). */
export function encodeWsFrame(opcode, payloadBuf) {
  const len = payloadBuf.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payloadBuf]);
}

/**
 * Lê o tamanho do payload de um quadro WebSocket, com o campo estendido de 16 ou 64 bits quando há.
 * @param {Buffer} buf Bytes do quadro.
 * @param {number} rawLen Tamanho de 7 bits do cabeçalho.
 * @returns {{length: number, offset: number}|null}
 */
function readExtendedLength(buf, rawLen) {
  if (rawLen < 126) return { length: rawLen, offset: 2 };
  if (rawLen === 126) {
    if (buf.length < 4) return null;
    return { length: buf.readUInt16BE(2), offset: 4 };
  }
  if (buf.length < 10) return null;
  return { length: Number(buf.readBigUInt64BE(2)), offset: 10 };
}

/** Decodifica quadros WebSocket completos de `buf` e devolve os quadros e o restante. */
export function decodeWsFrames(buf) {
  const frames = [];
  let cursor = 0;
  while (cursor + 2 <= buf.length) {
    const slice = buf.subarray(cursor);
    const opcode = slice[0] & 0x0f;
    const masked = (slice[1] & 0x80) !== 0;
    const meta = readExtendedLength(slice, slice[1] & 0x7f);
    if (!meta) break;
    const maskLen = masked ? 4 : 0;
    const frameSize = meta.offset + maskLen + meta.length;
    if (slice.length < frameSize) break;
    const payloadStart = meta.offset + maskLen;
    const payload = Buffer.from(slice.subarray(payloadStart, frameSize));
    if (masked) {
      const mask = slice.subarray(meta.offset, payloadStart);
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
    }
    frames.push({ opcode, payload });
    cursor += frameSize;
  }
  return { frames, rest: buf.subarray(cursor) };
}

/**
 * Confere se o evento casa com os filtros de tag (`#x`) do pedido.
 * @param {object} event Evento Nostr.
 * @param {object} filter Filtro do pedido `REQ`.
 * @returns {boolean}
 */
function matchesTagFilters(event, filter) {
  const tags = Array.isArray(event?.tags) ? event.tags : [];
  for (const [key, expected] of Object.entries(filter || {})) {
    if (!key.startsWith("#") || !Array.isArray(expected)) continue;
    const tagName = key.slice(1);
    const hit = tags.some((t) => Array.isArray(t) && t[0] === tagName && expected.includes(t[1]));
    if (!hit) return false;
  }
  return true;
}

/** Verifica se um evento Nostr casa com um filtro NIP-01 (`kinds`, `authors`, `#t`, `#p`). */
export function matchesNostrFilter(event, filter) {
  if (!filter || typeof filter !== "object") return false;
  if (Array.isArray(filter.kinds) && !filter.kinds.includes(event?.kind)) return false;
  if (Array.isArray(filter.authors) && !filter.authors.includes(event?.pubkey)) return false;
  return matchesTagFilters(event, filter);
}

/**
 * Envia um valor como quadro WebSocket de texto (JSON), se o socket ainda aceita escrita.
 * @param {net.Socket} socket Socket do cliente.
 * @param {unknown} value Valor a serializar.
 */
function sendJsonFrame(socket, value) {
  if (socket.destroyed || !socket.writable) return;
  socket.write(encodeWsFrame(0x1, Buffer.from(JSON.stringify(value), "utf8")));
}

/**
 * Trata uma mensagem Nostr do cliente (`EVENT`, `REQ` ou `CLOSE`).
 * @param {object} client Cliente conectado.
 * @param {string} rawText Texto bruto da mensagem.
 * @param {Set<object>} clients Clientes conectados.
 * @param {object} stats Contadores do relay.
 */
function handleNostrMessage(client, rawText, clients, stats) {
  let msg;
  try { msg = JSON.parse(rawText); } catch { return; }
  if (!Array.isArray(msg) || typeof msg[0] !== "string") return;
  const cmd = msg[0];
  if (cmd === "REQ" && typeof msg[1] === "string") {
    client.subs.set(msg[1], msg.slice(2));
    sendJsonFrame(client.socket, ["EOSE", msg[1]]);
    return;
  }
  if (cmd === "CLOSE" && typeof msg[1] === "string") {
    client.subs.delete(msg[1]);
    return;
  }
  if (cmd === "EVENT" && msg[1]?.id) {
    stats.events += 1;
    sendJsonFrame(client.socket, ["OK", msg[1].id, true, ""]);
    fanOutEvent(clients, msg[1]);
  }
}

/**
 * Entrega o evento aos clientes cujas inscrições casam com ele.
 * @param {Set<object>} clients Clientes conectados.
 * @param {object} event Evento Nostr.
 */
function fanOutEvent(clients, event) {
  for (const client of clients) {
    for (const [subId, filters] of client.subs.entries()) {
      if (filters.some((f) => matchesNostrFilter(event, f))) {
        sendJsonFrame(client.socket, ["EVENT", subId, event]);
      }
    }
  }
}

/**
 * Registra um cliente WebSocket e passa a ler os quadros que ele envia.
 * @param {net.Socket} socket Socket do cliente.
 * @param {Set<object>} clients Clientes conectados.
 * @param {object} stats Contadores do relay.
 */
function attachWsClient(socket, clients, stats) {
  const client = { socket, subs: new Map(), pending: Buffer.alloc(0) };
  clients.add(client);
  socket.on("data", (chunk) => {
    client.pending = Buffer.concat([client.pending, chunk]);
    const { frames, rest } = decodeWsFrames(client.pending);
    client.pending = rest;
    for (const frame of frames) {
      if (frame.opcode === 0x8) { socket.end(encodeWsFrame(0x8, Buffer.alloc(0))); return; }
      if (frame.opcode === 0x9) { socket.write(encodeWsFrame(0xa, frame.payload)); continue; }
      if (frame.opcode === 0x1) handleNostrMessage(client, frame.payload.toString("utf8"), clients, stats);
    }
  });
  socket.on("close", () => clients.delete(client));
  socket.on("error", () => clients.delete(client));
}

/**
 * Cria o controle do relay (endereço, contadores e encerramento).
 * @param {http.Server} server Servidor HTTP.
 * @param {string} host Host em que escuta.
 * @param {Set<object>} clients Clientes conectados.
 * @param {object} stats Contadores do relay.
 * @returns {object}
 */
function createRelayController(server, host, clients, stats) {
  const addr = server.address();
  return {
    url: `ws://${host}:${addr.port}`,
    port: addr.port,
    getStats: () => ({ ...stats, connectedClients: clients.size }),
    close: () => new Promise((done) => {
      for (const c of clients) c.socket.destroy();
      server.close(() => done());
    }),
  };
}

/**
 * Conclui o handshake de upgrade para WebSocket e registra o cliente.
 * @param {http.IncomingMessage} req Pedido de upgrade.
 * @param {net.Socket} socket Socket do cliente.
 * @param {Set<object>} clients Clientes conectados.
 * @param {object} stats Contadores do relay.
 */
function handleUpgrade(req, socket, clients, stats) {
  const key = String(req.headers["sec-websocket-key"] || "");
  const accept = crypto.createHash("sha1").update(key + WS_MAGIC_GUID).digest("base64");
  socket.write(
    `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  attachWsClient(socket, clients, stats);
}

/** Sobe um relay Nostr efêmero local e devolve `{ url, port, getStats, close }`. */
export function startEphemeralNostrRelay({ host = "127.0.0.1", port = 0 } = {}) {
  const clients = new Set();
  const stats = { events: 0 };
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "vox-nostr-ephemeral-e2e" }));
  });
  server.on("upgrade", (req, socket) => handleUpgrade(req, socket, clients, stats));
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(createRelayController(server, host, clients, stats)));
  });
}
