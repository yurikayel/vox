/** Índice sincrono: republicações próprias e contagem visível. */

import { getOriginalId } from "./repost-draft.js";

const KEY = "vox-own-reposts-v1";
let counts = new Map();

/** @param {unknown} raw */
function normalizeOwnMap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw;
}

function readOwn() {
  try {
    return normalizeOwnMap(JSON.parse(localStorage.getItem(KEY) || "{}"));
  } catch {
    return {};
  }
}

function writeOwn(map) {
  localStorage.setItem(KEY, JSON.stringify(map));
}

function noteVisible(p, authorId, own) {
  const oid = getOriginalId(p);
  if (!oid) return;
  counts.set(oid, (counts.get(oid) || 0) + 1);
  const who = String(p.author || p.owner || "");
  if (p.isOwnLocalPost || (authorId && who === authorId)) own[oid] = p.id;
}

/**
 * Recalcula contagens visíveis e atualiza o mapa de republicações próprias a partir dos posts carregados.
 * @param {object[]} posts Posts atualmente visíveis.
 * @param {string} [authorId] Rota do usuário local.
 * @returns {void}
 */
export function rememberVisible(posts, authorId) {
  counts = new Map();
  const own = readOwn();
  for (const p of posts || []) noteVisible(p, authorId, own);
  writeOwn(own);
}

/**
 * Indica se o usuário local já republicou o post original informado.
 * @param {string} originalId ID do post original.
 * @returns {boolean} `true` se houver republicação própria registrada.
 */
export function hasOwnRepost(originalId) {
  return Boolean(readOwn()[String(originalId || "")]);
}

/**
 * Retorna o ID da republicação própria para o post original informado.
 * @param {string} originalId ID do post original.
 * @returns {string} ID do repost próprio ou string vazia.
 */
export function getOwnRepostId(originalId) {
  return readOwn()[String(originalId || "")] || "";
}

/**
 * Retorna a contagem em memória de republicações visíveis para o post original.
 * @param {string} originalId ID do post original.
 * @returns {number} Quantidade de citações visíveis.
 */
export function getVisibleCount(originalId) {
  return counts.get(String(originalId || "")) || 0;
}

/**
 * Registra o vínculo entre post original e republicação própria no `localStorage`.
 * @param {string} originalId ID do post original.
 * @param {string} repostId ID da republicação própria.
 * @returns {void}
 */
export function setOwn(originalId, repostId) {
  if (!originalId || !repostId) return;
  const own = readOwn();
  own[originalId] = repostId;
  writeOwn(own);
}

/**
 * Registra nova republicação própria e incrementa a contagem visível.
 * @param {string} originalId ID do post original.
 * @param {string} repostId ID da republicação criada.
 * @returns {void}
 */
export function markCreated(originalId, repostId) {
  setOwn(originalId, repostId);
  counts.set(originalId, (counts.get(originalId) || 0) + 1);
}

/**
 * Remove a marcação de republicação própria e decrementa a contagem visível.
 * @param {string} originalId ID do post original.
 * @returns {void}
 */
export function markRemoved(originalId) {
  const own = readOwn();
  delete own[originalId];
  writeOwn(own);
  const n = counts.get(originalId) || 0;
  counts.set(originalId, Math.max(0, n - 1));
}
