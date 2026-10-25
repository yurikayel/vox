/** @file Deferred route() to break import cycles. */
/** @type {() => Promise<void>} */
let _route = async () => {};
export function setRoute(fn) {
  _route = fn;
}
export function route() {
  return _route();
}
