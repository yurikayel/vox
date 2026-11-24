/**
 * @file Fachada sob demanda (PM-01) para a tela `#/frase` (ADR-032 §3.3).
 * Mantém a pilha rara da frase de recuperação (`screens-phrase-view.js`, `phrase-print.js`
 * e `render/recovery-phrase.js`) fora do grafo estático de boot e do precache (`SHELL_ASSETS`).
 */

/** @type {Promise<typeof import("./screens-phrase-view.js")>|null} */
let viewModulePromise = null;

/**
 * Carrega sob demanda e memoiza a implementação da tela `#/frase`.
 *
 * @returns {Promise<typeof import("./screens-phrase-view.js")>}
 */
function loadPhraseView() {
  viewModulePromise ??= import("./screens-phrase-view.js");
  return viewModulePromise;
}

/**
 * Imprime o cartão da frase de recuperação sob demanda.
 *
 * @param {object} [opts] Opções do documento/janela.
 * @returns {Promise<boolean>} Se o diálogo de impressão foi disparado.
 */
export async function printCard(opts) {
  const view = await loadPhraseView();
  return view.printCard(opts);
}

/**
 * Abre a tela da frase de recuperação da conta ativa sob demanda.
 *
 * @returns {Promise<void>}
 */
export async function showRecoveryPhrase() {
  const view = await loadPhraseView();
  return view.showRecoveryPhrase();
}
