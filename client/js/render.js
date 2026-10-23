import * as mock from "./mock.js";
import * as social from "./social.js";

const root = () => document.getElementById("app-root");

export function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function shortId(id) {
  if (!id) return "—";
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

export function getCommunityColor(id = "") {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 45%)`;
}

const ICONS = {
  home: `<svg class="tab-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  communities: `<svg class="tab-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  compose: `<svg class="tab-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
  dm: `<svg class="tab-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  profile: `<svg class="tab-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
};

export function renderNetworkChip(metrics, rtcStatus, settings) {
  const isEnabled = settings?.enabled !== false;
  if (!isEnabled) {
    return `<a class="network-chip paused" href="#/settings/network" title="Modo somente leitura · Toque para configurar"><span class="chip-dot"></span><span>Só leitura</span></a>`;
  }
  const rtcCount = rtcStatus?.remotePeersConnected || 0;
  let text = "Rede ativa";
  if (rtcCount > 0) {
    text = `${rtcCount} ${rtcCount === 1 ? "aparelho" : "aparelhos"}`;
  } else if (metrics?.blobsServed > 0) {
    text = `${metrics.blobsServed} entregues`;
  }
  return `<a class="network-chip active" href="#/settings/network" title="Sua rede está ajudando outros aparelhos"><span class="chip-dot"></span><span>${escapeHtml(text)}</span></a>`;
}

const USER_ICON_SVG = `<svg class="badge-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

function renderWalletBadge(walletAddress) {
  return walletAddress
    ? `<a class="wallet-badge connected" href="#/perfil">${USER_ICON_SVG}<span>${escapeHtml(shortId(walletAddress))}</span></a>`
    : `<a class="wallet-badge" href="#/perfil">${USER_ICON_SVG}<span>Perfil</span></a>`;
}

function renderTabBar(activeTab) {
  const isHome = activeTab === "home";
  const isComm = activeTab === "communities";
  const isCompose = activeTab === "compose";
  const isDm = activeTab === "dm";
  const isProfile = activeTab === "profile" || activeTab === "wallet";

  return `
    <aside class="tab-bar">
      <div class="sidebar-brand">
        <a class="brand-link" href="#/"><span class="brand-mark">V</span><span class="brand-text">ox</span></a>
      </div>
      <nav class="tab-nav">
        <a href="#/" class="tab-item ${isHome ? "active" : ""}">
          <span class="tab-icon">${ICONS.home}</span>
          <span class="tab-label">Início</span>
        </a>
        <a href="#/communities" class="tab-item ${isComm ? "active" : ""}">
          <span class="tab-icon">${ICONS.communities}</span>
          <span class="tab-label">Comunidades</span>
        </a>
        <a href="#/compose/topic" class="tab-item compose-tab ${isCompose ? "active" : ""}">
          <span class="tab-icon">${ICONS.compose}</span>
          <span class="tab-label">Postar</span>
        </a>
        <a href="#/dm" class="tab-item ${isDm ? "active" : ""}">
          <span class="tab-icon">${ICONS.dm}</span>
          <span class="tab-label">Mensagens</span>
        </a>
        <a href="#/perfil" class="tab-item ${isProfile ? "active" : ""}">
          <span class="tab-icon">${ICONS.profile}</span>
          <span class="tab-label">Perfil</span>
        </a>
      </nav>
    </aside>`;
}

export function renderShell({ title, subtitle, breadcrumb, walletAddress, activeTab = "home", metrics, rtcStatus, settings }) {
  const chipHtml = renderNetworkChip(metrics, rtcStatus, settings);
  const walletBadge = renderWalletBadge(walletAddress);
  const tabBarHtml = renderTabBar(activeTab);

  root().innerHTML = `
    <div class="app-layout">
      ${tabBarHtml}
      <div class="main-column">
        <header class="top-bar">
          <div class="top-brand">
            <a class="home-link" href="#/"><span class="brand-mark">V</span><span class="brand-text">ox</span></a>
          </div>
          <div class="top-center">
            ${chipHtml}
          </div>
          <div class="top-actions">
            ${walletBadge}
          </div>
        </header>
        <main id="app-main"></main>
        <footer class="app-footer">Vox · Comunidades e mensagens nos seus aparelhos · <a href="./proposta-vox.html" target="_blank">Proposta</a></footer>
      </div>
    </div>
  `;

  const main = document.getElementById("app-main");
  if (breadcrumb) main.insertAdjacentHTML("afterbegin", breadcrumb);
  return main;
}

export function renderLoading(main, msg = "Carregando…") {
  main.innerHTML = `
    <div class="skeleton-container" aria-busy="true" aria-label="${escapeHtml(msg)}">
      <div class="skeleton-item card">
        <div class="skeleton-header">
          <div class="skeleton-avatar"></div>
          <div class="skeleton-line skeleton-line-sm"></div>
        </div>
        <div class="skeleton-line skeleton-line-lg"></div>
        <div class="skeleton-line"></div>
      </div>
      <div class="skeleton-item card">
        <div class="skeleton-header">
          <div class="skeleton-avatar"></div>
          <div class="skeleton-line skeleton-line-sm"></div>
        </div>
        <div class="skeleton-line skeleton-line-lg"></div>
        <div class="skeleton-line"></div>
      </div>
    </div>`;
}

export function renderError(main, message) {
  main.innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
}

export function renderDemoBanner(main) {
  main.insertAdjacentHTML(
    "afterbegin",
    `<div class="banner demo">Tour de demonstração — conteúdo de exemplo.</div>`
  );
}

export function renderGatewayBanner(main, label) {
  main.insertAdjacentHTML(
    "afterbegin",
    `<div class="banner">Sincronizando conteúdos…</div>`
  );
}

function renderAvatarHtml(author, authorDisplay, sizeClass = "") {
  const avatarUrl = mock.getAuthorAvatar(author);
  const authorInitial = (authorDisplay || author || "V").slice(0, 1).toUpperCase();
  if (avatarUrl) {
    return `<span class="avatar-wrap ${sizeClass}"><img class="avatar-img" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(authorDisplay)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><span class="avatar avatar-fallback" style="display:none;">${authorInitial}</span></span>`;
  }
  return `<span class="avatar ${sizeClass}">${authorInitial}</span>`;
}

function renderPostItem(t) {
  const author = t.author || t.owner || "";
  const authorDisplay = t.authorDisplay || (author ? mock.getAuthorDisplay(author) : "") || shortId(author);
  const authorHandle = (author ? mock.getAuthorHandle(author) : "") || shortId(author);
  const commLabel = t.communityTitle || "Comunidade";
  const commPill = t.communityId
    ? `<a class="post-community-pill" href="#/c/${encodeURIComponent(t.communityId)}">${escapeHtml(commLabel)}</a>`
    : "";
  const bodySnippet = t.body ? `<p class="post-body">${escapeHtml(t.body)}</p>` : "";
  const originBadge = t.isLocalP2p
    ? `<span class="badge-pill p2p-pill">Na rede</span>`
    : `<span class="badge-pill permanent-pill">Guardado</span>`;

  const imageHtml = t.image
    ? `<div class="post-media-container"><img class="post-media" src="${escapeHtml(t.image)}" alt="${escapeHtml(t.imageAlt || t.title)}" loading="lazy" /></div>`
    : "";

  const baseLikes = Number(t.likesCount) || 0;
  const liked = social.isLiked(t.id);
  const currentLikes = social.getLikesCount(t.id, baseLikes);
  const saved = social.isSaved(t.id);
  const repliesCount = Number(t.repliesCount) || 0;

  return `
    <article class="post insta-post" data-id="${escapeHtml(t.id)}">
      <a class="avatar-link" href="#/u/${encodeURIComponent(author)}">${renderAvatarHtml(author, authorDisplay)}</a>
      <div class="post-content">
        <div class="post-header">
          <div class="post-header-author">
            <a class="post-author" href="#/u/${encodeURIComponent(author)}">${escapeHtml(authorDisplay)}</a>
            <span class="post-handle">@${escapeHtml(authorHandle)}</span>
            <span class="post-dot">·</span>
            <span class="post-meta">recente</span>
          </div>
          <div class="post-header-tags">
            ${originBadge}
            ${commPill}
          </div>
        </div>
        <div class="post-title">
          <a href="#/t/${encodeURIComponent(t.id)}">${escapeHtml(t.title)}</a>
        </div>
        ${bodySnippet}
        ${imageHtml}
        <div class="post-actions insta-actions">
          <button class="action-btn btn-like ${liked ? "active" : ""}" data-id="${escapeHtml(t.id)}" data-count="${baseLikes}" aria-label="Curtir post">
            <svg class="action-icon icon-heart" width="18" height="18" viewBox="0 0 24 24" fill="${liked ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
            <span class="action-count count-likes">${currentLikes > 0 ? currentLikes : ""}</span>
          </button>
          <a class="action-btn btn-comment" href="#/t/${encodeURIComponent(t.id)}" aria-label="Ver discussão e responder">
            <svg class="action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span class="action-count count-replies">${repliesCount > 0 ? repliesCount : ""}</span>
          </a>
          <button class="action-btn btn-share btn-share-post" data-id="${escapeHtml(t.id)}" data-title="${escapeHtml(t.title)}" aria-label="Compartilhar post">
            <svg class="action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          </button>
          <button class="action-btn btn-save ${saved ? "active" : ""}" data-id="${escapeHtml(t.id)}" aria-label="Salvar post">
            <svg class="action-icon icon-bookmark" width="18" height="18" viewBox="0 0 24 24" fill="${saved ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
          </button>
        </div>
      </div>
    </article>`;
}

export function renderFeed(main, topics = []) {
  let html = `
    <div class="feed-header sticky-header">
      <span class="section-title">Para você</span>
      <a class="btn btn-primary btn-sm" href="#/compose/topic">+ Postar</a>
    </div>`;

  if (!topics.length) {
    html += `
      <div class="empty">
        <p>Nenhum post recente na rede.</p>
        <a class="btn btn-primary" href="#/compose/topic">Criar primeiro post</a>
      </div>`;
    main.innerHTML += html;
    return;
  }

  const items = topics.map(renderPostItem).join("");
  html += `<div class="feed-container">${items}</div>`;
  main.innerHTML += html;
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
    .map(
      (c) => `
    <div class="community-card card">
      <div class="community-cover-strip" style="background:${getCommunityColor(c.id)};"></div>
      <div class="community-card-body">
        <a href="#/c/${encodeURIComponent(c.id)}">
          <h3>${escapeHtml(c.title)} ${c.category ? `<span class="pill">${escapeHtml(c.category)}</span>` : ""}</h3>
        </a>
        <p class="desc">${escapeHtml(c.description || "Sem descrição.")}</p>
      </div>
      <div class="community-card-footer">
        <a class="btn btn-sm btn-outline" href="#/c/${encodeURIComponent(c.id)}">Abrir →</a>
      </div>
    </div>`
    )
    .join("");

  html += `<div class="community-grid">${items}</div>`;
  main.innerHTML += html;
}

export function renderCommunity(main, communityId, topics, meta = {}, { isMember = false, isMod = false, walletAddress = null } = {}) {
  const commTitle = meta.title || communityId;
  const commDesc = meta.description || "";
  const commCat = meta.category ? `<span class="pill">${escapeHtml(meta.category)}</span>` : "";

  let html = `
    <div class="card community-header">
      <h2>${escapeHtml(commTitle)} ${commCat}</h2>
      ${commDesc ? `<p class="desc">${escapeHtml(commDesc)}</p>` : ""}
      <p class="meta">Criada por: <a href="#/u/${encodeURIComponent(meta.owner || "")}">${escapeHtml(shortId(meta.owner))}</a></p>
      <div class="actions-row">
        <button id="btn-share-comm" class="btn btn-outline" data-id="${escapeHtml(communityId)}" data-title="${escapeHtml(commTitle)}">↗ Compartilhar</button>
        <button id="btn-join-comm" class="btn ${isMember ? "btn-secondary" : "btn-primary"}" data-id="${escapeHtml(communityId)}">
          ${isMember ? "✓ Já é Membro" : "★ Participar"}
        </button>
        <a class="btn btn-primary" href="#/compose/topic?c=${encodeURIComponent(communityId)}">+ Novo post</a>
      </div>
    </div>
    <div class="actions-bar">
      <span class="section-title">Posts</span>
    </div>`;

  if (!topics.length) {
    html += `<div class="empty"><p>Nenhum post nesta comunidade ainda.</p></div>`;
    main.innerHTML += html;
    return;
  }

  const items = topics.map((t) => renderPostItem({ ...t, communityId, communityTitle: commTitle })).join("");
  html += `<div class="feed-container">${items}</div>`;
  main.innerHTML += html;
}

export function renderTopic(main, topicId, topic, replies, { topicData = null, isMod = false, communityId = "" } = {}) {
  const commId = communityId || topic?.communityId || "";
  const backLink = commId ? `<a class="back-link" href="#/c/${encodeURIComponent(commId)}">← Voltar à comunidade</a>` : "";
  const bodyText = topicData?.body || topic?.body || "Sem conteúdo textual.";
  const author = topic?.author || topic?.owner || "";
  const authorDisplay = topic?.authorDisplay || (author ? mock.getAuthorDisplay(author) : "") || shortId(author);
  const authorHandle = (author ? mock.getAuthorHandle(author) : "") || shortId(author);
  const originBadge = topic?.isLocalP2p
    ? `<span class="badge-pill p2p-pill">Na rede</span>`
    : `<span class="badge-pill permanent-pill">Guardado</span>`;

  const topicImage = topic?.image || topicData?.image || "";
  const topicImageAlt = topic?.imageAlt || topicData?.imageAlt || topic?.title || "Foto da publicação";
  const imageHtml = topicImage
    ? `<div class="post-media-container" style="margin:12px 0 14px;"><img class="post-media" src="${escapeHtml(topicImage)}" alt="${escapeHtml(topicImageAlt)}" /></div>`
    : "";

  const baseLikes = Number(topic?.likesCount) || 0;
  const liked = social.isLiked(topicId);
  const currentLikes = social.getLikesCount(topicId, baseLikes);
  const saved = social.isSaved(topicId);

  const modBtn = isMod
    ? `<button class="btn btn-sm btn-danger btn-mod-hide" data-id="${escapeHtml(topicId)}" data-type="topic">🛡️ Ocultar</button>`
    : "";

  let html = `
    ${backLink}
    <article class="topic-root insta-topic-root card" style="padding:1.25rem;">
      <div class="post-header" style="align-items:center;">
        <a class="avatar-link" href="#/u/${encodeURIComponent(author)}">${renderAvatarHtml(author, authorDisplay)}</a>
        <div style="flex:1;">
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <a class="post-author" href="#/u/${encodeURIComponent(author)}">${escapeHtml(authorDisplay)}</a>
            <span class="post-handle">@${escapeHtml(authorHandle)}</span>
            ${originBadge}
          </div>
          <span class="post-meta">Publicado na rede</span>
        </div>
      </div>
      <h2 style="margin:0.75rem 0 0.5rem; font-size:1.25rem;">${escapeHtml(topic?.title || "Post")}</h2>
      <div class="post-body" style="font-size:0.98rem; line-height:1.5;">${escapeHtml(bodyText)}</div>
      ${imageHtml}
      <div class="post-actions insta-actions" style="margin-top:12px; padding-top:8px;">
        <button class="action-btn btn-like ${liked ? "active" : ""}" data-id="${escapeHtml(topicId)}" data-count="${baseLikes}" aria-label="Curtir post">
          <svg class="action-icon icon-heart" width="18" height="18" viewBox="0 0 24 24" fill="${liked ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
          <span class="action-count count-likes">${currentLikes > 0 ? currentLikes : ""}</span>
        </button>
        <button id="btn-share-topic" class="action-btn btn-share btn-share-post" data-id="${escapeHtml(topicId)}" data-title="${escapeHtml(topic?.title || "")}" aria-label="Compartilhar post">
          <svg class="action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          <span class="action-count">Compartilhar</span>
        </button>
        <button class="action-btn btn-save ${saved ? "active" : ""}" data-id="${escapeHtml(topicId)}" aria-label="Salvar post">
          <svg class="action-icon icon-bookmark" width="18" height="18" viewBox="0 0 24 24" fill="${saved ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
        </button>
        <a class="btn btn-primary btn-sm" href="#/compose/reply?t=${encodeURIComponent(topicId)}&c=${encodeURIComponent(commId)}" style="margin-left:auto;">💬 Responder</a>
        ${modBtn}
      </div>
    </article>

    <div class="actions-bar">
      <span class="section-title">Respostas (${replies.length})</span>
      <a class="btn btn-sm btn-primary" href="#/compose/reply?t=${encodeURIComponent(topicId)}&c=${encodeURIComponent(commId)}">+ Responder</a>
    </div>`;

  if (!replies.length) {
    html += `<div class="empty"><p>Sem respostas ainda. Inicie o debate!</p></div>`;
    main.innerHTML += html;
    return;
  }

  const replyItems = replies.map((r) => {
    const rAuthor = r.author || r.owner || "";
    const rAuthorDisplay = r.authorDisplay || (rAuthor ? mock.getAuthorDisplay(rAuthor) : "") || shortId(rAuthor);
    const rBadge = r.isLocalP2p
      ? `<span class="badge-pill p2p-pill">Na rede</span>`
      : `<span class="badge-pill permanent-pill">Guardado</span>`;
    const replyModBtn = isMod
      ? `<button class="btn btn-sm btn-danger btn-mod-hide" data-id="${escapeHtml(r.id)}" data-type="reply">🛡️</button>`
      : "";
    return `
      <div class="reply-item card reply" id="reply-${escapeHtml(r.id)}">
        <a class="avatar-link" href="#/u/${encodeURIComponent(rAuthor)}">${renderAvatarHtml(rAuthor, rAuthorDisplay)}</a>
        <div class="post-content">
          <div class="reply-header" style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <a class="post-author" href="#/u/${encodeURIComponent(rAuthor)}">${escapeHtml(rAuthorDisplay)}</a>
              ${rBadge}
            </div>
            ${replyModBtn}
          </div>
          <p class="reply-body">${escapeHtml(r.body || "(carregando conteúdo...)")}</p>
        </div>
      </div>`;
  }).join("");

  html += `<div class="thread-replies">${replyItems}</div>`;
  main.innerHTML += html;
}

function renderProfileHeader(address, isCurrentWallet, handle, isConflict, claimants, displayName, profileBio = "", stats = null) {
  const displayTitle = displayName ? `${displayName} (@${handle || shortId(address)})` : (handle ? `@${handle}` : "Perfil");
  const initial = (displayName || handle || address || "U").slice(0, 1).toUpperCase();
  const avatarUrl = mock.getAuthorAvatar(address);
  const avatarHtml = avatarUrl
    ? `<img class="profile-avatar-img" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(displayName || address)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><span class="avatar" style="display:none; width:72px; height:72px; font-size:1.8rem;">${initial}</span>`
    : `<span class="avatar" style="width:72px; height:72px; font-size:1.8rem;">${initial}</span>`;

  const bioHtml = profileBio ? `<p class="profile-bio desc" style="margin:8px 0 0; color:var(--text); line-height:1.45;">${escapeHtml(profileBio)}</p>` : "";
  const statsData = stats || mock.getMockProfile(address)?.stats;
  const statsHtml = statsData
    ? `<div class="profile-stats" style="display:flex; gap:1.2rem; margin-top:0.85rem; font-size:0.88rem;">
        <span><strong>${statsData.posts || 1}</strong> <span class="meta">${(statsData.posts || 1) === 1 ? "post" : "posts"}</span></span>
        <span><strong>${statsData.followers || 0}</strong> <span class="meta">seguidores</span></span>
        <span><strong>${statsData.following || 0}</strong> <span class="meta">seguindo</span></span>
      </div>`
    : "";

  const conflictBanner = isConflict
    ? `<div class="card error" style="margin-top:0.6rem;">
        ⚠️ <strong>Conflito de Handle:</strong> <code>@${escapeHtml(handle)}</code> reivindicado por mais de uma conta.
        <div style="font-size:0.8rem; margin-top:0.3rem;">
          ${claimants.map((c) => `<div>• <a href="#/u/${c.owner}">${escapeHtml(shortId(c.owner))}</a></div>`).join("")}
        </div>
      </div>`
    : "";

  return `
    <div class="card profile-card">
      <div style="display:flex; align-items:center; gap:16px; margin-bottom:8px;">
        ${avatarHtml}
        <div>
          <h2 style="margin:0;">${escapeHtml(displayTitle)}</h2>
          <p class="meta" style="margin:3px 0 0;">ID de Rede: <code>${escapeHtml(address)}</code></p>
        </div>
      </div>
      ${bioHtml}
      ${statsHtml}
      ${conflictBanner}
      ${isCurrentWallet ? `<span class="badge-pill" style="margin-top:0.6rem;">Sua Conta Neste Aparelho</span>` : ""}
    </div>`;
}

function renderProfileActions(address, isCurrentWallet, handle, displayName, hasWallet, balance) {
  if (isCurrentWallet) {
    return `
      <div class="card" style="margin-top:0.75rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div>
            <strong>Mensagens Diretas</strong>
            <p class="meta" style="margin:2px 0 0;">Compartilhe seu link para receber DMs privadas:</p>
          </div>
          <button id="btn-copy-my-dm-link" class="btn btn-sm btn-outline" data-route="${escapeHtml(address)}">📋 Copiar Meu Link</button>
        </div>
      </div>

      <div class="card" style="margin-top:0.75rem;">
        <h3>Identidade Local</h3>
        <form id="form-display-name" style="margin-top:0.5rem; display:flex; gap:0.5rem;">
          <input type="text" id="input-display-name" class="form-control" placeholder="Seu apelido ou nome..." value="${escapeHtml(displayName || "")}" maxlength="30" />
          <button type="submit" class="btn btn-sm btn-primary" style="white-space:nowrap;">Salvar Nome</button>
        </form>
      </div>

      <details class="advanced-settings card" style="margin-top:0.75rem;">
        <summary>Avançado — Arquivamento Permanente & Carteira</summary>
        <div style="margin-top:0.75rem;">
          <p class="desc">Por padrão, o Vox opera na rede distribuída com custo zero entre aparelhos. Se quiser arquivar publicações e seu @handle permanentemente no permaweb, configure sua carteira Arweave abaixo:</p>

          <form id="form-claim-handle" style="margin-top:0.75rem;">
            <label style="font-size:0.85rem; font-weight:600;">Reivindicar @handle on-chain:</label>
            <div style="display:flex; gap:0.5rem; margin-top:0.25rem;">
              <input type="text" id="input-handle-slug" class="form-control" placeholder="ex: maria" value="${handle || ""}" />
              <button type="submit" id="btn-submit-handle" class="btn btn-sm btn-primary" style="white-space:nowrap;">Salvar @handle</button>
            </div>
          </form>

          <div style="margin-top:0.75rem; border-top:1px solid var(--border); padding-top:0.6rem; display:flex; flex-wrap:wrap; gap:0.4rem;">
            <button id="btn-copy-dmpub" class="btn btn-sm btn-outline">📋 Copiar Chave Pública</button>
            <button id="btn-publish-dmpub" class="btn btn-sm btn-primary">🌐 Publicar Chave on-chain</button>
          </div>

          <div style="margin-top:0.75rem; border-top:1px solid var(--border); padding-top:0.6rem;">
            <h4>Carteira Arweave</h4>
            ${hasWallet ? `
              <p class="meta">Status: Conectada · Saldo: <strong>${escapeHtml(balance || "0.000")} AR</strong></p>
              <button id="btn-disconnect-wallet" class="btn btn-danger btn-sm">Desconectar Carteira</button>
            ` : `
              <p class="meta">Nenhuma carteira Arweave conectada.</p>
              <div style="display:flex; gap:0.5rem; margin-top:0.4rem;">
                <button id="btn-generate-wallet" class="btn btn-primary btn-sm">⚡ Gerar Carteira Arweave</button>
                <a href="#/wallet" class="btn btn-outline btn-sm">Importar JWK</a>
              </div>
            `}
          </div>
        </div>
      </details>`;
  }
  return `
    <div class="card" style="margin-top:0.75rem;">
      <a class="btn btn-primary btn-sm" href="#/dm/${encodeURIComponent(address)}">💬 Mensagem Privada</a>
    </div>`;
}

export function renderProfile(main, address, memberships = [], isCurrentWallet = false, dmPubStr = "", { handle = "", isConflict = false, claimants = [], displayName = "", profileBio = "", stats = null, posts = [], hasWallet = false, balance = "0.000" } = {}) {
  let html = renderProfileHeader(address, isCurrentWallet, handle, isConflict, claimants, displayName, profileBio, stats);
  html += renderProfileActions(address, isCurrentWallet, handle, displayName, hasWallet, balance);

  if (posts && posts.length) {
    html += `
      <div class="actions-bar">
        <span class="section-title">Posts do autor (${posts.length})</span>
      </div>
      <div class="feed-container">
        ${posts.map(renderPostItem).join("")}
      </div>`;
  }

  html += `
    <div class="actions-bar">
      <span class="section-title">Comunidades (${memberships.length})</span>
    </div>`;

  if (!memberships.length) {
    html += `<div class="empty"><p>Nenhuma comunidade registrada neste perfil.</p></div>`;
  } else {
    const list = memberships
      .map(
        (m) => `
      <div class="card" style="padding:10px 14px;">
        <a href="#/c/${encodeURIComponent(m.communityId)}">
          <h3 style="margin:0 0 2px;">${escapeHtml(m.communityId)}</h3>
        </a>
        <span class="meta">Membro confirmado</span>
      </div>`
      )
      .join("");
    html += `<div class="card-list">${list}</div>`;
  }

  main.innerHTML = html;
}

export function renderHandleConflict(main, slug, claimants = []) {
  const items = claimants
    .map(
      (c) => `
    <li class="card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <h3><a href="#/u/${encodeURIComponent(c.owner)}">${escapeHtml(shortId(c.owner))}</a></h3>
          <p class="meta">Endereço: <code>${escapeHtml(c.owner)}</code></p>
          <p class="meta">TX: <code>${escapeHtml(shortId(c.txId))}</code></p>
        </div>
        <a class="btn btn-outline" href="#/u/${encodeURIComponent(c.owner)}">Ver Perfil →</a>
      </div>
    </li>`
    )
    .join("");

  main.innerHTML = `
    <div class="card error">
      <h2>⚠️ Ambiguidade: Múltiplas contas reivindicam @${escapeHtml(slug)}</h2>
      <p class="desc">No Vox não há tribunal para confiscar nomes. Mais de um endereço publicou este identificador. Escolha qual conta deseja acessar:</p>
    </div>
    <ul class="card-list" style="margin-top:1rem;">${items}</ul>
  `;
}

export function renderWallet(main, { address = null, balance = "0.000", hasWallet = false, error = null } = {}) {
  let statusBox = "";
  if (hasWallet && address) {
    statusBox = `
      <div class="card wallet-info">
        <h3>Carteira Conectada</h3>
        <p class="meta">Endereço: <code>${escapeHtml(address)}</code></p>
        <p class="balance">Saldo: <strong>${escapeHtml(balance)} AR</strong></p>
        <div class="actions-row">
          <a class="btn btn-outline" href="#/perfil">Meu Perfil</a>
          <button id="btn-disconnect-wallet" class="btn btn-danger">Desconectar</button>
        </div>
      </div>`;
  } else {
    statusBox = `
      <div class="card wallet-warning">
        <p>Conecte ou gere uma carteira Arweave se desejar publicar dados no permaweb permanente.</p>
        <button id="btn-generate-wallet" class="btn btn-primary">⚡ Gerar Carteira Instantânea</button>
      </div>`;
  }

  let html = `
    <div class="actions-bar">
      <span class="section-title">Carteira Arweave</span>
    </div>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
    ${statusBox}
    <div class="card wallet-import">
      <h3>Importar Carteira (JWK)</h3>
      <p class="meta">Cole o JSON da sua chave privada:</p>
      <form id="form-import-wallet">
        <textarea id="wallet-jwk-input" rows="4" class="form-control" placeholder='{"kty":"RSA","n":"...","e":"AQAB",...}' required></textarea>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Salvar Carteira</button>
        </div>
      </form>
    </div>`;

  main.innerHTML += html;
}

export function renderComposeCommunity(main) {
  main.innerHTML = `
    <div class="card compose-card">
      <a class="back-link" href="#/communities">← Voltar</a>
      <h2>Nova Comunidade</h2>
      <form id="form-compose-community">
        <div class="form-group">
          <label for="comm-id">Identificador único (slug):</label>
          <input type="text" id="comm-id" class="form-control" placeholder="ex: cinema-nacional" required pattern="^[a-z0-9-]+$" title="Apenas letras minúsculas, números e hífens." />
        </div>
        <div class="form-group">
          <label for="comm-title">Título:</label>
          <input type="text" id="comm-title" class="form-control" placeholder="ex: Cinema Brasileiro" required maxlength="100" />
        </div>
        <div class="form-group">
          <label for="comm-category">Categoria:</label>
          <input type="text" id="comm-category" class="form-control" placeholder="ex: Cultura, Tecnologia" maxlength="40" />
        </div>
        <div class="form-group">
          <label for="comm-desc">Descrição e Regras:</label>
          <textarea id="comm-desc" class="form-control" rows="3" placeholder="Qual o propósito desta comunidade?" required maxlength="500"></textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" id="btn-submit-comm">Publicar Comunidade</button>
        </div>
      </form>
    </div>`;
}

export function renderComposeTopic(main, communityId) {
  const backLink = communityId
    ? `<a class="back-link" href="#/c/${encodeURIComponent(communityId)}">← Voltar à comunidade</a>`
    : `<a class="back-link" href="#/">← Voltar</a>`;

  main.innerHTML = `
    <div class="card compose-card">
      ${backLink}
      <h2>${communityId ? `Postar em ${escapeHtml(communityId)}` : "Novo Post na Rede"}</h2>
      <form id="form-compose-topic">
        ${communityId ? `<input type="hidden" id="topic-comm-id" value="${escapeHtml(communityId)}" />` : `
          <div class="form-group">
            <label for="topic-comm-id">Slug da Comunidade:</label>
            <input type="text" id="topic-comm-id" class="form-control" placeholder="ex: cinema-nacional" required />
          </div>
        `}
        <div class="form-group">
          <label for="topic-title">Título:</label>
          <input type="text" id="topic-title" class="form-control" placeholder="O que está acontecendo?" required maxlength="120" />
        </div>
        <div class="form-group">
          <label for="topic-body">Mensagem:</label>
          <textarea id="topic-body" class="form-control" rows="5" placeholder="Escreva seu post aqui..." required></textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" id="btn-submit-topic">Publicar Post</button>
        </div>
      </form>
    </div>`;
}

export function renderComposeReply(main, topicId, communityId) {
  main.innerHTML = `
    <div class="card compose-card">
      <a class="back-link" href="#/t/${encodeURIComponent(topicId)}">← Voltar ao post</a>
      <h2>Responder</h2>
      <form id="form-compose-reply">
        <input type="hidden" id="reply-topic-id" value="${escapeHtml(topicId)}" />
        <input type="hidden" id="reply-comm-id" value="${escapeHtml(communityId)}" />
        <div class="form-group">
          <textarea id="reply-body" class="form-control" rows="4" placeholder="Sua resposta..." required></textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" id="btn-submit-reply">Enviar Resposta</button>
        </div>
      </form>
    </div>`;
}

export function renderPactModal(container) {
  if (!container) return;
  container.innerHTML = `
    <div class="modal-overlay" id="pact-modal-overlay">
      <div class="modal-dialog">
        <div style="text-align:center; margin-bottom:1rem;">
          <h2 style="margin:0 0 0.25rem; font-size:1.25rem;">Bem-vindo ao Vox</h2>
          <p class="desc" style="margin:0;">Comunidades e conversas direto nos aparelhos de quem usa, sem controle central.</p>
        </div>

        <div class="pact-feature">
          <div class="pact-feature-icon">🛡️</div>
          <div>
            <strong>1. Seus dados são seus</strong>
            <p class="desc" style="margin:0.2rem 0 0;">Suas mensagens e publicações pertencem a você. Nenhuma empresa controla sua conta.</p>
          </div>
        </div>

        <div class="pact-feature">
          <div class="pact-feature-icon">⚡</div>
          <div>
            <strong>2. Rede cooperativa</strong>
            <p class="desc" style="margin:0.2rem 0 0;">O app aberto ajuda a distribuir conteúdos para outros usuários sem servidores caros.</p>
          </div>
        </div>

        <div class="pact-feature">
          <div class="pact-feature-icon">🔒</div>
          <div>
            <strong>3. Controle total</strong>
            <p class="desc" style="margin:0.2rem 0 0;">Respeita conexão Wi-Fi, teto diário de dados e você pode pausar a qualquer momento.</p>
          </div>
        </div>

        <div style="margin-top:1.25rem; display:flex; flex-direction:column; gap:0.5rem;">
          <button id="btn-pact-accept" class="btn btn-primary" style="padding:0.65rem; font-weight:700;">Continuar</button>
          <button id="btn-pact-settings" class="btn btn-outline" style="padding:0.5rem; font-size:0.85rem;">Ajustar rede depois</button>
        </div>
      </div>
    </div>
  `;
}

export function closePactModal(container) {
  if (container) container.innerHTML = "";
}

function renderNetworkHeader(isEnabled, relayStatus, rtcStatus) {
  const rtcCount = rtcStatus?.remotePeersConnected || 0;
  const statusBadge = isEnabled
    ? `<span class="pill" style="background:var(--success); color:#fff;">🟢 Ajudando a rede</span>`
    : `<span class="pill" style="background:var(--danger); color:#fff;">⏸️ Ajuda pausada</span>`;
  const peerBadge = rtcCount > 0
    ? `<span class="badge-pill" style="background:var(--success-soft); color:var(--success);">${rtcCount} ${rtcCount === 1 ? "aparelho conectado" : "aparelhos conectados"}</span>`
    : `<span class="badge-pill">Conectando a aparelhos próximos…</span>`;

  return `
    <div class="card network-card">
      <h2>Sua rede</h2>
      <p class="desc">Você ajuda a manter o Vox funcionando para todo mundo, direto do seu aparelho.</p>
      
      <div class="network-status" style="margin-top:0.75rem; display:flex; flex-wrap:wrap; gap:0.4rem;">
        ${statusBadge}
        ${peerBadge}
      </div>
    </div>`;
}

function renderNetworkStats(metrics, cacheStats, dailyUsage, settings) {
  const capMb = settings?.dailyCapMb || 50;
  const servedTodayMb = ((dailyUsage?.bytesServedToday || 0) / (1024 * 1024)).toFixed(1);
  const pct = Math.min(100, Math.round((servedTodayMb / capMb) * 100));

  return `
    <div class="actions-bar">
      <span class="section-title">Estatísticas de Ajuda</span>
    </div>

    <div class="stats-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:0.5rem; margin-bottom:1rem;">
      <div class="card" style="text-align:center; padding:0.65rem;">
        <div style="font-size:1.25rem; font-weight:700; color:var(--accent);">${metrics?.blobsServed || 0}</div>
        <div class="meta">Conteúdos entregues</div>
      </div>
      <div class="card" style="text-align:center; padding:0.65rem;">
        <div style="font-size:1.25rem; font-weight:700; color:var(--accent);">${((metrics?.bytesServed || 0) / 1024).toFixed(1)} KB</div>
        <div class="meta">Dados compartilhados</div>
      </div>
      <div class="card" style="text-align:center; padding:0.65rem;">
        <div style="font-size:1.1rem; font-weight:700; color:var(--text);">${servedTodayMb} / ${capMb} MB</div>
        <div class="usage-meter"><div class="usage-fill" style="width:${pct}%;"></div></div>
        <div class="meta" style="margin-top:0.25rem;">Uso hoje (${pct}%)</div>
      </div>
      <div class="card" style="text-align:center; padding:0.65rem;">
        <div style="font-size:1.1rem; font-weight:700; color:var(--text);">${cacheStats?.count || 0}</div>
        <div class="meta">Em cache (${cacheStats?.sizeKb || "0"} KB)</div>
      </div>
    </div>`;
}

function renderTurnFields(customTurn) {
  return `
    <div style="border-top:1px solid var(--border); padding-top:0.75rem; margin-top:0.75rem;">
      <label style="font-weight:600; font-size:0.85rem; display:block; margin-bottom:0.35rem;">Servidor auxiliar para conexões móveis (TURN)</label>
      <div class="form-group">
        <label for="net-turn-url">Endereço do servidor:</label>
        <input type="text" id="net-turn-url" class="form-control" placeholder="turn:turn.comunidade.org:3478" value="${customTurn?.urls || ""}" />
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem;">
        <div class="form-group">
          <label for="net-turn-user">Usuário:</label>
          <input type="text" id="net-turn-user" class="form-control" placeholder="vox" value="${customTurn?.username || ""}" />
        </div>
        <div class="form-group">
          <label for="net-turn-pass">Credencial:</label>
          <input type="password" id="net-turn-pass" class="form-control" placeholder="••••••" value="${customTurn?.credential || ""}" />
        </div>
      </div>
    </div>`;
}

function renderNetworkForm(settings, notifPermission, customSignalingUrl, customTurn, relayStatus, rtcStatus, metrics) {
  const isEnabled = Boolean(settings?.enabled);
  const isBg = Boolean(settings?.backgroundRelay);
  const notifNotice = notifPermission === "granted"
    ? `<span style="font-size:0.8rem; color:var(--success);">✓ Notificações permitidas</span>`
    : `<button type="button" id="btn-request-notif" class="btn btn-outline btn-sm">Ativar Notificações</button>`;
  const rtcCount = rtcStatus?.remotePeersConnected || 0;

  return `
    <div class="card">
      <h3>Preferências de Ajuda</h3>
      <form id="form-network-settings">
        <div class="form-group" style="display:flex; align-items:center; gap:0.6rem; margin-top:0.5rem;">
          <input type="checkbox" id="net-pause" ${!isEnabled ? "checked" : ""} style="width:1.1rem; height:1.1rem;" />
          <label for="net-pause" style="margin:0; font-weight:600; color:var(--danger);">Pausar ajuda à rede (modo somente leitura)</label>
        </div>

        <div class="form-group">
          <label for="net-daily-cap">Teto diário de dados compartilhados (MB):</label>
          <input type="number" id="net-daily-cap" class="form-control" min="5" max="1000" value="${settings?.dailyCapMb || 50}" />
        </div>

        <div class="form-group">
          <label for="net-max-mb">Limite de espaço em disco (MB):</label>
          <input type="number" id="net-max-mb" class="form-control" min="5" max="500" value="${settings?.maxMb || 25}" />
        </div>

        <div class="form-group" style="display:flex; align-items:center; gap:0.6rem;">
          <input type="checkbox" id="net-wifi" ${settings?.wifiOnly ? "checked" : ""} style="width:1rem; height:1rem;" />
          <label for="net-wifi" style="margin:0;">Ajudar apenas quando estiver no Wi-Fi</label>
        </div>

        <div class="form-group" style="display:flex; align-items:center; gap:0.6rem;">
          <input type="checkbox" id="net-comm-only" ${settings?.commOnly ? "checked" : ""} style="width:1rem; height:1rem;" />
          <label for="net-comm-only" style="margin:0;">Compartilhar apenas minhas comunidades</label>
        </div>

        <div class="form-group" style="display:flex; align-items:center; gap:0.6rem;">
          <input type="checkbox" id="net-webrtc" ${settings?.webrtcEnabled !== false ? "checked" : ""} style="width:1rem; height:1rem;" />
          <label for="net-webrtc" style="margin:0;">Conectar diretamente a outros aparelhos</label>
        </div>

        <details class="advanced-settings">
          <summary>Avançado (Conexões e Servidores)</summary>
          <div style="margin-top:0.75rem;">
            <p class="desc" style="font-size:0.8rem; margin-bottom:0.75rem;">Detalhes técnicos da malha WebRTC e servidores auxiliares.</p>

            <div class="form-group">
              <label for="net-signaling-url">Servidor de conexão (opcional):</label>
              <input type="text" id="net-signaling-url" class="form-control" placeholder="wss://signal.comunidade.org" value="${customSignalingUrl || ""}" />
            </div>

            ${renderTurnFields(customTurn)}

            <div class="form-group" style="display:flex; align-items:center; gap:0.6rem; margin-top:0.75rem;">
              <input type="checkbox" id="net-bg-relay" ${isBg ? "checked" : ""} style="width:1rem; height:1rem;" />
              <div style="flex:1;">
                <label for="net-bg-relay" style="margin:0; font-weight:600;">Segundo plano via Service Worker (Wi-Fi)</label>
                <div style="margin-top:0.2rem;">${notifNotice}</div>
              </div>
            </div>

            <div style="margin-top:0.75rem; border-top:1px solid var(--border); padding-top:0.6rem;">
              <div class="meta" style="margin-bottom:0.4rem;">
                Conexões ativas: <strong>${rtcCount} aparelhos</strong> · Conteúdos via WebRTC: <strong>${metrics?.blobsServedRtc || 0}</strong>
              </div>
              <button type="button" id="btn-check-relay" class="btn btn-outline btn-sm">Verificar Servidor Local</button>
              <span class="meta" style="margin-left:0.5rem;">${relayStatus?.online ? "🟢 Conectado" : "⚪ Offline"}</span>
            </div>

            <div style="margin-top:0.75rem; border-top:1px solid var(--border); padding-top:0.6rem;">
              <label style="font-weight:600; font-size:0.85rem; display:block; margin-bottom:0.25rem;">Tour de Demonstração</label>
              <p class="desc" style="font-size:0.8rem; margin:0 0 0.4rem;">Recarrega os 5 perfis e posts educativos de exemplo no seu aparelho:</p>
              <button type="button" id="btn-reset-demo" class="btn btn-outline btn-sm">🔄 Restaurar tour demo</button>
            </div>
          </div>
        </details>

        <div class="actions-row" style="margin-top:1rem;">
          <button type="submit" class="btn btn-primary">Salvar Preferências</button>
          <button type="button" id="btn-clear-cache" class="btn btn-outline">Limpar Cache Local</button>
        </div>
      </form>
    </div>`;
}

export function renderNetworkSettings(main, { settings, metrics, cacheStats, relayStatus, dailyUsage, notifPermission, rtcStatus, customSignalingUrl, customTurn }) {
  const isEnabled = Boolean(settings?.enabled);
  let html = renderNetworkHeader(isEnabled, relayStatus, rtcStatus);
  html += renderNetworkStats(metrics, cacheStats, dailyUsage, settings);
  html += renderNetworkForm(settings, notifPermission, customSignalingUrl, customTurn, relayStatus, rtcStatus, metrics);
  main.innerHTML = html;
}

export function renderDmList(main, conversations = [], myAddress = "") {
  let listHtml = "";
  if (!conversations.length) {
    listHtml = `<div class="empty"><p>Nenhuma conversa privada ainda.</p></div>`;
  } else {
    const items = conversations
      .map(
        (c) => {
          const initial = (c.peerAddress || "U").slice(0, 1).toUpperCase();
          const timeStr = c.lastTs ? new Date(c.lastTs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
          return `
          <a class="dm-inbox-item" href="#/dm/${encodeURIComponent(c.peerAddress)}">
            <span class="avatar">${initial}</span>
            <div class="dm-inbox-body">
              <div class="dm-inbox-header">
                <span class="dm-inbox-peer">${escapeHtml(shortId(c.peerAddress))}</span>
                <span class="meta" style="font-size:0.75rem;">${timeStr}</span>
              </div>
              <p class="dm-inbox-preview">${escapeHtml(c.lastText)}</p>
            </div>
          </a>`;
        }
      )
      .join("");
    listHtml = `<div class="dm-inbox-list">${items}</div>`;
  }

  main.innerHTML = `
    <div class="card">
      <h2 style="margin:0 0 2px;">Mensagens</h2>
      <p class="desc" style="margin:0 0 8px;">Privadas. Só neste aparelho. Criptografia ponta a ponta sem nuvem.</p>
      
      <div style="background:var(--surface-soft); border:1px solid var(--border); padding:8px 12px; border-radius:var(--radius-sm); margin:8px 0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
        <span class="meta" style="font-size:0.8rem;">Seu link de mensagens: <code>${escapeHtml(shortId(myAddress))}</code></span>
        <button id="btn-copy-my-dm-link" class="btn btn-sm btn-outline" data-route="${escapeHtml(myAddress)}">📋 Copiar Link</button>
      </div>

      <form id="form-new-dm" style="display:flex; gap:0.5rem; margin-top:0.75rem;">
        <input type="text" id="dm-peer-input" class="form-control" placeholder="ID de rota (vx_...) ou endereço..." required />
        <button type="submit" class="btn btn-primary" style="white-space:nowrap;">Conversar →</button>
      </form>
    </div>

    <div class="actions-bar">
      <span class="section-title">Conversas Recentes</span>
      <button id="btn-pull-inbox" class="btn btn-sm btn-outline">🔄 Atualizar</button>
    </div>
    ${listHtml}
  `;
}

function renderDmMessageBubbles(messages, myAddress, peerAddress) {
  if (!messages.length) {
    return `<div class="empty" style="text-align:center; padding:1.5rem 0;"><p>Início da conversa com ${escapeHtml(shortId(peerAddress))}. Mensagens salvas apenas neste aparelho.</p></div>`;
  }
  return messages
    .map((m) => {
      const isSent = m.from === myAddress || m.status === "sent";
      const cls = isSent ? "sent" : "received";
      const timeStr = m.ts ? new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
      const statusLabel = m.status === "delivered" ? "✓✓ Direta" : m.status === "queued-relay" ? "✓ Caixa postal" : "✓";
      return `
        <div class="dm-bubble ${cls}">
          <div>${escapeHtml(m.text)}</div>
          <div class="dm-bubble-meta">${timeStr} · ${statusLabel}</div>
        </div>`;
    })
    .join("");
}

export function renderDmThread(main, peerAddress, messages = [], myAddress = "", { isRtcOnline = false, hasDmPub = false } = {}) {
  const statusBadge = isRtcOnline
    ? `<span class="badge-pill" style="background:var(--success-soft); color:var(--success);">🟢 Conectado</span>`
    : `<span class="badge-pill">📦 Entrega offline</span>`;

  const keyWarning = !hasDmPub
    ? `<div class="card error" style="margin-bottom:0.75rem;">
        ⚠️ Chave de <code>${escapeHtml(shortId(peerAddress))}</code> não encontrada. Cole para ativar conversa privada:
        <div style="display:flex; gap:0.5rem; margin-top:0.4rem;">
          <input type="text" id="input-manual-dmpub" class="form-control" placeholder='{"kty":"EC","crv":"P-256",...}' />
          <button type="button" id="btn-save-manual-dmpub" class="btn btn-sm btn-primary">Salvar</button>
        </div>
      </div>`
    : "";

  main.innerHTML = `
    <a class="back-link" href="#/dm">← Voltar às conversas</a>
    ${keyWarning}

    <div class="dm-thread-container">
      <div class="dm-thread-header">
        <div>
          <strong style="font-size:0.95rem;"><a href="#/u/${encodeURIComponent(peerAddress)}">${escapeHtml(shortId(peerAddress))}</a></strong>
        </div>
        <div>${statusBadge}</div>
      </div>

      <div class="dm-thread-list" id="dm-thread-container">
        ${renderDmMessageBubbles(messages, myAddress, peerAddress)}
      </div>

      <form id="form-send-dm" class="dm-form-sticky">
        <input type="text" id="dm-message-input" class="form-control" placeholder="Mensagem privada..." required autocomplete="off" />
        <button type="submit" id="btn-send-dm" class="btn btn-primary" ${!hasDmPub ? "disabled" : ""}>Enviar 🔒</button>
      </form>
    </div>
  `;
}
