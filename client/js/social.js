/**
 * Gerenciador de interações sociais locais (Likes, Bookmarks/Salvos).
 * Persiste preferências do usuário em localStorage de forma privada e instantânea.
 */

const LIKES_KEY = "vox-liked-posts";
const SAVED_KEY = "vox-saved-posts";

function loadSet(key) {
  if (typeof window === "undefined" || !window.localStorage) return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveSet(key, set) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch {}
}

export function isLiked(postId) {
  if (!postId) return false;
  return loadSet(LIKES_KEY).has(postId);
}

export function getLikesCount(postId, baseCount = 0) {
  const base = Number(baseCount) || 0;
  return isLiked(postId) ? base + 1 : base;
}

export function toggleLike(postId, baseCount = 0) {
  if (!postId) return { liked: false, count: Number(baseCount) || 0 };
  const set = loadSet(LIKES_KEY);
  let liked = false;
  if (set.has(postId)) {
    set.delete(postId);
    liked = false;
  } else {
    set.add(postId);
    liked = true;
  }
  saveSet(LIKES_KEY, set);
  const count = (Number(baseCount) || 0) + (liked ? 1 : 0);
  return { liked, count };
}

export function isSaved(postId) {
  if (!postId) return false;
  return loadSet(SAVED_KEY).has(postId);
}

export function toggleSave(postId) {
  if (!postId) return false;
  const set = loadSet(SAVED_KEY);
  let saved = false;
  if (set.has(postId)) {
    set.delete(postId);
    saved = false;
  } else {
    set.add(postId);
    saved = true;
  }
  saveSet(SAVED_KEY, set);
  return saved;
}
