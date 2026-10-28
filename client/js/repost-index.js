/** Índice sincrono: republicações próprias e contagem visível. */

import { getOriginalId } from "./repost-draft.js";

const KEY = "vox-own-reposts-v1";
let counts = new Map();

function readOwn() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") || {};
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

export function rememberVisible(posts, authorId) {
  counts = new Map();
  const own = readOwn();
  for (const p of posts || []) noteVisible(p, authorId, own);
  writeOwn(own);
}

export function hasOwnRepost(originalId) {
  return Boolean(readOwn()[String(originalId || "")]);
}

export function getOwnRepostId(originalId) {
  return readOwn()[String(originalId || "")] || "";
}

export function getVisibleCount(originalId) {
  return counts.get(String(originalId || "")) || 0;
}

export function setOwn(originalId, repostId) {
  if (!originalId || !repostId) return;
  const own = readOwn();
  own[originalId] = repostId;
  writeOwn(own);
}

export function markCreated(originalId, repostId) {
  setOwn(originalId, repostId);
  counts.set(originalId, (counts.get(originalId) || 0) + 1);
}

export function markRemoved(originalId) {
  const own = readOwn();
  delete own[originalId];
  writeOwn(own);
  const n = counts.get(originalId) || 0;
  counts.set(originalId, Math.max(0, n - 1));
}
