/**
 * @file Persiste marcas em foto: `localStorage` e post assinado quando o autor é local.
 */

import * as photoTags from "../photo-tags.js";
import * as cacheNode from "../cache-node.js";
import * as localAccount from "../identity/index.js";
import * as postOwnership from "../post-ownership.js";

/**
 * Grava marcas localmente e re-assina o post quando a mutação é permitida neste aparelho.
 *
 * @param {string} postId Id do post com foto.
 * @param {object[]} tags Lista de marcas normalizada.
 * @returns {Promise<object[]>} Tags persistidas após saneamento.
 */
export async function persistPhotoTags(postId, tags) {
  const clean = photoTags.setLocalTags(postId, tags);
  const rec = await cacheNode.getPostRecord(postId);
  if (!rec) return clean;
  const me = await localAccount.getRouteId();
  if (!postOwnership.canMutateLocalPost(rec, me)) return clean;
  const { sig: _sig, pubKey: _pubKey, ...rest } = rec;
  const signed = await localAccount.signPayload({
    ...rest,
    photoTags: clean,
    editedAt: Date.now(),
  });
  await cacheNode.saveLocalPost(signed);
  return clean;
}
