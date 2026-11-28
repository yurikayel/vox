/**
 * @file Carga sob demanda de telas raras (PM-01): `import()` que lembra só o sucesso. Uma falha (sem rede, arquivo
 * ainda fora do cache) não fica guardada; a tela mostra um aviso com "Tentar de novo" e a próxima tentativa importa de
 * novo. Antes, `x ??= import(...)` guardava a promessa rejeitada e a tela nunca mais abria até recarregar a página.
 * @module app/lazy-module
 */
import { renderStateCard } from "../shared/state-card.js";

const FAILURE_TEXT = "Esta tela precisa de conexão na primeira vez. Confira a internet e tente de novo.";

/**
 * Troca o conteúdo da tela por um aviso de falha com "Tentar de novo". A tela anterior continua no shell; só o miolo muda.
 *
 * @param {() => unknown} retry Refaz a abertura da tela quando a pessoa toca no botão.
 * @returns {void}
 * @throws {Error} Quando não há miolo de tela para mostrar o aviso.
 */
function showLoadFailure(retry) {
  const main = document.getElementById("app-main");
  if (!main) throw new Error("Tela rara sem conexão e sem lugar para mostrar o aviso.");
  main.innerHTML = renderStateCard({
    kind: "offline",
    text: FAILURE_TEXT,
    action: { label: "Tentar de novo", data: { "lazy-retry": "1" } },
  });
  main.querySelector("[data-lazy-retry]")?.addEventListener("click", () => retry(), { once: true });
}

/**
 * Memoiza só o sucesso de um carregador: a promessa vale enquanto está em voo ou resolvida e é esquecida ao rejeitar.
 *
 * @template M
 * @param {() => () => Promise<M>} getLoader Devolve o carregador atual (trocável pelos testes).
 * @returns {{load: () => Promise<M>, forget: () => void}} `load` devolve o módulo; `forget` descarta o que está guardado.
 */
function memoizeSuccess(getLoader) {
  let pending = null;
  return {
    load() {
      if (pending) return pending;
      const attempt = Promise.resolve().then(() => getLoader()());
      pending = attempt;
      attempt.catch(() => {
        if (pending === attempt) pending = null;
      });
      return attempt;
    },
    forget() {
      pending = null;
    },
  };
}

/**
 * Cria o carregador de um módulo sob demanda: guarda a promessa enquanto ela vale (em voo ou resolvida) e a esquece
 * quando rejeita, para a próxima chamada tentar de novo.
 *
 * @template M
 * @param {() => Promise<M>} loader Faz o `import()` do módulo.
 * @returns {{
 *   load: () => Promise<M>,
 *   open: <R>(run: (mod: M) => R) => Promise<R|void>,
 *   useLoaderForTests: (next: () => Promise<M>) => () => void,
 * }} `load` devolve o módulo (rejeita se falhar); `open(run)` carrega e roda `run`, e na falha de carga mostra o aviso com
 * "Tentar de novo"; `useLoaderForTests` troca o `import()` por outro e devolve a função que restaura o original.
 */
export function lazyModule(loader) {
  let current = loader;
  const memo = memoizeSuccess(() => current);
  async function open(run) {
    let mod;
    try {
      mod = await memo.load();
    } catch {
      return showLoadFailure(() => open(run));
    }
    return run(mod);
  }
  function useLoaderForTests(next) {
    const original = current;
    current = next;
    memo.forget();
    return () => {
      current = original;
      memo.forget();
    };
  }
  return { load: memo.load, open, useLoaderForTests };
}
