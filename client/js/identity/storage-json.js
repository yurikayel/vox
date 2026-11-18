/**
 * @file Leitura e gravação de JSON no `localStorage` para as chaves de identidade (guardiões, trava de chaves,
 * saídas da conta). O que está guardado pode ter sido corrompido ou mexido à mão; aqui "mapa" é só objeto plano
 * (nem array, nem primitivo, nem null) e qualquer outra coisa conta como vazia. Ler nunca apaga nem regrava:
 * quem lê decide o que fazer, e o valor corrompido só some quando uma gravação legítima o substitui.
 */

/**
 * É um objeto plano (mapa ou registro)? Array, primitivo e null não são.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isPlainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Lê um mapa do `localStorage`. JSON inválido, valor que não é objeto plano ou armazenamento indisponível devolvem
 * `fallback`. A chave `__proto__` é descartada: JSON a cria como chave própria, e ela não deve ir adiante.
 * @param {string} key
 * @param {*} [fallback] devolvido quando não há mapa (padrão: `{}`)
 * @returns {*} cópia do mapa lido, ou `fallback`
 */
export function readStoredRecord(key, fallback = {}) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    if (!isPlainRecord(parsed)) return fallback;
    return Object.fromEntries(Object.entries(parsed).filter(([name]) => name !== "__proto__"));
  } catch {
    return fallback;
  }
}

/**
 * Grava JSON no `localStorage`. Cota cheia ou armazenamento bloqueado viram `false`: quem chama não pode dar o
 * dado como guardado.
 * @param {string} key
 * @param {unknown} value
 * @returns {boolean} se gravou
 */
export function writeStoredJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Entrada própria de um mapa que é registro, ou null. Nomes do protótipo (`constructor`, `__proto__`…) não contam.
 * @param {Record<string, unknown>} map
 * @param {string} id
 * @returns {object|null}
 */
export function ownRecord(map, id) {
  return Object.hasOwn(map, id) && isPlainRecord(map[id]) ? map[id] : null;
}
