/**
 * @file Despacho seguro de ações de botão na camada `app/` (`shared/action-runner` + toast padrão).
 *
 * Delega trava/restauração para `shared/action-runner.js` e preserva o aviso `share.showToast(..., "error")`
 * quando `onError` não é informado.
 *
 * @module app/action-runner
 */

import * as share from "../share.js";
import {
  runButtonAction as sharedRunButtonAction,
  bindActionDelegate as sharedBindActionDelegate,
} from "../shared/action-runner.js";

/**
 * Garante fallback para `share.showToast` quando o chamador não fornece `onError`.
 *
 * @param {object} [opts={}] Opções originais.
 * @returns {object}
 */
function withDefaultToast(opts = {}) {
  if (typeof opts.onError === "function") return opts;
  return {
    ...opts,
    onError: (err, resolvedOpts = opts) => {
      const message = resolvedOpts?.errorToast || opts.errorToast || err?.message || "Não foi possível concluir a ação.";
      share.showToast(message, "error");
    },
  };
}

/**
 * Executa uma ação assíncrona travando o botão contra duplo clique e restaurando no `finally`.
 * @template T
 * @param {HTMLElement|null|undefined} btn Botão acionado.
 * @param {(btn: HTMLElement) => Promise<T>|T} fn Ação a executar.
 * @param {{ busyText?: string, errorToast?: string, onError?: (err: unknown) => void }} [opts={}] Opções visuais/erro.
 * @returns {Promise<T|undefined>} Retorno da ação ou `undefined` se bloqueado/falhou.
 */
export function runButtonAction(btn, fn, opts = {}) {
  return sharedRunButtonAction(btn, fn, withDefaultToast(opts));
}

/**
 * Delega cliques `[data-action]` num contêiner para `handlers` via {@link runButtonAction}.
 * @param {Element|Document|null|undefined} rootEl Raiz onde ouvir cliques.
 * @param {Record<string, (btn: HTMLElement, ev: Event) => Promise<unknown>|unknown>} handlers Mapa ação → função.
 * @param {{ busyText?: string, errorToast?: string, onError?: (err: unknown) => void }} [defaultOpts={}] Opções padrão.
 * @returns {() => void} Função que remove o listener.
 */
export function bindActionDelegate(rootEl, handlers, defaultOpts = {}) {
  return sharedBindActionDelegate(rootEl, handlers, withDefaultToast(defaultOpts));
}
