/**
 * @module app/onboarding-oauth-ui
 * Feedback de UI compartilhado entre entrada OAuth e importação (quebra ciclo com `onboarding.js`).
 */

import * as share from "../share.js";
import * as localAccount from "../identity/index.js";

/**
 * Mostra ou limpa mensagem de erro na etapa de enriquecimento OAuth.
 *
 * @param {string} message Texto de erro; vazio esconde o bloco.
 * @param {string} [focusId] Id do campo a focar quando há mensagem.
 * @returns {void}
 */
export function setOAuthEnrichError(message, focusId) {
  const el = document.getElementById("oauth-enrich-error");
  if (!el) return;
  el.textContent = message || "";
  el.hidden = !message;
  if (message && focusId) document.getElementById(focusId)?.focus();
}

/** Aviso no passo de criação quando a conta ficou só na memória (armazenamento cheio ou bloqueado). */
export const ACCOUNT_NOT_PERSISTED_WARN =
  "Não deu para salvar a conta neste aparelho (armazenamento cheio ou bloqueado). Ela some se você fechar o app: libere espaço ou salve o arquivo de acesso antes de sair.";

/**
 * Mostra em `#oauth-enrich-error` se a conta ativa não foi gravada no aparelho; não bloqueia o fluxo.
 * @returns {void}
 */
export function warnIfAccountNotPersisted() {
  if (localAccount.getAccountStorageIssue()) setOAuthEnrichError(ACCOUNT_NOT_PERSISTED_WARN);
}

/**
 * Marca botão OAuth como ocupado para evitar duplo clique.
 *
 * @param {HTMLButtonElement|null} btn Botão alvo.
 * @param {boolean} busy Estado de carregamento.
 * @returns {void}
 */
export function setOAuthButtonBusy(btn, busy) {
  if (!btn) return;
  btn.disabled = busy;
  if (busy) btn.setAttribute("aria-busy", "true");
  else btn.removeAttribute("aria-busy");
}

/**
 * Propaga falha de OAuth para o bloco de erro e toast.
 *
 * @param {string} message Motivo retornado pelo provedor.
 * @param {string} fallbackLabel Texto padrão quando `message` está vazio.
 * @returns {void}
 */
export function reportOAuthEnrichFailure(message, fallbackLabel) {
  const text = message || fallbackLabel;
  setOAuthEnrichError(text);
  share.showToast(text, "error");
}

/**
 * Executa login OAuth com feedback de UI (busy, erro, toast).
 *
 * @param {HTMLButtonElement|null} btn Botão clicado.
 * @param {() => Promise<object>} signInFn Provedor (Google/Meta/GitHub).
 * @param {object} opts
 * @param {string} opts.fallbackError Mensagem padrão de falha.
 * @returns {Promise<object>} Resultado do provedor.
 */
export async function runOAuthEnrichSignIn(btn, signInFn, { fallbackError }) {
  setOAuthEnrichError("");
  setOAuthButtonBusy(btn, true);
  try {
    const res = await signInFn();
    if (res.ok) return res;
    reportOAuthEnrichFailure(res.reason, fallbackError);
    return res;
  } catch (err) {
    reportOAuthEnrichFailure(err?.message, fallbackError);
    return { ok: false, reason: err?.message };
  } finally {
    setOAuthButtonBusy(btn, false);
  }
}