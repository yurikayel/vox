/**
 * @file Contêiner de modal avulso no <body>, para modais que abrem fora do #modal-container
 * (denúncia, apontamento). Criado sob demanda; limpar o conteúdo fecha o modal.
 */

import { createFocusTrap } from "./focus-trap.js";

/** @type {WeakMap<HTMLElement, ReturnType<typeof createFocusTrap>>} */
const hostTraps = new WeakMap();

/**
 * Observa filhos do host e liga/desliga o preso de foco conforme o conteúdo.
 * @param {HTMLElement} el Contêiner do modal.
 * @param {ReturnType<typeof createFocusTrap>} trap Preso associado.
 * @returns {void}
 */
function watchModalContent(el, trap) {
  /**
   * Mostra ou oculta o hospedeiro conforme ele tem modais dentro.
   */
  const sync = () => {
    const hasChildren = (el.childNodes?.length ?? 0) > 0;
    if (hasChildren) trap.activate();
    else trap.deactivate();
  };
  if (typeof MutationObserver === "undefined") {
    sync();
    return;
  }
  const observer = new MutationObserver(sync);
  observer.observe(el, { childList: true, subtree: false });
  sync();
}

/**
 * Garante um contêiner de modal no `<body>` pelo `id` (cria se não existir).
 * @param {string} id ID do elemento.
 * @param {Document} [doc=globalThis.document]
 * @returns {HTMLElement}
 */
export function modalHost(id, doc = globalThis.document) {
  let el = doc.getElementById(id);
  if (!el) {
    el = doc.createElement("div");
    el.id = id;
    doc.body.appendChild(el);
  }
  if (!hostTraps.has(el)) {
    const trap = createFocusTrap(el, { doc });
    hostTraps.set(el, trap);
    watchModalContent(el, trap);
  }
  return el;
}

/**
 * Esvazia o contêiner do modal (fecha visualmente sem remover o nó) e devolve o foco.
 * @param {string} id ID do elemento.
 * @param {Document} [doc=globalThis.document]
 * @returns {void}
 */
export function clearModalHost(id, doc = globalThis.document) {
  const el = doc?.getElementById?.(id);
  if (!el) return;
  hostTraps.get(el)?.deactivate();
  el.innerHTML = "";
}