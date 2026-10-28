/** Persistência de republicação (local + gossip). */

import * as localAccount from "./local-account.js";
import * as cacheNode from "./cache-node.js";
import * as peers from "./peers.js";
import { buildRepostDraft } from "./repost-draft.js";

export {
  REPOST_LABEL,
  REPOST_HINT,
  excerptOf,
  newTopicId,
  getOriginalId,
  isRepost,
  buildRepostDraft,
} from "./repost-draft.js";

export async function persistRepost(draft) {
  if (!draft?.originalId || draft.type !== "topic") return null;
  const signed = await localAccount.signPayload(draft);
  await cacheNode.saveLocalPost(signed);
  try {
    peers.broadcastGossip(signed);
  } catch {
    /* offline */
  }
  return signed;
}

export async function republicarLocal(original) {
  const draft = buildRepostDraft(original);
  if (!draft) return null;
  return persistRepost(draft);
}

export async function republicarFromContext(ctx) {
  const postId = String(ctx?.postId || "").trim();
  if (!postId) return null;
  const rec = await cacheNode.getPostRecord(postId);
  return republicarLocal(
    rec || {
      id: postId,
      title: ctx.title || "",
      author: ctx.authorRoute || "",
      body: "",
    },
  );
}
