/**
 * @file Deduplicador de chamadas assíncronas em voo por chave (`in-flight`).
 *
 * Evita buscas concorrentes idênticas (GraphQL config, perfis on-chain) sem manter cache paralelo.
 *
 * @module shared/async-dedupe
 */

function callAsyncSafely(fn) {
  try {
    return Promise.resolve(fn());
  } catch (err) {
    return Promise.reject(err);
  }
}

function clearMapByPrefix(inFlight, prefix) {
  if (!prefix) {
    inFlight.clear();
    return;
  }
  for (const key of inFlight.keys()) {
    if (key.startsWith(prefix)) inFlight.delete(key);
  }
}

/**
 * Cria um registro isolado de promessas em voo.
 * @returns {{ run: <T>(key: string, fn: () => Promise<T>) => Promise<T>, clear: (prefix?: string) => void, has: (key: string) => boolean, size: () => number }} Controlador de deduplicação.
 */
export function createAsyncDeduper() {
  const inFlight = new Map();

  function run(key, fn) {
    if (typeof fn !== "function") return Promise.reject(new TypeError("async-dedupe: fn obrigatória"));
    const cleanKey = String(key || "");
    if (!cleanKey) return callAsyncSafely(fn);
    if (inFlight.has(cleanKey)) return inFlight.get(cleanKey);

    let tracked;
    tracked = callAsyncSafely(fn).finally(() => {
      if (inFlight.get(cleanKey) === tracked) inFlight.delete(cleanKey);
    });
    inFlight.set(cleanKey, tracked);
    return tracked;
  }

  return {
    run,
    clear: (prefix = "") => clearMapByPrefix(inFlight, prefix),
    has: (key) => inFlight.has(String(key || "")),
    size: () => inFlight.size,
  };
}

const defaultDeduper = createAsyncDeduper();

/**
 * Executa `fn` compartilhando a mesma `Promise` enquanto houver chamada em voo para `key`.
 * @template T
 * @param {string} key Chave canônica da operação.
 * @param {() => Promise<T>} fn Operação assíncrona a executar.
 * @returns {Promise<T>} Promessa compartilhada.
 */
export function dedupeAsync(key, fn) {
  return defaultDeduper.run(key, fn);
}

/**
 * Remove entradas em voo (todas ou apenas as iniciadas por `prefix`, ex.: troca de conta).
 * @param {string} [prefix=""] Prefixo opcional das chaves.
 * @returns {void}
 */
export function clearInFlight(prefix = "") {
  defaultDeduper.clear(prefix);
}

/**
 * Quantidade de chaves atualmente em voo no deduplicador padrão.
 * @returns {number} Total ativo.
 */
export function inFlightCount() {
  return defaultDeduper.size();
}
