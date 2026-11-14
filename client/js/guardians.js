/**
 * @file Guardiões, parte 3b (spec `docs/specs/guardioes-v0.md` §4–§6): mensagens, mapa da dona e guarda do
 * guardião. Lógica pura e armazenamento local, sem DOM nem rede; o transporte cifrado fica em
 * `app/guardians-flow.js`.
 *
 * - Dona: guarda só o mapa `{splitId, m, n, guardians:[{routeId, x, sentAt, heldAt}]}`, nunca os pedaços.
 * - Guardião: guarda o pedaço assinado, cifrado pela chave do aparelho (`sealJson`), sem tela para ver ou
 *   exportar ("caixa preta"). No máximo 20 donas; uma divisão nova da mesma dona substitui a anterior.
 */

import { openSealed, sealJsonStrict } from "./keystore.js";
import { MAX_N, MIN_M, SPLIT_ID_BYTES, splitSecret } from "./shamir-gf256.js";

/** Pedaço da dona para o guardião. */
export const SHARE_TYPE = "vox-guardiao-pedaco";
/** Recibo do guardião para a dona (`released: true` quando ele para de guardar). */
export const RECEIPT_TYPE = "vox-guardiao-recibo";
/** A dona revoga uma divisão antiga. */
export const REVOKE_TYPE = "vox-guardiao-revoga";
/** Padrão do piloto (spec §12.3). */
export const DEFAULT_M = 3;
/** Padrão do piloto (spec §12.3). */
export const DEFAULT_N = 5;
/** Quantas donas um guardião aceita guardar. */
export const MAX_HELD = 20;
/** Chave do `localStorage` com os pedaços que este aparelho guarda (entra na limpeza local). */
export const HELD_STORAGE = "vox-guardian-shares-v1";

const TYPES = [SHARE_TYPE, RECEIPT_TYPE, REVOKE_TYPE];
const ownerMapKey = (routeId) => `vox-guardians-v1:${routeId}`;
const toB64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const clip = (s, max) => String(s || "").trim().slice(0, max);

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value && typeof value === "object" ? value : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/**
 * Divide o segredo e monta um corpo (a assinar) por guardião.
 * @param {{ secret: Uint8Array, kind: "semente"|"chave", ownerName?: string, guardians: string[], m: number,
 *   now?: number, random?: (buf: Uint8Array) => Uint8Array }} opts
 * @returns {{ splitId: string, m: number, n: number, guardians: string[], bodies: { to: string, x: number, body: object }[] }}
 *   `splitId`, `m`, `n` e `guardians` são da escolha da dona, não saem do segredo; o pedaço `i` vai para `guardians[i]`
 *   com `x = i + 1`.
 */
export function buildShareBodies({ secret, kind, ownerName = "", guardians, m, now = Date.now(), random }) {
  const unique = [...new Set(guardians)];
  if (unique.length !== guardians.length) throw new RangeError("Guardião repetido.");
  const draw = random || ((buf) => crypto.getRandomValues(buf));
  const splitId = toB64url(draw(new Uint8Array(SPLIT_ID_BYTES)));
  const { shares } = splitSecret(secret, { m, n: unique.length, splitId, random: draw });
  const bodies = shares.map((share, i) => ({
    to: unique[i],
    x: i + 1,
    body: {
      type: SHARE_TYPE, v: 0, to: unique[i], ownerName: clip(ownerName, 80), splitId,
      m, n: unique.length, x: i + 1, kind, y: toB64url(share.y), createdAt: now,
    },
  }));
  return { splitId, m, n: unique.length, guardians: unique, bodies };
}

/**
 * Recibo (a assinar) do guardião para a dona.
 * @param {{ owner: string, splitId: string, x: number, released?: boolean, now?: number }} opts
 * @returns {object}
 */
export function buildReceiptBody({ owner, splitId, x, released = false, now = Date.now() }) {
  return { type: RECEIPT_TYPE, v: 0, to: owner, splitId, x, released: Boolean(released), heldAt: now };
}

/**
 * Revogação (a assinar) de uma divisão antiga.
 * @param {{ to: string, splitId: string, now?: number }} opts
 * @returns {object}
 */
export function buildRevokeBody({ to, splitId, now = Date.now() }) {
  return { type: REVOKE_TYPE, v: 0, to, splitId, ts: now };
}

/**
 * JSON que vai dentro do envelope de DM.
 * @param {object} signed corpo assinado por `localAccount.signPayload`
 * @returns {string}
 */
export function serializeGuardianDm(signed) {
  return JSON.stringify({ __vox_dm_v2: 1, kind: "guardian", payload: signed });
}

/**
 * Corpo assinado de uma mensagem de guardião, ou null se o texto não for uma.
 * @param {string} rawText texto decifrado do envelope
 * @returns {object|null}
 */
export function parseGuardianDm(rawText) {
  const s = String(rawText ?? "");
  if (!s.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(s);
    if (parsed?.__vox_dm_v2 !== 1 || parsed?.kind !== "guardian") return null;
    return isSignedGuardianBody(parsed.payload) ? parsed.payload : null;
  } catch {
    return null;
  }
}

/** Tipo conhecido, versão 0 e os campos de uma mensagem assinada (a assinatura é conferida por quem recebe). */
function isSignedGuardianBody(p) {
  const fields = ["author", "to", "sig", "pubKey", "splitId"];
  return Boolean(p && TYPES.includes(p.type) && p.v === 0 && fields.every((key) => p[key]));
}

/**
 * Pedaço com forma válida (faixas da spec §3 e tamanho do segredo).
 * @param {object} p corpo de `SHARE_TYPE`
 * @returns {boolean}
 */
export function isWellFormedShare(p) {
  return Boolean(p) && hasValidThreshold(p) && secretSizeMatchesKind(p);
}

/** M, N e x dentro das faixas da spec §3. */
function hasValidThreshold({ m, n, x }) {
  const ints = [m, n, x].every(Number.isInteger);
  return ints && m >= MIN_M && n <= MAX_N && m <= n && x >= 1 && x <= n;
}

/** `y` tem o tamanho do segredo: 16 bytes de semente ou 32 da chave. */
function secretSizeMatchesKind({ kind, y }) {
  const bytes = typeof y === "string" ? Math.floor((y.length * 3) / 4) : 0;
  return (kind === "semente" && bytes === 16) || (kind === "chave" && bytes === 32);
}

// ---- Mapa da dona: quem guarda cada pedaço, sem os pedaços. ----

/**
 * Divisão ativa da dona, ou null.
 * @param {string} owner
 * @returns {{ splitId: string, m: number, n: number, guardians: { routeId: string, x: number, sentAt: number, heldAt: number|null }[] }|null}
 */
export function getOwnerSplit(owner) {
  const map = readJson(ownerMapKey(owner), null);
  return map?.splitId ? map : null;
}

/**
 * Grava a divisão nova (substitui a anterior). Só o que a dona escolheu: quem guarda cada `x`, nunca os pedaços.
 * @param {string} owner
 * @param {{ splitId: string, m: number, guardians: string[] }} choice o guardião `i` recebeu `x = i + 1`
 * @param {number} [now]
 */
export function recordOwnerSplit(owner, { splitId, m, guardians: chosen }, now = Date.now()) {
  const guardians = chosen.map((routeId, i) => ({ routeId, x: i + 1, sentAt: now, heldAt: null }));
  writeJson(ownerMapKey(owner), { splitId, m, n: chosen.length, guardians });
}

/**
 * Quantos guardiões confirmaram que guardam o pedaço da divisão ativa.
 * @param {string} owner
 * @returns {{ confirmed: number, m: number, n: number }}
 */
export function countConfirmed(owner) {
  const split = getOwnerSplit(owner);
  if (!split) return { confirmed: 0, m: 0, n: 0 };
  return { confirmed: split.guardians.filter((g) => g.heldAt).length, m: split.m, n: split.n };
}

/**
 * Aplica um recibo já verificado; só conta se veio do guardião que recebeu aquele `x` daquela divisão.
 * @param {string} owner
 * @param {object} receipt corpo assinado de `RECEIPT_TYPE`
 * @returns {boolean} se o recibo valeu
 */
export function applyReceipt(owner, receipt) {
  const split = getOwnerSplit(owner);
  if (!split || receipt.splitId !== split.splitId) return false;
  const guardian = split.guardians.find((g) => g.routeId === receipt.author && g.x === receipt.x);
  if (!guardian) return false;
  guardian.heldAt = receipt.released ? null : Number(receipt.heldAt) || Date.now();
  writeJson(ownerMapKey(owner), split);
  return true;
}

// ---- Guarda do guardião: caixa preta. ----

function readHeld() {
  return readJson(HELD_STORAGE, {});
}

/**
 * Quem este aparelho guarda (sem os pedaços).
 * @returns {{ owner: string, ownerName: string, splitId: string, heldAt: number }[]}
 */
export function listHeld() {
  return Object.values(readHeld())
    .map(({ owner, ownerName, splitId, heldAt }) => ({ owner, ownerName, splitId, heldAt }))
    .sort((a, b) => b.heldAt - a.heldAt);
}

/**
 * Guarda um pedaço já verificado, sempre cifrado pelo aparelho. Recusa o da própria conta, passar de 20 donas e
 * aparelho sem chave do aparelho (o pedaço é de outra pessoa e não fica em claro).
 * @param {object} share corpo assinado de `SHARE_TYPE`
 * @param {string} me conta deste aparelho
 * @param {number} [now]
 * @returns {Promise<boolean>}
 */
export async function storeHeldShare(share, me, now = Date.now()) {
  const held = readHeld();
  if (share.author === me || (!held[share.author] && Object.keys(held).length >= MAX_HELD)) return false;
  const sealed = await sealJsonStrict(share).catch(() => null);
  if (!sealed) return false;
  held[share.author] = {
    owner: share.author, ownerName: clip(share.ownerName, 80), splitId: share.splitId, x: share.x, heldAt: now, sealed,
  };
  writeJson(HELD_STORAGE, held);
  return true;
}

/**
 * Pedaço guardado de uma dona (para a parte 3c devolver), ou null.
 * @param {string} owner
 * @returns {Promise<object|null>}
 */
export async function openHeldShare(owner) {
  const entry = readHeld()[owner];
  return entry ? openSealed(entry.sealed) : null;
}

/**
 * Apaga o pedaço de uma dona; com `splitId`, só se for daquela divisão (revogação).
 * @param {string} owner
 * @param {string} [splitId]
 * @returns {{ splitId: string, x: number }|null} o que foi apagado
 */
export function dropHeldShare(owner, splitId = "") {
  const held = readHeld();
  const entry = held[owner];
  if (!entry || (splitId && entry.splitId !== splitId)) return null;
  delete held[owner];
  writeJson(HELD_STORAGE, held);
  return { splitId: entry.splitId, x: entry.x };
}
