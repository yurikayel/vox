/**
 * @file Preso de foco (WCAG 2.1.2): Tab e Shift+Tab circulam dentro do diálogo; ao fechar, o foco volta.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), '
  + 'select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * O elemento não ocupa lugar na tela (`display: none` nele ou num ancestral) e por isso não recebe foco. Sem layout
 * (DOM em memória dos testes) devolve `false`.
 * @param {HTMLElement} el Elemento candidato.
 * @returns {boolean}
 */
function isNotRendered(el) {
  return typeof el.getClientRects === "function" && el.getClientRects().length === 0;
}

/**
 * Elementos focáveis visíveis dentro de `root`.
 * @param {ParentNode} root Nó raiz do diálogo ou menu.
 * @returns {HTMLElement[]}
 */
export function focusableIn(root) {
  if (!root?.querySelectorAll) return [];
  return [...root.querySelectorAll(FOCUSABLE)].filter((el) => {
    if (el.hidden || el.closest?.("[hidden]") || el.getAttribute?.("aria-hidden") === "true") return false;
    if (el.hasAttribute?.("disabled")) return false;
    return !isNotRendered(el);
  });
}

/**
 * @param {KeyboardEvent} e
 * @param {ParentNode} root
 * @param {Document} doc
 * @returns {void}
 */
function handleTrapTab(e, root, doc) {
  const items = focusableIn(root);
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  const current = doc.activeElement;
  const inside = current && root.contains?.(current);
  if (e.shiftKey) {
    if (current === first || !inside) {
      e.preventDefault();
      last.focus();
    }
    return;
  }
  if (current === last || !inside) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * Cria um preso de foco reutilizável para modais e folhas.
 * @param {ParentNode} root Contêiner onde o foco deve ficar.
 * @param {object} [options]
 * @param {Document} [options.doc=globalThis.document] Documento alvo.
 * @param {((e: KeyboardEvent) => void)|null} [options.onEscape=null] Ação opcional ao pressionar Escape.
 * @returns {{ activate: (opts?: { returnFocus?: Element|null }) => void, deactivate: () => void, active: () => boolean }}
 */
export function createFocusTrap(root, { doc = globalThis.document, onEscape = null } = {}) {
  let restoreFocus = null;
  let onKeyDown = null;

  /** @returns {void} */
  function deactivate() {
    if (!onKeyDown) return;
    doc?.removeEventListener?.("keydown", onKeyDown, true);
    onKeyDown = null;
    const target = restoreFocus;
    restoreFocus = null;
    target?.focus?.();
  }

  /**
   * Ativa o preso e opcionalmente define para onde devolver o foco ao desativar.
   * @param {{ returnFocus?: Element|null }} [opts]
   * @returns {void}
   */
  function activate({ returnFocus } = {}) {
    deactivate();
    const candidate = returnFocus ?? doc?.activeElement;
    restoreFocus = candidate?.focus ? candidate : null;
    onKeyDown = (e) => {
      if (e.key === "Escape" && onEscape) {
        onEscape(e);
        return;
      }
      if (e.key !== "Tab") return;
      handleTrapTab(e, root, doc);
    };
    doc?.addEventListener?.("keydown", onKeyDown, true);
  }

  return { activate, deactivate, active: () => Boolean(onKeyDown) };
}