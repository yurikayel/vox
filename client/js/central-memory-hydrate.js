/**
 * @file PM-86 — o que volta da memória central passa pelas regras da malha: assinatura, bloqueio, PM-09
 * e autor do post. A mídia do `mediaRef` fica no registro, fora da forma assinada (`MEDIA_FIELD`).
 */
import * as cacheNode from "./cache-node.js";
import * as localAccount from "./local-account.js";
import * as mediaBlob from "./media-blob.js";
import * as moderation from "./moderation.js";
import { MEDIA_FIELD, WIRE_MARK } from "./post-wire.js";

export function itemTimestamp(item) {
  if (!item || typeof item !== "object") return 0;
  return Number(item.updatedAt || item.editedAt || item.ts || item.timestamp || item.createdAt || 0);
}

/** Campos que só o aparelho escreve; um item que já chega com eles não é forma assinada. */
const hasLocalOnlyKeys = (item) => WIRE_MARK in item || MEDIA_FIELD in item;

/** Assinado por quem diz ser o autor e não bloqueado. */
async function isTrustedItem(item) {
  if (!item?.id || !item.sig || !item.author || hasLocalOnlyKeys(item)) return false;
  if (moderation.shouldDropGossip(item.author)) return false;
  return localAccount.verifyPayload(item);
}

/** Guarda só blobs cujo conteúdo bate com o hash; devolve os aceitos por hash. */
export async function hydrateBlobs(blobs) {
  const byHash = new Map();
  if (!Array.isArray(blobs)) return byHash;
  for (const blob of blobs) {
    if (!blob?.hash || !blob?.data || !(await mediaBlob.verifyMediaBlob(blob))) continue;
    byHash.set(blob.hash, blob);
    if (!mediaBlob.defaultBlobStorage.has(blob.hash)) await mediaBlob.defaultBlobStorage.put(blob);
  }
  return byHash;
}

async function hydrateSingleTombstone(tomb) {
  if (!(await isTrustedItem(tomb)) || (await cacheNode.getTombstone(tomb.id))) return false;
  const post = await cacheNode.getLocalPost(tomb.id);
  if (post?.author && post.author !== tomb.author) return false;
  await cacheNode.saveTombstone(tomb);
  return true;
}

export async function hydrateTombstones(tombstones) {
  if (!Array.isArray(tombstones)) return 0;
  let added = 0;
  for (const tomb of tombstones) {
    if (await hydrateSingleTombstone(tomb)) added += 1;
  }
  return added;
}

async function isAcceptablePost(post) {
  if (!(await isTrustedItem(post))) return false;
  if (post.type === "community_update" && !(await cacheNode.isCommunityUpdateAcceptable(post))) return false;
  const current = await cacheNode.getLocalPost(post.id);
  if (!current) return true;
  return current.author === post.author && itemTimestamp(current) < itemTimestamp(post);
}

/** `onAccepted(post)` roda para cada post aceito (ex.: cartão de diretório do autor). */
export async function hydratePosts(posts, blobsByHash = new Map(), onAccepted = () => {}) {
  if (!Array.isArray(posts)) return 0;
  let added = 0;
  for (const post of posts) {
    if (!(await isAcceptablePost(post))) continue;
    onAccepted(post);
    if (await cacheNode.saveLocalPost(mediaBlob.withLocalMedia(post, blobsByHash.get(post.mediaHash || post.mediaRef?.hash)))) added += 1;
  }
  return added;
}
