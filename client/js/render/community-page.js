/** @file Página da comunidade: cabeçalho Orkut, abas e layout principal.
 * @module render/community-page
 */
import * as mock from "../mock.js";
import * as communityUpdates from "../community-updates.js";
import { COMPOSER_IMAGE_ACCEPT_ATTR } from "../composer-media.js";
import { formatAbsoluteDate } from "../shared/date-format.js";
import {
  escapeHtml,
  shortId,
  resolvePostAuthorLabels,
  getCommunityColor,
  renderAvatarHtml,
} from "./util.js";
import { renderStat, formatCountdown } from "./vote.js";
import { renderCommunityHeaderToolbar } from "./community-toolbar.js";
import { renderChannelBarHtml, showsComposeButton } from "./channel-bar.js";
import {
  resolveCommunityMemberCount,
  formatCommunityMembers,
  renderCommunityForkBanner,
  renderCommunityWelcomeRecado,
  renderCommunityMetaChips,
} from "./community-shared.js";
import {
  renderCommunityNeighborPanel,
  renderCommunityMirrorHint,
  renderCommunitySeedChecklist,
} from "./community-neighbors.js";
import {
  renderCommunityMembersTab,
  renderCommunityPostsTab,
} from "./community-topics.js";
import { renderCommunityAvatarHtml, renderCommunityOrkutMembersBox } from "./community-home.js";
import { renderCommunityGovernanceTab, renderCommunityListingsTab } from "./community-governance.js";

/**
 * Avatar do cabeçalho da comunidade, com botão de troca quando permitido.
 *
 * @param {object} meta
 * @param {string} communityId
 * @param {boolean} canChangePhoto
 * @returns {string}
 */
function renderCommunityHeaderAvatar(meta, communityId, canChangePhoto) {
  const photoBtn = canChangePhoto ? `
    <label class="btn-change-comm-photo" title="Alterar foto da comunidade (estilo Orkut)">
      <input type="file" id="input-comm-photo-file" accept="${COMPOSER_IMAGE_ACCEPT_ATTR}" style="display:none;" />
      <span class="btn-change-comm-photo-label">📷 Alterar foto</span>
    </label>` : "";
  return `<div class="community-vox-avatar-wrap">${renderCommunityAvatarHtml(meta, communityId, "community-avatar-lg")}${photoBtn}</div>`;
}

/**
 * Detalhe da quarentena de chaves novas, só para quem gerencia.
 *
 * @param {object} meta
 * @param {string} communityId
 * @param {boolean} canManage
 * @returns {string}
 */
function renderCommunityQuarantineDetail(meta, communityId, canManage) {
  if (!canManage) return "";
  const on = Boolean(meta?.newKeyQuarantine);
  const next = on ? "false" : "true";
  const stateLabel = on ? "Ligada" : "Desligada";
  const actionLabel = on ? "Desligar" : "Ligar";
  const title = on ? "Desligar quarentena de chaves novas" : "Ligar quarentena de chaves novas";
  return `
        <div class="community-orkut-detail-item community-quarantine-control">
          <span class="community-orkut-detail-label">Quarentena:</span>
          <span class="community-orkut-detail-val">
            <span class="community-quarantine-state">${stateLabel}</span>
            <button type="button" class="btn btn-xs btn-outline btn-toggle-comm-quarantine" id="btn-toggle-comm-quarantine" data-comm="${escapeHtml(communityId)}" data-next="${next}" title="${title}">
              ${actionLabel}
            </button>
          </span>
        </div>`;
}

/**
 * Ficha da comunidade (estilo Orkut) com dono, membros e quarentena.
 *
 * @param {object} meta
 * @param {object|undefined} ownerLabels
 * @param {number} memberCount
 * @param {string} [quarantineHtml=""]
 * @returns {string}
 */
function renderCommunityFichaOrkut(meta, ownerLabels, memberCount, quarantineHtml = "") {
  const ownerItem = meta.owner && ownerLabels ? `
    <div class="community-orkut-detail-item">
      <span class="community-orkut-detail-label">Dono:</span>
      <span class="community-orkut-detail-val">
        <a class="community-orkut-owner-link" href="#/u/${encodeURIComponent(meta.owner)}">
          ${renderAvatarHtml(meta.owner, ownerLabels.authorDisplay, "avatar-xs")}
          <span class="community-orkut-owner-name">${escapeHtml(ownerLabels.authorDisplay)}</span>
          ${ownerLabels.authorHandle && ownerLabels.authorHandle !== ownerLabels.authorDisplay ? `<span class="meta community-orkut-owner-handle">@${escapeHtml(ownerLabels.authorHandle)}</span>` : ""}
        </a>
      </span>
    </div>` : "";

  return `
    <div class="community-vox-about community-orkut-ficha">
      ${meta.description ? `<p class="community-vox-desc">${escapeHtml(meta.description)}</p>` : ""}
      <div class="community-orkut-details-grid">
        ${ownerItem}
        ${meta.category ? `<div class="community-orkut-detail-item"><span class="community-orkut-detail-label">Categoria:</span><span class="community-orkut-detail-val">${escapeHtml(meta.category)}</span></div>` : ""}
        <div class="community-orkut-detail-item"><span class="community-orkut-detail-label">Tipo:</span><span class="community-orkut-detail-val">${meta.visibility === "closed" ? "Moderada (Fechada)" : "Pública (Aberta)"}</span></div>
        <div class="community-orkut-detail-item"><span class="community-orkut-detail-label">Idioma:</span><span class="community-orkut-detail-val">${escapeHtml(meta.language || "Português")}</span></div>
        ${memberCount != null ? `<div class="community-orkut-detail-item"><span class="community-orkut-detail-label">Membros:</span><span class="community-orkut-detail-val">${escapeHtml(formatCommunityMembers(memberCount))}</span></div>` : ""}
        ${meta.createdAt || meta.ts ? `<div class="community-orkut-detail-item"><span class="community-orkut-detail-label">Criada em:</span><span class="community-orkut-detail-val">${escapeHtml(formatAbsoluteDate(meta.createdAt || meta.ts))}</span></div>` : ""}
        ${quarantineHtml}
      </div>
      ${meta.owner ? `<p class="community-vox-owner meta" style="display:none;">Criada por <a href="#/u/${encodeURIComponent(meta.owner)}">${escapeHtml(shortId(meta.owner))}</a></p>` : ""}
    </div>`;
}

/** PM-09: mesma regra de quem aplica o update; a chave que assina é a da conta local (vx_…). */
function canChangeCommunityPhoto(meta, opts) {
  return communityUpdates.canUpdateCommunity(meta, opts.routeId || opts.walletAddress);
}

/**
 * Diz se a conta pode gerenciar a quarentena da comunidade.
 *
 * @param {object} meta
 * @param {object} [opts={}]
 * @returns {boolean}
 */
function canManageCommunityQuarantine(meta, opts = {}) {
  const who = opts.routeId || opts.walletAddress;
  if (who) return communityUpdates.canUpdateCommunity(meta, who);
  return Boolean(opts.isMod);
}

/**
 * Cabeçalho da página da comunidade.
 *
 * @param {object} meta
 * @param {string} communityId
 * @param {object} [opts={}]
 * @returns {string}
 */
function renderCommunityHeader(meta, communityId, opts = {}) {
  const commTitle = meta.title || communityId;
  const memberCount = resolveCommunityMemberCount(meta, communityId);
  const metaChips = renderCommunityMetaChips(meta, communityId, memberCount);
  const canChangePhoto = canChangeCommunityPhoto(meta, opts);
  const canManageQuarantine = canManageCommunityQuarantine(meta, opts);
  const quarantineHtml = renderCommunityQuarantineDetail(meta, communityId, canManageQuarantine);
  const tagline = meta.headerTagline || (communityId === mock.MOCK_DEMO_COMMUNITY.id ? mock.MOCK_DEMO_COMMUNITY.headerTagline : "");
  const kicker = tagline || (meta.category ? `Comunidade · ${meta.category}` : "Comunidade Vox");
  const ownerLabels = meta.owner ? resolvePostAuthorLabels(meta.owner) : null;

  return `
    <header class="community-vox-header card">
      <div class="community-vox-accent-rail" aria-hidden="true"></div>
      <div class="community-vox-header-grid">
        ${renderCommunityHeaderAvatar(meta, communityId, canChangePhoto)}
        <div class="community-vox-header-copy">
          <p class="community-vox-kicker">${escapeHtml(kicker)}</p>
          <h1 class="community-vox-name">${escapeHtml(commTitle)}</h1>
          ${metaChips}
          ${renderCommunityMirrorHint(opts.mirrorStatus)}
        </div>
        ${renderCommunityHeaderToolbar(communityId, commTitle, opts.isMember, showsComposeButton(meta, opts.isMod))}
      </div>
      ${renderCommunityFichaOrkut(meta, ownerLabels, memberCount, quarantineHtml)}
    </header>`;
}

/**
 * Abas de navegação da comunidade (posts, ofertas, governança, membros).
 *
 * @param {string} communityId
 * @param {string} activeTab
 * @param {number} [proposalCount=0]
 * @returns {string}
 */
function renderCommunityNavTabs(communityId, activeTab, proposalCount = 0) {
  const encId = encodeURIComponent(communityId);
  const isPosts = activeTab !== "listings" && activeTab !== "governance" && activeTab !== "members";
  const govLabel = proposalCount ? ` (${proposalCount})` : "";
  return `
    <nav class="community-vox-nav community-tabs segmented-tabs" aria-label="Seções da comunidade">
      <a class="tab-btn ${isPosts ? "active" : ""}" data-tab="posts" href="#/c/${encId}">Posts</a>
      <a class="tab-btn ${activeTab === "members" ? "active" : ""}" data-tab="members" href="#/c/${encId}?tab=members">Membros</a>
      <a class="tab-btn ${activeTab === "listings" ? "active" : ""}" data-tab="listings" href="#/c/${encId}?tab=listings">Classificados</a>
      <a class="tab-btn ${activeTab === "governance" ? "active" : ""}" data-tab="governance" href="#/c/${encId}?tab=governance">Governança${govLabel}</a>
    </nav>`;
}

/**
 * Monólitos da comunidade com o que o aparelho sabe de verdade (tela 7 do guia de design, sem tesouro nem ZK).
 * @param {number|null} memberCount Membros conhecidos (ou `null` quando ainda não há contagem).
 * @param {object[]} topics Tópicos carregados nesta tela.
 * @param {object[]} proposals Pautas da comunidade conhecidas pelo aparelho.
 * @returns {string} HTML da `.agora-stat-row`.
 */
function renderCommunityStatRowHtml(memberCount, topics, proposals) {
  const open = (proposals || []).filter((p) => (p.state || "open") === "open").length;
  const members = memberCount == null ? "—" : formatCommunityMembers(memberCount);
  return `<div class="agora-stat-row community-vox-stats">
      ${renderStat("Membros", members, "conhecidos neste aparelho")}
      ${renderStat("Tópicos", (topics || []).length, "carregados aqui")}
      ${renderStat("Pautas em votação", open, open ? "abertas agora" : "nenhuma aberta", open ? "emerald" : "")}
    </div>`;
}

/**
 * Pauta aberta em destaque no topo dos posts (a "assembleia aberta" do guia de design), com prazo real.
 * @param {string} communityId Id da comunidade.
 * @param {object[]} proposals Pautas conhecidas; usa a primeira em votação.
 * @returns {string} HTML do cartão `.agora-deliberation`, ou vazio se nenhuma pauta estiver aberta.
 */
function renderCommunityFeaturedProposalHtml(communityId, proposals) {
  const open = (proposals || []).find((p) => (p.state || "open") === "open");
  if (!open) return "";
  const href = `#/c/${encodeURIComponent(communityId)}/proposal/${encodeURIComponent(open.id)}`;
  const countdown = formatCountdown(open.closesAt);
  const body = String(open.body || "");
  return `<article class="agora-deliberation community-vox-featured" data-state="open">
      <div class="agora-deliberation-meta"><span class="agora-pill agora-pill--emerald">Pauta em votação</span>${countdown ? `<span class="agora-countdown">${escapeHtml(countdown)}</span>` : ""}</div>
      <h2 class="agora-deliberation-title"><a href="${href}">${escapeHtml(open.title || "Pauta sem título")}</a></h2>
      ${body ? `<p class="agora-deliberation-body">${escapeHtml(body.slice(0, 220))}${body.length > 220 ? "…" : ""}</p>` : ""}
      <div class="agora-vote-actions"><a class="agora-btn agora-btn--solid" href="${href}">Ver pauta e votar</a></div>
    </article>`;
}

/**
 * Monta a página em duas faixas: conteúdo (abas e posts) e lateral (vizinhos, primeiros passos).
 * No celular a lateral desce para depois do conteúdo; em telas largas fica ao lado (CSS).
 * @param {{communityId: string, accent: string, top: string, main: string, aside: string}} parts Pedaços já renderizados.
 * @returns {string} HTML da `.community-vox-page`.
 */
function renderCommunityPageHtml({ communityId, accent, top, main, aside }) {
  return `
    <div class="community-vox-page agora-wide" data-community-id="${escapeHtml(communityId)}" style="--community-accent:${accent};">
      ${top}
      <div class="community-vox-layout">
        <div class="community-vox-main">${main}</div>
        ${aside ? `<aside class="community-vox-aside" aria-label="Rede e primeiros passos">${aside}</aside>` : ""}
      </div>
    </div>`;
}

/**
 * Página completa da comunidade (cabeçalho, abas, lateral de vizinhos).
 * @param {HTMLElement} main Container da rota `#/c/…`.
 * @param {string} communityId Slug.
 * @param {object[]} topics Tópicos carregados.
 * @param {object} [meta={}] Ficha Orkut e metadados.
 * @param {object} [opts={}] Abas, propostas, checklist, stats de vizinhos.
 * @returns {void}
 */
export function renderCommunity(main, communityId, topics, meta = {}, opts = {}) {
  const activeTab = opts.activeTab || "posts";
  const accent = getCommunityColor(communityId);
  const headerHtml = renderCommunityHeader(meta, communityId, opts);
  const neighborHtml = renderCommunityNeighborPanel(opts.neighborStats, opts);
  const seedHtml = opts.seedChecklist ? renderCommunitySeedChecklist(communityId, opts.seedChecklist.state, opts.seedChecklist.ctx) : "";
  const recadoHtml = activeTab === "posts" && meta.welcomeRecado ? renderCommunityWelcomeRecado(meta.welcomeRecado) : "";
  const navHtml = renderCommunityNavTabs(communityId, activeTab, opts.proposals?.length);
  const memberCount = resolveCommunityMemberCount(meta, communityId);
  const featuredHtml = activeTab === "posts" ? renderCommunityFeaturedProposalHtml(communityId, opts.proposals) : "";
  const slotHtml = renderCommunityTabContent(activeTab, {
    communityId,
    commTitle: meta.title || communityId,
    meta,
    topics,
    listings: opts.listings,
    proposals: opts.proposals,
    recentPeople: opts.recentPeople,
    isMember: opts.isMember, isMod: opts.isMod,
    memberCount,
  });

  main.innerHTML += renderCommunityPageHtml({
    communityId,
    accent,
    top: `${headerHtml}${renderCommunityStatRowHtml(memberCount, topics, opts.proposals)}`,
    main: `${renderChannelBarHtml(meta, { communityId, isMod: opts.isMod })}${renderCommunityForkBanner(meta)}${recadoHtml}${featuredHtml}${navHtml}
      <div class="community-tab-content-slot" id="community-tab-content">${slotHtml}</div>`,
    aside: `${neighborHtml}${seedHtml}`,
  });
}

const TAB_RENDERERS = {
  listings: (c) => renderCommunityListingsTab(c.communityId, c.commTitle, c.meta, c.listings),
  governance: (c) => renderCommunityGovernanceTab(c.communityId, c.commTitle, c.meta, c.proposals),
  members: (c) => renderCommunityMembersTab(c.meta, c.communityId, c.recentPeople, c.isMember),
};

/**
 * Conteúdo de uma aba da comunidade (posts, membros, classificados, governança).
 * @param {string} [tab="posts"] Aba ativa.
 * @param {object} [ctx={}] Contexto montado por {@link renderCommunity}.
 * @returns {string} HTML do slot da aba.
 */
export function renderCommunityTabContent(tab = "posts", ctx = {}) {
  const activeTab = tab || "posts";
  const renderer = Object.hasOwn(TAB_RENDERERS, activeTab) ? TAB_RENDERERS[activeTab] : null;
  if (renderer) return renderer(ctx);
  return `<div class="community-vox-posts-wrap">
    ${renderCommunityOrkutMembersBox(ctx.meta, ctx.communityId, ctx.recentPeople, ctx.memberCount)}
    ${renderCommunityPostsTab(ctx.communityId, ctx.commTitle, ctx.topics || [], { sortMode: ctx.sortMode || "active", canCompose: showsComposeButton(ctx.meta, ctx.isMod) })}
  </div>`;
}
