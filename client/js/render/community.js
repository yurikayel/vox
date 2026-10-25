/** @file Home, communities, listings, governance proposals UI. */
import * as mock from "../mock.js";
import * as listing from "../listing.js";
import * as gov from "../governance.js";
import * as hashtags from "../hashtags.js";
import * as listingUi from "../listing-ui.js";
import * as gossipRetract from "../gossip-retract-ui.js";
import * as profileDirectory from "../profile-directory.js";
import {
  escapeHtml,
  shortId,
  getCommunityColor,
  formatTimeAgo,
  renderAvatarHtml,
  renderMarkdownLight,
} from "./util.js";

function resolveCommunityMemberCount(meta, communityId) {
  if (meta.memberCount != null && !Number.isNaN(Number(meta.memberCount))) {
    return Number(meta.memberCount);
  }
  if (communityId === mock.MOCK_DEMO_COMMUNITY.id) return mock.MOCK_DEMO_UF_COUNT;
  return null;
}

function formatCommunityMembers(n) {
  if (n == null) return "";
  return `${n.toLocaleString("pt-BR")} membros`;
}

function buildCommunityTypeSubtitle(meta, communityId) {
  const parts = [];
  const vis = meta.visibility === "closed" ? "fechada" : "aberta";
  parts.push(`Tipo: ${vis}`);
  if (communityId === mock.MOCK_DEMO_COMMUNITY.id || meta.demo) parts.push("Demo");
  return parts.join(" · ");
}

function renderCommunityWelcomeRecado(text) {
  if (!text) return "";
  return `
    <article class="community-vox-recado" aria-label="Recado da comunidade">
      <header class="community-vox-recado-head">
        <span class="community-vox-recado-icon" aria-hidden="true">✉</span>
        <span class="section-title">Recado da comunidade</span>
      </header>
      <p class="community-vox-recado-body">${escapeHtml(text)}</p>
    </article>`;
}

function resolveCommunityOnlinePeople(recentPeople, communityId, limit = 9) {
  const people = recentPeople.slice(0, limit);
  if (people.length >= limit) return people;
  if (communityId !== mock.MOCK_DEMO_COMMUNITY.id) return people;
  const seen = new Set(people.map((p) => p.routeId));
  for (const routeId of mock.UF_ROUTE_IDS) {
    if (people.length >= limit) break;
    if (seen.has(routeId)) continue;
    people.push({
      routeId,
      name: mock.getAuthorDisplay(routeId) || routeId.slice(0, 10),
    });
    seen.add(routeId);
  }
  return people;
}

function renderCommunityOnlineGrid(people = []) {
  if (!people.length) {
    return `<p class="community-vox-online-empty">Ninguém recente no feed — seja o primeiro!</p>`;
  }
  const cells = people
    .map((p) => {
      const label =
        profileDirectory.getAuthorDisplaySync(p.routeId) || p.name || p.routeId.slice(0, 10);
      const short = label.split(/\s+/)[0] || label;
      return `
        <a class="community-vox-online-face" href="#/u/${encodeURIComponent(p.routeId)}" title="${escapeHtml(label)}">
          ${renderAvatarHtml(p.routeId, label, "avatar-sm")}
          <span class="community-vox-online-name">${escapeHtml(short)}</span>
        </a>`;
    })
    .join("");
  return `<div class="community-vox-online-grid" role="list">${cells}</div>`;
}

function topicExcerptOneParagraph(topic) {
  const raw = (topic.body || topic.title || "").replace(/\s+/g, " ").trim();
  const noTags = raw.replace(/#\S+/g, "").replace(/\s+/g, " ").trim();
  const text = noTags || raw;
  if (text.length <= 180) return text;
  return `${text.slice(0, 177)}…`;
}

function topicReplyCount(topic) {
  const n = topic.repliesCount ?? topic.replyCount ?? 0;
  return Number.isFinite(Number(n)) ? Number(n) : 0;
}

export function renderCommunityTopicRow(topic, { communityId = "", communityTitle = "" } = {}) {
  const author = topic.author || topic.owner || "";
  const authorHandle = (author ? mock.getAuthorHandle(author) : "") || shortId(author);
  const timeLabel = formatTimeAgo(topic.ts);
  const replies = topicReplyCount(topic);
  const replyLabel = replies === 1 ? "1 resposta" : `${replies} respostas`;
  const title = topic.title || topicExcerptOneParagraph(topic) || "Sem título";
  const excerpt = topicExcerptOneParagraph(topic);
  const topicHref = `#/t/${encodeURIComponent(topic.id)}`;
  const thumb =
    topic.image && !gossipRetract.shouldHideGossipDeletedPost(topic)
      ? `<a class="community-topic-row-thumb" href="${topicHref}" aria-hidden="true"><img src="${escapeHtml(topic.image)}" alt="" width="48" height="48" loading="lazy" /></a>`
      : "";

  return `
    <article class="community-topic-row" data-id="${escapeHtml(topic.id)}">
      <div class="community-topic-row-body">
        <h3 class="community-topic-row-title">
          <a href="${topicHref}">${escapeHtml(title)}</a>
        </h3>
        <p class="community-topic-row-meta">
          <a class="community-topic-row-author" href="#/u/${encodeURIComponent(author)}">@${escapeHtml(authorHandle)}</a>
          <span class="community-topic-row-dot" aria-hidden="true">·</span>
          <span>${escapeHtml(replyLabel)}</span>
          <span class="community-topic-row-dot" aria-hidden="true">·</span>
          <span>${escapeHtml(timeLabel)}</span>
        </p>
        ${excerpt && excerpt !== title ? `<p class="community-topic-row-excerpt">${escapeHtml(excerpt)}</p>` : ""}
      </div>
      ${thumb}
    </article>`;
}

function renderCommunitySidebar(meta, communityId, recentPeople = [], isMember = false) {
  const memberCount = resolveCommunityMemberCount(meta, communityId);
  const online = resolveCommunityOnlinePeople(recentPeople, communityId, 9);
  const onlineExtra = Math.max(0, (memberCount || online.length) - online.length);
  const modCount = Array.isArray(meta.moderators) ? meta.moderators.length : 0;
  const onlineHint = online.length
    ? `${online.length}${onlineExtra ? `+${onlineExtra}` : ""} agora (demo)`
    : "Demo offline";

  return `
    <aside class="community-vox-sidebar" aria-label="Membros e estatísticas">
      <section class="community-vox-sidebar-block">
        <h3 class="community-vox-sidebar-title">Membros online</h3>
        <p class="community-vox-sidebar-hint">${escapeHtml(onlineHint)}</p>
        ${renderCommunityOnlineGrid(online)}
      </section>
      <section class="community-vox-sidebar-block community-vox-sidebar-stats">
        <h3 class="community-vox-sidebar-title">Estatísticas</h3>
        <dl class="community-vox-stat-dl">
          ${memberCount != null ? `<div><dt>Membros</dt><dd>${escapeHtml(formatCommunityMembers(memberCount))}</dd></div>` : ""}
          <div><dt>Moderadores</dt><dd>${modCount ? modCount : "Dono + até 10"}</dd></div>
          <div><dt>Você</dt><dd>${isMember ? "Membro" : "Visitante"}</dd></div>
        </dl>
      </section>
    </aside>`;
}

export function renderHome(main, communities) {
  let html = `
    <div class="actions-bar">
      <span class="section-title">Comunidades</span>
      <a class="btn btn-primary btn-sm" href="#/compose/community">+ Nova</a>
    </div>`;

  if (!communities.length) {
    html += `
      <div class="empty">
        <p>Nenhuma comunidade criada ainda.</p>
        <a class="btn btn-primary" href="#/compose/community">+ Criar Comunidade</a>
      </div>`;
    main.innerHTML += html;
    return;
  }

  const items = communities
    .map((c) => {
      const members = resolveCommunityMemberCount(c, c.id);
      const memberLine = members != null ? `<p class="community-vox-card-members">${escapeHtml(formatCommunityMembers(members))}</p>` : "";
      const typeLine = buildCommunityTypeSubtitle(c, c.id);
      return `
    <div class="community-card community-vox-card card">
      <div class="community-vox-card-band" style="--community-accent:${getCommunityColor(c.id)};">
        <div class="community-cover-strip"></div>
        <div class="community-vox-card-band-inner">
          <a class="community-vox-card-title" href="#/c/${encodeURIComponent(c.id)}">
            <h3>${escapeHtml(c.title)} ${c.category ? `<span class="pill">${escapeHtml(c.category)}</span>` : ""}</h3>
          </a>
          ${memberLine}
          <p class="community-vox-card-type">${escapeHtml(typeLine)}</p>
        </div>
      </div>
      <div class="community-card-body">
        <p class="desc">${escapeHtml(c.description || "Sem descrição.")}</p>
      </div>
      <div class="community-card-footer">
        <a class="btn btn-sm community-vox-enter-btn" href="#/c/${encodeURIComponent(c.id)}">Entrar →</a>
      </div>
    </div>`;
    })
    .join("");

  html += `<div class="community-grid">${items}</div>`;
  main.innerHTML += html;
}

export function renderCommunityPeopleStrip(people = []) {
  if (!people.length) return "";
  const chips = people
    .map((p) => {
      const label = profileDirectory.getAuthorDisplaySync(p.routeId) || p.name || p.routeId.slice(0, 10);
      const av = renderAvatarHtml(p.routeId, label, "avatar-sm");
      return `
        <span class="people-chip-wrap" style="display:inline-flex; align-items:center; gap:4px; padding:4px 6px 4px 8px; border:1px solid var(--border); border-radius:999px; font-size:0.82rem;">
          <a class="people-chip" href="#/u/${encodeURIComponent(p.routeId)}" style="display:inline-flex; align-items:center; gap:4px; text-decoration:none;">${av}<span>${escapeHtml(label)}</span></a>
          <button type="button" class="btn btn-sm btn-outline btn-community-add-contact" data-route="${escapeHtml(p.routeId)}" data-label="${escapeHtml(label)}" style="padding:2px 6px; font-size:0.72rem;">+ Contato</button>
        </span>`;
    })
    .join("");
  return `
    <div class="card" style="margin-top:0.5rem; padding:0.65rem 0.85rem;">
      <span class="section-title" style="font-size:0.85rem;">Pessoas nesta comunidade</span>
      <div style="display:flex; flex-wrap:wrap; gap:0.35rem; margin-top:0.45rem;">${chips}</div>
    </div>`;
}

export function renderCommunity(
  main,
  communityId,
  topics,
  meta = {},
  {
    isMember = false,
    isMod = false,
    walletAddress = null,
    activeTab = "posts",
    listings = [],
    proposals = [],
    recentPeople = [],
  } = {}
) {
  const commTitle = meta.title || communityId;
  const commDesc = meta.description || "";
  const commCat = meta.category ? `<span class="pill">${escapeHtml(meta.category)}</span>` : "";
  const memberCount = resolveCommunityMemberCount(meta, communityId);
  const typeSubtitle = buildCommunityTypeSubtitle(meta, communityId);
  const tagline =
    meta.headerTagline ||
    (communityId === mock.MOCK_DEMO_COMMUNITY.id ? mock.MOCK_DEMO_COMMUNITY.headerTagline : "");
  const welcomeText = meta.welcomeRecado || "";

  let html = `
    <header class="community-vox-hero">
      <div class="community-vox-band" style="--community-accent:${getCommunityColor(communityId)};">
        <div class="community-vox-band-top">
          <div class="community-vox-title-block">
            ${tagline ? `<p class="community-vox-kicker">${escapeHtml(tagline)}</p>` : `<p class="community-vox-kicker">Comunidade</p>`}
            <h2 class="community-vox-name">${escapeHtml(commTitle)} ${commCat}</h2>
            ${memberCount != null ? `<p class="community-vox-members">${escapeHtml(formatCommunityMembers(memberCount))}</p>` : ""}
            <p class="community-vox-type">${escapeHtml(typeSubtitle)}</p>
          </div>
          <div class="community-vox-hero-actions">
            <button id="btn-join-comm" type="button" class="community-vox-join-pill${isMember ? " is-member" : ""}" data-id="${escapeHtml(communityId)}" aria-pressed="${isMember ? "true" : "false"}">
              ${isMember ? "✓ Membro" : "Entrar"}
            </button>
            <button id="btn-share-comm" type="button" class="btn btn-sm btn-outline" data-id="${escapeHtml(communityId)}" data-title="${escapeHtml(commTitle)}">↗ Compartilhar</button>
            <a class="btn btn-sm btn-primary" href="#/compose/topic?c=${encodeURIComponent(communityId)}">+ Novo post</a>
          </div>
        </div>
        ${commDesc ? `<p class="community-vox-desc">${escapeHtml(commDesc)}</p>` : ""}
        <p class="community-vox-owner meta">Criada por: <a href="#/u/${encodeURIComponent(meta.owner || "")}">${escapeHtml(shortId(meta.owner))}</a></p>
      </div>
    </header>
    ${activeTab === "posts" && welcomeText ? renderCommunityWelcomeRecado(welcomeText) : ""}
    <div class="community-tabs segmented-tabs community-vox-tabs">
      <a class="tab-btn ${activeTab !== "listings" && activeTab !== "governance" ? "active" : ""}" href="#/c/${encodeURIComponent(communityId)}">Posts</a>
      <a class="tab-btn ${activeTab === "listings" ? "active" : ""}" href="#/c/${encodeURIComponent(communityId)}?tab=listings">Classificados</a>
      <a class="tab-btn ${activeTab === "governance" ? "active" : ""}" href="#/c/${encodeURIComponent(communityId)}?tab=governance">Governança${proposals.length ? ` (${proposals.length})` : ""}</a>
    </div>`;

  if (activeTab === "listings") {
    html += renderCommunityListingsTab(communityId, commTitle, meta, listings);
  } else if (activeTab === "governance") {
    html += renderCommunityGovernanceTab(communityId, commTitle, meta, proposals);
  } else {
    html += renderCommunityPostsLayout(communityId, commTitle, topics, meta, recentPeople, isMember);
  }
  main.innerHTML += html;
}

function renderCommunityPostsLayout(communityId, commTitle, topics, meta, recentPeople, isMember) {
  const mainCol = renderCommunityPostsTab(communityId, commTitle, topics);
  const sidebar = renderCommunitySidebar(meta, communityId, recentPeople, isMember);
  return `
    <div class="community-vox-layout">
      <div class="community-vox-main">${mainCol}</div>
      ${sidebar}
    </div>`;
}

function renderCommunityPostsTab(communityId, commTitle, topics) {
  let html = `
    <div class="actions-bar community-vox-topics-bar">
      <span class="section-title">Tópicos e posts</span>
    </div>`;
  if (!topics.length) {
    html += `<div class="empty community-vox-empty"><p>Nenhum post nesta comunidade ainda.</p></div>`;
    return html;
  }
  const items = topics
    .map((t) => renderCommunityTopicRow({ ...t, communityId, communityTitle: commTitle }))
    .join("");
  return html + `<div class="community-vox-topic-list">${items}</div>`;
}

function renderCommunityListingsTab(communityId, commTitle, meta, listings) {
  if (!listing.isCommercialEnabled(meta)) {
    return `
      <div class="community-vox-panel">
      <div class="empty feira-disabled" style="padding: 1.5rem; text-align: center;">
        <h3 style="margin-top:0;">🏛️ Feira comunitária não ativada</h3>
        <p class="desc" style="max-width: 480px; margin: 0.5rem auto 1rem;">
          Esta comunidade ainda não abriu classificados (modo comercial desligado por padrão). Uma proposta comunitária de governança pode deliberar e aprovar a abertura da feira local.
        </p>
        <a href="#/c/${encodeURIComponent(communityId)}" class="btn btn-outline btn-sm">← Ver posts da comunidade</a>
      </div>
      </div>`;
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

export function renderProposalItem(item, { communityId = "", communityTitle = "" } = {}) {
  const author = item.author || item.owner || "";
  const authorDisplay = (author ? mock.getAuthorDisplay(author) : "") || shortId(author);
  const authorHandle = (author ? mock.getAuthorHandle(author) : "") || shortId(author);
  const timeLabel = formatTimeAgo(item.createdAt || item.ts);
  const commId = item.communityId || communityId || "";
  const state = item.state || "open";
  const statusBadge = renderProposalStatusBadge(state);

  return `
    <article class="post-card proposal-card card" data-id="${escapeHtml(item.id)}">
      <div class="post-header">
        <div class="post-header-author">
          <a class="avatar-link" href="#/u/${encodeURIComponent(author)}">${renderAvatarHtml(author, authorDisplay)}</a>
          <a class="post-author" href="#/u/${encodeURIComponent(author)}">${escapeHtml(authorDisplay)}</a>
          <span class="post-handle">@${escapeHtml(authorHandle)}</span>
          <span class="post-dot">·</span>
          <span class="post-meta">${escapeHtml(timeLabel)}</span>
        </div>
        <div class="proposal-badges">
          ${statusBadge}
        </div>
      </div>
      <h3 class="proposal-title" style="margin: 0.5rem 0 0.25rem;">
        <a href="#/c/${encodeURIComponent(commId)}/proposal/${encodeURIComponent(item.id)}">${escapeHtml(item.title)}</a>
      </h3>
      <p class="post-text">${escapeHtml((item.body || "").slice(0, 160))}${(item.body || "").length > 160 ? "…" : ""}</p>
      <div class="proposal-meta-row" style="margin-top: 0.75rem;">
        ${item.diffText ? `<span class="pill">📄 Contém diff unificado</span>` : ""}
        <span class="pill pill-outline">Corte: ${escapeHtml(timeLabel)}</span>
        <a class="btn btn-outline btn-sm" style="margin-left:auto;" href="#/c/${encodeURIComponent(commId)}/proposal/${encodeURIComponent(item.id)}">Ver proposta & votos →</a>
      </div>
    </article>`;
}

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

export function renderListingItem(item, { communityTitle = "" } = {}) {
  if (gossipRetract.shouldHideGossipDeletedPost(item)) return "";
  const author = item.author || item.owner || "";
  const authorDisplay = (author ? mock.getAuthorDisplay(author) : "") || shortId(author);
  const authorHandle = (author ? mock.getAuthorHandle(author) : "") || shortId(author);
  const timeLabel = formatTimeAgo(item.ts);
  const price = listing.normalizePriceLabel(item.priceLabel);
  const location = listing.normalizeLocationLabel(item.locationLabel);
  const statusKey = listing.normalizeListingStatus(item.listingStatus);
  const statusLabel = listing.formatListingStatus(item.listingStatus);
  const commId = item.communityId || communityTitle || "demo-feira-local";

  const locBadge = location
    ? `<span class="listing-location-badge">📍 ${escapeHtml(location)}</span>`
    : "";

  const imgHtml = item.image
    ? `<div class="post-media-container"><img class="post-media" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.imageAlt || item.title || "Oferta")}" /></div>`
    : "";

  const pixKey = item.contactPix || (author ? mock.getAuthorPixKey(author) : "") || "";
  const pixBtn = pixKey
    ? `<button class="btn btn-secondary btn-sm btn-copy-pix" data-pix="${escapeHtml(pixKey)}" data-author-name="${escapeHtml(authorDisplay)}" data-price="${escapeHtml(price || "")}" data-title="${escapeHtml(item.title || "")}" title="Copiar Pix Copia e Cola">⚡ Copiar Pix</button>`
    : "";

  const ownerMenu = listingUi.renderListingOwnerMenu(item);
  const headerBadges = listingUi.renderListingHeaderBadges(item, {
    statusKey,
    statusLabel,
    escapeHtml,
  });

  return `
    <article class="post-card listing-card card" data-id="${escapeHtml(item.id)}">
      <div class="post-header">
        <div class="post-header-author">
          <a class="avatar-link" href="#/u/${encodeURIComponent(author)}">${renderAvatarHtml(author, authorDisplay)}</a>
          <a class="post-author" href="#/u/${encodeURIComponent(author)}">${escapeHtml(authorDisplay)}</a>
          <span class="post-handle">@${escapeHtml(authorHandle)}</span>
          ${locBadge}
          <span class="post-dot">·</span>
          <span class="post-meta">${escapeHtml(timeLabel)}</span>
        </div>
        ${headerBadges}
      </div>
      ${ownerMenu}
      ${imgHtml}
      <div class="listing-content">
        <div class="listing-price-row">
          ${price ? `<span class="listing-price">${escapeHtml(price)}</span>` : ""}
          <h3 class="listing-title">${escapeHtml(item.title || "Oferta")}</h3>
        </div>
        <div class="post-body listing-body">${hashtags.linkifyHashtags(escapeHtml(item.body || ""))}</div>
      </div>
      <div class="listing-actions post-toolbar" style="margin-top:10px; display:flex; gap:8px; align-items:center;">
        <a class="btn btn-outline btn-sm" href="#/dm/${encodeURIComponent(author)}">💬 Conversar no DM</a>
        ${pixBtn}
        <button class="action-btn btn-share-listing" data-id="${escapeHtml(item.id)}" data-title="${escapeHtml(item.title)}" data-comm="${escapeHtml(commId)}" data-price="${escapeHtml(price)}" aria-label="Compartilhar oferta">
          <svg class="action-icon icon-share" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        </button>
      </div>
    </article>`;
}
export function renderProposalDetail(main, proposal, tally, { userVote = null, isEligible = true, community = null, isMember = false, userAddress = null } = {}) {
  const commId = proposal.communityId;
  const commTitle = community?.title || commId;
  const author = proposal.author || proposal.owner || "";
  const authorDisplay = (author ? mock.getAuthorDisplay(author) : "") || shortId(author);
  const authorHandle = (author ? mock.getAuthorHandle(author) : "") || shortId(author);
  const timeLabel = formatTimeAgo(proposal.createdAt || proposal.ts);
  const state = tally.state || proposal.state || "open";

  const diffHtml = proposal.diffText ? renderProposalDiff(proposal.diffText) : "";
  const tallyHtml = renderProposalTally(tally, proposal);
  const votingHtml = renderProposalVotingBox(proposal, tally, { userVote, isEligible, isMember, userAddress });

  main.innerHTML = `
    <div class="proposal-detail">
      <div style="margin-bottom: 1rem;">
        <a href="#/c/${encodeURIComponent(commId)}?tab=governance" class="back-link">← Voltar para Governança de ${escapeHtml(commTitle)}</a>
      </div>
      <article class="card" style="padding: 1.5rem; margin-bottom: 1.25rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; flex-wrap:wrap; gap:0.5rem;">
          <div class="post-header-author">
            <a class="avatar-link" href="#/u/${encodeURIComponent(author)}">${renderAvatarHtml(author, authorDisplay)}</a>
            <a class="post-author" href="#/u/${encodeURIComponent(author)}">${escapeHtml(authorDisplay)}</a>
            <span class="post-handle">@${escapeHtml(authorHandle)}</span>
            <span class="post-dot">·</span>
            <span class="post-meta">${escapeHtml(timeLabel)}</span>
          </div>
          <div>${renderProposalStatusBadge(state)}</div>
        </div>
        <h1 style="font-size: 1.4rem; margin: 0.5rem 0 1rem;">${escapeHtml(proposal.title)}</h1>
        <div class="post-text" style="font-size: 1rem; line-height: 1.6;">${renderMarkdownLight(proposal.body)}</div>
        ${diffHtml}
      </article>
      ${tallyHtml}
      ${votingHtml}
      ${renderProposalVotesList(tally)}
    </div>`;
}

export function renderProposalDiff(diffText) {
  const lines = gov.parseUnifiedDiff(diffText);
  if (!lines.length) return "";
  const lineHtmls = lines.map((l) => {
    let cls = "diff-line-ctx";
    let prefix = " ";
    if (l.type === "add") {
      cls = "diff-line-add";
      prefix = "+";
    } else if (l.type === "del") {
      cls = "diff-line-del";
      prefix = "-";
    } else if (l.type === "hunk") {
      cls = "diff-line-hunk";
      prefix = "";
    }
    const cleanText = l.text.startsWith(" ") ? l.text.slice(1) : l.text;
    const content = prefix ? `${prefix} ${cleanText}` : cleanText;
    return `<div class="diff-line ${cls}">${escapeHtml(content)}</div>`;
  }).join("");

  return `
    <div style="margin-top: 1.5rem;">
      <h4 style="margin: 0 0 0.5rem; display:flex; align-items:center; gap:6px;">
        <span>📝</span> Patch proposto (Diff unificado)
      </h4>
      <div class="diff-viewer">${lineHtmls}</div>
    </div>`;
}

export function renderProposalTally(tally, proposal) {
  const total = tally.totalEligible || 0;
  const pctYes = total > 0 ? Math.round((tally.yes / total) * 100) : 0;
  const pctNo = total > 0 ? Math.round((tally.no / total) * 100) : 0;
  const pctAbstain = total > 0 ? Math.round((tally.abstain / total) * 100) : 0;

  return `
    <div class="tally-container card">
      <h3 style="margin: 0 0 0.5rem;">📊 Apuração de Votos (1 membro = 1 voto)</h3>
      <div class="tally-bar">
        <div class="tally-segment tally-yes" style="width: ${pctYes}%" title="Sim: ${pctYes}%"></div>
        <div class="tally-segment tally-no" style="width: ${pctNo}%" title="Não: ${pctNo}%"></div>
        <div class="tally-segment tally-abstain" style="width: ${pctAbstain}%" title="Abstenção: ${pctAbstain}%"></div>
      </div>
      <div class="tally-stats-row">
        <span>🟢 <strong>Sim:</strong> ${tally.yes} (${pctYes}%)</span>
        <span>🔴 <strong>Não:</strong> ${tally.no} (${pctNo}%)</span>
        <span>⚪ <strong>Abstenção:</strong> ${tally.abstain} (${pctAbstain}%)</span>
        <span>👥 <strong>Total apurado:</strong> ${total}</span>
        ${tally.ineligibleCount > 0 ? `<span>⚠️ <strong>Descartados pós-corte:</strong> ${tally.ineligibleCount}</span>` : ""}
      </div>
    </div>`;
}

export function renderProposalVotingBox(proposal, tally, { userVote, isEligible, isMember, userAddress }) {
  const state = tally.state || proposal.state || "open";
  if (state !== "open") {
    return `
      <div class="card" style="padding: 1.25rem; text-align: center; margin-bottom: 1.25rem;">
        <p class="desc" style="margin:0;">🔒 Esta votação está encerrada (${renderProposalStatusBadge(state)}).</p>
      </div>`;
  }
  if (!userAddress) {
    return `<div class="banner-info">ℹ️ Para votar nesta proposta, você precisa estar conectado à sua conta Vox local.</div>`;
  }

  let warningHtml = "";
  if (!isMember) {
    warningHtml = `<div class="banner-warning">⚠️ Você ainda não é membro desta comunidade. Membresia obtida após a abertura não confere voto nesta proposta (marco de corte anti-brigading).</div>`;
  } else if (!isEligible) {
    warningHtml = `<div class="banner-warning">⚠️ <strong>Atenção ao marco de corte:</strong> Você aderiu à comunidade após a abertura desta proposta. Seu voto será gravado e visível publicamente, mas <strong>não será computado</strong> no resultado oficial (regra canônica anti-brigading).</div>`;
  }

  const currentChoice = userVote ? gov.normalizeVoteChoice(userVote.choice) : "";
  return `
    <div class="card" style="padding: 1.25rem; margin-bottom: 1.25rem;">
      <h3 style="margin-top: 0;">🗳️ Registrar seu voto</h3>
      ${warningHtml}
      <p class="desc" style="font-size: 0.85rem; margin-bottom: 1rem;">
        🛡️ Cada membro tem peso idêntico (1×). Seu voto será assinado localmente com sua chave ECDSA e propagado para os pares.
        ${currentChoice ? `<br><strong>Seu voto atual:</strong> ${currentChoice.toUpperCase()} (você pode alterar até o encerramento).` : ""}
      </p>
      <div class="vote-action-buttons">
        <button class="vote-btn vote-btn-yes ${currentChoice === "yes" ? "selected" : ""}" data-choice="yes">✓ Sim (Aprovar)</button>
        <button class="vote-btn vote-btn-no ${currentChoice === "no" ? "selected" : ""}" data-choice="no">✗ Não (Rejeitar)</button>
        <button class="vote-btn vote-btn-abstain ${currentChoice === "abstain" ? "selected" : ""}" data-choice="abstain">○ Abstenção</button>
      </div>
    </div>`;
}

export function renderProposalVotesList(tally) {
  const votes = tally.votesDetail || [];
  if (!votes.length) return "";

  const rows = votes.map((v) => {
    const authorDisplay = mock.getAuthorDisplay(v.author) || shortId(v.author);
    const timeLabel = formatTimeAgo(v.ts);
    const choiceLabels = { yes: "Sim", no: "Não", abstain: "Abstenção" };
    const choiceColors = { yes: "#10b981", no: "#ef4444", abstain: "#9ca3af" };
    const choiceText = choiceLabels[v.choice] || v.choice;
    const choiceColor = choiceColors[v.choice] || "var(--text)";
    const choiceBadge = `<span class="pill" style="color:${choiceColor}; border-color:${choiceColor};">${escapeHtml(choiceText)}</span>`;

    const statusCol = v.eligible
      ? `<span style="color:#10b981;">✓ Computado</span>`
      : `<span style="color:#f59e0b;" title="${escapeHtml(v.reason)}">⚠️ Não computado (${escapeHtml(v.reason)})</span>`;

    return `
      <tr>
        <td><a href="#/u/${encodeURIComponent(v.author)}">${escapeHtml(authorDisplay)}</a></td>
        <td>${choiceBadge}</td>
        <td>${statusCol}</td>
        <td style="color:var(--muted);">${escapeHtml(timeLabel)}</td>
      </tr>`;
  }).join("");

  return `
    <div class="card" style="padding: 1.25rem;">
      <h4 style="margin: 0 0 0.75rem;">📋 Transparência de Votos (${votes.length})</h4>
      <table class="votes-table">
        <thead>
          <tr>
            <th>Eleitor</th>
            <th>Voto</th>
            <th>Status</th>
            <th>Quando</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

export function renderComposeProposal(main, communityId, commTitle = "") {
  main.innerHTML = `
    <div class="card compose-card compose-proposal-card" style="max-width: 640px; margin: 1rem auto; padding: 1.5rem;">
      <a class="back-link" href="#/c/${encodeURIComponent(communityId)}?tab=governance">← Voltar à governança</a>
      <h2>Nova Proposta — ${escapeHtml(commTitle || communityId)}</h2>
      <p class="desc" style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1rem;">
        🏛️ No espírito FOSS, mudanças de regras acompanham um diff transparente. Membros decidirão via voto direto (1 membro = 1 voto).
      </p>
      <form id="form-compose-proposal">
        <input type="hidden" id="prop-comm-id" value="${escapeHtml(communityId)}" />
        <div class="form-group" style="margin-bottom: 1rem;">
          <label for="prop-title" style="display:block; font-weight:600; margin-bottom:0.3rem;">Título da proposta *</label>
          <input type="text" id="prop-title" class="form-control" placeholder="Ex: Ativar feira comunitária popular" required maxlength="120" />
        </div>
        <div class="form-group" style="margin-bottom: 1rem;">
          <label for="prop-body" style="display:block; font-weight:600; margin-bottom:0.3rem;">Motivação e Descrição *</label>
          <textarea id="prop-body" class="form-control" rows="4" placeholder="Explique os motivos da mudança e benefícios para a comunidade..." required></textarea>
        </div>
        <div class="form-group" style="margin-bottom: 1.25rem;">
          <label for="prop-diff" style="display:block; font-weight:600; margin-bottom:0.3rem;">Diff unificado das regras (Pull Request) [opcional]:</label>
          <textarea id="prop-diff" class="form-control" rows="3" style="font-family:monospace; font-size:0.85rem;" placeholder="@@ -1,2 +1,3 @@&#10;- regra antiga&#10;+ nova regra"></textarea>
          <span style="font-size:0.75rem; color:var(--muted); display:block; margin-top:0.25rem;">Linhas com + indicam inclusões e - indicam exclusões.</span>
        </div>
        <div class="form-actions" style="margin-top:1rem; display:flex; justify-content:flex-end; gap:0.75rem;">
          <a href="#/c/${encodeURIComponent(communityId)}?tab=governance" class="btn btn-outline">Cancelar</a>
          <button type="submit" class="btn btn-primary" id="btn-submit-proposal">Publicar Proposta Assinada</button>
        </div>
      </form>
    </div>`;
}
