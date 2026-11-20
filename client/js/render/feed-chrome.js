/**
 * @file Chrome do feed principal: stories, abas, Bluesky e orquestração `renderFeed`.
 *
 * @module render/feed-chrome
 */
import * as mock from "../mock.js";
import * as profileDirectory from "../profile-directory.js";
import * as gossipRetract from "../gossip-retract-ui.js";
import { isWelcomeRouteId } from "../vox-welcome-profile.js";
import { isElectoralModeActive } from "../electoral-period.js";
import { escapeHtml } from "./util.js";
import { rememberVisible } from "../repost-index.js";
import { renderCivicFeedIntro } from "./civic-block.js";
import { renderInlineComposer } from "./feed-composer.js";
import { renderPostItem } from "./feed-post-item.js";

/**
 * Faixa horizontal de stories (perfis demo ou lista customizada).
 * @param {object[]|null} [customProfiles=null] Perfis com `routeId`, `name`, `avatar`.
 * @returns {string} HTML da strip ou placeholder oculto se vazio.
 */
export function renderStoriesStrip(customProfiles = null) {
  const profiles = customProfiles || Object.values(mock.MOCK_DEMO_PROFILES || {});
  if (!profiles.length) return '<div class="stories-strip stories-strip--empty" style="display:none;"></div>';
  const items = profiles
    .map((p) => {
      const avatarSrc = p.avatar || "icons/icon.svg";
      const firstName = (p.name || p.handle || "Autor").split(" ")[0];
      const ringClass = isWelcomeRouteId(p.routeId) ? "story-ring story-ring--official" : "story-ring";
      return `
        <a class="story-item" href="#/u/${encodeURIComponent(p.routeId)}" title="Ver perfil de ${escapeHtml(p.name)}">
          <div class="${ringClass}">
            <img class="story-avatar" src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(p.name)}" loading="lazy" />
          </div>
          <span class="story-name">${escapeHtml(firstName)}</span>
        </a>`;
    })
    .join("");

  return `<div class="stories-strip" aria-label="Stories em destaque">${items}</div>`;
}

const FEED_TAB_ICONS = {
  social: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/></svg>`,
  vox: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18"/><path d="M5 21V10M9 21V10M15 21V10M19 21V10"/><path d="M2 10 12 3l10 7Z"/></svg>`,
  external: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>`,
  all: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`,
  following: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/></svg>`,
};

/**
 * Chips de filtro de feed no topo da Ágora (mesmas chaves que a query `?feed=`).
 * @param {string} [activeFeed="for-you"] Feed selecionado.
 * @returns {string} HTML da barra de abas.
 */
export function renderFeedTabsBar(activeFeed = "for-you") {
  const tabs = [
    { key: "for-you", href: "#/", icon: FEED_TAB_ICONS.social, label: "Social" },
    { key: "civic", href: "#/?feed=civic", icon: FEED_TAB_ICONS.vox, label: "Cívico" },
    { key: "external", href: "#/?feed=external", icon: FEED_TAB_ICONS.external, label: "Redes (Bluesky)" },
    { key: "all", href: "#/?feed=all", icon: FEED_TAB_ICONS.all, label: "Tudo" },
    { key: "following", href: "#/?feed=following", icon: FEED_TAB_ICONS.following, label: "Seguindo" },
  ];
  const items = tabs
    .map((t) => {
      const active = activeFeed === t.key;
      return `<a href="${t.href}" class="feed-tab-chip ${active ? "active" : ""}" role="tab" aria-selected="${active}">${t.icon}<span>${t.label}</span></a>`;
    })
    .join("\n      ");
  return `
    <div class="feed-tabs-bar" role="tablist" aria-label="Filtro de feeds">
      ${items}
    </div>`;
}

function renderCitizenShieldBarHtml() {
  return `
    <div class="vox-citizen-shield-bar" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; padding:6px 10px; margin-bottom:0.65rem; border-radius:var(--radius-sm); background:rgba(22,163,74,0.1); border:1px solid rgba(22,163,74,0.35); font-size:0.75rem;">
      <span>🛡️ <strong>Escudo Cidadão Vox:</strong> sem rastreadores de terceiros no app · feed por horário de assinatura (sem leilão de boost)</span>
      <a href="#/settings/linked-accounts" style="font-weight:700; color:var(--accent); text-decoration:none;">🔗 Configurar Redes →</a>
    </div>`;
}

function renderBskySuggestionsRow() {
  if (isElectoralModeActive()) {
    return '<p class="meta bsky-suggestions-row" role="note">Período eleitoral: o Vox não sugere perfis nem ranqueia conteúdo político (Res. TSE 23.755/2026).</p>';
  }
  return `
    <div class="bsky-suggestions-row">
      <span class="bsky-sugg-label">Sugestões cívicas:</span>
      <button type="button" class="btn-add-suggestion" data-handle="lula.com.br">+ @lula.com.br</button>
      <button type="button" class="btn-add-suggestion" data-handle="brasildefato.com.br">+ @brasildefato.com.br</button>
      <button type="button" class="btn-add-suggestion" data-handle="theintercept.com">+ @theintercept.com</button>
      <button type="button" class="btn-add-suggestion" data-handle="apublica.org">+ @apublica.org</button>
      <button type="button" class="btn-add-suggestion" data-handle="cartacapital.com.br">+ @cartacapital.com.br</button>
    </div>`;
}

function renderBskyFormAndImport() {
  return `
    <form id="form-add-bsky" class="bsky-add-form" aria-label="Adicionar perfil do Bluesky">
      <div class="bsky-input-group">
        <input type="text" id="input-bsky-handle" class="bsky-input" placeholder="Digite @handle.bsky.social..." required aria-label="Handle do Bluesky" />
        <button type="submit" class="btn btn-primary btn-sm btn-submit-bsky">+ Acompanhar no Vox</button>
      </div>
    </form>
    <div class="bsky-import-section">
      <div class="bsky-import-follows-row">
        <input type="text" id="input-bsky-import-me" class="bsky-input" placeholder="Seu @handle para importar quem você segue..." aria-label="Seu perfil do Bluesky" />
        <button type="button" id="btn-import-bsky-follows" class="btn btn-outline btn-sm">📥 Puxar quem eu sigo</button>
      </div>
      ${renderBskySuggestionsRow()}
    </div>`;
}

/**
 * Painel de gestão de perfis Bluesky seguidos via ingestão AT Protocol.
 * @param {string[]} [subscriptions=[]] Handles já inscritos.
 * @returns {string} HTML do gerenciador `.bsky-feed-manager`.
 */
export function renderExternalFeedManagerHtml(subscriptions = []) {
  const list = Array.isArray(subscriptions) ? subscriptions : [];
  const chips = list
    .map((h) => `<span class="bsky-sub-chip"><span class="bsky-sub-name">@${escapeHtml(h)}</span><button type="button" class="btn-remove-bsky-sub" data-handle="${escapeHtml(h)}" aria-label="Remover @${escapeHtml(h)}" title="Deixar de acompanhar">×</button></span>`)
    .join("");

  return `
    <div class="bsky-feed-manager" role="region" aria-label="Gerenciador de feeds externos">
      ${renderCitizenShieldBarHtml()}
      <div class="bsky-manager-head">
        <span class="bsky-badge">🌐 INGESTÃO PREDATÓRIA · AT PROTOCOL</span>
        <h3 class="bsky-manager-title">Feeds Externos sob Proteção Cívica</h3>
        <p class="bsky-manager-desc">Consuma e interaja (curta, salve, comente, cite e exploda) com perfis externos dentro da soberania do Vox.</p>
      </div>
      ${renderBskyFormAndImport()}
      <div class="bsky-subs-list">
        <span class="bsky-subs-label">Perfis integrados:</span>
        <div class="bsky-subs-chips">${chips || '<span class="meta">Nenhum perfil cadastrado.</span>'}</div>
      </div>
    </div>`;
}

const CIVIC_EMPTY_HTML = `<div class="empty civic-empty">
    <p><strong>Nenhum post cívico ainda.</strong></p>
    <p class="desc">Publique uma pauta, ideia, debate ou enquete com título e argumento — ela aparece aqui para posicionamento assinado.</p>
  </div>`;

function renderFeedEmptyState(activeFeed) {
  if (activeFeed === "civic") return CIVIC_EMPTY_HTML;
  if (activeFeed === "external") {
    return `<div class="empty external-empty">
      <p><strong>Nenhum post externo encontrado.</strong></p>
      <p class="desc" style="max-width:440px; margin:0.4rem auto 0.8rem;">Adicione um perfil do Bluesky acima ou verifique sua conexão com a internet.</p>
    </div>`;
  }
  if (activeFeed === "following") {
    return `<div class="empty following-empty">
      <div style="font-size:2rem; margin-bottom:0.5rem;">👥</div>
      <p><strong>Você ainda não acompanha ninguém.</strong></p>
      <p class="desc" style="max-width:440px; margin:0.4rem auto 0.8rem;">Clique em <strong>👁️ Acompanhar (Watch)</strong> nos perfis de autores para ver as publicações deles reunidas nesta aba.</p>
      <div style="display:flex; gap:0.5rem; justify-content:center; flex-wrap:wrap;">
        <a class="btn btn-primary btn-sm" href="#/">Explorar feed "Para você"</a>
        <a class="btn btn-outline btn-sm" href="#/pessoas">Encontrar pessoas na rede</a>
      </div>
    </div>`;
  }
  return `<div class="empty">
    <div style="font-size:2rem; margin-bottom:0.5rem;">🌱</div>
    <p><strong>Nenhuma publicação no feed ainda.</strong></p>
    <p class="desc" style="max-width:440px; margin:0.4rem auto 0.8rem;">Seja a primeira voz soberana a compartilhar uma ideia, foto Lo-Fi, áudio ou vídeo nesta rede.</p>
    <div style="display:flex; gap:0.5rem; justify-content:center; flex-wrap:wrap;">
      <button type="button" class="btn btn-primary btn-sm" data-click-target="#feed-inline-composer .inline-composer-collapsed">Criar publicação</button>
      <a class="btn btn-outline btn-sm" href="#/pessoas">Encontrar pessoas</a>
    </div>
  </div>`;
}

/**
 * Página do feed principal: stories, abas, composer e lista de posts.
 * @param {HTMLElement} main Container da Ágora.
 * @param {object[]} [topics=[]] Posts a renderizar.
 * @param {object} [opts={}]
 * @param {string} [opts.activeFeed] Filtro ativo (`civic`, `external`, etc.).
 * @param {string} [opts.userRouteId] Conta para o composer.
 * @param {string[]} [opts.externalSubs] Handles Bluesky quando `activeFeed === "external"`.
 * @returns {void}
 */
export function renderFeed(main, topics = [], opts = {}) {
  const activeFeed = opts.activeFeed || "for-you";
  const userRouteId = opts.userRouteId || "";
  const isCivic = activeFeed === "civic";
  const displayName = userRouteId ? profileDirectory.getAuthorDisplaySync(userRouteId) || mock.getAuthorDisplay(userRouteId) : "";
  const tabsBar = renderFeedTabsBar(activeFeed);
  const managerHtml = activeFeed === "external" ? renderExternalFeedManagerHtml(opts.externalSubs) : "";

  let html = `
    <div class="feed-chrome">
      ${isCivic ? "" : renderStoriesStrip()}
      ${tabsBar}
      ${managerHtml}
      ${isCivic ? renderCivicFeedIntro() : `<div class="feed-composer-section">
        ${renderInlineComposer({ userRouteId, displayName })}
      </div>`}
    </div>`;

  if (!topics.length) {
    main.innerHTML += html + renderFeedEmptyState(activeFeed);
    return;
  }

  const visible = gossipRetract.filterFeedTopicsForGossipRetract(topics);
  rememberVisible(visible, userRouteId);
  const items = visible.map((t) => renderPostItem(t)).join("");
  main.innerHTML += `${html}<div class="feed-container">${items}</div>`;
}