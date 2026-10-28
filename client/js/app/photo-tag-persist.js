/** Persiste marcas: localStorage + post assinado se for seu. */

import * as photoTags from "../photo-tags.js";
import * as cacheNode from "../cache-node.js";
import * as localAccount from "../local-account.js";
import * as postOwnership from "../post-ownership.js";

export async function persistPhotoTags(postId, tags) {
  const clean = photoTags.setLocalTags(postId, tags);
  const rec = await cacheNode.getPostRecord(postId);
  if (!rec) return clean;
  const me = await localAccount.getRouteId();
  if (!postOwnership.canMutateLocalPost(rec, me)) return clean;
  const { sig, pubKey, ...rest } = rec;
  const signed = await localAccount.signPayload({
    ...rest,
    photoTags: clean,
    editedAt: Date.now(),
  });
  await cacheNode.saveLocalPost(signed);
  return clean;
}

export function tagsForPost(postId, post) {
  if (post) return photoTags.listTags(post);
  return photoTags.getLocalTags(postId);
}
