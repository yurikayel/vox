/**
 * @file ADR-032 §3.3 — tela `#/frase`: mostrar a frase, imprimir o cartão e conferir 3 palavras.
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

function showError(text) {
  const el = document.getElementById("phrase-error");
  if (!el) return;
  el.hidden = !text;
  el.textContent = text || "";
}

function screenEl() {
  return document.getElementById("phrase-screen");
}

function showWords(phrase) {
  screenEl().innerHTML = renderPhraseWordsHtml(phrase);
  document.getElementById("btn-phrase-print")?.addEventListener("click", () => printPhraseCard());
  document.getElementById("btn-phrase-written")?.addEventListener("click", () => showConfirm(phrase));
}

function readTyped() {
  const typed = {};
  document.querySelectorAll("[data-phrase-pos]").forEach((input) => {
    typed[input.dataset.phrasePos] = input.value;
  });
  return typed;
}

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
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "profile", "Frase de recuperação"));
  main.innerHTML = renderPhraseIntroHtml({ needsPassphrase: await phraseNeedsPassphrase() });
  document.getElementById("form-phrase-show")?.addEventListener("submit", (e) => {
    e.preventDefault();
    void revealPhrase();
  });
}
