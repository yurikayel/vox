/**
 * @module render/genesis-entry
 * Modal de entrada (gênese): primeiro acesso com nome ou e-mail + Senha Soberana, cartão do kit de
 * e-mail (ADR-032 Emenda 1), volta para quem já tem conta e o passo do pacto. `oauth-modals.js` reexporta.
 */
import { renderPactStepHtml } from "./welcome-pact.js";
import * as localAccount from "../identity/index.js";
import { escapeHtml } from "./util.js";
import { renderImportPanelHtml } from "./oauth-import.js";

function genesisStep(key, bodyHtml, { back = "", hidden = true } = {}) {
  const backBtn = back ? `<button type="button" class="genesis-back" data-genesis-go="${back}">← Voltar</button>` : "";
  return `<section class="genesis-step" data-genesis-step="${key}"${hidden ? " hidden" : ""}>${backBtn}${bodyHtml}</section>`;
}

/** Chegou por convite: diz quem chamou e que essa pessoa entra nos contatos. `invite.name` vazio: sem nome. */
function renderInviteLeadHtml(invite) {
  if (!invite) return "";
  const who = invite.name ? `<strong>${escapeHtml(invite.name)}</strong>` : "Alguém";
  return `<p class="genesis-lead genesis-lead--invite">${who} te chamou para o Vox. Ao entrar, essa pessoa já fica nos seus contatos.</p>`;
}

function renderGenesisEntryHtml(currentName, invite = null) {
  return `
          <h2 id="oauth-enrich-title" class="genesis-panel-title">Entrar no Vox</h2>
          ${renderInviteLeadHtml(invite)}
          <p class="genesis-lead">Sua conta é uma chave que nasce neste aparelho. Com nome, e-mail e senha você já sai com um acesso de volta.</p>
          <form id="form-oauth-custom-name" class="genesis-inline-form genesis-inline-form--stack">
            <input type="text" id="oauth-custom-name-input" class="agora-inscription genesis-input" maxlength="30" placeholder="Seu nome ou apelido" value="${currentName}" aria-label="Nome ou apelido" />
            <input type="email" id="oauth-entry-email-input" class="agora-inscription genesis-input" autocomplete="username" placeholder="Seu e-mail (para enviar seu kit de volta)" aria-label="Seu e-mail" />
            <p class="genesis-skip-note genesis-note-left">Seu e-mail não sai deste aparelho. Ele serve para você achar sua conta de volta.</p>
            <div class="genesis-pass-row">
              <input type="password" id="oauth-entry-pass-input" class="agora-inscription genesis-input" autocomplete="new-password" minlength="12" placeholder="Crie uma senha (12 ou mais caracteres)" aria-label="Senha Soberana" />
              <button type="button" id="btn-oauth-toggle-pass" class="agora-btn agora-btn--secondary" aria-pressed="false">Mostrar senha</button>
            </div>
            <label class="guided-check genesis-phrase-check"><input type="checkbox" id="oauth-entry-include-phrase" /> <span>Incluir a frase de 12 palavras neste e-mail</span></label>
            <p class="genesis-skip-note genesis-note-left">Com a frase no e-mail, quem ler sua caixa de entrada entra como você, mesmo sem a senha. Só marque se você confia mais no seu e-mail do que na sua memória.</p>
            <button type="submit" id="btn-oauth-save-name" class="agora-btn agora-btn--primary">Criar conta</button>
          </form>
          <div id="oauth-email-kit-slot" class="oauth-email-kit-slot" hidden></div>
          <div class="genesis-links">
            <button type="button" class="genesis-link" data-genesis-go="have">Já tenho conta</button>
            <button type="button" id="btn-oauth-name-only" class="genesis-link">Entrar só com o nome</button>
            <button type="button" id="btn-oauth-skip" class="genesis-link">Pular, escolho o nome depois</button>
          </div>
          <p class="genesis-skip-note">Sem nome, você não aparece no diretório.</p>`;
}

/**
 * Cartão de confirmação do kit enviado por `mailto:` (ADR-032 §6.5).
 * @param {{ email?: string, mailtoUrl?: string }} [opts] Destinatário e link `mailto:`.
 * @returns {string} HTML do cartão.
 */
export function renderEmailKitCardHtml({ email = "", mailtoUrl = "" } = {}) {
  return `
          <div class="card oauth-email-kit-card" id="oauth-email-kit-card" role="region" aria-label="Confirme o envio do seu e-mail de segurança">
            <h3 class="genesis-panel-title">Confirme o envio do seu e-mail de segurança</h3>
            <p class="genesis-lead">Para: <strong id="email-kit-recipient">${escapeHtml(email)}</strong> <button type="button" id="btn-email-kit-fix-email" class="genesis-link">Corrigir e-mail</button></p>
            <p class="genesis-skip-note genesis-note-left">O rascunho já abriu no seu app de e-mail (o Vox não envia sozinho). Se não abriu, copie ou baixe uma cópia. A sua senha nunca vai no e-mail.</p>
            <div class="oauth-email-kit-actions">
              <a id="btn-email-kit-open-app" class="agora-btn agora-btn--primary" href="${escapeHtml(mailtoUrl)}">Abrir app de e-mail</a>
              <button type="button" id="btn-email-kit-copy" class="agora-btn agora-btn--secondary">Copiar e-mail pronto</button>
              <button type="button" id="btn-email-kit-download" class="agora-btn agora-btn--secondary">Baixar cópia (.txt)</button>
            </div>
            <div class="genesis-links">
              <button type="button" id="btn-email-kit-confirm" class="agora-btn agora-btn--primary">Já enviei / Continuar</button>
              <button type="button" id="btn-email-kit-later" class="genesis-link">Continuar sem confirmar</button>
            </div>
          </div>`;
}

/** Conta que já existe: e-mail e senha, link/código do e-mail, frase (ADR-032), guardiões, QR do outro aparelho ou arquivos .txt. */
function renderGenesisHaveHtml() {
  return `
          <h2 class="genesis-panel-title">Já tenho conta</h2>
          <p class="genesis-lead"><strong>Com e-mail e senha:</strong> digite os dois para buscar seu cofre. Sem servidor conectado, cole o link <code>#/sync?b=…</code>, código <code>VOX1:…</code> ou o texto do e-mail.</p>
          <p class="genesis-lead"><strong>Com a frase:</strong> digite as 12 (ou 24) palavras na ordem. Não precisa de internet. Sem a frase, <a href="#/voltar">peça a volta aos seus guardiões</a>.</p>
          <p class="genesis-lead"><strong>Com o outro aparelho:</strong> nele, abra Perfil → QR para outro aparelho e aponte a câmera deste.</p>
          <form id="form-oauth-restore-passphrase" class="genesis-inline-form genesis-inline-form--stack">
            <input type="email" id="oauth-restore-email-input" class="agora-inscription genesis-input" autocomplete="username" placeholder="Seu e-mail (se cadastrou)" aria-label="Seu e-mail" />
            <input type="password" id="oauth-sovereign-passphrase-input" class="agora-inscription genesis-input" placeholder="Senha Soberana" autocomplete="current-password" aria-label="Senha Soberana" />
            <textarea id="oauth-restore-kit-text" class="genesis-input" rows="2" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Link #/sync?b=…, código VOX1:… ou texto do e-mail (se precisar)" aria-label="Link ou código do e-mail"></textarea>
            <textarea id="oauth-restore-phrase" class="genesis-input" rows="2" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Ou frase de recuperação: 12 ou 24 palavras" aria-label="Frase de recuperação"></textarea>
            <input type="file" id="oauth-restore-files" class="genesis-input" accept=".txt,.voxid,.json,text/plain,application/json" multiple aria-label="Arquivo de acesso ou backups (.txt / .voxid)" />
            <button type="submit" id="btn-oauth-restore-passphrase" class="agora-btn agora-btn--primary">Entrar</button>
          </form>`;
}

/** Onboarding em duas telas para quem é novo: entrada e pacto (18+). "Já tenho conta" é o desvio. */
function renderGenesisStepsHtml(currentName, invite = null) {
  return `
        <section class="genesis-panel genesis-panel--steps">
          <div id="oauth-enrich-error" class="oauth-enrich-error" role="alert" aria-live="polite" hidden></div>
          ${genesisStep("entry", renderGenesisEntryHtml(currentName, invite), { hidden: false })}
          ${genesisStep("have", renderGenesisHaveHtml(), { back: "entry" })}
          ${genesisStep("pact", renderPactStepHtml())}
        </section>`;
}

/**
 * Onboarding — Stitch tela 12, em etapas (uma decisão por tela).
 * @param {HTMLElement} container
 * @param {{ invite?: { name: string } | null, mode?: "entry" | "import" }} [opts] `invite`: a entrada diz quem chamou;
 *   `mode: "import"`: só importar nome e foto (Perfil), sem a entrada
 */
export function renderOAuthEnrich(container, { invite = null, mode = "entry" } = {}) {
  if (!container) return;
  const currentName = escapeHtml(localAccount.getDisplayName() || "");
  container.innerHTML = `
    <div class="modal-overlay oauth-enrich-overlay genesis-overlay" id="oauth-enrich-overlay" role="dialog" aria-modal="true" aria-label="Entrar no Vox">
      <div class="genesis-shell genesis-shell--steps oauth-enrich-dialog">
        <header class="genesis-hero">
          <div class="genesis-brand">
            <img class="genesis-brand-mark" src="icons/icon-white-192.png" width="48" height="48" alt="" decoding="async" />
            <p class="genesis-brand-name">VOX · Rede cívica soberana</p>
          </div>
          <h1 class="genesis-title">Sua voz. <span>Sua chave.</span></h1>
        </header>
        ${mode === "import" ? renderImportPanelHtml() : renderGenesisStepsHtml(currentName, invite)}
      </div>
    </div>`;
}

/**
 * Mostra só a etapa `key` do onboarding e foca o primeiro campo dela.
 * @param {ParentNode|null} root contêiner do modal de entrada
 * @param {string} key nome da etapa (`data-genesis-step`)
 * @returns {boolean} se a etapa existe
 */
export function showGenesisStep(root, key) {
  const steps = root?.querySelectorAll?.("[data-genesis-step]") || [];
  let target = null;
  steps.forEach((s) => {
    const on = s.dataset.genesisStep === key;
    s.hidden = !on;
    if (on) target = s;
  });
  target?.querySelector("input, button:not(.genesis-back)")?.focus({ preventScroll: true });
  return Boolean(target);
}

/**
 * Fecha o modal de entrada, esvaziando o contêiner.
 * @param {HTMLElement|null} container
 */
export function closeOAuthEnrich(container) {
  if (container) container.innerHTML = "";
}
