/**
 * @file Chave segura para mapas guardados em objeto comum: barra ids vindos de fora (comunidade, endereço, gateway)
 * que mexeriam no protótipo (`__proto__`, `constructor`, `prototype`) em vez de virar uma entrada do mapa.
 */

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Diz se `key` pode ser usada como propriedade de um mapa comum sem tocar no protótipo.
 *
 * @param {unknown} key Chave candidata (id de comunidade, endereço, rótulo de gateway…).
 * @returns {key is string} `true` para string não vazia que não seja nome de protótipo.
 */
export function isSafeKey(key) {
  return typeof key === "string" && key !== "" && !FORBIDDEN_KEYS.has(key);
}

/**
 * Cópia do mapa com `key` valendo `value`, montada por `Map` + `Object.fromEntries`: a chave vira sempre uma
 * entrada própria, nunca uma escrita dinâmica no objeto (que, com `__proto__`, trocaria o protótipo).
 *
 * @template T
 * @param {Record<string, T>|null|undefined} obj Mapa atual (lido do `localStorage`).
 * @param {string} key Chave (já conferida com {@link isSafeKey}).
 * @param {T} value Valor novo.
 * @returns {Record<string, T>} Mapa novo; o original não é alterado.
 */
export function withEntry(obj, key, value) {
  const entries = new Map(Object.entries(obj && typeof obj === "object" ? obj : {}));
  entries.set(key, value);
  return Object.fromEntries(entries);
}
