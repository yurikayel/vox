/**
 * @file Contêiner de modal avulso no <body>, para modais que abrem fora do #modal-container
 * (denúncia, apontamento). Criado sob demanda; limpar o conteúdo fecha o modal.
 */

import { createFocusTrap, focusableIn } from "./focus-trap.js";

/** @type {WeakMap<HTMLElement, ReturnType<typeof createFocusTrap>>} */
const hostTraps = new WeakMap();
/** Para onde devolver o foco quando o modal fechar, por contêiner (só vale até o preso ativar). */
const returnTargets = new WeakMap();
/** Sincroniza o preso com o conteúdo do contêiner (o mesmo que o observador chama). */
const syncs = new WeakMap();

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
    if (!hasChildren) trap.deactivate();
    else if (!trap.active()) {
      trap.activate({ returnFocus: returnTargets.get(el) });
      returnTargets.delete(el);
    }
  };
  syncs.set(el, sync);
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
  closeModalHost(doc?.getElementById?.(id));
}

/**
 * Liga o preso de foco já com o conteúdo do modal montado: guarda o gatilho para onde o foco volta ao fechar
 * (o foco do documento pode já ter caído no body, por exemplo quando o item do menu que abriu o modal some) e
 * leva o foco para dentro do diálogo. Com o modal já aberto (troca de etapa), mantém o gatilho original.
 * O gatilho vale uma abertura só: abrir sem gatilho (ou fechar) descarta o que ficou guardado.
 * @param {HTMLElement} el Contêiner devolvido por {@link modalHost}, com o conteúdo já escrito.
 * @param {{ returnFocus?: Element|null }} [opts] Gatilho que abriu o modal; sem ele vale o foco atual.
 * @returns {void}
 */
export function engageModalHost(el, { returnFocus = null } = {}) {
  if (!el) return;
  if (!hostTraps.get(el)?.active()) {
    if (returnFocus) returnTargets.set(el, returnFocus);
    else returnTargets.delete(el);
  }
  syncs.get(el)?.();
  focusableIn(el)[0]?.focus?.();
}

/**
 * Fecha o modal do contêiner: solta o preso (o foco volta ao gatilho) e esvazia o conteúdo.
 * @param {HTMLElement|null} el Contêiner do modal; `null` não faz nada.
 * @returns {void}
 */
export function closeModalHost(el) {
  if (!el) return;
  hostTraps.get(el)?.deactivate();
  el.innerHTML = "";
}