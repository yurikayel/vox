/** Persistência de republicação (local + gossip). */

import * as localAccount from "./local-account.js";
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

export async function republicarLocal(original) {
  const draft = buildRepostDraft(original);
  if (!draft) return null;
  return persistRepost(draft);
}

function fallbackOriginal(ctx, postId) {
  return {
    id: postId,
    title: ctx.title || "",
    author: ctx.authorRoute || "",
    body: "",
  };
}

export async function republicarFromContext(ctx) {
  const postId = String(ctx?.postId || "").trim();
  if (!postId) return null;
  const rec = await cacheNode.getPostRecord(postId);
  return republicarLocal(rec || fallbackOriginal(ctx, postId));
}

async function scanOwnRepost(originalId) {
  const acc = await localAccount.ensureLocalAccount();
  const locals = await cacheNode.getLocalPosts({ type: "topic" });
  const found = findOwnCite(locals, originalId, acc?.routeId || "");
  if (found?.id) index.setOwn(originalId, found.id);
  return found || null;
}

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

export async function undoOwnRepost(originalId) {
  const rec = await findOwnRepostRecord(originalId);
  if (!rec?.id) return { undone: false };
  await cacheNode.deleteLocalPost(rec.id);
  index.markRemoved(originalId);
  return { undone: true, id: rec.id };
}

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
