/**
 * @file Primitivas puras de assinatura ECDSA P-256, convites de sala e transferência de blobs
 * em chunks de 16 KiB com verificação SHA-256 para a Mesa Soberana P2P (E2).
 * @module dungeon/vtt-sync-codec
 */
import { sha256Hex } from "../rpg-crypto-table.js";
import { isValidVttId } from "./vtt-schema.js";

/** Tamanho padrão de cada bloco `BLOB_CHUNK` em bytes (16 KiB). */
export const BLOB_CHUNK_BYTES = 16 * 1024;
/** Teto máximo de tamanho de blob aceito pela rede P2P (16 MiB — INV-4). */
export const MAX_SYNC_BLOB_BYTES = 16 * 1024 * 1024;

const ENC = new TextEncoder();
const ECDSA_GEN = { name: "ECDSA", namedCurve: "P-256" };
const ECDSA_SIG = { name: "ECDSA", hash: "SHA-256" };

function bytesToBase64Url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(str) {
  const norm = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = norm.length % 4 === 0 ? "" : "=".repeat(4 - (norm.length % 4));
  const bin = atob(norm + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Gera uma chave de sala aleatória de 24 bytes em base64url (mantida no fragmento `#k=`).
 * @returns {string} Chave de sala segura.
 */
export function generateRoomKey() {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(24)));
}

/**
 * Monta o link de convite da mesa P2P mantendo a `roomKey` fora da query string (`#k=`).
 * @param {{ tableId: string, gmRouteId: string, roomKey: string }} opts Parâmetros da sala.
 * @returns {string} Hash URL de convite.
 */
export function buildRoomInviteHref({ tableId, gmRouteId, roomKey }) {
  return `#/dungeon/entrar/${encodeURIComponent(tableId)}?gm=${encodeURIComponent(gmRouteId)}#k=${encodeURIComponent(roomKey)}`;
}

/**
 * Faz parsing estrito de um link de convite `#/dungeon/entrar/:tableId?gm=:gm#k=:roomKey`.
 * @param {string} href URL ou fragmento de convite.
 * @returns {{ tableId: string, gmRouteId: string, roomKey: string }|null} Dados válidos ou `null`.
 */
export function parseRoomInviteHref(href) {
  const m = String(href || "").match(/#\/dungeon\/entrar\/([^?#]+)\?gm=([^#&]+)#k=([A-Za-z0-9_-]{16,128})$/);
  if (!m) return null;
  const tableId = decodeURIComponent(m[1]);
  const gmRouteId = decodeURIComponent(m[2]);
  const roomKey = decodeURIComponent(m[3]);
  if (!isValidVttId(tableId) || !gmRouteId.trim()) return null;
  return { tableId, gmRouteId, roomKey };
}

/**
 * Deriva o identificador de rota determinístico (`vx_...`) a partir da chave pública ECDSA P-256 em JWK.
 * @param {object} pubKeyJwk Chave pública JWK (`x`, `y`, `crv: "P-256"`).
 * @returns {Promise<string>} Identificador `vx_<20 hex>`.
 */
export async function deriveRouteIdFromJwk(pubKeyJwk) {
  const canonical = JSON.stringify({ crv: pubKeyJwk?.crv, kty: pubKeyJwk?.kty, x: pubKeyJwk?.x, y: pubKeyJwk?.y });
  const digest = await sha256Hex(ENC.encode(canonical));
  return `vx_${digest.slice(0, 20)}`;
}

/**
 * Gera um par de chaves ECDSA P-256 (WebCrypto) + `routeId` derivado para assinar operações `VttOp`.
 * @returns {Promise<{ publicKey: CryptoKey, privateKey: CryptoKey, publicJwk: object, routeId: string }>} Par de chaves.
 */
export async function generateVttKeypair() {
  const pair = await crypto.subtle.generateKey(ECDSA_GEN, true, ["sign", "verify"]);
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const routeId = await deriveRouteIdFromJwk(publicJwk);
  return { publicKey: pair.publicKey, privateKey: pair.privateKey, publicJwk, routeId };
}

function canonicalOpBytes(op) {
  return ENC.encode(JSON.stringify({
    opId: op.opId,
    type: op.type,
    payload: op.payload,
    actor: op.actor,
    lamport: op.lamport,
    ts: op.ts,
  }));
}

/**
 * Assina um `VttOp` com ECDSA P-256 vinculando `actor` ao `routeId` da chave pública (INV-7).
 * @param {object} op Operação `VttOp`.
 * @param {{ privateKey: CryptoKey, publicJwk: object, routeId: string }} keypair Par de chaves do autor.
 * @returns {Promise<object>} Operação assinada com `actor`, `pubKeyJwk` e `sig`.
 */
export async function signVttOp(op, keypair) {
  const signed = { ...op, actor: keypair.routeId };
  const rawSig = await crypto.subtle.sign(ECDSA_SIG, keypair.privateKey, canonicalOpBytes(signed));
  return { ...signed, pubKeyJwk: keypair.publicJwk, sig: bytesToBase64Url(new Uint8Array(rawSig)) };
}

/**
 * Verifica a assinatura ECDSA P-256 de um `VttOp` e confirma que `actor` coincide com a chave pública.
 * @param {object} op Operação assinada.
 * @returns {Promise<boolean>} `true` apenas se assinatura e identidade forem íntegras.
 */
export async function verifyVttOpSignature(op) {
  if (!op?.sig || !op?.pubKeyJwk || !op?.actor) return false;
  try {
    const derived = await deriveRouteIdFromJwk(op.pubKeyJwk);
    if (derived !== op.actor) return false;
    const pubKey = await crypto.subtle.importKey("jwk", op.pubKeyJwk, ECDSA_GEN, false, ["verify"]);
    return await crypto.subtle.verify(ECDSA_SIG, pubKey, base64UrlToBytes(op.sig), canonicalOpBytes(op));
  } catch {
    return false;
  }
}

/**
 * Divide um blob binário em mensagens `BLOB_CHUNK` de até 16 KiB para envio sobre WebRTC DataChannels.
 * @param {string} sha256 Digest SHA-256 hexadecimal esperado do blob completo.
 * @param {Uint8Array} bytes Conteúdo binário.
 * @param {number} [chunkSize=BLOB_CHUNK_BYTES] Tamanho máximo por bloco.
 * @returns {Array<object>} Lista ordenada de envelopes `BLOB_CHUNK`.
 */
export function splitBlobIntoChunks(sha256, bytes, chunkSize = BLOB_CHUNK_BYTES) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data.length > MAX_SYNC_BLOB_BYTES) throw new Error("Blob excede o limite de 16 MiB.");
  const step = Math.max(256, Math.trunc(Number(chunkSize) || BLOB_CHUNK_BYTES));
  const total = Math.max(1, Math.ceil(data.length / step));
  const out = [];
  for (let idx = 0; idx < total; idx += 1) {
    const slice = data.subarray(idx * step, Math.min(data.length, (idx + 1) * step));
    out.push({ kind: "BLOB_CHUNK", sha256, idx, total, dataB64: bytesToBase64Url(slice) });
  }
  return out;
}

function concatBlobChunks(chunks) {
  const size = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function parseChunkMeta(chunk) {
  const hash = String(chunk?.sha256 || "");
  const idx = Math.trunc(Number(chunk?.idx));
  const total = Math.trunc(Number(chunk?.total));
  const valid = Boolean(hash) && idx >= 0 && total >= 1 && idx < total && total <= 2048;
  return { valid, hash, idx, total };
}

async function finalizeAssembledBlob(hash, chunks) {
  const bytes = concatBlobChunks(chunks);
  const actual = await sha256Hex(bytes);
  if (actual !== hash) return { complete: false, error: "Hash SHA-256 do blob recebido não confere." };
  return { complete: true, sha256: hash, bytes };
}

/**
 * Cria um montador incremental de `BLOB_CHUNK` que valida limites e confere SHA-256 ao concluir.
 * @returns {{ pushChunk: (chunk: object) => Promise<{ complete: boolean, sha256?: string, bytes?: Uint8Array, error?: string }> }} Montador seguro.
 */
export function createBlobAssembler() {
  const pending = new Map();
  async function pushChunk(chunk) {
    const meta = parseChunkMeta(chunk);
    if (!meta.valid) return { complete: false, error: "Chunk de blob inválido." };
    const part = base64UrlToBytes(chunk.dataB64);
    const entry = pending.get(meta.hash) || { total: meta.total, received: 0, totalBytes: 0, chunks: new Array(meta.total) };
    if (entry.total !== meta.total) return { complete: false, error: "Total de chunks divergente." };
    if (!entry.chunks[meta.idx]) {
      entry.totalBytes += part.length;
      if (entry.totalBytes > MAX_SYNC_BLOB_BYTES) {
        pending.delete(meta.hash);
        return { complete: false, error: "Blob excede o limite máximo de 16 MiB." };
      }
      entry.chunks[meta.idx] = part;
      entry.received += 1;
      pending.set(meta.hash, entry);
    }
    if (entry.received < entry.total) return { complete: false };
    pending.delete(meta.hash);
    return finalizeAssembledBlob(meta.hash, entry.chunks);
  }
  return { pushChunk };
}
