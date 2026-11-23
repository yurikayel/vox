/** @file Governança, classificados, cartões de proposta/oferta e composição de pauta.
 * @module render/community-governance
 */
import * as mock from "../mock.js";
import * as listing from "../listing.js";
import * as hashtags from "../hashtags.js";
import * as listingUi from "../listing-ui.js";
import * as gossipRetract from "../gossip-retract-ui.js";
import { renderComposeSignaturePanel } from "./compose-chrome.js";
import { renderSteps, renderReviewList, renderFeiraDisabled } from "./compose-steps.js";
import { buildListingDmHref } from "../dm-messenger.js";
import {
  escapeHtml,
  resolvePostAuthorLabels,
  formatTimeAgo,
  renderAvatarHtml,
} from "./util.js";

/**
 * Painel exibido quando a Feira está desligada na comunidade.
 *
 * @param {string} communityId
 * @returns {string}
 */
function renderCommercialDisabledView(communityId) {
  return `<div class="community-vox-panel">${renderFeiraDisabled(communityId)}</div>`;
}

/**
 * Aba Classificados com ofertas locais ou aviso de feira desativada.
 * @param {string} communityId Slug.
 * @param {string} commTitle Título da comunidade.
 * @param {object} meta Metadados (comercial habilitado ou não).
 * @param {object[]} listings Ofertas carregadas.
 * @returns {string} HTML do painel.
 */
export function renderCommunityListingsTab(communityId, commTitle, meta, listings) {
  if (!listing.isCommercialEnabled(meta)) {
    return renderCommercialDisabledView(communityId);
  }
  const actions = `
    <div class="community-vox-panel">
    <div class="actions-bar feira-actions-bar" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
      <span class="section-title">Ofertas locais</span>
      <a class="btn btn-primary btn-sm" href="#/compose/listing?c=${encodeURIComponent(communityId)}">+ Nova oferta</a>
    </div>`;

  if (!listings || !listings.length) {
    return `${actions}
      <div class="empty" style="padding: 1.5rem; text-align: center;">
        <p>Nenhuma oferta cadastrada nesta feira ainda.</p>
        <a class="btn btn-primary btn-sm" href="#/compose/listing?c=${encodeURIComponent(communityId)}">+ Criar primeira oferta</a>
      </div>
    </div>`;
  }

  const items = listings.map((l) => renderListingItem(l, { communityTitle: commTitle })).join("");
  return `${actions}
    <div class="feed-container community-vox-panel-feed">${items}</div>
    <p class="listing-footer-disclaimer">⚡ ${escapeHtml(listing.LISTING_DISCLAIMER)}</p>
    </div>`;
}

/**
 * Aba Governança com lista de propostas e CTA de nova proposta.
 * @param {string} communityId Slug.
 * @param {string} commTitle Título legível.
 * @param {object} meta Metadados (reservado para regras futuras).
 * @param {object[]} [proposals=[]] Propostas conhecidas.
 * @returns {string} HTML do painel.
 */
export function renderCommunityGovernanceTab(communityId, commTitle, meta, proposals = []) {
  const actions = `
    <div class="community-vox-panel">
    <div class="actions-bar gov-actions-bar" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
      <span class="section-title">Deliberações Comunitárias</span>
      <a class="btn btn-primary btn-sm" href="#/compose/proposal?c=${encodeURIComponent(communityId)}">+ Nova proposta</a>
    </div>
    <div class="gov-info-card" style="padding: 1rem; margin-bottom: 1rem;">
      <p class="desc" style="margin:0; font-size:0.875rem;">
        🏛️ <strong>Rede como repo público:</strong> Mudanças de regras e moderação são propostas abertas com diff unificado, apuração estrita de <strong>1 membro = 1 voto</strong> e marco de corte anti-brigading.
      </p>
    </div>`;

  if (!proposals.length) {
    return `${actions}
      <div class="empty" style="padding: 1.5rem; text-align: center;">
        <p>Nenhuma proposta em deliberação nesta comunidade ainda.</p>
        <a class="btn btn-primary btn-sm" href="#/compose/proposal?c=${encodeURIComponent(communityId)}">+ Criar primeira proposta</a>
      </div>
    </div>`;
  }

  const items = proposals.map((p) => renderProposalItem(p, { communityId, communityTitle: commTitle })).join("");
  return `${actions}<div class="feed-container community-vox-panel-feed">${items}</div></div>`;
}

/**
 * Rodapé da proposta com data e selo de diff.
 *
 * @param {object} item
 * @param {string} commId
 * @param {string} timeLabel
 * @returns {string}
 */
function renderProposalMetaFooter(item, commId, timeLabel) {
  const diffBadge = item.diffText ? '<span class="pill">📄 Contém diff unificado</span>' : "";
  return `
    <div class="proposal-meta-row" style="margin-top: 0.75rem;">
      ${diffBadge}
      <span class="pill pill-outline">Corte: ${escapeHtml(timeLabel)}</span>
      <a class="btn btn-outline btn-sm" style="margin-left:auto;" href="#/c/${encodeURIComponent(commId)}/proposal/${encodeURIComponent(item.id)}">Ver proposta & votos →</a>
    </div>`;
}

/**
 * Cartão resumido de proposta na lista de governança.
 * @param {object} item Proposta com título, corpo e estado.
 * @param {object} [options={}]
 * @param {string} [options.communityId=""] Comunidade padrão.
 * @param {string} [options.communityTitle=""] Título (contexto).
 * @returns {string} HTML do cartão.
 */
export function renderProposalItem(item, { communityId = "", communityTitle: _communityTitle = "" } = {}) {
  const author = item.author || item.owner || "";
  const labels = resolvePostAuthorLabels(author, {
    authorDisplay: item.authorDisplay,
    isOwnLocalPost: item.isOwnLocalPost,
  });
  const timeLabel = formatTimeAgo(item.createdAt || item.ts);
  const commId = item.communityId || communityId || "";
  const statusBadge = renderProposalStatusBadge(item.state || "open");
  const bodyText = (item.body || "").slice(0, 160);
  const bodyEllipsis = (item.body || "").length > 160 ? "…" : "";

  return `
    <article class="post-card proposal-card card" data-id="${escapeHtml(item.id)}">
      <div class="post-header">
        <div class="post-header-author">
          <a class="avatar-link" href="#/u/${encodeURIComponent(author)}">${renderAvatarHtml(author, labels.authorDisplay)}</a>
          <a class="post-author" href="#/u/${encodeURIComponent(author)}">${escapeHtml(labels.authorDisplay)}</a>
          <span class="post-handle">@${escapeHtml(labels.authorHandle)}</span>
          <span class="post-dot">·</span>
          <span class="post-meta">${escapeHtml(timeLabel)}</span>
        </div>
        <div class="proposal-badges">${statusBadge}</div>
      </div>
      <h3 class="proposal-title" style="margin: 0.5rem 0 0.25rem;">
        <a href="#/c/${encodeURIComponent(commId)}/proposal/${encodeURIComponent(item.id)}">${escapeHtml(item.title)}</a>
      </h3>
      <p class="post-text">${escapeHtml(bodyText)}${bodyEllipsis}</p>
      ${renderProposalMetaFooter(item, commId, timeLabel)}
    </article>`;
}

/**
 * Selo colorido do estado da proposta (`open`, `merged`, `rejected`, `expired`).
 * @param {string} state Chave de estado.
 * @returns {string} HTML do `.status-pill`.
 */
export function renderProposalStatusBadge(state) {
  if (state === "merged") {
    return `<span class="status-pill status-merged">🟣 Aprovada (Merged)</span>`;
  }
  if (state === "rejected") {
    return `<span class="status-pill status-rejected">🔴 Rejeitada</span>`;
  }
  if (state === "expired") {
    return `<span class="status-pill status-expired">⚪ Expirada</span>`;
  }
  return `<span class="status-pill status-open">🟢 Em votação</span>`;
}

/**
 * Imagem da oferta da Feira, vazia se não há.
 *
 * @param {object} item
 * @returns {string}
 */
function renderListingMedia(item) {
  if (!item.image) return "";
  return `<div class="post-media-container"><img class="post-media" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.imageAlt || item.title || "Oferta")}" /></div>`;
}

/**
 * Ações da oferta (Pix, mensagem, link).
 *
 * @param {object} options
 * @returns {string}
 */
function renderListingActions({ item, author, authorDisplay, price, pixKey, commId }) {
  const pixBtn = pixKey
    ? `<button type="button" class="btn btn-secondary btn-sm btn-zap-post btn-copy-pix" data-pix="${escapeHtml(pixKey)}" data-author="${escapeHtml(author)}" data-author-name="${escapeHtml(authorDisplay)}" data-price="${escapeHtml(price || "")}" data-title="${escapeHtml(item.title || "")}" aria-label="Apoiar com Pix" title="Apoiar com Pix">⚡ Apoiar</button>`
    : "";
  const dmHref = buildListingDmHref(author, item, { communityId: commId, price: price || "", pixKey });

  return `
    <div class="listing-actions post-toolbar" style="margin-top:10px; display:flex; gap:8px; align-items:center;">
      <a class="btn btn-outline btn-sm" href="${escapeHtml(dmHref)}">💬 Conversar no DM</a>
      ${pixBtn}
      <button class="action-btn btn-share-listing" data-id="${escapeHtml(item.id)}" data-title="${escapeHtml(item.title)}" data-comm="${escapeHtml(commId)}" data-price="${escapeHtml(price)}" aria-label="Compartilhar oferta">
        <svg class="action-icon icon-share" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
      </button>
    </div>`;
}

/**
 * Cabeçalho da oferta com autor, selos e hora.
 *
 * @param {object} author
 * @param {object} labels
 * @param {string} locBadge
 * @param {string} timeLabel
 * @param {string} headerBadges
 * @returns {string}
 */
function renderListingHeader(author, labels, locBadge, timeLabel, headerBadges) {
  return `
    <div class="post-header">
      <div class="post-header-author">
        <a class="avatar-link" href="#/u/${encodeURIComponent(author)}">${renderAvatarHtml(author, labels.authorDisplay)}</a>
        <a class="post-author" href="#/u/${encodeURIComponent(author)}">${escapeHtml(labels.authorDisplay)}</a>
        <span class="post-handle">@${escapeHtml(labels.authorHandle)}</span>
        ${locBadge}
        <span class="post-dot">·</span>
        <span class="post-meta">${escapeHtml(timeLabel)}</span>
      </div>
      ${headerBadges}
    </div>`;
}

/**
 * Título, descrição e preço da oferta.
 *
 * @param {object} item
 * @param {string} price
 * @returns {string}
 */
function renderListingContent(item, price) {
  const priceHtml = price ? `<span class="listing-price">${escapeHtml(price)}</span>` : "";
  return `
    <div class="listing-content">
      <div class="listing-price-row">
        ${priceHtml}
        <h3 class="listing-title">${escapeHtml(item.title || "Oferta")}</h3>
      </div>
      <div class="post-body listing-body">${hashtags.linkifyHashtags(escapeHtml(item.body || ""))}</div>
    </div>`;
}

/**
 * Cartão de oferta na feira comunitária (preço, Pix, DM).
 * @param {object} item Oferta/listing.
 * @param {object} [options={}]
 * @param {string} [options.communityTitle=""] Nome da feira no contexto.
 * @returns {string} HTML do cartão ou `""` se apagado por gossip.
 */
export function renderListingItem(item, { communityTitle = "" } = {}) {
  if (gossipRetract.shouldHideGossipDeletedPost(item)) return "";
  const author = item.author || item.owner || "";
  const labels = resolvePostAuthorLabels(author, {
    authorDisplay: item.authorDisplay,
    isOwnLocalPost: item.isOwnLocalPost,
  });
  const price = listing.normalizePriceLabel(item.priceLabel);
  const location = listing.normalizeLocationLabel(item.locationLabel);
  const commId = item.communityId || communityTitle || "demo-feira-local";
  const pixKey = item.contactPix || (author ? mock.getAuthorPixKey(author) : "") || "";
  const locBadge = location ? `<span class="listing-location-badge">📍 ${escapeHtml(location)}</span>` : "";
  const headerBadges = listingUi.renderListingHeaderBadges(item, {
    statusKey: listing.normalizeListingStatus(item.listingStatus),
    statusLabel: listing.formatListingStatus(item.listingStatus),
    escapeHtml,
  });

  return `
    <article class="post-card listing-card card" data-id="${escapeHtml(item.id)}">
      ${renderListingHeader(author, labels, locBadge, formatTimeAgo(item.ts), headerBadges)}
      ${listingUi.renderListingOwnerMenu(item)}
      ${renderListingMedia(item)}
      ${renderListingContent(item, price)}
      ${renderListingActions({ item, author, authorDisplay: labels.authorDisplay, price, pixKey, commId })}
    </article>`;
}

/**
 * Passo da proposta: o que muda.
 *
 * @returns {string}
 */
function proposalWhatStepHtml() {
  return `
        <div class="form-group agora-compose-field">
          <label for="prop-title" class="agora-field-label">Título da proposta</label>
          <input type="text" id="prop-title" class="form-control" placeholder="Ex: Ativar feira comunitária popular" required maxlength="120" />
        </div>`;
}

/**
 * Passo da proposta: por quê.
 *
 * @returns {string}
 */
function proposalWhyStepHtml() {
  return `
        <div class="form-group agora-compose-field">
          <label for="prop-body" class="agora-field-label">Motivação e descrição</label>
          <textarea id="prop-body" class="form-control" rows="6" placeholder="Explique os motivos da mudança e benefícios para a comunidade..." required></textarea>
        </div>`;
}

/**
 * Passo da proposta: diff opcional.
 *
 * @returns {string}
 */
function proposalDiffStepHtml() {
  return `
        <div class="form-group agora-compose-field">
          <label for="prop-diff" class="agora-field-label">Diff unificado das regras</label>
          <textarea id="prop-diff" class="form-control agora-diff-input" rows="6" placeholder="@@ -1,2 +1,3 @@&#10;- regra antiga&#10;+ nova regra"></textarea>
          <span class="agora-field-hint">Linhas com + indicam inclusões e - indicam exclusões. Pode pular.</span>
        </div>`;
}

/**
 * Passo da proposta: revisão antes de enviar.
 *
 * @returns {string}
 */
function proposalReviewStepHtml() {
  return `
        ${renderReviewList([
          { label: "Título", from: "prop-title" },
          { label: "Motivação", from: "prop-body", long: true },
          { label: "Regras", from: "prop-diff", empty: "Sem diff", long: true },
        ])}
        <p class="compose-step-lead">Membros decidem por voto direto: 1 membro = 1 voto. Só vota quem já era membro quando a proposta nasceu.</p>
        ${renderComposeSignaturePanel()}`;
}

/**
 * Wizard de nova proposta de governança (diff opcional + assinatura).
 * @param {HTMLElement} main Container da rota.
 * @param {string} communityId Comunidade alvo.
 * @param {string} [commTitle=""] Título no kicker.
 * @returns {void}
 */
export function renderComposeProposal(main, communityId, commTitle = "") {
  const backHref = `#/c/${encodeURIComponent(communityId)}?tab=governance`;
  const nav = { backHref, submitId: "btn-submit-proposal", submitLabel: "Publicar Proposta Assinada" };
  const steps = [
    { key: "what", title: "O que muda?", required: ["prop-title"], requiredMsg: "Dê um título à proposta.", body: proposalWhatStepHtml() },
    { key: "why", title: "Por quê?", required: ["prop-body"], requiredMsg: "Explique a motivação.", body: proposalWhyStepHtml() },
    { key: "diff", title: "Quais regras mudam? (opcional)", body: proposalDiffStepHtml() },
    { key: "review", title: "Revisar a proposta", body: proposalReviewStepHtml() },
  ];
  main.innerHTML = `
    <div class="card compose-card compose-proposal-card agora-composer agora-composer--steps">
      <div class="agora-composer-head">
        <a class="back-link" href="${backHref}">← Voltar à governança</a>
        <p class="agora-composer-kicker">Nova Proposta — ${escapeHtml(commTitle || communityId)}</p>
      </div>
      <form id="form-compose-proposal" novalidate>
        <input type="hidden" id="prop-comm-id" value="${escapeHtml(communityId)}" />
        ${renderSteps(steps, nav)}
      </form>
    </div>`;
}