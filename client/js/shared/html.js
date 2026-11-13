/**
 * @file Escape de texto para HTML. Lógica pura: sem DOM, sem estado e sem imports.
 *
 * Fica fora de `render/` para o domínio usar sem importar a camada de UI.
 *
 * @module shared/html
 * @see docs/ARCHITECTURE.md (seção "Camadas")
 */

/**
 * Troca `& < > " '` por entidades, para o texto não virar marcação em HTML nem fechar um atributo.
 * @param {*} s Valor a escapar; valor falsy (`null`, `undefined`, `0`) vira texto vazio.
 * @returns {string} Texto escapado.
 */
export function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
