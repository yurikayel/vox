/**
 * @module mesh-vault
 * @file Cofre na malha (ADR-037), sem E/S de rede: o cofre cifrado da dona fica com até 7 laços mútuos; o aparelho
 * novo pede pela caixa postal cega, selado para a chave da caixa (derivada do endereço do cofre); quem guarda avisa a
 * dona e entrega na hora se ela aprovar, nunca se ela vetar, e 24 h depois do aviso se ela não responder.
 *
 * Aqui ficam os formatos, a chave e os endereços das caixas, a guarda (caixa preta) e a regra de decisão. O transporte
 * (DM, relay, telas) é `app/mesh-vault-flow.js`.
 */

import { decodeTempPub, encodeTempPub, jwkPairFromScalar, scalarFromBytes } from "../identity/index.js";
import { deriveVaultAddress, normalizeVaultEmail } from "./vault-crypto.js";

/** Chave temporária do pedido, do texto curto para JWK (a mesma forma do pedido aos guardiões). */
export { decodeTempPub as decodeMeshTempPub } from "../identity/index.js";

/** Tipos das mensagens assinadas (dentro de envelope de DM). */
export const GUARD_TYPE = "vox-cofre-guarda";
/** A dona pede para apagar o cofre dela. */
export const RELEASE_TYPE = "vox-cofre-solta";
/** Quem guarda avisa a dona de um pedido. */
export const NOTICE_TYPE = "vox-cofre-aviso";
/** A dona aprova ou veta um pedido. */
export const DECISION_TYPE = "vox-cofre-decisao";
const TYPES = [GUARD_TYPE, RELEASE_TYPE, NOTICE_TYPE, DECISION_TYPE];

/** Pedido do aparelho novo e resposta de quem guarda (texto selado, não assinado). */
export const REQUEST_TYPE = "vox-cofre-pedido";
/** Resposta de quem guarda, selada para a chave temporária. */
export const REPLY_TYPE = "vox-cofre-resposta";

/** Quantos aparelhos guardam o cofre de uma dona. */
export const MAX_HOLDERS = 7;
/** Quantas donas um aparelho guarda. */
export const MAX_HELD = 50;
/** Tamanho máximo do cofre cifrado guardado (JSON). */
export const MAX_RECORD_CHARS = 4096;
/** Sem resposta da dona, quem guarda entrega este tempo depois do aviso. */
export const WAIT_MS = 24 * 60 * 60 * 1000;
/** Pedido mais velho que isto é descartado. */
export const REQUEST_MAX_AGE_MS = 72 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

/** Prefixo da caixa dos pedidos de um cofre. */
export const BOX_PREFIX = "vxcof_";
/** Prefixo da caixa das respostas para uma chave temporária. */
export const REPLY_PREFIX = "vxcofr_";

/** Cofres que este aparelho guarda (caixa preta). */
export const HELD_STORAGE = "vox-cofre-malha-guardados-v0";
/** O cofre desta conta e para quem já foi. */
export const MINE_STORAGE = "vox-cofre-malha-meu-v0";
/** Pedido em andamento do aparelho novo. */
export const PENDING_STORAGE = "vox-cofre-malha-pedido-v0";
/** Avisos recebidos pela dona, esperando decisão. */
export const NOTICES_STORAGE = "vox-cofre-malha-avisos-v0";

const enc = new TextEncoder();
const ADDRESS_RE = /^[0-9a-f]{64}$/;

async function sha256Hex(text) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Endereço do cofre tem a forma esperada (64 hexadecimais)?
 * @param {string} address
 * @returns {boolean}
 */
export function isVaultAddress(address) {
  return ADDRESS_RE.test(String(address || ""));
}

/**
 * Caixa postal dos pedidos de um cofre.
 * @param {string} address endereço do cofre
 * @returns {Promise<string>}
 */
export async function boxMailbox(address) {
  return BOX_PREFIX + (await sha256Hex(`vox-cofre-caixa-v0|${address}`)).slice(0, 20);
}

/**
 * Caixa postal das respostas para uma chave temporária.
 * @param {string} k chave temporária comprimida
 * @returns {Promise<string>}
 */
export async function replyMailbox(k) {
  return REPLY_PREFIX + (await sha256Hex(`vox-cofre-resposta-v0|${k}`)).slice(0, 20);
}

/**
 * Chave da caixa do cofre (ECDH P-256): HKDF-SHA256 do endereço, reduzida como no ADR-032 §5.2. Só quem sabe o
 * endereço (a dona e quem guarda) chega a ela.
 * @param {string} address endereço do cofre
 * @returns {Promise<{ publicJwk: object, privateJwk: object }>}
 */
export async function boxKeyPair(address) {
  if (!isVaultAddress(address)) throw new Error("Endereço de cofre inválido.");
  const ikm = await crypto.subtle.importKey("raw", enc.encode(address), "HKDF", false, ["deriveBits"]);
  const params = { name: "HKDF", hash: "SHA-256", salt: enc.encode("vox-cofre-malha-v0"), info: enc.encode("vox-cofre-caixa-p256") };
  const bits = new Uint8Array(await crypto.subtle.deriveBits(params, ikm, 384));
  return jwkPairFromScalar(scalarFromBytes(bits), "ECDH");
}

/**
 * Endereço do cofre a partir do que a pessoa digitou, igual ao da gravação (ADR-032 §6.3).
 * @param {string} pass senha
 * @param {string} email e-mail, ou ""
 * @returns {Promise<string>}
 */
export function meshVaultAddress(pass, email) {
  return deriveVaultAddress(String(pass || "").trim(), normalizeVaultEmail(email || ""));
}

// ---- Mensagens assinadas (DM) ----

/**
 * Texto da DM de uma mensagem assinada do cofre na malha.
 * @param {object} signed corpo assinado
 * @returns {string}
 */
export function serializeMeshDm(signed) {
  return JSON.stringify({ __vox_dm_v2: 1, kind: "cofre-malha", payload: signed });
}

/**
 * Corpo assinado do cofre na malha, ou null se o texto não for um.
 * @param {string} rawText texto decifrado do envelope
 * @returns {object|null}
 */
export function parseMeshDm(rawText) {
  const s = String(rawText ?? "");
  if (!s.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(s);
    if (parsed?.__vox_dm_v2 !== 1 || parsed?.kind !== "cofre-malha") return null;
    const p = parsed.payload;
    return p && TYPES.includes(p.type) && p.v === 0 && p.author && p.to && p.sig && p.pubKey ? p : null;
  } catch {
    return null;
  }
}

/**
 * Corpo para mandar o cofre a quem vai guardar.
 * @param {{ to: string, address: string, record: object, updatedAt: number }} opts
 * @returns {object}
 */
export function buildGuardBody({ to, address, record, updatedAt }) {
  return { type: GUARD_TYPE, v: 0, to, address, record, updatedAt };
}

/**
 * Corpo para pedir que apaguem o cofre.
 * @param {{ to: string }} opts
 * @returns {object}
 */
export function buildReleaseBody({ to }) {
  return { type: RELEASE_TYPE, v: 0, to };
}

/**
 * Corpo do aviso de pedido, de quem guarda para a dona.
 * @param {{ to: string, requestId: string, firstSeen: number }} opts
 * @returns {object}
 */
export function buildNoticeBody({ to, requestId, firstSeen }) {
  return { type: NOTICE_TYPE, v: 0, to, requestId, firstSeen };
}

/**
 * Corpo da decisão da dona, para quem guarda.
 * @param {{ to: string, requestId: string, decision: "sim"|"nao" }} opts
 * @returns {object}
 */
export function buildDecisionBody({ to, requestId, decision }) {
  return { type: DECISION_TYPE, v: 0, to, requestId, decision: decision === "sim" ? "sim" : "nao" };
}

// ---- Pedido e resposta (selados, sem assinatura) ----

function randomNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Texto do pedido do aparelho novo (vai selado para a chave da caixa).
 * @param {{ publicJwk: object, now?: number, nonce?: string }} opts
 * @returns {{ type: string, v: 0, k: string, t: number, n: string }}
 */
export function buildRequest({ publicJwk, now = Date.now(), nonce = randomNonce() }) {
  return { type: REQUEST_TYPE, v: 0, k: encodeTempPub(publicJwk), t: now, n: nonce };
}

/**
 * Pedido válido e dentro do prazo, ou null.
 * @param {string} text texto aberto com a chave da caixa
 * @param {number} [now]
 * @returns {{ type: string, v: 0, k: string, t: number, n: string }|null}
 */
export function parseRequest(text, now = Date.now()) {
  try {
    const req = JSON.parse(String(text));
    if (req?.type !== REQUEST_TYPE || req.v !== 0 || typeof req.n !== "string" || !Number.isFinite(req.t)) return null;
    decodeTempPub(req.k);
    if (req.t > now + CLOCK_SKEW_MS || now - req.t > REQUEST_MAX_AGE_MS) return null;
    return req;
  } catch {
    return null;
  }
}

/**
 * Identificador curto do pedido (chave temporária + nonce).
 * @param {{ k: string, n: string }} req
 * @returns {Promise<string>}
 */
export async function requestIdOf(req) {
  return (await sha256Hex(`vox-cofre-pedido-v0|${req.k}|${req.n}`)).slice(0, 24);
}

/**
 * Texto da resposta (vai selado para a chave temporária).
 * @param {object} record cofre cifrado
 * @param {string} requestId
 * @returns {string}
 */
export function buildReplyText(record, requestId) {
  return JSON.stringify({ type: REPLY_TYPE, v: 0, requestId, record });
}

/**
 * Cofre da resposta deste pedido, ou null.
 * @param {string} text texto aberto com a chave temporária
 * @param {string} requestId
 * @returns {object|null}
 */
export function parseReplyText(text, requestId) {
  try {
    const r = JSON.parse(String(text));
    const ok = r?.type === REPLY_TYPE && r.v === 0 && r.requestId === requestId && r.record && typeof r.record === "object";
    return ok ? r.record : null;
  } catch {
    return null;
  }
}

// ---- Armazenamento ----

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sem espaço ou sem armazenamento: a malha é atalho */
  }
}

/** Mapa plano no `localStorage`; array, primitivo ou null contam como vazio. */
function plainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// ---- Guarda (aparelho de quem guarda) ----

/**
 * Cofres guardados por dona: `{ [owner]: { address, record, updatedAt, requests } }`.
 * @returns {Record<string, { address: string, record: object, updatedAt: number, requests: Record<string, object> }>}
 */
export function loadHeld() {
  const held = readJson(HELD_STORAGE, {});
  if (!plainRecord(held)) return {};
  const out = {};
  for (const [owner, entry] of Object.entries(held)) {
    if (plainRecord(entry)) out[owner] = entry;
  }
  return out;
}

/**
 * Grava a guarda inteira.
 * @param {Record<string, object>} held
 * @returns {void}
 */
export function saveHeld(held) {
  writeJson(HELD_STORAGE, held);
}

/**
 * Quantas donas este aparelho guarda (é tudo o que a tela mostra).
 * @returns {number}
 */
export function heldCount() {
  return Object.keys(loadHeld()).length;
}

/** Forma do corpo que dá para guardar: endereço de cofre, data numérica e cofre-objeto dentro do teto. */
function isGuardableBody(body) {
  if (!isVaultAddress(body?.address) || !Number.isFinite(body.updatedAt)) return false;
  if (!body.record || typeof body.record !== "object") return false;
  return JSON.stringify(body.record).length <= MAX_RECORD_CHARS;
}

/**
 * Aceita (ou troca) o cofre de uma dona. Recusa forma errada, cofre grande, versão mais velha e dona nova além do teto.
 * @param {{ author: string, address: string, record: object, updatedAt: number }} body corpo já conferido
 * @returns {"ok"|"invalid"|"stale"|"full"}
 */
export function acceptGuard(body) {
  if (!isGuardableBody(body)) return "invalid";
  const held = loadHeld();
  const prev = held[body.author];
  if (prev && prev.updatedAt >= body.updatedAt) return "stale";
  if (!prev && Object.keys(held).length >= MAX_HELD) return "full";
  const requests = prev && prev.address === body.address ? prev.requests || {} : {};
  held[body.author] = { address: body.address, record: body.record, updatedAt: body.updatedAt, requests };
  saveHeld(held);
  return "ok";
}

/**
 * Apaga o cofre de uma dona.
 * @param {string} owner
 * @returns {boolean} se havia
 */
export function dropHeld(owner) {
  const held = loadHeld();
  if (!held[owner]) return false;
  delete held[owner];
  saveHeld(held);
  return true;
}

/**
 * O que fazer com um pedido guardado: entregar, esperar ou descartar.
 * @param {{ t: number, firstSeen: number, decision?: "sim"|"nao", answered?: boolean }} req
 * @param {number} [now]
 * @returns {"release"|"wait"|"drop"}
 */
export function decideRequest(req, now = Date.now()) {
  if (req.decision === "nao" || req.answered) return "drop";
  if (now - req.t > REQUEST_MAX_AGE_MS) return "drop";
  if (req.decision === "sim") return "release";
  return now - req.firstSeen >= WAIT_MS ? "release" : "wait";
}

// ---- O cofre desta conta (aparelho da dona) ----

/**
 * O cofre desta conta como foi gravado por último e para quem já foi.
 * @returns {{ routeId: string, address: string, record: object, updatedAt: number, sentTo: string[] }|null}
 */
export function loadMine() {
  const mine = readJson(MINE_STORAGE, null);
  return mine && isVaultAddress(mine.address) ? mine : null;
}

/**
 * Lembra o cofre recém-gravado. Endereço novo (outra senha ou e-mail) zera a lista de quem já recebeu.
 * @param {{ routeId: string, address: string, record: object, updatedAt?: number }} opts
 * @returns {void}
 */
export function rememberMine({ routeId, address, record, updatedAt = Date.now() }) {
  if (!routeId || !isVaultAddress(address) || JSON.stringify(record).length > MAX_RECORD_CHARS) return;
  const prev = loadMine();
  const previousHolders = prev?.routeId === routeId ? prev.sentTo || [] : [];
  writeJson(MINE_STORAGE, { routeId, address, record, updatedAt, sentTo: [], previousHolders });
  globalThis.dispatchEvent?.(new CustomEvent("vox-cofre-malha-mudou"));
}

/**
 * Marca para quem o cofre atual já foi.
 * @param {string[]} routeIds
 * @returns {void}
 */
export function markSent(routeIds) {
  const mine = loadMine();
  if (!mine) return;
  writeJson(MINE_STORAGE, { ...mine, sentTo: [...new Set([...(mine.sentTo || []), ...routeIds])] });
}

/**
 * Esquece o cofre desta conta (outra conta entrou, ou a conta saiu).
 * @returns {void}
 */
export function forgetMine() {
  writeJson(MINE_STORAGE, null);
}

/**
 * Apaga deste aparelho tudo do cofre na malha: o próprio cofre, as cópias guardadas para outros, o pedido de volta e
 * os avisos. Usado por "Apagar conta local", junto com os pedaços de guardião.
 * @returns {void}
 */
export function forgetAllMesh() {
  for (const key of [HELD_STORAGE, MINE_STORAGE, PENDING_STORAGE, NOTICES_STORAGE]) {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      /* armazenamento indisponível: nada a apagar */
    }
  }
}

/**
 * Quem deve receber o cofre agora: quem já guardava antes da troca primeiro, depois os candidatos, até `MAX_HOLDERS`.
 * @param {{ sentTo?: string[], previousHolders?: string[] }} mine
 * @param {string[]} candidates laços mútuos (guardiões primeiro)
 * @returns {string[]}
 */
export function pickHolders(mine, candidates) {
  const sent = new Set(mine.sentTo || []);
  const order = [...new Set([...(mine.previousHolders || []), ...candidates])];
  const room = Math.max(0, MAX_HOLDERS - sent.size);
  return order.filter((id) => id && !sent.has(id)).slice(0, room);
}

// ---- Avisos (aparelho da dona) ----

/**
 * Avisos de pedido ainda sem decisão desta conta.
 * @returns {{ holder: string, requestId: string, firstSeen: number }[]}
 */
export function loadNotices() {
  const list = readJson(NOTICES_STORAGE, []);
  return Array.isArray(list) ? list : [];
}

/**
 * Guarda um aviso (sem repetir pedido do mesmo guarda).
 * @param {{ holder: string, requestId: string, firstSeen: number }} notice
 * @returns {boolean} se era novo
 */
export function addNotice(notice) {
  const list = loadNotices();
  if (list.some((n) => n.holder === notice.holder && n.requestId === notice.requestId)) return false;
  writeJson(NOTICES_STORAGE, [...list, notice].slice(-50));
  return true;
}

/**
 * Tira os avisos de um pedido (todos os guardas), depois da decisão.
 * @param {string} requestId
 * @returns {{ holder: string, requestId: string, firstSeen: number }[]} os avisos tirados
 */
export function takeNotices(requestId) {
  const list = loadNotices();
  writeJson(NOTICES_STORAGE, list.filter((n) => n.requestId !== requestId));
  return list.filter((n) => n.requestId === requestId);
}

// ---- Pedido do aparelho novo ----

/**
 * Pedido em andamento: `{ address, mailbox, request, requestId, sealedPrivate }`, ou null.
 * @param {number} [now]
 * @returns {object|null}
 */
export function loadPending(now = Date.now()) {
  const p = readJson(PENDING_STORAGE, null);
  if (!p?.request || now - p.request.t > REQUEST_MAX_AGE_MS) return null;
  return p;
}

/**
 * Grava o pedido em andamento.
 * @param {object|null} pending
 * @returns {void}
 */
export function savePending(pending) {
  writeJson(PENDING_STORAGE, pending);
}
