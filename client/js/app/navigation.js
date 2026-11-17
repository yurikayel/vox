/**
 * @file Desvio do `route()` para quebrar ciclos de import entre telas e o roteador.
 */
/** @type {() => Promise<void>} */
let _route = async () => {};
/**
 * Registra a implementação real do roteamento (chamada uma vez em `route.js`).
 *
 * @param {() => Promise<void>} fn Função que aplica hash → tela.
 * @returns {void}
 */
export function setRoute(fn) {
  _route = fn;
}
/**
 * Dispara o roteamento registrado por {@link setRoute}.
 *
 * @returns {Promise<void>}
 */
export function route() {
  return _route();
}
