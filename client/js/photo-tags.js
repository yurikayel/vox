/**
 * Marcas em fotos — pin x/y (%) + alvo (vx_ / handle).
 * Sem reconhecimento facial. Sem scrape. Extra field que pares desconhecidos ignoram.
 */

const TAGS_KEY = "vox-photo-tags-v1";
export const TAGS_MAX = 12;
export const TAGS_HINT =
  "Marca local; quem não está na sua agenda não é notificado magicamente.";

function loadAll() {
  if (typeof window === "undefined" || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(TAGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAll(map) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(TAGS_KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

export function clampPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v * 10) / 10));
}

export function normalizeTag(raw) {
  const targetId = String(raw?.targetId || "").trim().slice(0, 80);
  if (!targetId) return null;
  return {
    x: clampPct(raw.x),
    y: clampPct(raw.y),
    targetId,
    label: String(raw?.label || "").trim().slice(0, 40),
  };
}

export function sanitizeTags(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const tag = normalizeTag(raw);
    if (!tag) continue;
    const key = `${tag.targetId}@${tag.x},${tag.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= TAGS_MAX) break;
  }
  return out;
}

export function getLocalTags(postId) {
  const id = String(postId || "").trim();
  if (!id) return [];
  return sanitizeTags(loadAll()[id]);
}

export function setLocalTags(postId, tags) {
  const id = String(postId || "").trim();
  if (!id) return [];
  const clean = sanitizeTags(tags);
  const map = loadAll();
  if (!clean.length) delete map[id];
  else map[id] = clean;
  saveAll(map);
  return clean;
}

export function listTags(post) {
  const fromPost = sanitizeTags(post?.photoTags);
  if (fromPost.length) return fromPost;
  return getLocalTags(post?.id);
}

export function addTag(list, raw) {
  return sanitizeTags([...(list || []), raw]);
}

export function __resetPhotoTagsForTests() {
  try {
    localStorage.removeItem(TAGS_KEY);
  } catch {
    /* ignore */
  }
}
