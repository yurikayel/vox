/**
 * @file Armadilha de foco para diálogos e menus modais: Tab e Shift+Tab circulam dentro do contêiner,
 * Esc fecha e, ao soltar, o foco volta para quem abriu (WCAG 2.1.2 e 2.4.3).
 *
 * Armadilhas empilhadas: só a mais recente reage ao teclado, então um modal aberto sobre o menu ⋯
 * não perde o foco para o menu de baixo.
 *
 * @module render/focus-trap
 */

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Armadilhas ativas, da mais antiga à mais recente. */
const stack = [];

/**
 * Elementos focáveis visíveis do contêiner, na ordem do documento.
 *
 * @param {ParentNode} container Raiz do diálogo.
 * @returns {HTMLElement[]}
 */
export function focusableIn(container) {
  const all = Array.from(container?.querySelectorAll?.(FOCUSABLE) ?? []);
  return all.filter((el) => !el.hidden && !el.closest?.("[hidden]"));
}

/** Decide o próximo foco de um Tab; devolve o elemento a focar ou `null` se o navegador pode seguir. */
function nextTabTarget(container, event, active) {
  const items = focusableIn(container);
  if (!items.length) return container;
  const first = items[0];
  const last = items[items.length - 1];
  if (!container.contains(active)) return event.shiftKey ? last : first;
  if (event.shiftKey && active === first) return last;
  if (!event.shiftKey && active === last) return first;
  return null;
}

function makeKeyHandler(container, doc, onEscape) {
  return (event) => {
    if (stack[stack.length - 1]?.container !== container) return;
    if (event.key === "Escape") {
      event.preventDefault?.();
      onEscape?.();
      return;
    }
    if (event.key !== "Tab") return;
    const target = nextTabTarget(container, event, doc.activeElement);
    if (!target) return;
    event.preventDefault?.();
    target.focus?.();
  };
}

/**
 * Prende o foco no contêiner até o `release` ser chamado.
 *
 * @param {HTMLElement} container Diálogo ou folha; precisa conter ao menos um elemento focável (ou aceitar foco).
 * @param {object} [options]
 * @param {() => void} [options.onEscape] Chamado no Esc; quem chama decide como fechar.
 * @param {HTMLElement|null} [options.restoreTo] Quem recebe o foco ao soltar; padrão: o elemento ativo de antes.
 * @param {Document} [options.doc] Documento (injetável nos testes).
 * @returns {(opts?: {restore?: boolean}) => void} `release`: remove a armadilha e devolve o foco (idempotente).
 */
export function trapFocus(container, { onEscape, restoreTo, doc = globalThis.document } = {}) {
  const opener = restoreTo ?? doc.activeElement;
  const handler = makeKeyHandler(container, doc, onEscape);
  stack.push({ container });
  doc.addEventListener("keydown", handler);
  let released = false;
  return ({ restore = true } = {}) => {
    if (released) return;
    released = true;
    doc.removeEventListener("keydown", handler);
    const at = stack.findIndex((t) => t.container === container);
    if (at >= 0) stack.splice(at, 1);
    if (restore) opener?.focus?.();
  };
}
