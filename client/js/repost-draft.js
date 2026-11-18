/** Draft puro de republicação — sem peers/DOM. */

import { randomBase36 } from "./shared/html.js";

/**
 * Operação `REPOST_LABEL` do módulo.
 * @type {*}
 */
export const REPOST_LABEL = "Republicar";
/**
 * Operação `REPOST_HINT` do módulo.
 * @type {*}
 */
export const REPOST_HINT =
  "Cria um post local que cita o original. Feed cronológico — sem impulsionar.";
const EXCERPT_MAX = 160;

/**
 * Operação `excerptOf` do módulo.
 * @param {*} [post] Parâmetro `post`.
 * @param {*} [max] Parâmetro `max`.
 * @returns {*} Resultado da operação.
 */
export function excerptOf(post, max = EXCERPT_MAX) {
  const raw = String(post?.body || post?.title || "").replace(/\s+/g, " ").trim();
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max - 1)}…`;
}

/**
 * Operação `newTopicId` do módulo.
 * @returns {*} Resultado da operação.
 */
export function newTopicId() {
  return `top_${randomBase36(8)}`;
}

/**
 * Operação `getOriginalId` do módulo.
 * @param {*} [post] Parâmetro `post`.
 * @returns {*} Resultado da operação.
 */
export function getOriginalId(post) {
  return String(post?.originalId || "").trim();
}

/**
 * Operação `isRepost` do módulo.
 * @param {*} [post] Parâmetro `post`.
 * @returns {*} Resultado da operação.
 */
export function isRepost(post) {
  return Boolean(post?.originalId || post?.isRepost);
}

/**
 * Operação `postsCiting` do módulo.
 * @param {*} [posts] Parâmetro `posts`.
 * @param {*} [originalId] Parâmetro `originalId`.
 * @returns {*} Resultado da operação.
 */
export function postsCiting(posts, originalId) {
  const id = String(originalId || "").trim();
  if (!id || !Array.isArray(posts)) return [];
  return posts.filter((p) => getOriginalId(p) === id);
}

/**
 * Operação `countCites` do módulo.
 * @param {*} [posts] Parâmetro `posts`.
 * @param {*} [originalId] Parâmetro `originalId`.
 * @returns {*} Resultado da operação.
 */
export function countCites(posts, originalId) {
  return postsCiting(posts, originalId).length;
}

/**
 * Operação `findOwnCite` do módulo.
 * @param {*} [posts] Parâmetro `posts`.
 * @param {*} [originalId] Parâmetro `originalId`.
 * @param {*} [authorId] Parâmetro `authorId`.
 * @returns {*} Resultado da operação.
 */
export function findOwnCite(posts, originalId, authorId) {
  const author = String(authorId || "").trim();
  return (
    postsCiting(posts, originalId).find((p) => {
      if (p.isOwnLocalPost) return true;
      const who = String(p.author || p.owner || "").trim();
      return Boolean(author && who === author);
    }) || null
  );
}

/**
 * Operação `buildRepostDraft` do módulo.
 * @param {*} [original] Parâmetro `original`.
 * @param {Object} [options] `id` opcional do rascunho.
 * @returns {*} Resultado da operação.
 */
export function buildRepostDraft(original, { id } = {}) {
  const originalId = String(original?.id || "").trim();
  if (!originalId) return null;
  const author = String(original.author || original.owner || "").trim();
  const excerpt = excerptOf(original);
  const cite = author || "autor original";
  return {
    id: id || newTopicId(),
    type: "topic",
    communityId: original.communityId || "geral",
    title: "Republicação",
    body: `Republicação de ${cite}\n#/t/${originalId}\n\n${excerpt}`,
    originalId,
    originalAuthor: author,
    excerpt,
    isRepost: true,
  };
}
