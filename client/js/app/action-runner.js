/**
 * @file Despacho seguro de ações de botão (`aria-busy`/`disabled` + `try/finally` + toast).
 *
 * Evita duplo clique e garante restauração do estado do botão mesmo após exceção.
 *
 * @module app/action-runner
 */

import * as share from "../share.js";

const busyButtons = new WeakSet();

/**
 * Diz se o botão já está ocupado por uma ação em andamento.
 *
 * @param {HTMLElement} btn
 * @returns {boolean}
 */
function isButtonBusy(btn) {
  return busyButtons.has(btn) || Boolean(btn.disabled) || btn.getAttribute?.("aria-busy") === "true";
}

/**
 * Trava o botão durante a ação e guarda o estado para restaurar depois.
 *
 * @param {HTMLElement} btn
 * @param {string|undefined} busyText Texto exibido enquanto ocupado
 * @returns {{text: string, disabled: boolean}}
 */
function lockButton(btn, busyText) {
  const snapshot = { text: btn.textContent, disabled: Boolean(btn.disabled) };
  busyButtons.add(btn);
  btn.disabled = true;
  btn.setAttribute?.("aria-busy", "true");
  if (typeof busyText === "string" && busyText) btn.textContent = busyText;
  return snapshot;
}

/**
 * Devolve o botão ao estado guardado por `lockButton`.
 *
 * @param {HTMLElement} btn
 * @param {{text: string, disabled: boolean}} snapshot Estado anterior do botão.
 */
function restoreButton(btn, snapshot) {
  busyButtons.delete(btn);
  if (btn.isConnected === false) return;
  btn.removeAttribute?.("aria-busy");
  btn.disabled = snapshot.disabled;
  if (typeof snapshot.text === "string") btn.textContent = snapshot.text;
}

/**
 * Mostra a falha de uma ação: usa `onError` quando existe, senão um aviso de erro.
 *
 * @param {unknown} err Erro lançado pela ação.
 * @param {{onError?: Function, errorToast?: string}} opts Opções da ação.
 */
function handleActionFailure(err, opts) {
  if (typeof opts.onError === "function") {
    opts.onError(err);
    return;
  }
  share.showToast(opts.errorToast || err?.message || "Não foi possível concluir a ação.", "error");
}

/**
 * Executa uma ação assíncrona travando o botão contra duplo clique e restaurando no `finally`.
 * @template T
 * @param {HTMLElement|null|undefined} btn Botão acionado.
 * @param {(btn: HTMLElement) => Promise<T>|T} fn Ação a executar.
 * @param {{ busyText?: string, errorToast?: string, onError?: (err: unknown) => void }} [opts={}] Opções visuais/erro.
 * @returns {Promise<T|undefined>} Retorno da ação ou `undefined` se bloqueado/falhou.
 */
export async function runButtonAction(btn, fn, opts = {}) {
  if (!btn || typeof fn !== "function" || isButtonBusy(btn)) return undefined;
  const snapshot = lockButton(btn, opts.busyText);
  try {
    return await fn(btn);
  } catch (err) {
    handleActionFailure(err, opts);
    return undefined;
  } finally {
    restoreButton(btn, snapshot);
  }
}

/**
 * Combina as opções padrão com as sobrescritas nos atributos `data-` do botão.
 *
 * @param {HTMLElement} btn Botão com `data-busy-text` e `data-error-toast` opcionais.
 * @param {object} defaultOpts Opções padrão.
 * @returns {object}
 */
function resolveActionOptions(btn, defaultOpts) {
  return {
    ...defaultOpts,
    busyText: btn.dataset?.busyText ?? defaultOpts.busyText,
    errorToast: btn.dataset?.errorToast ?? defaultOpts.errorToast,
  };
}

/**
 * Delega cliques `[data-action]` num contêiner para `handlers` via {@link runButtonAction}.
 * @param {Element|Document|null|undefined} rootEl Raiz onde ouvir cliques.
 * @param {Record<string, (btn: HTMLElement, ev: Event) => Promise<unknown>|unknown>} handlers Mapa ação → função.
 * @param {{ busyText?: string, errorToast?: string, onError?: (err: unknown) => void }} [defaultOpts={}] Opções padrão.
 * @returns {() => void} Função que remove o listener.
 */
export function bindActionDelegate(rootEl, handlers, defaultOpts = {}) {
  if (!rootEl || typeof rootEl.addEventListener !== "function" || !handlers) return () => {};
  /**
   * Trata o clique: acha o `data-action`, chama o handler registrado e roda a ação com o botão travado.
   *
   * @param {Event} ev Evento de clique delegado.
   */
  const onClick = (ev) => {
    const btn = ev.target?.closest?.("[data-action]");
    const action = btn?.dataset?.action;
    const handler = action && Object.hasOwn(handlers, action) ? handlers[action] : null;
    if (!handler) return;
    ev.preventDefault?.();
    void runButtonAction(btn, () => handler(btn, ev), resolveActionOptions(btn, defaultOpts));
  };
  rootEl.addEventListener("click", onClick);
  return () => rootEl.removeEventListener("click", onClick);
}
