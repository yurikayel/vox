/**
 * @module app/onboarding-email
 * Entrada e volta com e-mail + Senha Soberana (ADR-032 Emenda 1). O e-mail é só a caixa onde a
 * pessoa guarda o próprio backup cifrado: o Vox não o guarda nem o envia a servidor.
 */

import * as render from "../render.js";
import * as localAccount from "../local-account.js";
import * as emailKit from "../email-kit.js";
import { normalizeVaultEmail } from "../vault-crypto.js";
import { setOAuthButtonBusy, setOAuthEnrichError } from "./onboarding.js";

function bindEntryPasswordToggle() {
  const input = document.getElementById("oauth-entry-pass-input");
  const toggle = document.getElementById("btn-oauth-toggle-pass");
  if (!input || !toggle) return;
  toggle.addEventListener("click", () => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    toggle.textContent = show ? "Ocultar senha" : "Mostrar senha";
    toggle.setAttribute("aria-pressed", String(show));
  });
}

function readEntryFormValues() {
  return {
    rawName: document.getElementById("oauth-custom-name-input")?.value.trim() || "",
    email: normalizeVaultEmail(document.getElementById("oauth-entry-email-input")?.value || ""),
    pass: document.getElementById("oauth-entry-pass-input")?.value.trim() || "",
    includePhrase: Boolean(document.getElementById("oauth-entry-include-phrase")?.checked),
  };
}

function showEmailKitCard({ kit, routeId, email, form, finish }) {
  const slot = document.getElementById("oauth-email-kit-slot");
  const links = form.parentElement?.querySelector(".genesis-links");
  if (!slot) return finish({ ok: true, routeId, email });
  form.hidden = true;
  if (links) links.hidden = true;
  slot.innerHTML = render.renderEmailKitCardHtml({ email: kit.to, mailtoUrl: kit.mailtoUrl });
  slot.hidden = false;
  document.getElementById("btn-email-kit-fix-email")?.addEventListener("click", () => {
    slot.hidden = true;
    form.hidden = false;
    if (links) links.hidden = false;
    document.getElementById("oauth-entry-email-input")?.focus();
  });
  document.getElementById("btn-email-kit-copy")?.addEventListener("click", () => void emailKit.copyEmailKit(kit));
  document.getElementById("btn-email-kit-download")?.addEventListener("click", () => emailKit.downloadEmailKitFile(kit, routeId));
  const done = (confirmExit) => {
    if (confirmExit) emailKit.confirmEmailKitSent(routeId);
    finish({ ok: true, routeId, email }, `Bem-vindo(a), ${localAccount.getDisplayName()}!`);
  };
  document.getElementById("btn-email-kit-confirm")?.addEventListener("click", () => done(true));
  document.getElementById("btn-email-kit-later")?.addEventListener("click", () => done(false));
}

async function handleEntryFormSubmit({ draftState, form, finish, finishNameOnly }) {
  const v = readEntryFormValues();
  const err = emailKit.validateEmailEntry(v);
  if (err) return setOAuthEnrichError(err);
  setOAuthEnrichError("");
  if (!v.email && !v.pass) return finishNameOnly(v.rawName);
  const btn = document.getElementById("btn-oauth-save-name");
  setOAuthButtonBusy(btn, true);
  try {
    const out = await emailKit.createEmailAccountKit({ ...v, draftState });
    if (!out.ok) return setOAuthEnrichError(out.reason);
    emailKit.triggerMailtoDraft(out.kit.mailtoUrl);
    showEmailKitCard({ kit: out.kit, routeId: out.routeId, email: v.email, form, finish });
  } catch (errCreate) {
    setOAuthEnrichError(errCreate?.message || "Erro ao criar conta.");
  } finally {
    setOAuthButtonBusy(btn, false);
  }
}

/**
 * Liga o formulário de entrada (ADR-032 Emenda 1): só nome, ou e-mail + senha, que cria a conta,
 * abre o rascunho do e-mail para a própria pessoa e mostra o cartão do kit.
 * @param {HTMLFormElement} form `#form-oauth-custom-name`
 * @param {{ finish: (result: object, toastMsg?: string) => void, finishNameOnly: (rawName: string) => void }} done
 */
export function bindEmailEntryForm(form, { finish, finishNameOnly }) {
  const draftState = { email: "", pass: "" };
  bindEntryPasswordToggle();
  document.getElementById("btn-oauth-name-only")?.addEventListener("click", () => finishNameOnly(readEntryFormValues().rawName));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    void handleEntryFormSubmit({ draftState, form, finish, finishNameOnly });
  });
}

/**
 * Lê os campos da volta: e-mail, senha, kit colado, frase e arquivos de backup.
 * @returns {{ email: string, pass: string, kitText: string, phraseText: string, files: File[] }}
 */
export function readRestoreInputs() {
  return {
    email: document.getElementById("oauth-restore-email-input")?.value.trim() || "",
    pass: document.getElementById("oauth-sovereign-passphrase-input")?.value.trim() || "",
    kitText: document.getElementById("oauth-restore-kit-text")?.value.trim() || "",
    phraseText: document.getElementById("oauth-restore-phrase")?.value.trim() || "",
    files: [...(document.getElementById("oauth-restore-files")?.files || [])],
  };
}

/**
 * Mostra por que a volta falhou; sem servidor, aponta para o link ou código do e-mail.
 * @param {{ noServer?: boolean, reason?: string }|null} res
 */
export function handleRestoreFailure(res) {
  if (res?.noServer) {
    setOAuthEnrichError("Nenhum servidor respondeu aqui. Toque no link do seu e-mail ou cole o link (#/sync?b=…) / código VOX1:… acima, mantendo sua senha.");
    document.getElementById("oauth-restore-kit-text")?.focus();
    return;
  }
  setOAuthEnrichError(res?.reason || "Senha incorreta ou cofre não encontrado.");
}
