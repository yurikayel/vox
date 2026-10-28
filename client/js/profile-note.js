/**
 * Nota curta no perfil (local-first).
 * Expira em 24h. Na malha só se o cartão de perfil circular.
 * Não é Stories / notes do Instagram.
 */

const NOTES_KEY = "vox-profile-notes-v1";

export const NOTE_MAX = 80;
export const NOTE_TTL_MS = 24 * 60 * 60 * 1000;
export const NOTE_HINT =
  "Nota neste aparelho / na malha se o cartão de perfil circular. Não é Stories do Instagram.";

function loadMap() {
  if (typeof window === "undefined" || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(NOTES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveMap(map) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(NOTES_KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

export function clipNote(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, NOTE_MAX);
}

export function isNoteFresh(rec, now = Date.now()) {
  const at = Number(rec?.updatedAt) || 0;
  if (!rec?.text || !at) return false;
  return now - at < NOTE_TTL_MS;
}

export function getNote(routeId, now = Date.now()) {
  const id = String(routeId || "").trim();
  if (!id) return null;
  const rec = loadMap()[id];
  if (!isNoteFresh(rec, now)) return null;
  return { text: rec.text, updatedAt: rec.updatedAt };
}

export function setNote(routeId, text) {
  const id = String(routeId || "").trim();
  if (!id) return null;
  const clipped = clipNote(text);
  const map = loadMap();
  if (!clipped) {
    delete map[id];
    saveMap(map);
    return null;
  }
  const rec = { text: clipped, updatedAt: Date.now() };
  map[id] = rec;
  saveMap(map);
  return rec;
}

export function clearNote(routeId) {
  return setNote(routeId, "");
}

export function ingestRemoteNote(routeId, text, updatedAt) {
  const id = String(routeId || "").trim();
  const clipped = clipNote(text);
  const at = Number(updatedAt) || 0;
  if (!id || !clipped || !at) return null;
  if (!isNoteFresh({ text: clipped, updatedAt: at })) return null;
  const map = loadMap();
  const prev = map[id];
  if (prev && Number(prev.updatedAt) >= at) return prev;
  const rec = { text: clipped, updatedAt: at };
  map[id] = rec;
  saveMap(map);
  return rec;
}

export function __resetNotesForTests() {
  try {
    localStorage.removeItem(NOTES_KEY);
  } catch {
    /* ignore */
  }
}
