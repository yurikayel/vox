/** @file OAuth, cantina gate, pact/zap/edit modals, people search. */
import { renderPactModalHtml } from "./welcome-pact.js";
import * as brcode from "../brcode.js";
import * as i18n from "../i18n-pt-br.js";
import * as postOwnership from "../post-ownership.js";
import * as localAccount from "../local-account.js";
import { escapeHtml, shortId, renderAvatarHtml } from "./util.js";

const CANTINA_ART_ALT =
  "Ilustração anime de uma cantina: o bartender de túnica bege aponta para a câmera; dois balões pintados na arte dizem 'Seus bots tem que esperar lá fora!' e 'Aqui não servimos esse tipo.'";

const CANTINA_ART =
  `<img class="cantina-art-img" src="./images/cantina-gate.jpg" alt="${CANTINA_ART_ALT}" width="1024" height="575" />`;

/** Ícones inline (GIS / Meta brand — sem asset extra no SW). */
const OAUTH_SVG_GOOGLE = `<svg class="oauth-btn__icon" width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

const OAUTH_SVG_META = `<svg class="oauth-btn__icon oauth-btn__icon--meta" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`;

const OAUTH_SVG_GITHUB = `<svg class="oauth-btn__icon oauth-btn__icon--github" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>`;

export function renderOAuthEnrich(container) {
  if (!container) return;
  container.innerHTML = `
    <div class="modal-overlay modal-sheet oauth-enrich-overlay" id="oauth-enrich-overlay" role="dialog" aria-modal="true" aria-labelledby="oauth-enrich-title">
      <div class="modal-dialog modal-card modal-dialog-solid oauth-enrich-dialog">
        <h2 id="oauth-enrich-title" class="oauth-enrich-title">Como quer aparecer?</h2>
        <p class="desc oauth-enrich-lead">Importe <strong>nome e foto</strong> (opcional). Seu ID na rede continua sendo <code>vx_*</code> neste aparelho — não é login centralizado.</p>
        <div id="oauth-enrich-error" class="oauth-enrich-error" role="alert" aria-live="polite" hidden></div>
        <div class="oauth-enrich-actions">
          <button type="button" id="btn-oauth-google" class="oauth-btn oauth-btn--google" aria-label="Entrar com Google para importar nome e foto">
            ${OAUTH_SVG_GOOGLE}
            <span class="oauth-btn__label">Continuar com Google</span>
          </button>
          <button type="button" id="btn-oauth-meta" class="oauth-btn oauth-btn--meta" aria-label="Entrar com Meta para importar nome e foto">
            ${OAUTH_SVG_META}
            <span class="oauth-btn__label">Continuar com Meta</span>
          </button>
          <button type="button" id="btn-oauth-github" class="oauth-btn oauth-btn--github" aria-label="Entrar com GitHub para importar nome e foto">
            ${OAUTH_SVG_GITHUB}
            <span class="oauth-btn__label">Continuar com GitHub</span>
          </button>
        </div>
        <p class="oauth-enrich-divider" role="presentation"><span>ou</span></p>
        <button type="button" id="btn-oauth-skip" class="oauth-btn oauth-btn--skip">Pular — continuar só com vx_</button>
        <p class="meta oauth-enrich-legal">Só claims públicos de perfil; tokens OAuth não são armazenados (LGPD — ver COMPLIANCE-BR.md).</p>
      </div>
    </div>`;
}

export function closeOAuthEnrich(container) {
  if (container) container.innerHTML = "";
}

function renderPeopleResultRow(p) {
  const name = escapeHtml(p.name || p.routeId.slice(0, 14));
  const handle = p.handle ? `@${escapeHtml(p.handle)}` : "";
  const av = renderAvatarHtml(p.routeId, name);
  const myId = localAccount.getCachedRouteIdSync();
  const isSelf = Boolean(myId && p.routeId === myId);
  const actionsHtml = isSelf
    ? `<a class="btn btn-sm btn-outline" href="#/u/${encodeURIComponent(p.routeId)}">Meu perfil</a>`
    : `
        <a class="btn btn-sm btn-outline" href="#/connect/${encodeURIComponent(p.routeId)}">Conectar</a>
        <a class="btn btn-sm btn-primary" href="#/dm/${encodeURIComponent(p.routeId)}">DM</a>
      `;
  return `
    <div class="card people-result" style="padding:0.65rem 0.85rem; margin-top:0.45rem; display:flex; gap:0.65rem; align-items:center;">
      ${av}
      <div style="flex:1; min-width:0;">
        <a href="#/u/${encodeURIComponent(p.routeId)}" style="font-weight:600;">${name}</a>
        ${handle ? `<span class="meta"> ${handle}</span>` : ""}
        <p class="meta" style="margin:2px 0 0;"><code>${escapeHtml(shortId(p.routeId))}</code></p>
      </div>
      <div style="display:flex; flex-direction:column; gap:0.25rem;">
        ${actionsHtml}
      </div>
    </div>`;
}

function renderPeopleSection(title, people) {
  if (!people?.length) return "";
  const rows = people.map((p) => renderPeopleResultRow(p)).join("");
  return `
    <div class="people-section" style="margin-top:0.75rem;">
      <h3 class="section-title" style="font-size:0.95rem; margin:0 0 0.35rem;">${escapeHtml(title)}</h3>
      ${rows}
    </div>`;
}

function resolvePeopleSearchBody(sections, results, query) {
  const q = escapeHtml(query);
  const hasQuery = Boolean(String(query || "").trim());
  if (hasQuery) {
    return results.length === 0
      ? `<div class="empty"><p>Nenhuma pessoa encontrada para “${q}”.</p></div>`
      : results.map((p) => renderPeopleResultRow(p)).join("");
  }
  if (sections) {
    const hasAny = Boolean(sections.contacts?.length || sections.mesh?.length || sections.tour?.length);
    if (!hasAny) return `<div class="empty"><p>Ninguém indexado ainda.</p></div>`;
    return (
      renderPeopleSection("Contatos", sections.contacts) +
      renderPeopleSection("Na malha", sections.mesh) +
      renderPeopleSection("Tour (demonstração)", sections.tour)
    );
  }
  return results.map((p) => renderPeopleResultRow(p)).join("");
}

export function renderPeopleSearch(main, { sections = null, results = [], query = "" } = {}) {
  const q = escapeHtml(query);
  const body = resolvePeopleSearchBody(sections, results, query);

  main.innerHTML = `
    <div class="card">
      <h2 style="margin:0 0 4px;">Pessoas</h2>
      <p class="desc" style="margin:0 0 0.75rem;">Busca local: contatos, autores vistos na malha, cartões opt-in e tour (só se vazio).</p>
      <form id="form-people-search" style="display:flex; gap:0.5rem;">
        <input type="search" id="people-search-input" class="form-control" placeholder="Nome, @handle ou vx_…" value="${q}" />
        <button type="submit" class="btn btn-primary">Buscar</button>
      </form>
      <form id="form-people-paste-link" style="margin-top:0.65rem; display:flex; gap:0.5rem; flex-wrap:wrap;">
        <input type="text" id="people-paste-input" class="form-control" placeholder="#/connect/… ou vx_…" style="flex:1; min-width:12rem;" />
        <button type="submit" class="btn btn-outline">Abrir conexão</button>
      </form>
      <p class="meta" style="margin:0.35rem 0 0; font-size:0.78rem;">Cole um link #/connect ou vx_ para conectar sem busca.</p>
    </div>
    <div class="people-results">${body}</div>`;
}

function renderPostPactIdentityHtml(routeId) {
  return `<div class="post-pact-identity-preview">
    ${renderAvatarHtml(routeId, shortId(routeId))}
    <div class="post-pact-identity-meta">
      <strong>Sua Chave Cidadã</strong>
      <p class="meta"><code>${escapeHtml(shortId(routeId))}</code> · Soberana e sem dono</p>
    </div>
  </div>`;
}

function renderPostPactActionsHtml(routeId, link) {
  return `<div class="modal-actions modal-actions--row post-pact-actions">
    <button type="button" id="btn-post-pact-share-connect" class="btn btn-primary btn-post-pact-share" data-route="${escapeHtml(routeId)}">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
      Compartilhar
    </button>
    <button type="button" id="btn-post-pact-connect-close" class="btn btn-outline btn-post-pact-close">Continuar</button>
  </div>
  <details class="dm-advanced post-pact-advanced">
    <summary class="dm-advanced-summary">Ver link técnico</summary>
    <p class="meta">Só se precisar copiar manualmente:</p>
    <p class="meta modal-connect-url"><code id="post-pact-connect-url">${escapeHtml(link)}</code></p>
  </details>`;
}

export function renderPostPactConnectModal(container, routeId) {
  if (!container || !routeId) return;
  const link = `${typeof location !== "undefined" ? location.origin + location.pathname : ""}#/connect/${encodeURIComponent(routeId)}`;
  container.innerHTML = `
    <div class="modal-overlay modal-sheet modal-sheet--raised" id="post-pact-connect-overlay" role="dialog" aria-modal="true" aria-labelledby="post-pact-title">
      <div class="modal-dialog modal-card post-pact-connect-card">
        <div class="post-pact-badge-pill">
          <span class="post-pact-badge-dot"></span>
          <span>Nó Conectado à Malha Cívica</span>
        </div>
        <div class="post-pact-header">
          <div class="post-pact-icon" aria-hidden="true">🎉</div>
          <div>
            <h3 class="modal-card-title" id="post-pact-title">Convide amigos</h3>
            <p class="desc modal-card-lead">Toque em Compartilhar para mandar seu convite do Vox.</p>
          </div>
        </div>
        ${renderPostPactIdentityHtml(routeId)}
        ${renderPostPactActionsHtml(routeId, link)}
      </div>
    </div>`;
}

export function closePostPactConnectModal(container) {
  if (container) container.innerHTML = "";
}

export function renderConnectPreview(main, profile, routeId, { isContact = false } = {}) {
  const name = escapeHtml(profile?.name || routeId);
  const bio = profile?.bio ? `<p class="desc">${escapeHtml(profile.bio)}</p>` : "";
  const av = renderAvatarHtml(routeId, name);
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

export function renderCantinaGate(container) {
  if (!container) return;
  container.innerHTML = `
    <div class="modal-overlay modal-sheet cantina-overlay" id="cantina-modal-overlay" role="dialog" aria-modal="true" aria-label="Porta da Cantina">
      <div class="modal-dialog modal-card cantina-dialog">
        <div class="cantina-art-wrap">
          ${CANTINA_ART}
        </div>
        <div class="cantina-actions modal-actions modal-actions--stack">
          <button id="btn-cantina-enter" class="btn btn-primary btn-cantina-enter btn-cantina-enter-lg">Entrar — sou humano</button>
          <details class="cantina-details">
            <summary class="cantina-details-summary">O que isso significa?</summary>
            <p class="desc cantina-details-body">No Vox você não precisa de CPF nem de cadastro sob vigilância. Protegemos o espaço recusando fazendas de automação para que pessoas reais conversem em paz sob o Pacto Vox.</p>
          </details>
        </div>
      </div>
    </div>
  `;
}

export function closeCantinaGate(container) {
  if (container) container.innerHTML = "";
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
