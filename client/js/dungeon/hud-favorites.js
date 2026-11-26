/**
 * @file Favoritos do HUD (spec hud-jogo-v0, D1): lista de até 6 chaves (`action:<id>` ou `item:<id>`) em `sheet_meta.favorites`.
 * @module dungeon/hud-favorites
 */

/** Teto de favoritos na barra do HUD. */
export const FAVORITES_MAX = 6;
const KEY_RE = /^(action|item):[^\s]{1,48}$/;

/**
 * Normaliza a lista: só chaves válidas, sem repetição, no máximo `FAVORITES_MAX`.
 * @param {unknown} raw Lista crua (de arquivo ou de outra pessoa).
 * @returns {string[]} Lista segura.
 */
export function normalizeFavorites(raw) {
  if (!Array.isArray(raw)) return [];
  const keys = raw.filter((k) => typeof k === "string" && KEY_RE.test(k));
  return [...new Set(keys)].slice(0, FAVORITES_MAX);
}

/**
 * Liga ou desliga um favorito. Com a barra cheia, uma chave nova não entra.
 * @param {unknown} list Lista atual.
 * @param {string} key Chave `action:<id>` ou `item:<id>`.
 * @returns {{favorites: string[], changed: boolean}} Nova lista e se algo mudou.
 */
export function toggleFavorite(list, key) {
  const cur = normalizeFavorites(list);
  if (!KEY_RE.test(String(key))) return { favorites: cur, changed: false };
  if (cur.includes(key)) return { favorites: cur.filter((k) => k !== key), changed: true };
  if (cur.length >= FAVORITES_MAX) return { favorites: cur, changed: false };
  return { favorites: [...cur, key], changed: true };
}
