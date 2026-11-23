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
