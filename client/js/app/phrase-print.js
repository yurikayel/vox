/**
 * @file Impressão do cartão da frase de recuperação (ADR-032 §3.3). Uma cópia do cartão vai direto no `body`, o CSS
 * esconde o resto da página na impressão e a cópia sai assim que der: no `afterprint`, ao trocar de rota
 * (`hashchange`), ao sair da página (`pagehide`) ou quando a tela da frase segue para a conferência. O `afterprint`
 * sozinho não basta: há navegadores que não o disparam, e a cópia com as 12 palavras ficava no `body` depois de sair
 * da tela.
 */

/** `id` da cópia do cartão colocada no `body` só durante a impressão. */
export const PRINT_ROOT_ID = "phrase-print-root";
const PRINT_CLASS = "printing-phrase";
const CLEANUP_EVENTS = ["afterprint", "hashchange", "pagehide"];

/**
 * Tira do `body` a cópia do cartão (com a frase) e a classe de impressão. Pode ser chamada a qualquer momento.
 * @param {Document} [doc] documento (padrão: o da página)
 * @returns {void}
 */
export function discardPhrasePrintCopy(doc = globalThis.document) {
  if (!doc?.body) return;
  doc.body.classList.remove(PRINT_CLASS);
  doc.getElementById(PRINT_ROOT_ID)?.remove();
}

/**
 * Imprime só o cartão da frase. Sem `print()` no navegador, a cópia nem fica no `body`.
 * @param {{ doc?: Document, win?: Window }} [env] documento e janela (padrão: os da página)
 * @returns {boolean} se o diálogo de impressão foi pedido
 */
export function printPhraseCard({ doc = globalThis.document, win = globalThis } = {}) {
  discardPhrasePrintCopy(doc);
  const card = doc?.getElementById("phrase-print-card")?.cloneNode(true);
  if (!card) return false;
  if (typeof win?.print !== "function") return false;
  card.id = PRINT_ROOT_ID;
  doc.body.append(card);
  doc.body.classList.add(PRINT_CLASS);
  /**
   * Descarta a cópia impressa da frase.
   *
   * @returns {void}
   */
  const cleanup = () => discardPhrasePrintCopy(doc);
  for (const type of CLEANUP_EVENTS) win.addEventListener?.(type, cleanup, { once: true });
  win.print();
  return true;
}
