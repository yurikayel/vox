/** Persistência de republicação (local + gossip). */

import * as localAccount from "./identity/index.js";
import * as cacheNode from "./cache-node.js";
import * as peers from "./peers.js";
import { buildRepostDraft, findOwnCite } from "./repost-draft.js";
import * as index from "./repost-index.js";

export {
  REPOST_LABEL,
  REPOST_HINT,
  excerptOf,
  newTopicId,
  getOriginalId,
  isRepost,
  buildRepostDraft,
  postsCiting,
  findOwnCite,
  countCites,
} from "./repost-draft.js";

export {
  rememberVisible,
  hasOwnRepost,
  getOwnRepostId,
  getVisibleCount,
} from "./repost-index.js";

/**
 * Assina, grava localmente e propaga pela malha um rascunho de republicação.
 * @param {object} draft Rascunho gerado por `buildRepostDraft`.
 * @returns {Promise<object|null>} Republicação assinada ou `null` se o rascunho for inválido.
 */
export async function persistRepost(draft) {
  if (!draft?.originalId || draft.type !== "topic") return null;
  const signed = await localAccount.signPayload(draft);
  await cacheNode.saveLocalPost(signed);
  try {
    peers.broadcastGossip(signed);
  } catch {
    /* offline */
  }
  index.markCreated(draft.originalId, signed.id);
  return signed;
}

/**
 * Monta e persiste uma republicação local a partir do post original.
 * @param {object} original Registro do post original.
 * @returns {Promise<object|null>} Republicação assinada ou `null`.
 */
export async function republicarLocal(original) {
  const draft = buildRepostDraft(original);
  if (!draft) return null;
  return persistRepost(draft);
}

/**
 * Monta o post original de reserva quando ele não está disponível.
 * @param {object} ctx Contexto da republicação
 * @param {string} postId Id do post original
 * @returns {object} Post de reserva.
 */
function fallbackOriginal(ctx, postId) {
  return {
    id: postId,
    title: ctx.title || "",
    author: ctx.authorRoute || "",
    body: "",
  };
}

/**
 * Republica um post a partir do contexto de UI (buscando no cache ou usando fallback mínimo).
 * @param {{ postId?: string, title?: string, authorRoute?: string }} ctx Contexto do botão/card.
 * @returns {Promise<object|null>} Republicação assinada ou `null`.
 */
export async function republicarFromContext(ctx) {
  const postId = String(ctx?.postId || "").trim();
  if (!postId) return null;
  const rec = await cacheNode.getPostRecord(postId);
  return republicarLocal(rec || fallbackOriginal(ctx, postId));
}

/**
 * Procura nos posts locais uma republicação própria do post original.
 * @param {string} originalId Id do post original
 * @returns {Promise<object|null>} Republicação encontrada, ou `null`.
 */
async function scanOwnRepost(originalId) {
  const acc = await localAccount.ensureLocalAccount();
  const locals = await cacheNode.getLocalPosts({ type: "topic" });
  const found = findOwnCite(locals, originalId, acc?.routeId || "");
  if (found?.id) index.setOwn(originalId, found.id);
  return found || null;
}

/**
 * Localiza o registro local de republicação própria para o post original informado.
 * @param {string} originalId ID do post original.
 * @returns {Promise<object|null>} Registro da republicação ou `null`.
 */
export async function findOwnRepostRecord(originalId) {
  const id = String(originalId || "").trim();
  if (!id) return null;
  const cached = index.getOwnRepostId(id);
  if (cached) {
    const rec = await cacheNode.getLocalPost(cached);
    if (rec) return rec;
  }
  return scanOwnRepost(id);
}

/**
 * Desfaz a republicação própria de um post removendo o registro local e atualizando o índice.
 * @param {string} originalId ID do post original.
 * @returns {Promise<{ undone: boolean, id?: string }>} Resultado da remoção.
 */
export async function undoOwnRepost(originalId) {
  const rec = await findOwnRepostRecord(originalId);
  if (!rec?.id) return { undone: false };
  await cacheNode.deleteLocalPost(rec.id);
  index.markRemoved(originalId);
  return { undone: true, id: rec.id };
}

/**
 * Alterna (cria ou desfaz) a republicação própria a partir do contexto de UI.
 * @param {{ postId?: string, id?: string, title?: string, authorRoute?: string }} ctx Contexto do post.
 * @returns {Promise<{ ok: boolean, kind?: "create"|"undo", signed?: object, undone?: boolean, id?: string }>} Resultado da alternância.
 */
export async function toggleFromContext(ctx) {
  const postId = String(ctx?.postId || ctx?.id || "").trim();
  if (!postId) return { ok: false };
  if (await findOwnRepostRecord(postId)) {
    const undone = await undoOwnRepost(postId);
    return { ...undone, kind: "undo", ok: undone.undone };
  }
  const signed = await republicarFromContext(ctx);
  return signed ? { ok: true, kind: "create", signed } : { ok: false };
}
