/**
 * Nota curta no perfil (local-first).
 * Expira em 24h. Na malha só se o cartão de perfil circular.
 * Não é Stories / notes do Instagram.
 */

const NOTES_KEY = "vox-profile-notes-v1";

/**
 * Operação `NOTE_MAX` do módulo.
 * @type {*}
 */
export const NOTE_MAX = 80;
/**
 * Operação `NOTE_TTL_MS` do módulo.
 * @type {*}
 */
export const NOTE_TTL_MS = 24 * 60 * 60 * 1000;
/**
 * Operação `NOTE_HINT` do módulo.
 * @type {*}
 */
export const NOTE_HINT =
  "Nota neste aparelho / na malha se o cartão de perfil circular. Não é Stories do Instagram.";

/**
 * Lê do `localStorage` as notas de perfil.
 * @returns {object} Notas por perfil, ou objeto vazio.
 */
function loadMap() {
  if (typeof window === "undefined" || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(NOTES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Grava no `localStorage` as notas de perfil.
 * @param {object} map Notas por perfil
 */
function saveMap(map) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(NOTES_KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

/**
 * Operação `clipNote` do módulo.
 * @param {*} [text] Parâmetro `text`.
 * @returns {*} Resultado da operação.
 */
export function clipNote(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, NOTE_MAX);
}

/**
 * Operação `isNoteFresh` do módulo.
 * @param {*} [rec] Parâmetro `rec`.
 * @param {*} [now] Parâmetro `now`.
 * @returns {*} Resultado da operação.
 */
export function isNoteFresh(rec, now = Date.now()) {
  const at = Number(rec?.updatedAt) || 0;
  if (!rec?.text || !at) return false;
  return now - at < NOTE_TTL_MS;
}

/**
 * Operação `getNote` do módulo.
 * @param {*} [routeId] Parâmetro `routeId`.
 * @param {*} [now] Parâmetro `now`.
 * @returns {*} Resultado da operação.
 */
export function getNote(routeId, now = Date.now()) {
  const id = String(routeId || "").trim();
  if (!id) return null;
  const rec = loadMap()[id];
  if (!isNoteFresh(rec, now)) return null;
  return { text: rec.text, updatedAt: rec.updatedAt };
}

/**
 * Operação `setNote` do módulo.
 * @param {*} [routeId] Parâmetro `routeId`.
 * @param {*} [text] Parâmetro `text`.
 * @returns {*} Resultado da operação.
 */
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

/**
 * Operação `clearNote` do módulo.
 * @param {*} [routeId] Parâmetro `routeId`.
 * @returns {*} Resultado da operação.
 */
export function clearNote(routeId) {
  return setNote(routeId, "");
}

/**
 * Operação `ingestRemoteNote` do módulo.
 * @param {*} [routeId] Parâmetro `routeId`.
 * @param {*} [text] Parâmetro `text`.
 * @param {*} [updatedAt] Parâmetro `updatedAt`.
 * @returns {*} Resultado da operação.
 */
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

/**
 * Reseta estado de teste (`__resetNotesForTests`).
 */
export function __resetNotesForTests() {
  try {
    localStorage.removeItem(NOTES_KEY);
  } catch {
    /* ignore */
  }
}
