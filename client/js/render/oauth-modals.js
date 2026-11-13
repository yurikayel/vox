/** @file OAuth, pact/zap/edit modals, people search. */
import { renderPactModalHtml, renderPactStepHtml } from "./welcome-pact.js";
import * as brcode from "../brcode.js";
import { PIX_PAYER_CHECK_NOTICE_PT } from "../pix-key.js";
import * as i18n from "../i18n-pt-br.js";
import * as postOwnership from "../post-ownership.js";
import * as localAccount from "../local-account.js";
import { hasChosenName } from "../people-index.js";
import { escapeHtml, shortId, renderAvatarHtml, formatTimeAgo, renderInviteFriendsCard } from "./util.js";
import { renderPageHead } from "./shell.js";

/** Ícones inline (GIS / Meta brand — sem asset extra no SW). */
const OAUTH_SVG_GOOGLE = `<svg class="oauth-btn__icon" width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

const OAUTH_SVG_META = `<svg class="oauth-btn__icon oauth-btn__icon--meta" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`;

const OAUTH_SVG_GITHUB = `<svg class="oauth-btn__icon oauth-btn__icon--github" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>`;

function renderOAuthProviderButtonsHtml() {
  return `<div class="oauth-enrich-actions">
    <button type="button" id="btn-oauth-google" class="oauth-btn oauth-btn--google" aria-label="Entrar com Google para importar nome e foto">
      ${OAUTH_SVG_GOOGLE}
      <span class="oauth-btn__label">Nome e foto do Google</span>
    </button>
    <button type="button" id="btn-oauth-meta" class="oauth-btn oauth-btn--meta" aria-label="Entrar com Meta para importar nome e foto">
      ${OAUTH_SVG_META}
      <span class="oauth-btn__label">Nome e foto da Meta</span>
    </button>
    <button type="button" id="btn-oauth-github" class="oauth-btn oauth-btn--github" aria-label="Entrar com GitHub para importar nome e foto">
      ${OAUTH_SVG_GITHUB}
      <span class="oauth-btn__label">Nome e foto do GitHub</span>
    </button>
  </div>`;
}

function genesisStep(key, bodyHtml, { back = "", hidden = true } = {}) {
  const backBtn = back ? `<button type="button" class="genesis-back" data-genesis-go="${back}">← Voltar</button>` : "";
  return `<section class="genesis-step" data-genesis-step="${key}"${hidden ? " hidden" : ""}>${backBtn}${bodyHtml}</section>`;
}

/** Tela única de entrada: Google, Meta ou GitHub trazem nome e foto; ou a pessoa escreve o nome. */
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
          <p class="genesis-lead">Sua conta nasce neste aparelho. Google e Meta só trazem nome e foto.</p>
          ${renderOAuthProviderButtonsHtml()}
          <form id="form-oauth-custom-name" class="genesis-inline-form">
            <input type="text" id="oauth-custom-name-input" class="agora-inscription genesis-input" maxlength="30" placeholder="Ou escreva seu nome" value="${currentName}" aria-label="Nome ou apelido" />
            <button type="submit" id="btn-oauth-save-name" class="agora-btn agora-btn--primary">Continuar</button>
          </form>
          <div class="genesis-links">
            <button type="button" class="genesis-link" data-genesis-go="have">Já tenho conta</button>
            <button type="button" id="btn-oauth-skip" class="genesis-link">Pular, escolho o nome depois</button>
          </div>
          <p class="genesis-skip-note">Sem nome, você não aparece no diretório.</p>`;
}

/** Conta que já existe: pelo QR do outro aparelho, ou pelo backup do e-mail e a Senha Soberana. */
function renderGenesisHaveHtml() {
  return `
          <h2 class="genesis-panel-title">Já tenho conta</h2>
          <p class="genesis-lead"><strong>Com o outro aparelho:</strong> nele, abra Perfil → QR para outro aparelho e aponte a câmera deste.</p>
          <p class="genesis-lead"><strong>Sem ele:</strong> escolha os backups do seu e-mail, se tiver, e digite a Senha Soberana.</p>
          <form id="form-oauth-restore-passphrase" class="genesis-inline-form genesis-inline-form--stack">
            <input type="file" id="oauth-restore-files" class="genesis-input" accept=".txt,text/plain" multiple aria-label="Backups do e-mail (opcional)" />
            <input type="password" id="oauth-sovereign-passphrase-input" class="agora-inscription genesis-input" placeholder="Senha Soberana" autocomplete="current-password" aria-label="Senha Soberana" />
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
          <p class="meta oauth-enrich-legal">Tokens do Google e da Meta não são guardados (LGPD).</p>
        </section>`;
}

/**
 * Onboarding — Stitch tela 12, em etapas (uma decisão por tela).
 * @param {HTMLElement} container
 * @param {{ invite?: { name: string } | null }} [opts] chegada por convite: a entrada diz quem chamou
 */
export function renderOAuthEnrich(container, { invite = null } = {}) {
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
        ${renderGenesisStepsHtml(currentName, invite)}
      </div>
    </div>`;
}

/** Mostra só a etapa `key` do onboarding e foca o primeiro campo dela. */
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

export function closeOAuthEnrich(container) {
  if (container) container.innerHTML = "";
}

function resolvePersonStampsHtml(p, isSelf) {
  const stamps = [];
  if (isSelf) stamps.push(`<span class="agora-stamp agora-stamp--bronze">Você</span>`);
  else if (p.source === "contact") stamps.push(`<span class="agora-stamp agora-stamp--teal"><span class="agora-pylon agora-pylon--teal" aria-hidden="true"></span>Contato</span>`);
  else if (p.source === "mesh-card" || p.source === "mesh") stamps.push(`<span class="agora-stamp agora-stamp--consensus"><span class="agora-pylon" aria-hidden="true"></span>Conectado</span>`);
  return stamps.join("");
}

/**
 * Linha do Diretório de Cidadãos (Stitch tela 10): avatar, nome, @ e selos, mais as ações.
 * A chave `vx_…` não aparece aqui (não diz nada a quem lê); ela fica no perfil, como dado complementar.
 */
function renderPeopleResultRow(p) {
  const myId = localAccount.getCachedRouteIdSync();
  const isSelf = Boolean(myId && p.routeId === myId);
  // A própria conta ainda sem nome aparece como "Você", com o convite para escolher um, nunca como `vx_…`.
  const selfUnnamed = isSelf && !hasChosenName(p);
  const name = escapeHtml(selfUnnamed ? "Você" : p.name || p.routeId.slice(0, 14));
  const handle = p.handle ? `@${escapeHtml(p.handle)}` : "";
  const av = renderAvatarHtml(p.routeId, name, "", p.avatarUrl);
  const rid = encodeURIComponent(p.routeId);
  const selfAction = selfUnnamed
    ? `<a class="agora-btn agora-btn--solid" href="#/perfil">Escolher nome</a>`
    : `<a class="agora-btn agora-btn--secondary" href="#/u/${rid}">Meu perfil</a>`;
  const actionsHtml = isSelf
    ? selfAction
    : `
        <a class="agora-btn agora-btn--secondary" href="#/connect/${rid}">Conectar</a>
        <a class="agora-btn agora-btn--solid" href="#/dm/${rid}" aria-label="Mensagem direta e cifrada">Mensagem</a>`;
  return `
    <article class="card people-result agora-citizen">
      <div class="agora-citizen-avatar">${av}</div>
      <div class="agora-citizen-body">
        <h3 class="agora-citizen-name"><a href="#/u/${rid}">${name}</a>${handle ? `<span class="agora-citizen-handle">${handle}</span>` : ""}</h3>
        <div class="agora-citizen-stamps">${resolvePersonStampsHtml(p, isSelf)}</div>
      </div>
      <div class="agora-citizen-actions">${actionsHtml}
      </div>
    </article>`;
}

function renderPeopleSection(title, people) {
  if (!people?.length) return "";
  const rows = people.map((p) => renderPeopleResultRow(p)).join("");
  return `
    <section class="people-section agora-citizen-section">
      <h3 class="agora-section-label">${escapeHtml(title)}<span class="agora-citizen-count">${people.length}</span></h3>
      ${rows}
    </section>`;
}

export function resolvePeopleSearchBody(sections, results, query) {
  const q = escapeHtml(query);
  const hasQuery = Boolean(String(query || "").trim());
  if (hasQuery) {
    return results.length === 0
      ? `<div class="empty"><p>Nenhuma pessoa encontrada para “${q}”.</p></div>`
      : results.map((p) => renderPeopleResultRow(p)).join("");
  }
  if (sections) {
    if (Array.isArray(sections.all)) {
      const total = sections.all.length;
      if (!total) return `<div class="empty"><p>Ninguém indexado ainda.</p></div>`;
      const summaryHtml = `<p class="agora-citizen-summary"><span>Registros autenticados: <strong>${total} ${total === 1 ? "cidadão" : "cidadãos"}</strong></span></p>`;
      return summaryHtml + sections.all.map((p) => renderPeopleResultRow(p)).join("");
    }
    const cLen = sections.contacts?.length || 0;
    const mLen = sections.mesh?.length || 0;
    const tLen = sections.tour?.length || 0;
    const total = cLen + mLen + tLen;
    if (!total) return `<div class="empty"><p>Ninguém indexado ainda.</p></div>`;
    return (
      renderPeopleSection("Contatos", sections.contacts) +
      renderPeopleSection(i18n.peopleSectionMesh, sections.mesh) +
      renderPeopleSection("Tour (demonstração)", sections.tour)
    );
  }
  return results.map((p) => renderPeopleResultRow(p)).join("");
}

function renderAddedYouRow(n) {
  const label = n.name || shortId(n.routeId);
  const av = renderAvatarHtml(n.routeId, label, "", n.avatarUrl || "");
  const rid = encodeURIComponent(n.routeId);
  const when = formatTimeAgo(n.ts);
  return `
    <article class="card people-result agora-citizen">
      <div class="agora-citizen-avatar">${av}</div>
      <div class="agora-citizen-body">
        <h3 class="agora-citizen-name"><a href="#/u/${rid}">${escapeHtml(label)}</a></h3>
        <div class="agora-citizen-stamps"><span class="agora-stamp agora-stamp--teal">Adicionou você · ${escapeHtml(when)}</span></div>
      </div>
      <div class="agora-citizen-actions">
        <button type="button" class="agora-btn agora-btn--solid btn-added-you-back" data-route="${escapeHtml(n.routeId)}" data-label="${escapeHtml(label)}">Adicionar de volta</button>
        <button type="button" class="agora-btn agora-btn--secondary btn-added-you-dismiss" data-route="${escapeHtml(n.routeId)}">Dispensar</button>
      </div>
    </article>`;
}

/**
 * Seção "Quem adicionou você" no topo do diretório de pessoas.
 *
 * @param {Array<{routeId: string, name?: string, avatarUrl?: string, ts?: number}>} [notices=[]] Avisos pendentes.
 * @returns {string} HTML da seção, ou `""` se não houver avisos.
 */
export function renderAddedYouSection(notices = []) {
  if (!notices?.length) return "";
  return `
    <section class="people-section agora-citizen-section" id="people-added-you-section">
      <h3 class="agora-section-label">Quem adicionou você<span class="agora-citizen-count">${notices.length}</span></h3>
      ${notices.map(renderAddedYouRow).join("")}
    </section>`;
}

function renderPeopleInviteSection(query, routeId, inviteLink) {
  if (query.trim() || !routeId) return "";
  return renderInviteFriendsCard({
    routeId,
    inviteLink,
    buttonId: "btn-people-share-connect",
    codeId: "people-invite-connect-url",
    className: "card people-invite-card",
  });
}

export function renderPeopleSearch(main, { sections = null, results = [], query = "", addedBy = [], routeId = "", inviteLink = "" } = {}) {
  const q = escapeHtml(query);
  const body = resolvePeopleSearchBody(sections, results, query);
  const addedHtml = query.trim() ? "" : renderAddedYouSection(addedBy);
  const inviteHtml = renderPeopleInviteSection(query, routeId, inviteLink);
  const head = renderPageHead({
    title: "Diretório de Cidadãos",
    subtitle: "Pessoas com identidade criptográfica verificada no aparelho de quem publicou. Sem servidor central decidindo quem existe.",
    wide: true,
  });

  main.innerHTML = `
    <div class="agora-wide agora-directory">
      ${head}
      <form id="form-people-search" class="card people-search-card agora-directory-search" role="search">
        <svg class="agora-directory-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M2 12a10 10 0 0 1 18-6"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2v2"/></svg>
        <input type="search" id="people-search-input" class="form-control" placeholder="Buscar por nome, @arroba cívica, chave vx_ ou link de convite…" value="${q}" aria-label="Buscar pessoas" />
        <button type="submit" class="agora-btn agora-btn--solid">Buscar</button>
      </form>
      ${inviteHtml}
      <div id="people-added-you-container">${addedHtml}</div>
      <div class="people-results agora-citizen-list" id="people-results-container">${body}</div>
    </div>`;
}

export function renderConnectPreview(main, profile, routeId, { isContact = false } = {}) {
  const name = escapeHtml(profile?.name || routeId);
  const bio = profile?.bio ? `<p class="desc">${escapeHtml(profile.bio)}</p>` : "";
  const av = renderAvatarHtml(routeId, name, "", profile?.avatarUrl || profile?.avatar || "");
  main.innerHTML = `
    <div class="card">
      <h2 style="margin:0 0 0.5rem;">Conectar</h2>
      <div style="display:flex; gap:0.75rem; align-items:flex-start;">
        ${av}
        <div>
          <h3 style="margin:0;">${name}</h3>
          <p class="meta"><code>${escapeHtml(routeId)}</code></p>
          ${bio}
        </div>
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:0.5rem; margin-top:1rem;">
        <button type="button" id="btn-connect-add" class="btn btn-primary" data-route="${escapeHtml(routeId)}" ${isContact ? "disabled" : ""}>
          ${isContact ? "✓ Já nos contatos" : "Adicionar contato"}
        </button>
        <a class="btn btn-outline" href="#/dm/${encodeURIComponent(routeId)}">Enviar mensagem</a>
        <a class="btn btn-outline" href="#/u/${encodeURIComponent(routeId)}">Ver perfil</a>
        <button type="button" id="btn-connect-share" class="btn btn-outline" data-route="${escapeHtml(routeId)}">Compartilhar link</button>
      </div>
    </div>`;
}

export function renderPactModal(container) {
  if (!container) return;
  container.innerHTML = renderPactModalHtml();
}

export function closePactModal(container) {
  if (container) container.innerHTML = "";
}

function buildInitialPixPayload(pixKey, authorName, amount) {
  try {
    return brcode.buildPixPayload({
      key: pixKey,
      name: authorName,
      amount,
      description: "Apoio Vox",
    });
  } catch {
    return pixKey;
  }
}

function renderZapModalHeaderHtml(authorName, title) {
  const titleHtml = title
    ? `<p class="desc" style="font-size:0.82rem; margin:0 0 0.75rem; color:var(--muted);">${escapeHtml(title.slice(0, 60))}${title.length > 60 ? "…" : ""}</p>`
    : "";
  return `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
    <h3 style="margin:0; font-size:1.15rem; display:flex; align-items:center; gap:6px;">
      <span>⚡</span> Pix Zap para ${escapeHtml(authorName)}
    </h3>
    <button class="btn btn-sm btn-outline btn-close-zap" style="border:none; padding:4px 8px; font-size:1.1rem; cursor:pointer;" aria-label="Fechar">✕</button>
  </div>
  ${titleHtml}`;
}

function renderZapAmountButtonsHtml(initialAmount) {
  const isCustom = ![2, 5, 10].includes(initialAmount);
  const btn = (val, label) =>
    `<button class="btn btn-sm btn-zap-val ${initialAmount === val ? "btn-primary" : "btn-outline"}" data-val="${val}">${label}</button>`;
  const customBtn = `<button class="btn btn-sm btn-zap-val ${isCustom ? "btn-primary" : "btn-outline"}" data-val="custom">Outro</button>`;
  return `<label style="font-size:0.82rem; font-weight:600; display:block; margin-bottom:6px;">Escolha o valor do apoio:</label>
    <div class="zap-amount-buttons" style="display:flex; gap:6px; margin-bottom:0.75rem;">
      ${btn(2, "R$ 2")}${btn(5, "R$ 5")}${btn(10, "R$ 10")}${customBtn}
    </div>
    <div class="zap-custom-container" style="display:${isCustom ? "block" : "none"}; margin-bottom:0.75rem;">
      <input type="text" id="zap-custom-input" class="form-control" placeholder="Ex: 15 ou R$ 20,00" value="${isCustom ? initialAmount : ""}" style="font-size:0.9rem;" />
    </div>`;
}

export function renderZapModal(container, { author: _author = "", authorName = "Autor", pixKey = "", title = "", defaultAmount = 5 } = {}) {
  if (!container) return;
  const initialAmount = defaultAmount || 5;
  const initialPayload = buildInitialPixPayload(pixKey, authorName, initialAmount);

  container.innerHTML = `
    <div class="modal-overlay modal-sheet" id="zap-modal-overlay">
      <div class="modal-dialog modal-card zap-modal-dialog">
        ${renderZapModalHeaderHtml(authorName, title)}
        ${renderZapAmountButtonsHtml(initialAmount)}
        <div class="form-group" style="margin-bottom:0.75rem;">
          <label style="font-size:0.82rem; font-weight:600; display:block; margin-bottom:4px;">Pix Copia e Cola (BR Code EMV):</label>
          <textarea id="zap-payload-area" class="form-control" rows="3" readonly style="font-family:monospace; font-size:0.75rem; resize:none; word-break:break-all; background:var(--surface-soft);">${escapeHtml(initialPayload)}</textarea>
        </div>
        <button id="btn-copy-zap-payload" class="btn btn-primary" style="width:100%; margin-bottom:0.75rem; font-weight:600;">
          ⚡ Copiar Pix Copia e Cola
        </button>
        <p class="zap-payer-check" role="note" style="font-size:0.78rem; line-height:1.4; margin:0 0 0.5rem;">🔎 ${escapeHtml(PIX_PAYER_CHECK_NOTICE_PT)}</p>
        <div class="zap-disclaimer banner-info" style="font-size:0.74rem; line-height:1.4; margin:0; padding:0.5rem 0.75rem;">
          🛡️ <strong>O Vox não é PSP:</strong> Código gerado 100% offline no seu navegador. O Vox não custodia valores nem cobra taxas. A liquidação é feita diretamente no seu banco pelo Banco Central.
        </div>
      </div>
    </div>`;
}

export function closeZapModal(container) {
  if (container) container.innerHTML = "";
}

export function postEditInitialText({ title = "", body = "" } = {}) {
  const disp = postOwnership.formatPostDisplay({ title, body });
  if (disp.mode === "caption") return disp.text || "";
  if (disp.mode === "title-body" && body.trim()) return body.trim();
  return [title, body].filter(Boolean).join("\n").trim();
}

export function renderPostEditModal(container, { id = "", title = "", body = "", hasImage = false } = {}) {
  if (!container) return;
  const initialText = postEditInitialText({ title, body });
  const imageRow = hasImage
    ? `<label class="post-edit-remove-image">
        <input type="checkbox" id="post-edit-remove-image" /> Remover imagem anexada
      </label>`
    : "";
  container.innerHTML = `
    <div class="modal-overlay modal-sheet post-edit-overlay" id="post-edit-modal-overlay" role="dialog" aria-modal="true" aria-label="Editar publicação">
      <div class="modal-dialog modal-card modal-dialog-solid post-edit-dialog">
        <div class="post-edit-head">
          <h3 class="post-edit-title">Editar publicação</h3>
          <button type="button" class="btn btn-sm btn-outline btn-close-post-edit post-edit-close" aria-label="Fechar">✕</button>
        </div>
        <form id="form-post-edit" data-id="${escapeHtml(id)}">
          <label class="post-edit-label" for="post-edit-text">Texto da publicação</label>
          <textarea id="post-edit-text" class="form-control inline-composer-textarea post-edit-textarea" rows="6" maxlength="5000" required placeholder="O que você quer dizer?">${escapeHtml(initialText)}</textarea>
          <p class="post-edit-char meta" id="post-edit-char" aria-live="polite">${initialText.length} / 5000</p>
          <p class="post-edit-local-hint meta" title="${escapeHtml(i18n.localMutateEditDeleteTooltip)}">${escapeHtml(i18n.localMutateEditDeleteHint)}</p>
          ${imageRow}
          <div class="post-edit-actions">
            <button type="button" class="btn btn-outline btn-cancel-post-edit">Cancelar</button>
            <button type="submit" class="btn btn-primary" id="btn-post-edit-save">Salvar</button>
          </div>
        </form>
      </div>
    </div>`;
}

export function closePostEditModal(container) {
  if (container) container.innerHTML = "";
}
