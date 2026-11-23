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

/** Escopo da rota atual; mora aqui (e não em `route.js`) para as telas lerem sem importar o roteador. */
let _routeScope = null;
/**
 * Registra o escopo da rota que acabou de começar (chamada por `routeImpl` em `route.js`).
 *
 * @param {{ signal: AbortSignal }|null} scope Escopo da rota, ou `null` para limpar.
 * @returns {void}
 */
export function setRouteScope(scope) {
  _routeScope = scope;
}
/**
 * Escopo da rota **atual** no momento da chamada. Em telas async, capture antes do primeiro `await` e confira
 * `scope.signal.aborted` antes de desenhar: abortado quer dizer que a pessoa já foi para outra rota.
 *
 * @returns {{ signal: AbortSignal }|null}
 */
export function getRouteScope() {
  return _routeScope;
}
