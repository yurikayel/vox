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

const FEED_SEGMENTS = [
  { key: "for-you", href: "#/", label: "Social" },
  { key: "civic", href: "#/?feed=civic", label: "Cívico" },
];

const FEED_FILTERS = [
  { key: "following", href: "#/?feed=following", label: "Seguindo" },
  { key: "external", href: "#/?feed=external", label: "Redes externas" },
  { key: "all", href: "#/?feed=all", label: "Tudo" },
];

const currentAttr = (on) => (on ? ' aria-current="page"' : "");

function renderFeedSegments(activeFeed) {
  const links = FEED_SEGMENTS.map((s) => `<a href="${s.href}" class="sv-seg-btn"${currentAttr(activeFeed === s.key)}>${s.label}</a>`).join("");
  return `<div class="sv-seg">${links}</div>`;
}

function renderFeedFilter(activeFeed) {
  const active = FEED_FILTERS.find((f) => f.key === activeFeed);
  const links = FEED_FILTERS.map((f) => `<a href="${f.href}"${currentAttr(f === active)}>${f.label}</a>`).join("");
  const clear = active
    ? `<a href="#/" class="sv-filtro-chip" aria-label="Tirar o filtro ${active.label}">${active.label} <span aria-hidden="true">✕</span></a>`
    : "";
  return `<details class="sv-filtro"><summary>${active ? `Filtro: ${active.label}` : "Filtro"}</summary><div class="sv-filtro-menu">${links}</div></details>${clear}`;
}

/**
 * Barra de feeds no topo da Ágora (mesmas chaves que a query `?feed=`): 2 segmentos (Social e Cívico) e o menu Filtro
 * com Seguindo, Redes externas e Tudo. É navegação por links, sem JS: o segmento do feed aberto leva
 * `aria-current="page"`; com um filtro ativo nenhum segmento leva, e o chip "✕" volta ao Social.
 * @param {string} [activeFeed="for-you"] Feed selecionado.
 * @returns {string} HTML da barra `nav.sv-feedbar`.
 */
export function renderFeedTabsBar(activeFeed = "for-you") {
  return `
    <nav class="sv-feedbar" aria-label="Feeds">
      ${renderFeedSegments(activeFeed)}
      ${renderFeedFilter(activeFeed)}
    </nav>`;
}

/**
 * Barra do escudo cidadão no topo do feed.
 *
 * @returns {string}
 */
function renderCitizenShieldBarHtml() {
  return `
    <div class="vox-citizen-shield-bar" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; padding:6px 10px; margin-bottom:0.65rem; border-radius:var(--radius-sm); background:rgba(22,163,74,0.1); border:1px solid rgba(22,163,74,0.35); font-size:0.75rem;">
      <span>🛡️ <strong>Escudo Cidadão Vox:</strong> sem rastreadores de terceiros no app · feed por horário de assinatura (sem leilão de boost)</span>
      <a href="#/settings/linked-accounts" style="font-weight:700; color:var(--accent); text-decoration:none;">🔗 Configurar Redes →</a>
    </div>`;
}

/**
 * Linha de sugestões do Bluesky; no período eleitoral mostra só um aviso.
 *
 * @returns {string}
 */
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

/**
 * Formulário para adicionar perfil do Bluesky e importar.
 *
 * @returns {string}
 */
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

/**
 * Estado vazio do feed ativo.
 *
 * @param {string} activeFeed
 * @returns {string}
 */
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