/**
 * @file Implementação sob demanda (PM-01) da tela `#/frase`: mostrar a frase,
 * imprimir o cartão e conferir 3 palavras (ADR-032 §3.3).
 * A frase fica só na memória desta tela; sair da rota a descarta.
 */

import * as render from "../render.js";
import * as share from "../share.js";
import { confirmPhraseWords, getAccountPhrase, phraseNeedsPassphrase, pickConfirmPositions } from "../identity/index.js";
import {
  renderPhraseConfirmHtml,
  renderPhraseDoneHtml,
  renderPhraseIntroHtml,
  renderPhraseWordsHtml,
} from "../render/recovery-phrase.js";
import { getActiveUser, makeShellProps } from "./context.js";
import { discardPhrasePrintCopy, printPhraseCard } from "./phrase-print.js";

/**
 * Mostra ou limpa o erro da tela da frase.
 *
 * @param {string} text Mensagem (vazia limpa).
 */
function showError(text) {
  const el = document.getElementById("phrase-error");
  if (!el) return;
  el.hidden = !text;
  el.textContent = text || "";
}

/**
 * Raiz da tela da frase de recuperação.
 *
 * @returns {HTMLElement|null}
 */
function screenEl() {
  return document.getElementById("phrase-screen");
}

/**
 * Imprime o cartão da frase de recuperação.
 *
 * @param {object} [opts] Opções do documento/janela.
 * @returns {boolean} Se o diálogo de impressão foi disparado.
 */
export function printCard(opts) {
  return printPhraseCard(opts);
}

/**
 * Mostra as palavras da frase e liga imprimir e "anotei".
 *
 * @param {{words: string[]}} phrase Frase de recuperação.
 */
function showWords(phrase) {
  screenEl().innerHTML = renderPhraseWordsHtml(phrase);
  document.getElementById("btn-phrase-print")?.addEventListener("click", () => printCard({ words: phrase.words }));
  document.getElementById("btn-phrase-written")?.addEventListener("click", () => showConfirm(phrase));
}

/**
 * Lê as palavras digitadas na confirmação, por posição.
 *
 * @returns {Object<string, string>}
 */
function readTyped() {
  const typed = {};
  document.querySelectorAll("[data-phrase-pos]").forEach((input) => {
    typed[input.dataset.phrasePos] = input.value;
  });
  return typed;
}

/**
 * Mostra a confirmação em que a pessoa digita palavras sorteadas da frase.
 *
 * @param {{words: string[]}} phrase Frase de recuperação.
 */
function showConfirm(phrase) {
  discardPhrasePrintCopy();
  screenEl().innerHTML = renderPhraseConfirmHtml(pickConfirmPositions(phrase.words.length));
  document.getElementById("btn-phrase-back")?.addEventListener("click", () => showWords(phrase));
  document.getElementById("form-phrase-confirm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!confirmPhraseWords(phrase.words, readTyped())) return showError("Alguma palavra não confere. Veja o papel e tente de novo.");
    screenEl().innerHTML = renderPhraseDoneHtml();
    share.showToast("Frase conferida. Esta conta agora tem saída.");
  });
}

/**
 * Pede a senha, revela a frase da conta e mostra as palavras.
 */
async function revealPhrase() {
  const btn = document.getElementById("btn-phrase-show");
  if (btn) btn.disabled = true;
  try {
    showWords(await getAccountPhrase(document.getElementById("phrase-pass")?.value || ""));
  } catch (err) {
    showError(err?.message || "Não deu para abrir a frase.");
  } finally {
    if (btn) btn.disabled = false;
  }
}

/** Abre a tela da frase de recuperação da conta ativa. */
export async function showRecoveryPhrase() {
  discardPhrasePrintCopy();
  globalThis.addEventListener?.("hashchange", () => discardPhrasePrintCopy(), { once: true });
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "profile", "Frase de recuperação"));
  main.innerHTML = renderPhraseIntroHtml({ needsPassphrase: await phraseNeedsPassphrase() });
  document.getElementById("form-phrase-show")?.addEventListener("submit", (e) => {
    e.preventDefault();
    void revealPhrase();
  });
  const first = document.getElementById("phrase-pass") || document.getElementById("btn-phrase-show");
  first?.focus({ preventScroll: true });
}
