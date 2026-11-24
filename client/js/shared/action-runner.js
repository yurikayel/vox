/**
 * @file Primitiva pura de despacho seguro de ações de botão (`WeakSet` + `disabled` + `aria-busy` + `try/finally`).
 *
 * Evita duplo clique e garante restauração do estado do botão mesmo após exceção, sem depender de camadas superiores (`app/`).
 *
 * @module shared/action-runner
 */

const busyButtons = new WeakSet();

/**
 * Diz se o elemento já está ocupado por uma ação em andamento.
 *
 * @param {HTMLElement} el Elemento acionado.
 * @returns {boolean}
 */
function isButtonBusy(el) {
  return busyButtons.has(el) || Boolean(el.disabled) || el.getAttribute?.("aria-busy") === "true";
}

/**
 * Trava o elemento durante a ação e guarda o estado para restaurar depois.
 *
 * @param {HTMLElement} el Botão acionado.
 * @param {string|undefined} busyText Texto exibido enquanto ocupado.
 * @returns {{text: string, disabled: boolean}}
 */
function lockButton(el, busyText) {
  const snapshot = { text: el.textContent, disabled: Boolean(el.disabled) };
  busyButtons.add(el);
  el.disabled = true;
  el.setAttribute?.("aria-busy", "true");
  if (typeof busyText === "string" && busyText) el.textContent = busyText;
  return snapshot;
}

/**
 * Devolve o elemento ao estado guardado por `lockButton`.
 *
 * @param {HTMLElement} el Botão acionado.
 * @param {{text: string, disabled: boolean}} snapshot Estado anterior do elemento.
 */
function restoreButton(el, snapshot) {
  busyButtons.delete(el);
  if (el.isConnected === false) return;
  el.removeAttribute?.("aria-busy");
  el.disabled = snapshot.disabled;
  if (typeof snapshot.text === "string") el.textContent = snapshot.text;
}

/**
 * Combina as opções padrão com as sobrescritas nos atributos `data-` do elemento.
 *
 * @param {HTMLElement} el Elemento com `data-busy-text` e `data-error-toast` opcionais.
 * @param {object} defaultOpts Opções padrão.
 * @returns {object}
 */
function resolveActionOptions(el, defaultOpts) {
  return {
    ...defaultOpts,
    busyText: el.dataset?.busyText ?? defaultOpts.busyText,
    errorToast: el.dataset?.errorToast ?? defaultOpts.errorToast,
  };
}

/**
 * Executa uma ação assíncrona travando o botão contra duplo clique e restaurando no `finally`.
 * @template T
 * @param {HTMLElement|null|undefined} el Elemento acionado.
 * @param {(el: HTMLElement) => Promise<T>|T} fn Ação a executar.
 * @param {{ busyText?: string, errorToast?: string, onError?: (err: unknown, opts?: object) => void }} [opts={}] Opções visuais e de erro.
 * @returns {Promise<T|undefined>} Retorno da ação ou `undefined` se bloqueado/tratado por `onError`.
 */
export async function runButtonAction(el, fn, opts = {}) {
  if (!el || typeof fn !== "function" || isButtonBusy(el)) return undefined;
  const snapshot = lockButton(el, opts.busyText);
  try {
    return await fn(el);
  } catch (err) {
    if (typeof opts.onError === "function") {
      opts.onError(err, opts);
      return undefined;
    }
    throw err;
  } finally {
    restoreButton(el, snapshot);
  }
}

/**
 * Delega cliques `[data-action]` num contêiner para `handlers` via {@link runButtonAction}.
 * @param {Element|Document|null|undefined} rootEl Raiz onde ouvir cliques.
 * @param {Record<string, (el: HTMLElement, ev: Event) => Promise<unknown>|unknown>} handlers Mapa ação → função.
 * @param {{ busyText?: string, errorToast?: string, onError?: (err: unknown, opts?: object) => void }} [defaultOpts={}] Opções padrão.
 * @returns {() => void} Função que remove o listener.
 */
export function bindActionDelegate(rootEl, handlers, defaultOpts = {}) {
  if (!rootEl || typeof rootEl.addEventListener !== "function" || !handlers) return () => {};
  const onClick = (ev) => {
    const btn = ev.target?.closest?.("[data-action]");
    const action = btn?.dataset?.action;
    const handler = action && Object.hasOwn(handlers, action) ? handlers[action] : null;
    if (!handler) return;
    ev.preventDefault?.();
    void runButtonAction(btn, () => handler(btn, ev), resolveActionOptions(btn, defaultOpts)).catch(() => {});
  };
  rootEl.addEventListener("click", onClick);
  return () => rootEl.removeEventListener("click", onClick);
}
