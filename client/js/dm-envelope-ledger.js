/**
 * @file IDs de envelope DM já aplicados (reação/leitura) — evita replay que alterna estado.
 *
 * @module dm-envelope-ledger
 */

/** Chave em `localStorage` (só neste aparelho). @type {string} */
export const DM_SEEN_ENVELOPE_STORAGE_KEY = "vox-dm-seen-envelope-ids-v1";

/** @type {number} */
const MAX_SEEN_IDS = 2048;

/**
 * @param {Storage} storage
 * @returns {Set<string>}
 */
function loadSeenSet(storage) {
  try {
    const raw = JSON.parse(storage.getItem(DM_SEEN_ENVELOPE_STORAGE_KEY) || "[]");
    return new Set(Array.isArray(raw) ? raw.filter((x) => typeof x === "string" && x) : []);
  } catch {
    return new Set();
  }
}

/**
 * @param {string} id
 * @param {Storage} [storage]
 * @returns {boolean}
 */
export function isSeenDmEnvelopeId(id, storage = globalThis.localStorage) {
  const key = String(id || "").trim();
  if (!key || !storage) return false;
  return loadSeenSet(storage).has(key);
}

/**
 * @param {string} id
 * @param {Storage} [storage]
 * @returns {void}
 */
export function markSeenDmEnvelopeId(id, storage = globalThis.localStorage) {
  const key = String(id || "").trim();
  if (!key || !storage) return;
  const set = loadSeenSet(storage);
  if (set.has(key)) return;
  set.add(key);
  const arr = [...set];
  while (arr.length > MAX_SEEN_IDS) arr.shift();
  storage.setItem(DM_SEEN_ENVELOPE_STORAGE_KEY, JSON.stringify(arr));
}