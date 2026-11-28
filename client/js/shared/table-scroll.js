/**
 * @file Contêiner de rolagem própria para tabelas largas: a página não rola de lado no celular.
 * A região é focável (rola pelo teclado) e tem nome para o leitor de tela.
 */
import { escapeHtml } from "./html.js";

/**
 * Envolve o HTML de uma tabela num contêiner com rolagem horizontal própria.
 * @param {string} label Nome da região lido pelo leitor de tela (ex.: "Salvaguardas do grupo").
 * @param {string} tableHtml HTML da tabela já montado.
 * @returns {string} HTML da região rolável com a tabela dentro.
 */
export function scrollableTableHtml(label, tableHtml) {
  return `<div class="sv-table-scroll" role="region" tabindex="0" aria-label="${escapeHtml(label)}">${tableHtml}</div>`;
}
