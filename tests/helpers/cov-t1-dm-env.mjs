/**
 * @file Ambiente compartilhado dos testes de DM do lote T1: relay HTTP em memória, `navigator`
 * com área de transferência e `location` falsos. Criptografia e IndexedDB são os reais.
 */

const realFetch = globalThis.fetch;
const realNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");

/**
 * Relay em memória: serve `inbox` para o dono, aceita POST em `/inbox/<to>` e anota o que foi apagado.
 *
 * @param {string} me Rota dona da caixa.
 * @param {{inbox?: object[], failPush?: boolean, failPull?: boolean}} [opts] Estado inicial e falhas forçadas.
 * @returns {{pushed: {to: string, env: object}[], deleted: string[], inbox: object[], opts: object}} Registro do que passou.
 */
export function installRelay(me, opts = {}) {
  const log = { pushed: [], deleted: [], inbox: opts.inbox || [], opts };
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (init.method === "DELETE") {
      log.deleted.push(decodeURIComponent(u.split("/").pop()));
      return { ok: true, json: async () => ({}) };
    }
    if (init.method === "POST" && u.includes("/inbox/")) {
      if (opts.failPush) return { ok: false, status: 503, text: async () => "" };
      log.pushed.push({ to: decodeURIComponent(u.split("/inbox/")[1]), env: JSON.parse(init.body) });
      return { ok: true, json: async () => ({ ok: true }) };
    }
    if (u.includes(`/inbox/${encodeURIComponent(me)}`)) {
      if (opts.failPull) throw new Error("relay fora do ar");
      return { ok: true, json: async () => ({ envelopes: log.inbox.splice(0) }) };
    }
    return { ok: false, status: 404, text: async () => "" };
  };
  return log;
}

/**
 * Troca `navigator` por um falso com área de transferência que grava o que recebe.
 *
 * @returns {{copied: string[]}} Textos copiados.
 */
export function installClipboard() {
  const copied = [];
  Object.defineProperty(globalThis, "navigator", {
    value: { clipboard: { writeText: (t) => { copied.push(t); } } },
    configurable: true,
    writable: true,
  });
  return { copied };
}

/** Devolve `fetch` e `navigator` originais. */
export function restoreEnv() {
  globalThis.fetch = realFetch;
  if (realNavigator) Object.defineProperty(globalThis, "navigator", realNavigator);
}

/**
 * Cede ao laço de eventos para as chamadas assíncronas disparadas por ouvintes terminarem.
 *
 * @param {number} [ms=40] Espera em milissegundos.
 * @returns {Promise<void>} Resolve após `ms`.
 */
export const settle = (ms = 40) => new Promise((r) => setTimeout(r, ms));
