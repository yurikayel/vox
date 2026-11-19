/**
 * @file Helper de `fetch` com prazo: rede que não responde não segura a tela nem o fluxo.
 * @module fetch-timeout
 */

/** Prazo padrão de um pedido, em milissegundos. */
export const DEFAULT_FETCH_TIMEOUT_MS = 8000;

/** Erro lançado quando o prazo estoura (`name === "TimeoutError"`). */
function timeoutError(ms) {
  const err = new Error(`Tempo esgotado após ${ms} ms`);
  err.name = "TimeoutError";
  return err;
}

/**
 * Liga um signal externo ao controller interno; devolve a função que desfaz a ligação.
 * @param {AbortSignal | undefined} external
 * @param {AbortController} controller
 * @returns {() => void}
 */
function linkSignal(external, controller) {
  if (!external) return () => {};
  if (external.aborted) {
    controller.abort(external.reason);
    return () => {};
  }
  const onAbort = () => controller.abort(external.reason);
  external.addEventListener("abort", onAbort, { once: true });
  return () => external.removeEventListener("abort", onAbort);
}

/**
 * `fetch` que rejeita com `TimeoutError` quando o prazo estoura, mesmo que a implementação
 * ignore o `signal`. Aceita um `signal` externo em `init`: abortar por ele também cancela.
 * @param {string | URL | Request} url
 * @param {RequestInit} [init] `init.signal` externo é respeitado.
 * @param {{ timeoutMs?: number, fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<Response>}
 */
export function fetchWithTimeout(url, init = {}, opts = {}) {
  const { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, fetchImpl = (...a) => globalThis.fetch(...a) } = opts;
  const controller = new AbortController();
  const unlink = linkSignal(init?.signal, controller);
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = timeoutError(timeoutMs);
      reject(err);
      controller.abort(err);
    }, timeoutMs);
  });
  const request = new Promise((resolve) => resolve(fetchImpl(url, { ...init, signal: controller.signal })));
  request.catch(() => {});
  return Promise.race([request, deadline]).finally(() => {
    clearTimeout(timer);
    unlink();
  });
}

/**
 * Lê o corpo da resposta (sucesso ou erro) para o socket fechar limpo após 413/429 do relay.
 * @param {Response} res
 * @param {number} [maxChars=8192] recorte para mensagens de erro
 * @returns {Promise<string>}
 */
export async function readResponseText(res, maxChars = 8192) {
  try {
    const text = await res.text();
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars - 1)}…`;
  } catch {
    return "";
  }
}
