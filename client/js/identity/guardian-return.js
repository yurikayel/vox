/**
 * @file Guardiões, parte 3c (spec `docs/specs/guardioes-v0.md` §7, THREAT-MODEL T25): pedir a conta de volta.
 * Lógica pura e o pedido pendente da aba; sem DOM e sem rede (o transporte fica em `app/guardian-return-flow.js`).
 *
 * - O pedido é `{o, k, t, n}`: a dona, a chave pública temporária comprimida, quando foi criado e um sorteio.
 *   Não carrega segredo nem nome: o guardião mostra o nome que ele mesmo conhece.
 * - O código curto (4 palavras) e a caixa temporária `vxtmp_` saem do hash do pedido e da chave temporária; a
 *   caixa não leva o `routeId` da dona.
 * - A resposta leva o pedaço como a dona assinou; o aparelho novo confere a assinatura, a dona, a divisão e, no
 *   fim, se a conta juntada é a pedida.
 */

import { BIP39_PT } from "../data/bip39-pt.js";
import { isWellFormedShare, SHARE_TYPE } from "./guardians.js";
import { bigIntTo32Bytes, bytesToBigInt, compressPoint, decompressPoint } from "./p256.js";
import { combineShares } from "../shamir-gf256.js";
import { b64UrlToBytes, bytesToB64Url } from "../signed-verify.js";

/** Resposta do guardião, dentro do envelope selado para a chave temporária. */
export const REPLY_TYPE = "vox-guardiao-volta";
/** Pedido com mais que isto é recusado pelo guardião e esquecido pelo aparelho novo. */
export const REQUEST_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Folga para relógio adiantado do aparelho novo. */
export const CLOCK_SKEW_MS = 5 * 60 * 1000;
/** Prefixo da caixa postal temporária no relay. */
export const MAILBOX_PREFIX = "vxtmp_";
/** Prefixo da resposta colada à mão (volta pessoal, sem relay). */
export const PASTE_PREFIX = "vox-volta:";
/**
 * Chave do `sessionStorage` com o pedido pendente desta aba: a chave temporária (privada cifrada pelo aparelho, nunca
 * em claro) e as respostas recebidas, ainda seladas.
 */
export const PENDING_STORAGE = "vox-guardian-return-v1";
/** Quantas palavras tem o código curto. */
export const CODE_WORDS = 4;

const ROUTE_ID_RE = /^vx_[A-Za-z0-9_-]{20}$/;
const NONCE_RE = /^[A-Za-z0-9_-]{8,32}$/;
const MAX_ENVELOPES = 14;

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

/**
 * Chave pública temporária (JWK) para o texto curto do link.
 * @param {{ x: string, y: string }} publicJwk
 * @returns {string}
 */
export function encodeTempPub(publicJwk) {
  const point = { x: bytesToBigInt(b64UrlToBytes(publicJwk.x)), y: bytesToBigInt(b64UrlToBytes(publicJwk.y)) };
  return bytesToB64Url(compressPoint(point));
}

/**
 * JWK da chave temporária a partir do texto do link; lança se não for um ponto da curva.
 * @param {string} k
 * @returns {{ kty: "EC", crv: "P-256", x: string, y: string, ext: true }}
 */
export function decodeTempPub(k) {
  const { x, y } = decompressPoint(b64UrlToBytes(String(k)));
  return { kty: "EC", crv: "P-256", x: bytesToB64Url(bigIntTo32Bytes(x)), y: bytesToB64Url(bigIntTo32Bytes(y)), ext: true };
}

/**
 * Pedido novo.
 * @param {{ owner: string, publicJwk: object, now?: number, nonce?: string }} opts
 * @returns {{ o: string, k: string, t: number, n: string }}
 */
export function buildRequest({ owner, publicJwk, now = Date.now(), nonce }) {
  const n = nonce || bytesToB64Url(crypto.getRandomValues(new Uint8Array(9)));
  return { o: owner, k: encodeTempPub(publicJwk), t: now, n };
}

/**
 * Pedido lido de um link (ou de `URLSearchParams`), ou null se algum campo não vale.
 * @param {{ get: (key: string) => string|null }} query
 * @returns {{ o: string, k: string, t: number, n: string }|null}
 */
export function parseRequest(query) {
  const [o, k, t, n] = ["o", "k", "t", "n"].map((key) => String(query?.get?.(key) || ""));
  const ts = Number(t);
  if (!ROUTE_ID_RE.test(o) || !NONCE_RE.test(n) || !Number.isSafeInteger(ts) || ts <= 0) return null;
  try {
    decodeTempPub(k);
  } catch {
    return null;
  }
  return { o, k, t: ts, n };
}

/**
 * Idade do pedido: vale até 24 h; adiantado mais que a folga também não vale.
 * @param {{ t: number }} req
 * @param {number} [now]
 * @returns {"ok"|"old"|"future"}
 */
export function requestAge(req, now = Date.now()) {
  if (req.t > now + CLOCK_SKEW_MS) return "future";
  return now - req.t > REQUEST_MAX_AGE_MS ? "old" : "ok";
}

/**
 * Identificador do pedido (hash dos quatro campos); a resposta o carrega.
 * @param {{ o: string, k: string, t: number, n: string }} req
 * @returns {Promise<string>}
 */
export async function requestId(req) {
  return bytesToB64Url((await sha256(`vox-guardiao-pedido-v0|${req.o}|${req.k}|${req.t}|${req.n}`)).subarray(0, 16));
}

/**
 * Código curto de conferência: 4 palavras (11 bits cada) do hash do pedido.
 * @param {{ o: string, k: string, t: number, n: string }} req
 * @returns {Promise<string[]>}
 */
export async function shortCode(req) {
  const hash = await sha256(`vox-guardiao-codigo-v0|${req.o}|${req.k}|${req.t}|${req.n}`);
  const bits = bytesToBigInt(hash.subarray(0, 6));
  return Array.from({ length: CODE_WORDS }, (_, i) => BIP39_PT[Number((bits >> BigInt(37 - 11 * i)) & 0x7ffn)]);
}

/**
 * Caixa postal temporária: `vxtmp_` e 20 caracteres hex do SHA-256 da chave temporária.
 * @param {string} k chave temporária comprimida
 * @returns {Promise<string>}
 */
export async function mailboxFor(k) {
  const hex = Array.from(await sha256(`vox-guardiao-caixa-v0|${k}`), (b) => b.toString(16).padStart(2, "0")).join("");
  return MAILBOX_PREFIX + hex.slice(0, 20);
}

/**
 * Link do pedido para o guardião abrir no app dele.
 * @param {{ o: string, k: string, t: number, n: string }} req
 * @param {string} base origem e caminho do app, sem `#`
 * @returns {string}
 */
export function requestLink(req, base) {
  const q = new URLSearchParams({ o: req.o, k: req.k, t: String(req.t), n: req.n });
  return `${String(base).split("#")[0]}#/guardiao?${q}`;
}

/**
 * Texto da resposta (vai selado para a chave temporária).
 * @param {object} share pedaço como a dona assinou
 * @param {string} reqId `requestId` do pedido
 * @returns {string}
 */
export function buildReplyText(share, reqId) {
  return JSON.stringify({ __vox_dm_v2: 1, kind: "guardian-return", payload: { type: REPLY_TYPE, v: 0, req: reqId, share } });
}

/**
 * Pedaço de uma resposta para este pedido, ou null.
 * @param {string} text texto decifrado
 * @param {string} reqId
 * @returns {object|null}
 */
export function parseReplyText(text, reqId) {
  try {
    const parsed = JSON.parse(String(text));
    const p = parsed?.kind === "guardian-return" ? parsed.payload : null;
    return p?.type === REPLY_TYPE && p.v === 0 && p.req === reqId && p.share ? p.share : null;
  } catch {
    return null;
  }
}

/**
 * Envelope selado como texto para colar (volta pessoal).
 * @param {object} envelope
 * @returns {string}
 */
export function encodePasteText(envelope) {
  return PASTE_PREFIX + bytesToB64Url(new TextEncoder().encode(JSON.stringify(envelope)));
}

/**
 * Envelope de um texto colado, ou null. Aceita espaços e quebras de linha no meio.
 * @param {string} text
 * @returns {object|null}
 */
export function decodePasteText(text) {
  const s = String(text || "").replace(/\s+/g, "");
  const at = s.indexOf(PASTE_PREFIX);
  if (at < 0) return null;
  try {
    const env = JSON.parse(new TextDecoder().decode(b64UrlToBytes(s.slice(at + PASTE_PREFIX.length))));
    return env?.v === 1 && env.ephPub && env.ct ? env : null;
  } catch {
    return null;
  }
}

/** Pedaço que vale para a dona: assinatura dela, tipo e forma da spec. */
async function isOwnersShare(share, owner, verify) {
  if (share?.type !== SHARE_TYPE || share.author !== owner || !isWellFormedShare(share)) return false;
  return Boolean(await Promise.resolve(verify(share)).catch(() => false));
}

/** Agrupa por divisão, sem repetir `x`. */
function groupBySplit(shares) {
  const groups = new Map();
  for (const s of shares) {
    const group = groups.get(s.splitId) || new Map();
    group.set(s.x, s);
    groups.set(s.splitId, group);
  }
  return [...groups.values()].map((group) => [...group.values()]);
}

/** Uma divisão com pedaços de mesmo M e mesmo tipo, e pelo menos M deles. */
function completeGroup(groups) {
  for (const group of groups) {
    const { m, kind } = group[0];
    const same = group.filter((s) => s.m === m && s.kind === kind);
    if (same.length >= m) return same;
  }
  return null;
}

/**
 * Junta os pedaços recebidos: só os assinados pela dona, de uma mesma divisão, com M deles.
 * @param {object[]} shares pedaços como vieram nas respostas
 * @param {string} owner `routeId` pedido
 * @param {(signed: object) => Promise<boolean>|boolean} verify confere a assinatura
 * @returns {Promise<{ ok: true, kind: "semente"|"chave", secret: Uint8Array }|{ ok: false, have: number, need: number }>}
 */
export async function joinShares(shares, owner, verify) {
  const checks = await Promise.all(shares.map((s) => isOwnersShare(s, owner, verify)));
  const groups = groupBySplit(shares.filter((_, i) => checks[i]));
  const group = completeGroup(groups);
  if (!group) {
    const best = groups.reduce((acc, g) => (g.length > acc.have ? { have: g.length, need: g[0].m } : acc), { have: 0, need: 0 });
    return { ok: false, ...best };
  }
  const m = group[0].m;
  const secret = combineShares(group.slice(0, m).map((s) => ({ splitId: s.splitId, x: s.x, y: b64UrlToBytes(s.y) })), m);
  return { ok: true, kind: group[0].kind, secret };
}

// ---- Pedido pendente desta aba (some ao fechar a aba ou passadas 24 h). ----

/**
 * Pedido pendente desta aba, ou null; o vencido é apagado.
 * @param {number} [now]
 * @returns {{ request: object, publicJwk: object, sealedPrivate: object, envelopes: object[] }|null}
 */
export function loadPending(now = Date.now()) {
  try {
    const p = JSON.parse(sessionStorage.getItem(PENDING_STORAGE) || "null");
    if (p?.request && p.sealedPrivate && requestAge(p.request, now) === "ok") return { ...p, envelopes: p.envelopes || [] };
  } catch {
    /* sessionStorage indisponível ou dado estragado: sem pedido */
  }
  clearPending();
  return null;
}

/**
 * Grava o pedido pendente desta aba.
 * @param {{ request: object, publicJwk: object, sealedPrivate: object, envelopes?: object[] }} pending
 *   `sealedPrivate`: saída de `sealJsonStrict` (keystore)
 */
export function savePending(pending) {
  const envelopes = (pending.envelopes || []).slice(-MAX_ENVELOPES);
  sessionStorage.setItem(PENDING_STORAGE, JSON.stringify({ ...pending, envelopes }));
}

/** Esquece o pedido pendente e a chave temporária desta aba. */
export function clearPending() {
  try {
    sessionStorage.removeItem(PENDING_STORAGE);
  } catch {
    /* sessionStorage indisponível: nada a apagar */
  }
}
