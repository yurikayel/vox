import * as mock from "./mock.js";
import * as social from "./social.js";
import * as listing from "./listing.js";
import * as gov from "./governance.js";
import * as brcode from "./brcode.js";
import * as hashtags from "./hashtags.js";
import * as frames from "./frames.js";
import * as postOwnership from "./post-ownership.js";
import * as i18n from "./i18n-pt-br.js";
import * as gossipRetract from "./gossip-retract-ui.js";
import * as listingUi from "./listing-ui.js";
import * as localAccount from "./local-account.js";
import * as profileDirectory from "./profile-directory.js";
import {
  getWelcomeProfile,
  WELCOME_ROUTE_ID,
  shouldShowWelcomeCard,
} from "./vox-welcome-profile.js";

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

function normAuthorToken(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "");
}

/** Nome + @handle ou ID curto uma vez (title = routeId completo). */
export function resolvePostAuthorLabels(author, { authorDisplay: override = "", isOwnLocalPost = false } = {}) {
  const routeId = String(author || "");
  const profileName = routeId ? mock.getAuthorDisplay(routeId) : "";
  const profileHandle = routeId ? mock.getAuthorHandle(routeId) : "";
  let fullName = override || profileName || "";
  if (!fullName && isOwnLocalPost) {
    fullName = localAccount.getDisplayName() || "";
  }
  const shortRoute = routeId ? shortId(routeId) : "";
  const firstName = (fullName.split(/\s+/).filter(Boolean)[0] || fullName || "").trim();

  if (!firstName && routeId) {
    return {
      primary: shortRoute || "—",
      secondaryHandle: "",
      authorDisplay: shortRoute || "—",
      authorHandle: profileHandle || shortRoute,
      routeTitle: routeId,
    };
  }

  const primary = firstName || shortRoute || "—";
  let secondaryHandle = "";
  if (profileHandle) {
    secondaryHandle = profileHandle;
  } else if (routeId && normAuthorToken(shortRoute) !== normAuthorToken(firstName)) {
    secondaryHandle = shortRoute;
  }

  if (
    secondaryHandle &&
    normAuthorToken(primary) === normAuthorToken(shortRoute) &&
    normAuthorToken(secondaryHandle) === normAuthorToken(shortRoute)
  ) {
    secondaryHandle = "";
  }

  const authorDisplay = fullName || primary;
  const authorHandle = profileHandle || secondaryHandle || shortRoute;

  return { primary, secondaryHandle, authorDisplay, authorHandle, routeTitle: routeId };
}

function renderPostAuthorMetaLines(author, labels, timeLabel) {
  const { primary, secondaryHandle, routeTitle } = labels;
  const titleAttr = routeTitle ? ` title="${escapeHtml(routeTitle)}"` : "";
  const handleHtml = secondaryHandle
    ? `<span class="post-handle"${titleAttr}>@${escapeHtml(secondaryHandle)}</span><span class="post-dot">·</span>`
    : "";
  return `<div class="post-header-meta">
          <a class="post-author" href="#/u/${encodeURIComponent(author)}"${titleAttr}>${escapeHtml(primary)}</a>
          ${handleHtml}
          <span class="post-time">${escapeHtml(timeLabel)}</span>
        </div>`;
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
  if (!walletAddress) {
    return `<a class="wallet-badge account-access" href="#/perfil" aria-label="Abrir perfil">${USER_ICON_SVG}<span class="wallet-badge-label">Perfil</span></a>`;
  }
  const display = mock.getAuthorDisplay(walletAddress) || "Conta";
  const shortName = display.split(/\s+/)[0] || display;
  const tip = `${display} · ID ${walletAddress}`;
  return `<a class="wallet-badge account-access connected" href="#/perfil" title="${escapeHtml(tip)}" aria-label="Perfil de ${escapeHtml(display)}">${USER_ICON_SVG}<span class="wallet-badge-label">${escapeHtml(shortName)}</span></a>`;
}

export function renderFeedNav(activeFeed = "for-you") {
  const isForYou = activeFeed !== "following";
  return `
    <nav class="sidebar-feed-nav" aria-label="Alternar feed">
      <a href="#/" class="sidebar-feed-tab ${isForYou ? "active" : ""}"${isForYou ? ' aria-current="page"' : ""}>
        <span class="sidebar-feed-icon" aria-hidden="true">${ICONS.home}</span>
        <span class="sidebar-feed-label">Para você</span>
      </a>
      <a href="#/?feed=following" class="sidebar-feed-tab ${!isForYou ? "active" : ""}"${!isForYou ? ' aria-current="page"' : ""}>
        <span class="sidebar-feed-icon" aria-hidden="true">${ICONS.communities}</span>
        <span class="sidebar-feed-label">Seguindo</span>
      </a>
    </nav>`;
}

function attachSidebarBehavior() {
  const layout = document.querySelector(".app-layout");
  const btn = document.getElementById("sidebar-collapse-btn");
  const backdrop = document.getElementById("sidebar-backdrop");
  if (!layout || !btn || btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";

  const desktopMq = window.matchMedia("(min-width: 768px)");
  if (desktopMq.matches && localStorage.getItem("vox-sidebar-collapsed") === "1") {
    layout.classList.add("sidebar-collapsed");
    btn.setAttribute("aria-expanded", "false");
  }

  btn.addEventListener("click", () => {
    if (desktopMq.matches) {
      layout.classList.toggle("sidebar-collapsed");
      const collapsed = layout.classList.contains("sidebar-collapsed");
      localStorage.setItem("vox-sidebar-collapsed", collapsed ? "1" : "0");
      btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
      return;
    }
    layout.classList.toggle("sidebar-drawer-open");
    if (backdrop) backdrop.hidden = !layout.classList.contains("sidebar-drawer-open");
  });

  backdrop?.addEventListener("click", () => {
    layout.classList.remove("sidebar-drawer-open");
    backdrop.hidden = true;
  });
}

function renderSidebar(activeTab, { showFeedNav, activeFeed, chipHtml, walletBadge }) {
  const isHome = activeTab === "home";
  const isComm = activeTab === "communities";
  const isCompose = activeTab === "compose";
  const isDm = activeTab === "dm";
  const isPeople = activeTab === "people";
  const isProfile = activeTab === "profile" || activeTab === "wallet";
  const feedNav = showFeedNav ? renderFeedNav(activeFeed) : "";

  return `
    <div class="sidebar-backdrop" id="sidebar-backdrop" hidden aria-hidden="true"></div>
    <aside class="app-sidebar tab-bar" id="app-sidebar" aria-label="Navegação principal">
      <div class="sidebar-scroll">
        <div class="sidebar-brand">
          <a class="brand-link" href="#/"><span class="brand-mark">V</span><span class="brand-text">ox</span></a>
        </div>
        ${feedNav}
        <nav class="tab-nav" aria-label="Seções">
          <a href="#/" class="tab-item ${isHome ? "active" : ""}"${isHome ? ' aria-current="page"' : ""}>
            <span class="tab-icon">${ICONS.home}</span>
            <span class="tab-label">Início</span>
          </a>
          <a href="#/communities" class="tab-item ${isComm ? "active" : ""}"${isComm ? ' aria-current="page"' : ""}>
            <span class="tab-icon">${ICONS.communities}</span>
            <span class="tab-label">Comunidades</span>
          </a>
          <a href="#/people" class="tab-item ${isPeople ? "active" : ""}"${isPeople ? ' aria-current="page"' : ""}>
            <span class="tab-icon">${ICONS.communities}</span>
            <span class="tab-label">Pessoas</span>
          </a>
          <a href="#/compose/topic" class="tab-item compose-tab ${isCompose ? "active" : ""}"${isCompose ? ' aria-current="page"' : ""}>
            <span class="tab-icon">${ICONS.compose}</span>
            <span class="tab-label">Postar</span>
          </a>
          <a href="#/dm" class="tab-item ${isDm ? "active" : ""}"${isDm ? ' aria-current="page"' : ""}>
            <span class="tab-icon">${ICONS.dm}</span>
            <span class="tab-label">Mensagens</span>
          </a>
          <a href="#/perfil" class="tab-item ${isProfile ? "active" : ""}"${isProfile ? ' aria-current="page"' : ""}>
            <span class="tab-icon">${ICONS.profile}</span>
            <span class="tab-label">Perfil</span>
          </a>
        </nav>
        <div class="sidebar-footer">
          <span class="sidebar-sync-hint" id="top-sync-hint" hidden aria-live="polite"></span>
          ${chipHtml}
          ${walletBadge}
        </div>
      </div>
      <button type="button" class="sidebar-collapse-btn" id="sidebar-collapse-btn" aria-expanded="true" aria-controls="app-sidebar" aria-label="Recolher ou expandir menu">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
    </aside>`;
}

export function updateTopBarSync(active, detail = "") {
  const el = document.getElementById("top-sync-hint");
  if (!el) return;
  if (active) {
    el.hidden = false;
    el.textContent = detail || "Sincronizando…";
  } else {
    el.hidden = true;
    el.textContent = "";
  }
}

export function renderShell({
  title,
  subtitle,
  breadcrumb,
  walletAddress,
  activeTab = "home",
  metrics,
  rtcStatus,
  settings,
  activeFeed = "for-you",
  showFeedNav = false,
}) {
  const chipHtml = renderNetworkChip(metrics, rtcStatus, settings);
  const walletBadge = renderWalletBadge(walletAddress);
  const sidebarHtml = renderSidebar(activeTab, { showFeedNav, activeFeed, chipHtml, walletBadge });
  const pageTitle = title ? `<span class="top-bar-title">${escapeHtml(title)}</span>` : "";
  const topBarHtml = title
    ? `<header class="top-bar"><div class="top-bar-start">${pageTitle}</div></header>`
    : "";

  root().innerHTML = `
    <div class="app-layout">
      ${sidebarHtml}
      <div class="main-column">
        ${topBarHtml}
        <main id="app-main"></main>
        <footer class="app-footer">Vox · Comunidades e mensagens nos seus aparelhos · <a href="./proposta-vox.html" target="_blank">Proposta</a></footer>
      </div>
    </div>
  `;

  attachSidebarBehavior();
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
    `<p class="feed-notice demo" role="status">Tour de demonstração — conteúdo de exemplo.</p>`
  );
}

export function renderGatewayBanner(main, label) {
  updateTopBarSync(true, label ? "Sincronizando conteúdos…" : "Sincronizando…");
}

function renderAvatarHtml(author, authorDisplay, sizeClass = "") {
  const avatarUrl = profileDirectory.getAuthorAvatarSync(author) || mock.getAuthorAvatar(author);
  const display =
    authorDisplay || profileDirectory.getAuthorDisplaySync(author) || mock.getAuthorDisplay(author) || author;
  const authorInitial = (display || "V").slice(0, 1).toUpperCase();
  if (avatarUrl) {
    return `<span class="avatar-wrap ${sizeClass}"><img class="avatar-img" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(display)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><span class="avatar avatar-fallback" style="display:none;">${authorInitial}</span></span>`;
  }
  return `<span class="avatar ${sizeClass}">${authorInitial}</span>`;
}

export function formatTimeAgo(ts) {
  if (!ts || isNaN(Number(ts))) return "recente";
  const diff = Math.max(0, Date.now() - Number(ts));
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mês`;
}

/** @deprecated use renderInlineComposer — kept for tests/fallback */
export function renderComposerStrip(displayName = "") {
  return renderInlineComposer({ displayName });
}

export function renderInlineComposer({ userRouteId = "", displayName = "" } = {}) {
  const label = displayName || (userRouteId ? mock.getAuthorDisplay(userRouteId) : "") || "Você";
  const avatarHtml = userRouteId
    ? renderAvatarHtml(userRouteId, label)
    : `<span class="avatar">✍</span>`;
  return `
    <div class="inline-composer" id="feed-inline-composer" data-user-route="${escapeHtml(userRouteId || "")}">
      <div class="inline-composer-collapsed" tabindex="0" role="button" aria-expanded="false" aria-controls="form-inline-topic">
        <div class="inline-composer-avatar">${avatarHtml}</div>
        <span class="inline-composer-placeholder">O que está acontecendo na sua rede?</span>
      </div>
      <form class="inline-composer-form hidden" id="form-inline-topic" aria-label="Nova publicação">
        <div class="inline-composer-form-head">
          ${avatarHtml}
          <textarea id="inline-topic-body" class="inline-composer-textarea" rows="3" maxlength="2000" placeholder="Compartilhe texto, #hashtags ou anexe uma foto…" required aria-label="Texto da publicação"></textarea>
        </div>
        <div class="inline-composer-preview hidden" id="inline-topic-preview-wrap">
          <img id="inline-topic-preview" class="inline-composer-preview-img" alt="Prévia da imagem" />
          <button type="button" class="btn btn-outline btn-sm inline-composer-remove-img" id="btn-inline-remove-img">Remover foto</button>
        </div>
        <div class="inline-composer-toolbar">
          <div class="inline-composer-tools">
            <label class="inline-composer-tool" title="Anexar imagem">
              <input type="file" id="inline-topic-file" accept="image/jpeg,image/png,image/webp,image/gif" hidden />
              <span aria-hidden="true">🖼</span> Foto
            </label>
            <input type="text" id="inline-topic-comm" class="inline-composer-comm" placeholder="Comunidade (opcional)" maxlength="64" aria-label="Slug da comunidade" />
          </div>
          <button type="submit" class="btn btn-primary btn-sm" id="btn-inline-submit" disabled>Postar</button>
        </div>
        <p class="inline-composer-meta" aria-live="polite">
          <span class="inline-composer-char" id="inline-topic-char">0 / 2000</span>
          <span class="inline-composer-hint meta"> · assinado no aparelho · <a href="#/compose/topic">formulário completo</a></span>
          <span class="inline-composer-local-hint meta" title="${escapeHtml(i18n.localMutateEditDeleteTooltip)}"> · ${escapeHtml(i18n.localMutateComposerHint)}</span>
        </p>
      </form>
    </div>`;
}

export function getPostFeedLayout(t) {
  if (t?.githubGist?.lines?.length) return "github";
  if (t?.image || t?.mediaRef?.hash) return "photo";
  return "text";
}

function renderPostGithubGist(t) {
  const gist = t.githubGist;
  if (!gist?.lines?.length) return "";
  const label = gist.label || "README / diff";
  const lines = gist.lines.map((line) => escapeHtml(line)).join("\n");
  return `<div class="post-github-gist" role="region" aria-label="${escapeHtml(label)}">
    <div class="post-github-gist-label">${escapeHtml(label)}</div>
    <pre class="post-github-gist-body">${lines}</pre>
  </div>`;
}

export function formatPostMarkdown(post) {
  if (!post) return "";
  const author = post.author || post.owner || "";
  const { authorDisplay, authorHandle } = resolvePostAuthorLabels(author, {
    authorDisplay: post.authorDisplay,
    isOwnLocalPost: post.isOwnLocalPost,
  });
  const title = post.title || "Publicação";
  const body = post.body || "";
  const host = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "https://yurikayel.github.io/vox";
  const url = `${host}/#/t/${encodeURIComponent(post.id)}`;
  return `> **${authorDisplay}** (@${authorHandle}) · *Vox Brasil*\n>\n> **${title}**\n>\n> ${body}\n>\n> 🔗 Ver no Vox: ${url}`;
}

export function commentsPanelId(topicId) {
  return `post-comments-${String(topicId || "").replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

export function renderInlineReplyItem(r) {
  const rAuthor = r.author || r.owner || "";
  const rLabels = resolvePostAuthorLabels(rAuthor, {
    authorDisplay: r.authorDisplay,
    isOwnLocalPost: r.isOwnLocalPost,
  });
  const rAuthorDisplay = rLabels.authorDisplay;
  const handleHtml = rLabels.secondaryHandle
    ? `<span class="post-handle" title="${escapeHtml(rLabels.routeTitle)}">@${escapeHtml(rLabels.secondaryHandle)}</span>`
    : "";
  return `
    <li class="post-comment-item" id="inline-reply-${escapeHtml(r.id)}">
      <a class="avatar-link" href="#/u/${encodeURIComponent(rAuthor)}">${renderAvatarHtml(rAuthor, rAuthorDisplay, "sm")}</a>
      <div class="post-comment-body">
        <div class="post-comment-meta">
          <a class="post-author" href="#/u/${encodeURIComponent(rAuthor)}">${escapeHtml(rAuthorDisplay)}</a>
          ${handleHtml}
        </div>
        <p class="reply-body">${hashtags.linkifyHashtags(escapeHtml(r.body || ""))}</p>
      </div>
    </li>`;
}

export function renderCommentList(replies = []) {
  if (!replies.length) {
    return `<div class="post-comments-feed"><p class="post-comments-empty">Nenhuma resposta ainda.</p></div>`;
  }
  return `<div class="post-comments-feed"><ul class="post-comment-list">${replies.map(renderInlineReplyItem).join("")}</ul></div>`;
}

function renderInlineReplyComposer(topicId, commId) {
  return `
    <form class="post-comment-composer" data-topic="${escapeHtml(topicId)}" data-comm="${escapeHtml(commId || "")}">
      <textarea class="form-control post-comment-input" rows="2" maxlength="500" required placeholder="Responder…" aria-label="Escrever resposta"></textarea>
      <div class="post-comment-composer-actions">
        <a class="post-comments-thread" href="#/t/${encodeURIComponent(topicId)}">Abrir thread</a>
        <button type="submit" class="btn btn-primary btn-sm btn-inline-reply">Responder</button>
      </div>
    </form>`;
}

export function renderPostComments(topicId, commId = "", { replies = [], expanded = false } = {}) {
  const panelId = commentsPanelId(topicId);
  const openCls = expanded ? " is-open" : "";
  const hid = expanded ? "" : " hidden";
  return `<div class="post-comments${openCls}" id="${escapeHtml(panelId)}"${hid} data-topic="${escapeHtml(topicId)}" data-comm="${escapeHtml(commId)}">${renderCommentList(replies)}${renderInlineReplyComposer(topicId, commId)}</div>`;
}

export function renderPostOwnerMenu(t) {
  if (!t?.isOwnLocalPost || t.type === "reply") return "";
  const syncTip = escapeHtml(i18n.localMutateEditDeleteTooltip);
  const hintId = `post-local-sync-hint-${escapeHtml(t.id)}`;
  return `<div class="post-owner-block">
    <div class="post-owner-menu" role="group" aria-label="Gerenciar publicação">
      <button type="button" class="btn-post-edit btn-text-quiet" data-id="${escapeHtml(t.id)}" title="${syncTip}" aria-describedby="${hintId}">Editar</button>
      <button type="button" class="btn-post-delete btn-text-quiet" data-id="${escapeHtml(t.id)}" title="${syncTip}" aria-describedby="${hintId}">Apagar</button>
      <button type="button" class="post-local-sync-hint" id="${hintId}" title="${syncTip}" aria-label="${syncTip}"><span aria-hidden="true">ⓘ</span></button>
    </div>
  </div>`;
}

function renderPostHeaderBlock(t, author, labels) {
  const authorDisplay = labels.authorDisplay;
  const ownerMenu = renderPostOwnerMenu(t);
  const metaHtml = renderPostAuthorMetaLines(author, labels, formatTimeAgo(t.ts));
  const asideHtml = ownerMenu ? `<div class="post-header-aside">${ownerMenu}</div>` : "";
  return `
    <header class="post-header-ig">
      <div class="post-header-user">
        <a class="avatar-link" href="#/u/${encodeURIComponent(author)}">${renderAvatarHtml(author, authorDisplay)}</a>
        ${metaHtml}
      </div>
      ${asideHtml}
    </header>`;
}

function renderPostMedia(t) {
  if (t?.image) {
    const alt = escapeHtml(t.imageAlt || t.title);
    return `<div class="post-media-container"><img class="post-media" src="${escapeHtml(t.image)}" alt="${alt}" loading="lazy" /></div>`;
  }
  if (t?.mediaRef?.hash) {
    const alt = escapeHtml(t.imageAlt || t.title || "Mídia P2P");
    return `<div class="post-media-container post-media-lazy" data-media-hash="${escapeHtml(t.mediaRef.hash)}"><div class="media-placeholder" style="aspect-ratio:4/5; display:flex; align-items:center; justify-content:center; background:var(--surface-soft); color:var(--muted); font-size:0.85rem;"><span>📷 Mídia P2P (${escapeHtml(t.mediaRef.mime || "imagem")})</span></div></div>`;
  }
  return "";
}

export function renderPostTextHtml(post) {
  const id = post?.id || "";
  const href = id ? `#/t/${encodeURIComponent(id)}` : "#";
  const disp = postOwnership.formatPostDisplay({ title: post?.title, body: post?.body });
  if (disp.mode === "empty") return "";
  if (disp.mode === "caption") {
    const linked = hashtags.linkifyHashtags(escapeHtml(disp.text));
    return `<p class="post-body post-caption-only"><a href="${href}">${linked}</a></p>`;
  }
  const titleBlock = `<div class="post-title"><a href="${href}">${escapeHtml(disp.title)}</a></div>`;
  const bodyBlock = disp.body
    ? `<p class="post-body">${hashtags.linkifyHashtags(escapeHtml(disp.body))}</p>`
    : "";
  return `${titleBlock}${bodyBlock}`;
}

function renderPostText(t) {
  return renderPostTextHtml(t);
}

function renderTopicDetailText(topicId, title, bodyText) {
  const disp = postOwnership.formatPostDisplay({ title, body: bodyText });
  if (disp.mode === "caption") {
    return `<div class="post-body post-caption-only post-topic-detail" style="font-size:0.98rem; line-height:1.5; margin:0.75rem 0 0;">${hashtags.linkifyHashtags(escapeHtml(disp.text))}</div>`;
  }
  const titleBlock = `<h2 class="post-title post-topic-detail-title" style="margin:0.75rem 0 0.5rem; font-size:1.25rem;">${escapeHtml(disp.title || "Post")}</h2>`;
  const bodyBlock = `<div class="post-body" style="font-size:0.98rem; line-height:1.5;">${hashtags.linkifyHashtags(escapeHtml(disp.body || ""))}</div>`;
  return `${titleBlock}${bodyBlock}`;
}

export function renderFrameContentHtml(frame, state) {
  if (!state) return "";
  if (state.kind === "poll") {
    if (state.userVotedIndex) {
      const bars = state.options
        .map((opt) => {
          const isUser = state.userVotedIndex === opt.index;
          return `<div class="frame-poll-bar-wrapper ${isUser ? "user-choice" : ""}">
            <div class="frame-poll-bar-fill" style="width:${opt.percent}%"></div>
            <div class="frame-poll-bar-label"><span>${escapeHtml(opt.label)} ${isUser ? "✓" : ""}</span> <strong>${opt.percent}% (${opt.count})</strong></div>
          </div>`;
        })
        .join("");
      return `<div class="frame-poll-results">${bars}</div>`;
    }
    return `<p class="frame-prompt">Vote na enquete abaixo para ver os resultados parciais em tempo real:</p>`;
  }

  if (state.kind === "petition") {
    return `<div class="frame-petition-box">
      <div class="frame-petition-metric"><strong>${state.signaturesCount}</strong> assinaturas (meta: ${state.goal}) · ${state.percent}%</div>
      <div class="frame-petition-bar"><div class="frame-petition-bar-fill" style="width:${state.percent}%"></div></div>
      ${state.hasSigned ? '<p class="frame-signed-msg">✓ Você assinou este abaixo-assinado.</p>' : '<p class="frame-prompt">Adicione sua assinatura com 1 clique (identidade criptográfica local):</p>'}
    </div>`;
  }

  if (state.kind === "clt") {
    return `<div class="frame-clt-box">
      <h4 class="frame-clt-title">${escapeHtml(state.title)}</h4>
      ${state.result ? `<div class="frame-clt-result">${escapeHtml(state.result)}</div>` : ""}
      <p class="frame-clt-detail">${escapeHtml(state.detail)}</p>
    </div>`;
  }
  return "";
}

function renderFrameButtons(t, frame, localAction) {
  const activeIndex = localAction?.buttonIndex || 0;
  return frame.buttons
    .map(
      (b) => `<button type="button" class="btn btn-sm btn-frame-action ${activeIndex === b.index ? "active" : ""}" data-post-id="${escapeHtml(t.id)}" data-index="${b.index}" data-action="${escapeHtml(b.action)}" data-label="${escapeHtml(b.label)}" ${b.target ? `data-target="${escapeHtml(b.target)}"` : ""}>${escapeHtml(b.label)}</button>`
    )
    .join("");
}

export function renderPostFrame(t) {
  if (!t.frame) return "";
  const parsed = frames.parseFrame(t.frame);
  if (!parsed.valid) return "";
  const frame = parsed.frame;
  const localAction = frames.getUserFrameAction(t.id);
  const state = frames.getFrameState(frame, [], localAction);

  const imgHtml = frame["of:image"]
    ? `<div class="vox-frame-media"><img class="vox-frame-img" src="${escapeHtml(frame["of:image"])}" alt="${escapeHtml(frame.title || t.title)}" loading="lazy" /></div>`
    : "";

  return `
    <div class="vox-frame" data-post-id="${escapeHtml(t.id)}" data-kind="${escapeHtml(frame.kind)}">
      <div class="vox-frame-badge"><span class="pill pill-frame">⚡ Mini-App · Open Frame</span> <span class="vox-frame-tag">${frame.kind.toUpperCase()}</span></div>
      ${imgHtml}
      <div class="vox-frame-body">
        <div class="vox-frame-content" id="frame-content-${escapeHtml(t.id)}">
          ${renderFrameContentHtml(frame, state)}
        </div>
        <div class="vox-frame-buttons">
          ${renderFrameButtons(t, frame, localAction)}
        </div>
        <div class="vox-frame-footer">
          <small class="meta">Open Frames FOSS · Assinatura ECDSA P-256 local · Sem iframes</small>
        </div>
      </div>
    </div>`;
}

function renderCommentButton(t) {
  const n = Number(t.repliesCount) || 0;
  const panelId = commentsPanelId(t.id);
  return `<button type="button" class="action-btn btn-comment" data-id="${escapeHtml(t.id)}" data-comm="${escapeHtml(t.communityId || "")}" aria-expanded="false" aria-controls="${escapeHtml(panelId)}" aria-label="Ver comentários">
            <svg class="action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span class="action-count count-replies">${n > 0 ? n : ""}</span>
          </button>`;
}

function renderZapToolbarBtn(t, author, authorDisplay) {
  const pix = t.contactPix || (author ? mock.getAuthorPixKey(author) : "") || "";
  const icon = `<svg class="action-icon icon-zap" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
  if (!pix) {
    return `<button class="action-btn btn-zap-post disabled" disabled aria-label="Autor sem Pix informado" title="Autor sem chave Pix informada" style="opacity:0.35; cursor:not-allowed;">${icon}</button>`;
  }
  return `<button class="action-btn btn-zap-post" data-id="${escapeHtml(t.id)}" data-author="${escapeHtml(author)}" data-author-name="${escapeHtml(authorDisplay)}" data-pix="${escapeHtml(pix)}" data-title="${escapeHtml(t.title)}" aria-label="Apoiar com Pix Zap" title="Apoiar com Pix Zap">${icon}<span class="action-label zap-label" style="font-size:0.75rem; font-weight:600; margin-left:2px;">Apoiar</span></button>`;
}

function renderPostToolbar(t, author, authorDisplay, authorHandle) {
  const baseLikes = Number(t.likesCount) || 0;
  const liked = social.isLiked(t.id);
  const likes = social.getLikesCount(t.id, baseLikes);
  const baseStars = Number(t.starsCount) || 0;
  const starred = social.isStarred(t.id);
  const stars = social.getStarsCount(t.id, baseStars);
  const saved = social.isSaved(t.id);
  return `
        <div class="post-actions insta-actions post-toolbar">
          <div class="toolbar-left">
            <button class="action-btn btn-like ${liked ? "active" : ""}" data-id="${escapeHtml(t.id)}" data-count="${baseLikes}" aria-label="Curtir post">
              <svg class="action-icon icon-heart" width="20" height="20" viewBox="0 0 24 24" fill="${liked ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
              <span class="action-count count-likes">${likes > 0 ? likes : ""}</span>
            </button>
            ${renderCommentButton(t)}
            <button class="action-btn btn-share btn-share-post" data-id="${escapeHtml(t.id)}" data-title="${escapeHtml(t.title)}" aria-label="Compartilhar post">
              <svg class="action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
            </button>
          </div>
          <div class="toolbar-center">
            ${renderZapToolbarBtn(t, author, authorDisplay)}
            <button class="action-btn btn-star ${starred ? "active" : ""}" data-id="${escapeHtml(t.id)}" data-count="${baseStars}" aria-label="Dar estrela ao post">
              <svg class="action-icon icon-star" width="19" height="19" viewBox="0 0 24 24" fill="${starred ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              <span class="action-count count-stars">${stars > 0 ? stars : ""}</span>
            </button>
          </div>
          <div class="toolbar-right">
            <button class="action-btn btn-copy-md" data-id="${escapeHtml(t.id)}" data-title="${escapeHtml(t.title)}" data-body="${escapeHtml(t.body || "")}" data-author="${escapeHtml(authorDisplay)}" data-handle="${escapeHtml(authorHandle)}" aria-label="Copiar post como Markdown">
              <svg class="action-icon icon-copy" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
            </button>
            <button class="action-btn btn-save ${saved ? "active" : ""}" data-id="${escapeHtml(t.id)}" aria-label="Salvar post">
              <svg class="action-icon icon-bookmark" width="19" height="19" viewBox="0 0 24 24" fill="${saved ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
            </button>
          </div>
        </div>`;
}

export function renderPostItem(t, { isPinned = false } = {}) {
  if (gossipRetract.shouldHideGossipDeletedPost(t)) return "";
  const author = t.author || t.owner || "";
  const labels = resolvePostAuthorLabels(author, {
    authorDisplay: t.authorDisplay,
    isOwnLocalPost: t.isOwnLocalPost,
  });
  const { authorDisplay, authorHandle } = labels;
  const layout = getPostFeedLayout(t);
  const header = renderPostHeaderBlock(t, author, labels);
  const media = layout === "photo" ? renderPostMedia(t) : "";
  const frame = renderPostFrame(t);
  const toolbar = renderPostToolbar(t, author, authorDisplay, authorHandle);
  const caption = `<div class="post-caption-block">${renderPostText(t)}</div>`;
  const gist = layout === "github" ? renderPostGithubGist(t) : "";
  const comments = renderPostComments(t.id, t.communityId);

  if (layout === "text" || layout === "github") {
    return `
    <article class="post insta-post post-layout-${layout}" data-id="${escapeHtml(t.id)}" data-layout="${layout}">
      ${header}
      ${caption}
      ${gist}
      ${frame}
      ${toolbar}
      ${comments}
    </article>`;
  }

  return `
    <article class="post insta-post post-layout-photo" data-id="${escapeHtml(t.id)}" data-layout="photo">
      ${header}
      ${media}
      ${frame}
      ${caption}
      ${toolbar}
      ${comments}
    </article>`;
}

export function renderStoriesStrip() {
  const profiles = Object.values(mock.MOCK_DEMO_PROFILES || {});
  if (!profiles.length) return "";
  const items = profiles
    .map((p) => {
      const avatarSrc = p.avatar || "icons/icon.svg";
      const firstName = (p.name || p.handle || "Autor").split(" ")[0];
      return `
        <a class="story-item" href="#/u/${encodeURIComponent(p.routeId)}" title="Ver perfil de ${escapeHtml(p.name)}">
          <div class="story-ring">
            <img class="story-avatar" src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(p.name)}" loading="lazy" />
          </div>
          <span class="story-name">${escapeHtml(firstName)}</span>
        </a>`;
    })
    .join("");

  return `<div class="stories-strip" aria-label="Stories em destaque">${items}</div>`;
}

export function renderWelcomeCardHtml() {
  if (!shouldShowWelcomeCard()) return "";
  const w = getWelcomeProfile();
  const av = renderAvatarHtml(WELCOME_ROUTE_ID, w.name);
  return `
    <div class="card welcome-first-contact" id="welcome-first-contact-card" style="margin-bottom:0.75rem; border:1px solid var(--border);">
      <div style="display:flex; gap:0.75rem; align-items:flex-start;">
        <div>${av}</div>
        <div style="flex:1; min-width:0;">
          <h3 style="margin:0 0 4px; font-size:1rem;">Primeiro contato: ${escapeHtml(w.name)}</h3>
          <p class="desc" style="margin:0 0 0.65rem; font-size:0.88rem;">${escapeHtml(w.bio)}</p>
          <div style="display:flex; flex-wrap:wrap; gap:0.4rem;">
            <a class="btn btn-primary btn-sm" href="#/u/${encodeURIComponent(WELCOME_ROUTE_ID)}">Ver perfil</a>
            <a class="btn btn-outline btn-sm" href="#/dm/${encodeURIComponent(WELCOME_ROUTE_ID)}">Mensagem</a>
            <a class="btn btn-outline btn-sm" href="#/people">Encontrar pessoas</a>
            <button type="button" class="btn btn-sm btn-outline" id="btn-welcome-card-dismiss">Ok, entendi</button>
          </div>
        </div>
      </div>
    </div>`;
}

export function renderFeed(main, topics = [], { activeFeed = "for-you", userRouteId = "" } = {}) {
  const isForYou = activeFeed !== "following";
  const displayName =
    userRouteId ? profileDirectory.getAuthorDisplaySync(userRouteId) || mock.getAuthorDisplay(userRouteId) : "";
  const welcomeCard = isForYou ? renderWelcomeCardHtml() : "";
  let html = `
    <div class="feed-chrome">
      ${renderStoriesStrip()}
      <div class="feed-composer-section">
        ${renderInlineComposer({ userRouteId, displayName })}
      </div>
      ${welcomeCard}
    </div>`;

  if (!topics.length) {
    if (!isForYou) {
      html += `
        <div class="empty following-empty">
          <p><strong>Você ainda não acompanha ninguém.</strong></p>
          <p class="desc" style="max-width:440px; margin:0.4rem auto 0.8rem;">Clique em <strong>👁️ Acompanhar (Watch)</strong> nos perfis de autores para ver as publicações deles reunidas nesta aba.</p>
          <div style="display:flex; gap:0.5rem; justify-content:center; flex-wrap:wrap;">
            <a class="btn btn-primary btn-sm" href="#/">Explorar feed "Para você"</a>
            <a class="btn btn-outline btn-sm" href="#/c/demo-aprenda-vox">Conhecer perfis do tour</a>
          </div>
        </div>`;
    } else {
      html += `
        <div class="empty">
          <p>Nenhum post recente na rede.</p>
          <a class="btn btn-primary" href="#/compose/topic">Criar primeiro post</a>
        </div>`;
    }
    main.innerHTML += html;
    return;
  }

  const visible = gossipRetract.filterFeedTopicsForGossipRetract(topics);
  const items = visible.map((t) => renderPostItem(t)).join("");
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
    ${activeTab === "posts" ? renderCommunityPeopleStrip(recentPeople) : ""}
    <div class="community-tabs segmented-tabs">
      <a class="tab-btn ${activeTab !== "listings" && activeTab !== "governance" ? "active" : ""}" href="#/c/${encodeURIComponent(communityId)}">Posts</a>
      <a class="tab-btn ${activeTab === "listings" ? "active" : ""}" href="#/c/${encodeURIComponent(communityId)}?tab=listings">Classificados</a>
      <a class="tab-btn ${activeTab === "governance" ? "active" : ""}" href="#/c/${encodeURIComponent(communityId)}?tab=governance">Governança${proposals.length ? ` (${proposals.length})` : ""}</a>
    </div>`;

  if (activeTab === "listings") {
    html += renderCommunityListingsTab(communityId, commTitle, meta, listings);
  } else if (activeTab === "governance") {
    html += renderCommunityGovernanceTab(communityId, commTitle, meta, proposals);
  } else {
    html += renderCommunityPostsTab(communityId, commTitle, topics);
  }
  main.innerHTML += html;
}

function renderCommunityPostsTab(communityId, commTitle, topics) {
  let html = `
    <div class="actions-bar">
      <span class="section-title">Posts</span>
    </div>`;
  if (!topics.length) {
    html += `<div class="empty"><p>Nenhum post nesta comunidade ainda.</p></div>`;
    return html;
  }
  const items = topics.map((t) => renderPostItem({ ...t, communityId, communityTitle: commTitle })).join("");
  return html + `<div class="feed-container">${items}</div>`;
}

function renderCommunityListingsTab(communityId, commTitle, meta, listings) {
  if (!listing.isCommercialEnabled(meta)) {
    return `
      <div class="empty feira-disabled card" style="padding: 1.5rem; text-align: center;">
        <h3 style="margin-top:0;">🏛️ Feira comunitária não ativada</h3>
        <p class="desc" style="max-width: 480px; margin: 0.5rem auto 1rem;">
          Esta comunidade ainda não abriu classificados (modo comercial desligado por padrão). Uma proposta comunitária de governança pode deliberar e aprovar a abertura da feira local.
        </p>
        <a href="#/c/${encodeURIComponent(communityId)}" class="btn btn-outline btn-sm">← Ver posts da comunidade</a>
      </div>`;
  }

  const actions = `
    <div class="actions-bar feira-actions-bar" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
      <span class="section-title">Ofertas locais</span>
      <a class="btn btn-primary btn-sm" href="#/compose/listing?c=${encodeURIComponent(communityId)}">+ Nova oferta</a>
    </div>`;

  if (!listings || !listings.length) {
    return actions + `
      <div class="empty card" style="padding: 1.5rem; text-align: center;">
        <p>Nenhuma oferta cadastrada nesta feira ainda.</p>
        <a class="btn btn-primary btn-sm" href="#/compose/listing?c=${encodeURIComponent(communityId)}">+ Criar primeira oferta</a>
      </div>`;
  }

  const items = listings.map((l) => renderListingItem(l, { communityTitle: commTitle })).join("");
  return actions + `
    <div class="feed-container">${items}</div>
    <p class="listing-footer-disclaimer">⚡ ${escapeHtml(listing.LISTING_DISCLAIMER)}</p>`;
}

export function renderCommunityGovernanceTab(communityId, commTitle, meta, proposals = []) {
  const actions = `
    <div class="actions-bar gov-actions-bar" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
      <span class="section-title">Deliberações Comunitárias</span>
      <a class="btn btn-primary btn-sm" href="#/compose/proposal?c=${encodeURIComponent(communityId)}">+ Nova proposta</a>
    </div>
    <div class="gov-info-card card" style="padding: 1rem; margin-bottom: 1rem;">
      <p class="desc" style="margin:0; font-size:0.875rem;">
        🏛️ <strong>Rede como repo público:</strong> Mudanças de regras e moderação são propostas abertas com diff unificado, apuração estrita de <strong>1 membro = 1 voto</strong> e marco de corte anti-brigading.
      </p>
    </div>`;

  if (!proposals.length) {
    return actions + `
      <div class="empty card" style="padding: 1.5rem; text-align: center;">
        <p>Nenhuma proposta em deliberação nesta comunidade ainda.</p>
        <a class="btn btn-primary btn-sm" href="#/compose/proposal?c=${encodeURIComponent(communityId)}">+ Criar primeira proposta</a>
      </div>`;
  }

  const items = proposals.map((p) => renderProposalItem(p, { communityId, communityTitle: commTitle })).join("");
  return actions + `<div class="feed-container">${items}</div>`;
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

export function renderTopic(main, topicId, topic, replies, { topicData = null, isMod = false, communityId = "" } = {}) {
  const commId = communityId || topic?.communityId || "";
  const backLink = commId ? `<a class="back-link" href="#/c/${encodeURIComponent(commId)}">← Voltar à comunidade</a>` : "";
  if (gossipRetract.shouldHideGossipDeletedPost(topic)) {
    main.innerHTML = `${backLink}${gossipRetract.renderGossipDeletedTopicShellHtml()}`;
    return;
  }
  const bodyText = topicData?.body || topic?.body || "Sem conteúdo textual.";
  const author = topic?.author || topic?.owner || "";
  const labels = resolvePostAuthorLabels(author, {
    authorDisplay: topic?.authorDisplay,
    isOwnLocalPost: topic?.isOwnLocalPost,
  });
  const { authorDisplay, authorHandle } = labels;
  const originBadge = topic?.isLocalP2p
    ? `<span class="badge-pill p2p-pill">Na rede</span>`
    : `<span class="badge-pill permanent-pill">Guardado</span>`;
  const timeLabel = formatTimeAgo(topic?.ts || topicData?.ts);
  const topicAuthorMeta = renderPostAuthorMetaLines(author, labels, timeLabel);
  const ownerMenuHeader = renderPostOwnerMenu(topic);

  const topicImage = topic?.image || topicData?.image || "";
  const topicImageAlt = topic?.imageAlt || topicData?.imageAlt || topic?.title || "Foto da publicação";
  const imageHtml = topicImage
    ? `<div class="post-media-container"><img class="post-media" src="${escapeHtml(topicImage)}" alt="${escapeHtml(topicImageAlt)}" /></div>`
    : "";

  const baseLikes = Number(topic?.likesCount) || 0;
  const liked = social.isLiked(topicId);
  const currentLikes = social.getLikesCount(topicId, baseLikes);

  const baseStars = Number(topic?.starsCount) || 0;
  const starred = social.isStarred(topicId);
  const currentStars = social.getStarsCount(topicId, baseStars);

  const saved = social.isSaved(topicId);
  const authorPixKey = topic?.contactPix || (author ? mock.getAuthorPixKey(author) : "") || "";

  const modBtn = isMod
    ? `<button class="btn btn-sm btn-danger btn-mod-hide" data-id="${escapeHtml(topicId)}" data-type="topic">🛡️ Ocultar</button>`
    : "";

  let html = `
    ${backLink}
    <article class="topic-root insta-topic-root card" style="padding:1.25rem;">
      <div class="post-header post-header-ig">
        <div class="post-header-user">
          <a class="avatar-link" href="#/u/${encodeURIComponent(author)}">${renderAvatarHtml(author, authorDisplay)}</a>
          ${topicAuthorMeta}
        </div>
        <div class="post-header-aside">
          <div class="post-header-tags">${originBadge}</div>
          ${ownerMenuHeader}
        </div>
      </div>
      ${imageHtml}
      ${renderTopicDetailText(topicId, topic?.title || "", bodyText)}
      <div class="post-actions insta-actions post-toolbar" style="margin-top:12px; padding-top:8px;">
        <button class="action-btn btn-like ${liked ? "active" : ""}" data-id="${escapeHtml(topicId)}" data-count="${baseLikes}" aria-label="Curtir post">
          <svg class="action-icon icon-heart" width="18" height="18" viewBox="0 0 24 24" fill="${liked ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
          <span class="action-count count-likes">${currentLikes > 0 ? currentLikes : ""}</span>
        </button>
        <button class="action-btn btn-star ${starred ? "active" : ""}" data-id="${escapeHtml(topicId)}" data-count="${baseStars}" aria-label="Dar estrela ao post">
          <svg class="action-icon icon-star" width="18" height="18" viewBox="0 0 24 24" fill="${starred ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          <span class="action-count count-stars">${currentStars > 0 ? currentStars : ""}</span>
        </button>
        ${authorPixKey
          ? `<button class="action-btn btn-zap-post" data-id="${escapeHtml(topicId)}" data-author="${escapeHtml(author)}" data-author-name="${escapeHtml(authorDisplay)}" data-pix="${escapeHtml(authorPixKey)}" data-title="${escapeHtml(topic?.title || "")}" aria-label="Apoiar com Pix Zap" title="Apoiar com Pix Zap">
          <svg class="action-icon icon-zap" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          <span class="action-label zap-label" style="font-size:0.75rem; font-weight:600; margin-left:2px;">Apoiar</span>
        </button>`
          : `<button class="action-btn btn-zap-post disabled" disabled aria-label="Autor sem Pix informado" title="Autor sem chave Pix informada" style="opacity:0.35; cursor:not-allowed;">
          <svg class="action-icon icon-zap" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        </button>`
        }
        <button id="btn-share-topic" class="action-btn btn-share btn-share-post" data-id="${escapeHtml(topicId)}" data-title="${escapeHtml(topic?.title || "")}" aria-label="Compartilhar post">
          <svg class="action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          <span class="action-count">Compartilhar</span>
        </button>
        <button class="action-btn btn-copy-md" data-id="${escapeHtml(topicId)}" data-title="${escapeHtml(topic?.title || "")}" data-body="${escapeHtml(bodyText)}" data-author="${escapeHtml(authorDisplay)}" data-handle="${escapeHtml(authorHandle)}" aria-label="Copiar post como Markdown">
          <svg class="action-icon icon-copy" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
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
          <p class="reply-body">${hashtags.linkifyHashtags(escapeHtml(r.body || "(carregando conteúdo...)"))}</p>
        </div>
      </div>`;
  }).join("");

  html += `<div class="thread-replies">${replyItems}</div>`;
  main.innerHTML += html;
}

function formatInlineMd(str) {
  return str
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function renderMarkdownLight(md) {
  if (!md) return "";
  const lines = String(md).split("\n");
  const out = [];
  let inList = false;

  for (const rawLine of lines) {
    const line = escapeHtml(rawLine);
    const trimmed = line.trim();

    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${formatInlineMd(trimmed.slice(2))}</li>`);
      continue;
    }

    if (inList) {
      out.push("</ul>");
      inList = false;
    }

    if (trimmed.startsWith("### ")) {
      out.push(`<h4>${trimmed.slice(4)}</h4>`);
    } else if (trimmed.startsWith("## ")) {
      out.push(`<h3>${trimmed.slice(3)}</h3>`);
    } else if (trimmed.startsWith("# ")) {
      out.push(`<h2>${trimmed.slice(2)}</h2>`);
    } else if (!trimmed) {
      // blank line
    } else {
      out.push(`<p>${formatInlineMd(trimmed)}</p>`);
    }
  }

  if (inList) out.push("</ul>");
  return out.join("");
}

function renderProfileGithubBadge(githubHandle) {
  if (!githubHandle) return "";
  const clean = escapeHtml(String(githubHandle).replace(/^@+/, ""));
  return `
    <div class="profile-github-badge">
      <span class="github-badge-icon">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
      </span>
      <span>GitHub: <a href="https://github.com/${clean}" target="_blank" rel="noopener"><strong>@${clean}</strong></a></span>
      <span class="badge-pill gh-pill">Informado</span>
    </div>`;
}

function renderProfileReadme(address, displayName, readme, isCurrentWallet) {
  if (!readme && !isCurrentWallet) return "";
  const contentHtml = readme
    ? renderMarkdownLight(readme)
    : `<p class="desc" style="font-style:italic;">Nenhum README.md adicionado ainda. Conte sobre seus projetos e ideias!</p>`;
  return `
    <div class="card profile-readme" style="margin-top:0.75rem;">
      <div class="readme-header">
        <span class="readme-title"><span class="readme-icon">📖</span> <strong>README.md</strong></span>
        ${isCurrentWallet ? `<button type="button" id="btn-toggle-edit-readme" class="btn btn-xs btn-outline">Editar README</button>` : ""}
      </div>
      <div class="readme-body" id="readme-view">
        ${contentHtml}
      </div>
      ${isCurrentWallet ? `
        <form id="form-edit-readme" style="display:none; margin-top:0.6rem;">
          <textarea id="input-profile-readme" class="form-control" rows="5" placeholder="Escreva seu README em Markdown...">${escapeHtml(readme || "")}</textarea>
          <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
            <button type="submit" class="btn btn-sm btn-primary">Salvar README</button>
            <button type="button" id="btn-cancel-readme" class="btn btn-sm btn-outline">Cancelar</button>
          </div>
        </form>
      ` : ""}
    </div>`;
}

function renderProfileStats(statsData, address = "") {
  if (!statsData) return "";
  const postsCount = statsData.posts || 1;
  const postsLabel = postsCount === 1 ? "post" : "posts";
  const baseFollowers = statsData.followers || 0;
  const followersCount = social.getFollowersCount(address, baseFollowers);
  const starsCount = statsData.stars || 0;

  return `
    <div class="profile-stats">
      <span><strong>${postsCount}</strong> <span class="meta">${postsLabel}</span></span>
      <span><strong>${followersCount}</strong> <span class="meta">acompanhando</span></span>
      ${starsCount ? `<span><strong>${starsCount}</strong> <span class="meta">estrelas</span></span>` : ""}
      ${statsData.peersConnected !== undefined
        ? `<span><strong>${statsData.peersConnected}</strong> <span class="meta">aparelhos próximos</span></span>`
        : ""}
      ${statsData.communities !== undefined
        ? `<span><strong>${statsData.communities}</strong> <span class="meta">comunidade</span></span>`
        : ""}
      ${statsData.isTourDemo ? `<span class="badge-pill demo-badge">Perfil do tour de exemplo</span>` : ""}
    </div>`;
}

function renderProfilePixBadge(pixKeyMasked, pixKeyRaw) {
  if (!pixKeyMasked) return "";
  const query = encodeURIComponent(pixKeyRaw || pixKeyMasked);
  return `
    <div class="profile-pix-badge">
      <span class="pix-badge-icon">❖</span>
      <span>Chave Pix: <strong>${escapeHtml(pixKeyMasked)}</strong></span>
      <a class="pix-badge-link" href="#/pix/${query}">Consultar</a>
    </div>`;
}

function renderProfileHeader(address, isCurrentWallet, handle, isConflict, claimants, displayName, profileBio = "", stats = null, pixKeyMasked = "", pixKeyRaw = "", githubHandle = "") {
  const displayTitle = displayName ? `${displayName} (@${handle || shortId(address)})` : (handle ? `@${handle}` : "Perfil");
  const initial = (displayName || handle || address || "U").slice(0, 1).toUpperCase();
  const avatarUrl = profileDirectory.getAuthorAvatarSync(address) || mock.getAuthorAvatar(address);
  const avatarHtml = avatarUrl
    ? `<img class="profile-avatar-img" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(displayName || address)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><span class="avatar" style="display:none; width:72px; height:72px; font-size:1.8rem;">${initial}</span>`
    : `<span class="avatar" style="width:72px; height:72px; font-size:1.8rem;">${initial}</span>`;

  const bioHtml = profileBio ? `<p class="profile-bio desc">${escapeHtml(profileBio)}</p>` : "";
  const statsData = stats || mock.getMockProfile(address)?.stats;
  const statsHtml = renderProfileStats(statsData, address);
  const pixBadge = renderProfilePixBadge(pixKeyMasked, pixKeyRaw);
  const githubBadge = renderProfileGithubBadge(githubHandle);

  const isWatchingAuthor = social.isWatching(address);
  const watchBtnHtml = !isCurrentWallet
    ? `<button class="btn btn-sm ${isWatchingAuthor ? "btn-outline" : "btn-primary"} btn-watch-profile" data-route="${escapeHtml(address)}" style="margin-left:auto;">
        ${isWatchingAuthor ? "✓ Acompanhando" : "👁️ Acompanhar (Watch)"}
      </button>`
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
      <div class="profile-cover"></div>
      <div class="profile-header-body">
        <div class="profile-avatar-row">
          <div class="profile-avatar-wrap">${avatarHtml}</div>
          ${isCurrentWallet ? `<span class="badge-pill">Sua Conta Neste Aparelho</span>` : ""}
          ${watchBtnHtml}
        </div>
        <div class="profile-info">
          <h2 class="profile-title">${escapeHtml(displayTitle)}</h2>
          <p class="meta profile-route-id">ID de Rede: <code>${escapeHtml(address)}</code></p>
        </div>
        ${bioHtml}
        <div style="display:flex; flex-wrap:wrap; gap:0.5rem; align-items:center;">
          ${pixBadge}
          ${githubBadge}
        </div>
        ${statsHtml}
        ${conflictBanner}
      </div>
    </div>`;
}

function renderPixForm(currentPixKey) {
  return `
    <div class="pix-section">
      <label for="input-pix-key" class="pix-label">Chave Pix (opcional no perfil):</label>
      <p class="desc pix-desc">Chave para apoios diretos. Não é login nem valida titularidade bancária. Seu ID de conta continua sendo sua chave criptográfica local.</p>
      <form id="form-pix-key" class="pix-form">
        <input type="text" id="input-pix-key" class="form-control" placeholder="CPF, e-mail, telefone ou chave aleatória" value="${escapeHtml(currentPixKey || "")}" />
        <button type="submit" class="btn btn-sm btn-primary">Salvar Pix</button>
        ${currentPixKey ? `<button type="button" id="btn-clear-pix" class="btn btn-sm btn-outline">Remover</button>` : ""}
      </form>
      <div id="pix-feedback" class="pix-feedback"></div>
    </div>`;
}

function renderGithubForm(currentGithub) {
  return `
    <div class="github-section" style="margin-top:0.75rem; border-top:1px solid var(--border-subtle); padding-top:0.75rem;">
      <label for="input-github-handle" class="pix-label">Perfil GitHub (opcional):</label>
      <p class="desc pix-desc">Vincule seu @handle público do GitHub ao seu perfil.</p>
      <form id="form-github-handle" class="pix-form">
        <input type="text" id="input-github-handle" class="form-control" placeholder="Usuário do GitHub (ex: dev-brasil)" value="${escapeHtml(currentGithub || "")}" />
        <button type="submit" class="btn btn-sm btn-primary">Salvar GitHub</button>
        ${currentGithub ? `<button type="button" id="btn-clear-github" class="btn btn-sm btn-outline">Remover</button>` : ""}
      </form>
      <div id="github-feedback" class="pix-feedback"></div>
    </div>`;
}

function renderOAuthEnrichmentBlock(oauthProvider = "") {
  if (!oauthProvider) return "";
  const label = oauthProvider === "google" ? "Google" : oauthProvider === "facebook" ? "Meta" : oauthProvider;
  return `
    <div class="oauth-enrich-notice" style="margin-top:0.65rem; padding:0.55rem 0.65rem; background:var(--surface-soft); border-radius:var(--radius-sm); font-size:0.82rem;">
      <p class="desc" style="margin:0 0 0.45rem;">Nome e foto importados via <strong>${escapeHtml(label)}</strong> (opcional). Tokens OAuth não são guardados neste aparelho.</p>
      <button type="button" id="btn-clear-oauth-enrich" class="btn btn-sm btn-outline">Remover nome/foto importados</button>
    </div>`;
}

function renderProfileActions(
  address,
  isCurrentWallet,
  handle,
  displayName,
  hasWallet,
  balance,
  currentPixKey = "",
  currentGithub = "",
  oauthProvider = "",
  isBlocked = false,
  isMuted = false,
  meshDiscoverable = false,
) {
  if (isCurrentWallet) {
    return `
      <div class="card" style="margin-top:0.75rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div>
            <strong>Mensagens Diretas</strong>
            <p class="meta" style="margin:2px 0 0;">Compartilhe seu link para receber DMs privadas:</p>
          </div>
          <div style="display:flex; gap:0.35rem; flex-wrap:wrap;">
            <button id="btn-copy-my-dm-link" class="btn btn-sm btn-outline" data-route="${escapeHtml(address)}">📋 Copiar Meu Link</button>
            <button id="btn-copy-connect-link" class="btn btn-sm btn-outline" data-route="${escapeHtml(address)}">↗ Link #/connect</button>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:0.75rem;">
        <h3>Identidade Local</h3>
        <form id="form-display-name" style="margin-top:0.5rem; display:flex; gap:0.5rem;">
          <input type="text" id="input-display-name" class="form-control" placeholder="Seu apelido ou nome..." value="${escapeHtml(displayName || "")}" maxlength="30" />
          <button type="submit" class="btn btn-sm btn-primary" style="white-space:nowrap;">Salvar Nome</button>
        </form>
        ${renderOAuthEnrichmentBlock(oauthProvider)}
        ${renderPixForm(currentPixKey)}
        ${renderGithubForm(currentGithub)}
      </div>

      <div class="card" style="margin-top:0.75rem;">
        <h3>Descoberta na malha</h3>
        <div class="form-group" style="display:flex; align-items:flex-start; gap:0.6rem; margin-top:0.5rem;">
          <input type="checkbox" id="profile-mesh-discoverable" ${meshDiscoverable ? "checked" : ""} style="width:1.1rem; height:1.1rem; margin-top:0.2rem;" />
          <div>
            <label for="profile-mesh-discoverable" style="margin:0; font-weight:600;">Aparecer na busca da malha</label>
            <p class="desc" style="font-size:0.82rem; margin:0.25rem 0 0;">Cartão assinado opt-in para pares conectados; sem ranking nem servidor central.</p>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:0.75rem;">
        <h3>Backup & Restauração de Conta</h3>
        <p class="desc" style="font-size:0.85rem; margin-bottom:0.5rem;">Exporte sua identidade completa (chaves de assinatura e DMs) para controle total da sua conta.</p>
        <div style="display:flex; flex-wrap:wrap; gap:0.5rem;">
          <button type="button" id="btn-export-account" class="btn btn-sm btn-outline">💾 Exportar Identidade (.json)</button>
          <label class="btn btn-sm btn-outline" style="margin:0; cursor:pointer;">
            📥 Restaurar Backup
            <input type="file" id="file-import-account" accept="application/json,.json" style="display:none;" />
          </label>
        </div>
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
    <div class="card" style="margin-top:0.75rem; display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">
      <a class="btn btn-primary btn-sm" href="#/dm/${encodeURIComponent(address)}">💬 Mensagem Privada</a>
      <button class="btn btn-outline btn-sm" id="btn-copy-author-route" data-route="${escapeHtml(address)}">📋 Copiar ID</button>
      <button class="btn btn-sm ${isBlocked ? "btn-outline" : "btn-danger"}" id="btn-toggle-block" data-route="${escapeHtml(address)}">
        ${isBlocked ? "Desbloquear Autor" : "🚫 Bloquear"}
      </button>
      <button class="btn btn-sm btn-outline" id="btn-toggle-mute" data-route="${escapeHtml(address)}">
        ${isMuted ? "Desilenciar no Feed" : "🔇 Silenciar"}
      </button>
    </div>`;
}

export function renderProfile(main, address, memberships = [], isCurrentWallet = false, dmPubStr = "", {
  handle = "",
  isConflict = false,
  claimants = [],
  displayName = "",
  profileBio = "",
  stats = null,
  posts = [],
  starredPosts = [],
  hasWallet = false,
  balance = "0.000",
  pixKey = "",
  pixKeyMasked = "",
  githubHandle = "",
  readme = "",
  activeTab = "posts",
  pinnedPostId = "",
  oauthProvider = "",
  isBlocked = false,
  isMuted = false,
  meshDiscoverable = false,
} = {}) {
  const finalGithub = githubHandle || (isCurrentWallet ? social.getLocalGithubHandle() : mock.getAuthorGithub(address));
  const finalReadme = readme || (isCurrentWallet ? social.getLocalReadme() : mock.getAuthorReadme(address));
  const finalPinned = pinnedPostId || (isCurrentWallet ? social.getPinnedPostId(address) : mock.getAuthorPinnedPostId(address));

  let html = renderProfileHeader(address, isCurrentWallet, handle, isConflict, claimants, displayName, profileBio, stats, pixKeyMasked, pixKey, finalGithub);
  html += renderProfileActions(
    address,
    isCurrentWallet,
    handle,
    displayName,
    hasWallet,
    balance,
    pixKey,
    finalGithub,
    oauthProvider,
    isBlocked,
    isMuted,
    meshDiscoverable,
  );
  html += renderProfileReadme(address, displayName, finalReadme, isCurrentWallet);

  // Reordena posts para colocar fixado no topo
  const authorPostList = [...(posts || [])];
  if (finalPinned) {
    const pinIdx = authorPostList.findIndex((p) => p.id === finalPinned);
    if (pinIdx > 0) {
      const [pinnedItem] = authorPostList.splice(pinIdx, 1);
      authorPostList.unshift(pinnedItem);
    }
  }

  const starredList = starredPosts || [];
  const currentTab = activeTab || "posts";

  html += `
    <div class="community-tabs profile-tabs" style="margin-top:1rem;">
      <a href="#/u/${encodeURIComponent(address)}?tab=posts" class="tab-btn ${currentTab === "posts" ? "active" : ""}">Posts do autor (${authorPostList.length})</a>
      <a href="#/u/${encodeURIComponent(address)}?tab=starred" class="tab-btn ${currentTab === "starred" ? "active" : ""}">Estrelados (${starredList.length})</a>
      <a href="#/u/${encodeURIComponent(address)}?tab=communities" class="tab-btn ${currentTab === "communities" ? "active" : ""}">Comunidades (${memberships.length})</a>
    </div>`;

  if (currentTab === "posts") {
    if (!authorPostList.length) {
      html += `<div class="empty"><p>Nenhum post publicado por este autor.</p></div>`;
    } else {
      const postCards = authorPostList.map((p) => renderPostItem(p, { isPinned: p.id === finalPinned })).join("");
      html += `<div class="feed-container" style="margin-top:0.75rem;">${postCards}</div>`;
    }
  } else if (currentTab === "starred") {
    if (!starredList.length) {
      html += `<div class="empty"><p>Nenhum post favoritado com estrela ⭐ ainda.</p></div>`;
    } else {
      const starredCards = starredList.map((p) => renderPostItem(p)).join("");
      html += `<div class="feed-container" style="margin-top:0.75rem;">${starredCards}</div>`;
    }
  } else if (currentTab === "communities") {
    if (!memberships.length) {
      html += `<div class="empty"><p>Nenhuma comunidade registrada neste perfil.</p></div>`;
    } else {
      const list = memberships
        .map(
          (m) => `
        <div class="card" style="padding:10px 14px; margin-top:0.5rem;">
          <a href="#/c/${encodeURIComponent(m.communityId)}">
            <h3 style="margin:0 0 2px;">${escapeHtml(m.communityId)}</h3>
          </a>
          <span class="meta">Membro confirmado</span>
        </div>`
        )
        .join("");
      html += `<div class="card-list">${list}</div>`;
    }
  }

  main.innerHTML = html;
}

export function renderPixLookup(main, query = "", profile = null) {
  const queryStr = escapeHtml(query);
  let content = "";
  if (profile) {
    const profName = profile.name || shortId(profile.routeId);
    const profHandle = profile.handle ? `@${profile.handle}` : "";
    const pixMasked = profile.pixKeyMasked || profile.pixKey || "";
    content = `
      <div class="card pix-lookup-card">
        <div class="pix-lookup-header">
          <span class="badge-pill p2p-pill">❖ Conta Localizada</span>
        </div>
        <h2 style="margin:0.5rem 0 0.2rem;">${escapeHtml(profName)} ${profHandle ? `<span class="meta">${escapeHtml(profHandle)}</span>` : ""}</h2>
        <p class="meta">ID de Rede: <code>${escapeHtml(profile.routeId)}</code></p>
        <div class="card" style="margin:0.75rem 0; background:var(--surface-soft);">
          <span class="meta" style="font-size:0.8rem;">Chave Pix informada:</span>
          <div style="font-size:1.1rem; font-weight:700; margin-top:0.2rem;"><code>${escapeHtml(pixMasked)}</code></div>
        </div>
        <div class="card" style="font-size:0.82rem; color:var(--muted); margin-bottom:1rem;">
          <p style="margin:0;"><strong>Aviso de Conformidade:</strong> O Vox é um aplicativo peer-to-peer sem servidores centrais e não é uma instituição financeira nem processa pagamentos. Abra seu aplicativo de banco para concluir transações com segurança.</p>
        </div>
        <div class="actions-row">
          <a class="btn btn-primary" href="#/u/${encodeURIComponent(profile.routeId)}">Ver Perfil Completo</a>
          <a class="btn btn-outline" href="#/dm/${encodeURIComponent(profile.routeId)}">💬 Mensagem Privada</a>
        </div>
      </div>`;
  } else {
    content = `
      <div class="card pix-lookup-card empty">
        <h2>Chave Pix não vinculada</h2>
        <p class="desc">A chave <code>${queryStr}</code> não foi declarada em nenhum perfil ativo ou tour neste aparelho.</p>
        <p class="meta" style="margin-top:0.5rem;">Lembre-se: chaves Pix no Vox são atributos declarativos opcionais armazenados no aparelho de cada usuário.</p>
        <div class="actions-row" style="margin-top:1rem;">
          <a class="btn btn-outline" href="#/">← Voltar ao Início</a>
        </div>
      </div>`;
  }

  main.innerHTML = `
    <div class="actions-bar">
      <span class="section-title">Consulta de Chave Pix</span>
    </div>
    ${content}
  `;
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

export function renderComposeListing(main, communityId, commTitle = "", prefill = {}) {
  const titleDisplay = commTitle || communityId || "Feira";
  const backLink = `<a class="back-link" href="#/c/${encodeURIComponent(communityId)}?tab=listings">← Voltar à feira</a>`;
  const defaultPix = prefill.defaultPix || "";

  main.innerHTML = `
    <div class="card compose-card compose-listing-card">
      ${backLink}
      <h2>Nova Oferta — ${escapeHtml(titleDisplay)}</h2>
      <p class="listing-form-disclaimer" style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1rem;">
        ⚡ ${escapeHtml(listing.LISTING_DISCLAIMER)}
      </p>
      <form id="form-compose-listing">
        <input type="hidden" id="listing-comm-id" value="${escapeHtml(communityId)}" />
        <div class="form-group">
          <label for="listing-title">O que você está ofertando?</label>
          <input type="text" id="listing-title" class="form-control" placeholder="Ex: Pão artesanal de fermentação natural" required maxlength="120" />
        </div>
        <div class="form-row" style="display:flex; gap:0.75rem; flex-wrap:wrap;">
          <div class="form-group" style="flex:1 1 140px;">
            <label for="listing-price">Preço sugerido:</label>
            <input type="text" id="listing-price" class="form-control" placeholder="Ex: R$ 35" />
          </div>
          <div class="form-group" style="flex:1 1 180px;">
            <label for="listing-location">Bairro / Região:</label>
            <input type="text" id="listing-location" class="form-control" placeholder="Ex: Vila Madalena, SP" maxlength="60" />
          </div>
        </div>
        <div class="form-group">
          <label for="listing-pix">Chave Pix para recebimento direto (opcional):</label>
          <input type="text" id="listing-pix" class="form-control" placeholder="E-mail, celular, CPF ou chave aleatória" value="${escapeHtml(defaultPix)}" />
        </div>
        <div class="form-group">
          <label for="listing-image">Foto do item (URL opcional):</label>
          <input type="text" id="listing-image" class="form-control" placeholder="images/posts/tour-helena.jpg ou https://..." />
        </div>
        <div class="form-group">
          <label for="listing-body">Descrição da oferta:</label>
          <textarea id="listing-body" class="form-control" rows="4" placeholder="Descreva os detalhes do produto ou serviço, prazos e forma de entrega..." required></textarea>
        </div>
        <div class="form-actions" style="margin-top:1rem;">
          <button type="submit" class="btn btn-primary" id="btn-submit-listing">Publicar na Feira</button>
        </div>
      </form>
    </div>`;
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

const CANTINA_ART_ALT =
  "Ilustração anime de uma cantina: o bartender de túnica bege aponta para a câmera; dois balões pintados na arte dizem 'Seus bots tem que esperar lá fora!' e 'Aqui não servimos esse tipo.'";

const CANTINA_ART =
  `<img class="cantina-art-img" src="./images/cantina-gate.jpg" alt="${CANTINA_ART_ALT}" width="1024" height="575" />`;

/** Ícones inline (GIS / Meta brand — sem asset extra no SW). */
const OAUTH_SVG_GOOGLE = `<svg class="oauth-btn__icon" width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

const OAUTH_SVG_META = `<svg class="oauth-btn__icon oauth-btn__icon--meta" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`;

export function renderOAuthEnrich(container) {
  if (!container) return;
  container.innerHTML = `
    <div class="modal-overlay oauth-enrich-overlay" id="oauth-enrich-overlay" role="dialog" aria-modal="true" aria-labelledby="oauth-enrich-title">
      <div class="modal-dialog modal-dialog-solid oauth-enrich-dialog">
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
        </div>
        <p class="oauth-enrich-divider" role="presentation"><span>ou</span></p>
        <button type="button" id="btn-oauth-skip" class="oauth-btn oauth-btn--skip">Pular — continuar só com vx_</button>
        <p id="oauth-enrich-error" class="oauth-enrich-error" role="alert" aria-live="polite" hidden></p>
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
  return `
    <div class="card people-result" style="padding:0.65rem 0.85rem; margin-top:0.45rem; display:flex; gap:0.65rem; align-items:center;">
      ${av}
      <div style="flex:1; min-width:0;">
        <a href="#/u/${encodeURIComponent(p.routeId)}" style="font-weight:600;">${name}</a>
        ${handle ? `<span class="meta"> ${handle}</span>` : ""}
        <p class="meta" style="margin:2px 0 0;"><code>${escapeHtml(shortId(p.routeId))}</code></p>
      </div>
      <div style="display:flex; flex-direction:column; gap:0.25rem;">
        <a class="btn btn-sm btn-outline" href="#/connect/${encodeURIComponent(p.routeId)}">Conectar</a>
        <a class="btn btn-sm btn-primary" href="#/dm/${encodeURIComponent(p.routeId)}">DM</a>
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

export function renderPeopleSearch(main, { sections = null, results = [], query = "" } = {}) {
  const q = escapeHtml(query);
  const hasQuery = Boolean(String(query || "").trim());
  let body = "";
  if (hasQuery) {
    body =
      results.length === 0
        ? `<div class="empty"><p>Nenhuma pessoa encontrada para “${q}”.</p></div>`
        : results.map((p) => renderPeopleResultRow(p)).join("");
  } else if (sections) {
    body =
      renderPeopleSection("Contatos", sections.contacts) +
      renderPeopleSection("Na malha", sections.mesh) +
      renderPeopleSection("Tour (demonstração)", sections.tour);
    if (!sections.contacts?.length && !sections.mesh?.length && !sections.tour?.length) {
      body = `<div class="empty"><p>Ninguém indexado ainda.</p></div>`;
    }
  } else {
    body = results.map((p) => renderPeopleResultRow(p)).join("");
  }

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

export function renderPostPactConnectModal(container, routeId) {
  if (!container || !routeId) return;
  const link = `${typeof location !== "undefined" ? location.origin + location.pathname : ""}#/connect/${encodeURIComponent(routeId)}`;
  container.innerHTML = `
    <div class="modal-overlay" id="post-pact-connect-overlay" role="dialog" aria-modal="true" style="z-index:10001;">
      <div class="modal-dialog card" style="max-width:420px;">
        <h3 style="margin:0 0 0.5rem;">Seu link #/connect</h3>
        <p class="desc" style="margin:0 0 0.75rem;">Compartilhe para outros adicionarem você diretamente.</p>
        <p class="meta" style="word-break:break-all;"><code id="post-pact-connect-url">${escapeHtml(link)}</code></p>
        <div style="display:flex; gap:0.5rem; margin-top:1rem; flex-wrap:wrap;">
          <button type="button" id="btn-post-pact-share-connect" class="btn btn-primary" data-route="${escapeHtml(routeId)}">Compartilhar</button>
          <button type="button" id="btn-post-pact-connect-close" class="btn btn-outline">Continuar</button>
        </div>
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
    <div class="modal-overlay cantina-overlay" id="cantina-modal-overlay" role="dialog" aria-modal="true" aria-label="Porta da Cantina">
      <div class="modal-dialog cantina-dialog">
        <div class="cantina-art-wrap">
          ${CANTINA_ART}
        </div>
        <div class="cantina-actions" style="display:flex; flex-direction:column; gap:0.6rem;">
          <button id="btn-cantina-enter" class="btn btn-primary btn-cantina-enter" style="padding:0.75rem; font-weight:700; font-size:1rem;">Entrar — sou humano</button>
          <details class="cantina-details" style="font-size:0.82rem; margin-top:0.35rem; cursor:pointer;">
            <summary style="color:var(--muted); text-align:center;">O que isso significa?</summary>
            <p class="desc" style="margin:0.4rem 0 0; text-align:left; font-size:0.8rem; background:var(--surface-soft); padding:8px 10px; border-radius:var(--radius-sm); border:1px solid var(--border);">No Vox você não precisa de CPF nem de cadastro sob vigilância. Protegemos o espaço recusando fazendas de automação para que pessoas reais conversem em paz sob o Pacto Vox.</p>
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

export function renderZapModal(container, { author = "", authorName = "Autor", pixKey = "", title = "", defaultAmount = 5 } = {}) {
  if (!container) return;
  const initialAmount = defaultAmount || 5;
  let initialPayload = "";
  try {
    initialPayload = brcode.buildPixPayload({
      key: pixKey,
      name: authorName,
      amount: initialAmount,
      description: "Apoio Vox",
    });
  } catch {
    initialPayload = pixKey;
  }

  container.innerHTML = `
    <div class="modal-overlay" id="zap-modal-overlay">
      <div class="modal-dialog zap-modal-dialog" style="max-width: 440px; width: 100%; padding: 1.5rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
          <h3 style="margin:0; font-size:1.15rem; display:flex; align-items:center; gap:6px;">
            <span>⚡</span> Pix Zap para ${escapeHtml(authorName)}
          </h3>
          <button class="btn btn-sm btn-outline btn-close-zap" style="border:none; padding:4px 8px; font-size:1.1rem; cursor:pointer;" aria-label="Fechar">✕</button>
        </div>
        ${title ? `<p class="desc" style="font-size:0.82rem; margin:0 0 0.75rem; color:var(--muted);">${escapeHtml(title.slice(0, 60))}${title.length > 60 ? "…" : ""}</p>` : ""}
        
        <label style="font-size:0.82rem; font-weight:600; display:block; margin-bottom:6px;">Escolha o valor do apoio:</label>
        <div class="zap-amount-buttons" style="display:flex; gap:6px; margin-bottom:0.75rem;">
          <button class="btn btn-sm btn-zap-val ${initialAmount === 2 ? "btn-primary" : "btn-outline"}" data-val="2">R$ 2</button>
          <button class="btn btn-sm btn-zap-val ${initialAmount === 5 ? "btn-primary" : "btn-outline"}" data-val="5">R$ 5</button>
          <button class="btn btn-sm btn-zap-val ${initialAmount === 10 ? "btn-primary" : "btn-outline"}" data-val="10">R$ 10</button>
          <button class="btn btn-sm btn-zap-val ${![2, 5, 10].includes(initialAmount) ? "btn-primary" : "btn-outline"}" data-val="custom">Outro</button>
        </div>
        
        <div class="zap-custom-container" style="display:${![2, 5, 10].includes(initialAmount) ? "block" : "none"}; margin-bottom:0.75rem;">
          <input type="text" id="zap-custom-input" class="form-control" placeholder="Ex: 15 ou R$ 20,00" value="${![2, 5, 10].includes(initialAmount) ? initialAmount : ""}" style="font-size:0.9rem;" />
        </div>

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
    <div class="modal-overlay post-edit-overlay" id="post-edit-modal-overlay" role="dialog" aria-modal="true" aria-label="Editar publicação">
      <div class="modal-dialog modal-dialog-solid post-edit-dialog">
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

const PARTICIPATION_LAYERS = [
  {
    id: "passive",
    title: "Passivo",
    desc: "Você navega e publica, mas não repassa cache nem ajuda outros aparelhos. Ideal para economizar dados ou pausar a contribuição.",
    control: '<a class="participation-link" href="#net-pause">Pausar ajuda à rede (modo somente leitura)</a>',
  },
  {
    id: "active",
    title: "Ativo",
    desc: "Padrão do Pacto Vox: entrega leve de conteúdo público já em cache, com tetos de banda, limite de disco e preferência por Wi-Fi.",
    control: '<span class="meta">Desmarque “Pausar ajuda” e ajuste os limites abaixo.</span>',
  },
  {
    id: "supporter",
    title: "Apoiador",
    desc: "Prioriza os espaços digitais em que você participa: o compartilhamento na malha foca nas suas comunidades, não no feed global inteiro.",
    control: '<a class="participation-link" href="#net-comm-only-wrap">Compartilhar apenas minhas comunidades</a> (<code>commOnly</code>)',
  },
  {
    id: "steward",
    title: "Steward",
    desc: "Apoia a malha com relay desktop ou servidor de conexão (LAN/VPS), espelhando índices e sinalização para quem está por perto.",
    control: '<a class="participation-link" href="#net-relay-steward">Relay e servidor de conexão</a>',
  },
];

/** Camada inferida para destaque na UI (não persiste estado separado). */
export function inferParticipationLayer(settings = {}, { customSignalingUrl = "" } = {}) {
  if (settings.enabled === false) return "passive";
  const signaling = String(customSignalingUrl || "").trim();
  if (settings.backgroundRelay || signaling) return "steward";
  if (settings.commOnly) return "supporter";
  return "active";
}

function renderParticipationLayers(settings, customSignalingUrl) {
  const current = inferParticipationLayer(settings, { customSignalingUrl });
  const cards = PARTICIPATION_LAYERS.map((layer) => {
    const isCurrent = layer.id === current;
    const border = isCurrent ? "border:2px solid var(--accent);" : "border:1px solid var(--border);";
    const badge = isCurrent
      ? `<span class="pill" style="font-size:0.7rem; margin-left:0.35rem;">Você está aqui</span>`
      : "";
    return `
      <div class="participation-layer" data-layer="${layer.id}" style="${border} border-radius:var(--radius-sm); padding:0.65rem 0.75rem; margin-bottom:0.5rem;">
        <div style="font-weight:600; font-size:0.9rem;">${escapeHtml(layer.title)}${badge}</div>
        <p class="desc" style="font-size:0.8rem; margin:0.35rem 0;">${escapeHtml(layer.desc)}</p>
        <div style="font-size:0.8rem;">${layer.control}</div>
      </div>`;
  }).join("");

  return `
    <details class="advanced-settings participation-layers">
      <summary>Camadas de participação (Passivo → Steward)</summary>
      <div style="margin-top:0.75rem;">
        <p class="desc" style="font-size:0.8rem; margin:0 0 0.75rem;">
          Opt-in em etapas: ninguém precisa virar steward para usar o Vox. Escolha o nível que combina com seu aparelho e com os espaços digitais que você habita.
        </p>
        ${cards}
      </div>
    </details>`;
}

function renderGatewayHealthBlock(gatewayHealth) {
  const state = gatewayHealth?.state || "all_ok";
  if (state === "all_ok") {
    return `<p class="desc" style="font-size:0.8rem; margin:0.5rem 0 0;">Leitura Arweave: gateways respondendo normalmente neste aparelho.</p>`;
  }
  const label =
    state === "critical"
      ? "Leitura reserva — gateways falharam recentemente; conteúdo pode vir só do cache local ou relay comunitário."
      : "Leitura reserva ocasional — um ou mais gateways falharam; a malha ou relay comunitário ajudam.";
  return `
    <div class="card" style="margin-top:0.65rem; padding:0.65rem 0.75rem; border-color:var(--warning-border, #fde68a); background:var(--warning-soft, #fef3c7);">
      <strong style="font-size:0.85rem;">📡 ${escapeHtml(label)}</strong>
      <p class="desc" style="font-size:0.75rem; margin:0.35rem 0 0;">Sem envio de dados externos — só histórico local. <a href="#/settings/network">Ajustar rede</a></p>
    </div>`;
}

function renderNetworkHeader(isEnabled, relayStatus, rtcStatus, gatewayHealth) {
  const rtcCount = rtcStatus?.remotePeersConnected || 0;
  const statusBadge = isEnabled
    ? `<span class="pill" style="background:var(--success); color:#fff;">🟢 Ajudando a rede</span>`
    : `<span class="pill" style="background:var(--danger); color:#fff;">⏸️ Ajuda pausada</span>`;
  const peerBadge = rtcCount > 0
    ? `<span class="badge-pill" style="background:var(--success-soft); color:var(--success);">${rtcCount} ${rtcCount === 1 ? "aparelho conectado" : "aparelhos conectados"}</span>`
    : `<span class="badge-pill">Conectando a aparelhos próximos…</span>`;
  const reservePill =
    gatewayHealth?.state && gatewayHealth.state !== "all_ok"
      ? `<span class="badge-pill" style="background:var(--amber-soft, #fef3c7); color:var(--amber, #b45309);">Leitura reserva</span>`
      : "";

  return `
    <div class="card network-card">
      <h2>Sua rede</h2>
      <p class="desc">Você ajuda a manter o Vox funcionando para todo mundo, direto do seu aparelho.</p>
      
      <div class="network-status" style="margin-top:0.75rem; display:flex; flex-wrap:wrap; gap:0.4rem;">
        ${statusBadge}
        ${peerBadge}
        ${reservePill}
      </div>
      ${renderGatewayHealthBlock(gatewayHealth)}
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

function relayHealthLabel(relayStatus, relayHttpUrl) {
  const host = relayHttpUrl ? new URL(relayHttpUrl).host : "";
  if (relayStatus?.online) {
    return host ? `🟢 Conectado (${host})` : "🟢 Conectado";
  }
  return host ? `⚪ Offline (${host})` : "⚪ Offline";
}

function renderNetworkForm(settings, notifPermission, customSignalingUrl, customRelayHttpUrl, customTurn, relayStatus, rtcStatus, metrics, relayHttpUrl, meshDiscoverable = false) {
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

        <div class="form-group" style="display:flex; align-items:flex-start; gap:0.6rem;">
          <input type="checkbox" id="net-mesh-discoverable" ${meshDiscoverable ? "checked" : ""} style="width:1.1rem; height:1.1rem; margin-top:0.2rem;" />
          <div>
            <label for="net-mesh-discoverable" style="margin:0; font-weight:600;">Aparecer na busca da malha</label>
            <p class="desc" style="font-size:0.78rem; margin:0.25rem 0 0;">Cartão de perfil assinado (opt-in) propagado via gossip — ver COMPLIANCE-BR.md.</p>
          </div>
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

        <div id="net-comm-only-wrap" class="form-group" style="display:flex; align-items:center; gap:0.6rem;">
          <input type="checkbox" id="net-comm-only" ${settings?.commOnly ? "checked" : ""} style="width:1rem; height:1rem;" />
          <label for="net-comm-only" style="margin:0;">Compartilhar apenas minhas comunidades (camada Apoiador)</label>
        </div>

        ${renderParticipationLayers(settings, customSignalingUrl)}

        <div class="form-group" style="display:flex; align-items:center; gap:0.6rem;">
          <input type="checkbox" id="net-webrtc" ${settings?.webrtcEnabled !== false ? "checked" : ""} style="width:1rem; height:1rem;" />
          <label for="net-webrtc" style="margin:0;">Conectar diretamente a outros aparelhos</label>
        </div>

        <details class="advanced-settings">
          <summary>Avançado (Conexões e Servidores)</summary>
          <div id="net-relay-steward" style="margin-top:0.75rem;">
            <p class="desc" style="font-size:0.8rem; margin-bottom:0.5rem;">Detalhes técnicos da malha WebRTC, relay e camada Steward.</p>
            <p style="margin-bottom:0.75rem;"><a href="#/settings/network/steward" class="btn btn-outline btn-sm">Assistente steward (5 passos)</a></p>

            <div class="form-group">
              <label for="net-signaling-url">Servidor de conexão (opcional):</label>
              <input type="text" id="net-signaling-url" class="form-control" placeholder="wss://signal.comunidade.org" value="${customSignalingUrl || ""}" />
            </div>

            <div class="form-group">
              <label for="net-relay-http-url">Relay HTTP (cache e inbox, opcional):</label>
              <input type="text" id="net-relay-http-url" class="form-control" placeholder="https://relay.comunidade.org ou 192.168.0.10:3920" value="${customRelayHttpUrl || ""}" />
              <p class="desc" style="font-size:0.75rem; margin:0.35rem 0 0;">Usado para buscar posts e mensagens efêmeras. Vazio = derivado do servidor de conexão ou localhost.</p>
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
              <button type="button" id="btn-check-relay" class="btn btn-outline btn-sm">Verificar Relay HTTP</button>
              <span class="meta" style="margin-left:0.5rem;">${relayHealthLabel(relayStatus, relayHttpUrl)}</span>
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

function renderModerationSettingsSection(blockedUsers = [], mutedUsers = []) {
  const blockedList = blockedUsers.length
    ? blockedUsers.map((u) => `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;"><code>${escapeHtml(shortId(u))}</code><button type="button" class="btn btn-sm btn-outline btn-unblock-item" data-route="${escapeHtml(u)}">Desbloquear</button></div>`).join("")
    : `<p class="meta" style="margin:0;">Nenhum autor bloqueado.</p>`;

  const mutedList = mutedUsers.length
    ? mutedUsers.map((u) => `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;"><code>${escapeHtml(shortId(u))}</code><button type="button" class="btn btn-sm btn-outline btn-unmute-item" data-route="${escapeHtml(u)}">Desilenciar</button></div>`).join("")
    : `<p class="meta" style="margin:0;">Nenhum autor silenciado.</p>`;

  return `
    <div class="card" style="margin-top:1rem;">
      <h3>Moderação Local & Filtros</h3>
      <p class="desc" style="font-size:0.85rem; margin-bottom:0.6rem;">Filtros de conteúdo soberanos salvos apenas neste aparelho.</p>
      
      <div style="margin-bottom:0.75rem;">
        <h4 style="margin:0 0 4px; font-size:0.9rem;">Autores Bloqueados (${blockedUsers.length})</h4>
        <div class="card" style="background:var(--surface-soft); padding:8px 10px;">${blockedList}</div>
      </div>

      <div style="margin-bottom:0.75rem;">
        <h4 style="margin:0 0 4px; font-size:0.9rem;">Autores Silenciados (${mutedUsers.length})</h4>
        <div class="card" style="background:var(--surface-soft); padding:8px 10px;">${mutedList}</div>
      </div>

      <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.5rem;">
        <button type="button" id="btn-export-moderation" class="btn btn-sm btn-outline">💾 Exportar Regras</button>
        <label class="btn btn-sm btn-outline" style="margin:0; cursor:pointer;">
          📥 Importar Regras
          <input type="file" id="file-import-moderation" accept="application/json,.json" style="display:none;" />
        </label>
      </div>
    </div>`;
}
export function renderNetworkSettings(main, {
  settings,
  metrics,
  cacheStats,
  relayStatus,
  dailyUsage,
  notifPermission,
  rtcStatus,
  customSignalingUrl,
  customRelayHttpUrl,
  customTurn,
  relayHttpUrl,
  gatewayHealth,
  blockedUsers = [],
  mutedUsers = [],
  meshDiscoverable = false,
}) {
  const isEnabled = Boolean(settings?.enabled);
  let html = renderNetworkHeader(isEnabled, relayStatus, rtcStatus, gatewayHealth);
  html += renderNetworkStats(metrics, cacheStats, dailyUsage, settings);
  html += renderNetworkForm(
    settings,
    notifPermission,
    customSignalingUrl,
    customRelayHttpUrl,
    customTurn,
    relayStatus,
    rtcStatus,
    metrics,
    relayHttpUrl,
    meshDiscoverable,
  );
  html += renderModerationSettingsSection(blockedUsers, mutedUsers);
  main.innerHTML = html;
}

/** Wizard operador steward (V-P01) — MVP 5 passos. */
export function renderStewardWizard(main, { draft = {}, step = 1 } = {}) {
  const s = Math.min(5, Math.max(1, Number(step) || 1));
  const d = draft || {};
  main.innerHTML = `
    <a class="back-link" href="#/settings/network">← Voltar às preferências de rede</a>
    <div class="card">
      <h2>Assistente steward</h2>
      <p class="desc">Voluntário da <strong>comunidade</strong> — não o mantenedor do código. Passo ${s} de 5.</p>
      <form id="form-steward-wizard">
        ${s === 1 ? `
          <p class="desc" style="font-size:0.85rem;">Camada Steward: espelho e relay para leitura mais rápida. Leia <code>COMPLIANCE-BR.md</code> no repositório Vox (Marco Civil, espelho).</p>
          <label style="display:flex; gap:0.5rem; align-items:flex-start; margin-top:0.75rem;">
            <input type="checkbox" id="sw-pledge" ${d.pledge ? "checked" : ""} required style="margin-top:0.2rem;" />
            <span>Comprometo-me a operar infra <strong>voluntária</strong>, com quotas e sem inspecionar DMs.</span>
          </label>
        ` : ""}
        ${s === 2 ? `
          <div class="form-group">
            <label for="sw-community-id">Community-Id ou slug da comunidade</label>
            <input type="text" id="sw-community-id" class="form-control" value="${escapeHtml(d.communityId || "")}" placeholder="ex. bairro-centro" required />
          </div>
        ` : ""}
        ${s === 3 ? `
          <p class="desc">Deploy relay + Caddy + Coturn: siga <code>relay/deploy/README.md</code> no repositório (Docker).</p>
          <p class="desc" style="font-size:0.8rem;">Checklist rápido: doc <code>docs/steward-seed-15min.md</code> no repositório.</p>
        ` : ""}
        ${s === 4 ? `
          <div class="form-group">
            <label for="sw-signaling">WSS signaling</label>
            <input type="text" id="sw-signaling" class="form-control" value="${escapeHtml(d.signalingUrl || "")}" placeholder="wss://signal.coletivo.org" />
          </div>
          <div class="form-group">
            <label for="sw-relay-http">URL HTTP relay</label>
            <input type="text" id="sw-relay-http" class="form-control" value="${escapeHtml(d.relayHttpUrl || "")}" placeholder="https://relay.coletivo.org" />
          </div>
          <button type="button" id="sw-verify-relay" class="btn btn-outline btn-sm">Verificar Relay HTTP</button>
          <span id="sw-verify-result" class="meta" style="margin-left:0.5rem;"></span>
        ` : ""}
        ${s === 5 ? `
          <p class="desc">Salve as URLs acima em <a href="#/settings/network">Preferências de rede</a>. Depois, na comunidade, dispare espelho (<code>mirrorCommunityToRelay</code>) e compartilhe <code>#/c/&lt;slug&gt;</code>.</p>
          <div class="form-group">
            <label for="sw-share-link">Link para compartilhar</label>
            <input type="text" id="sw-share-link" class="form-control" value="${escapeHtml(d.shareLink || "")}" placeholder="#/c/minha-comunidade" />
          </div>
        ` : ""}
        <div style="display:flex; gap:0.5rem; margin-top:1rem; flex-wrap:wrap;">
          ${s > 1 ? `<button type="button" id="sw-prev" class="btn btn-outline">← Anterior</button>` : ""}
          ${s < 5 ? `<button type="submit" class="btn btn-primary">Próximo →</button>` : `<button type="submit" class="btn btn-primary">Concluir</button>`}
        </div>
      </form>
    </div>`;
}

export function renderDmList(main, conversations = [], myAddress = "", { contactList = [] } = {}) {
  const sorted = [...conversations].sort((a, b) => {
    if (a.peerAddress === WELCOME_ROUTE_ID) return -1;
    if (b.peerAddress === WELCOME_ROUTE_ID) return 1;
    return (b.lastTs || 0) - (a.lastTs || 0);
  });

  let listHtml = "";
  if (!sorted.length) {
    listHtml = `<div class="empty"><p>Nenhuma conversa privada ainda.</p></div>`;
  } else {
    const items = sorted
      .map((c) => {
        const peer = c.peerAddress || "";
        const label =
          profileDirectory.getAuthorDisplaySync(peer) || (peer === WELCOME_ROUTE_ID ? getWelcomeProfile().name : shortId(peer));
        const timeStr = c.lastTs ? new Date(c.lastTs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
        const pin = peer === WELCOME_ROUTE_ID ? `<span class="badge-pill" style="font-size:0.65rem;">Boas-vindas</span> ` : "";
        const avInner = renderAvatarHtml(peer, label);
        return `
          <a class="dm-inbox-item" href="#/dm/${encodeURIComponent(peer)}">
            <div class="dm-inbox-avatar">${avInner}</div>
            <div class="dm-inbox-body">
              <div class="dm-inbox-header">
                <span class="dm-inbox-peer">${pin}${escapeHtml(label)}</span>
                <span class="meta" style="font-size:0.75rem;">${timeStr}</span>
              </div>
              <p class="dm-inbox-preview">${escapeHtml(c.lastText)}</p>
            </div>
          </a>`;
      })
      .join("");
    listHtml = `<div class="dm-inbox-list">${items}</div>`;
  }

  const contactChips =
    contactList.length === 0
      ? ""
      : `<div class="card" style="margin-top:0.5rem; padding:0.55rem 0.75rem;">
          <span class="section-title" style="font-size:0.82rem;">Contatos</span>
          <div style="display:flex; flex-wrap:wrap; gap:0.35rem; margin-top:0.35rem;">
            ${contactList
              .slice(0, 12)
              .map((c) => {
                const label = c.label || profileDirectory.getAuthorDisplaySync(c.routeId) || shortId(c.routeId);
                return `<a class="btn btn-sm btn-outline" href="#/dm/${encodeURIComponent(c.routeId)}">${escapeHtml(label)}</a>`;
              })
              .join("")}
          </div>
        </div>`;

  const datalistOptions = contactList
    .map((c) => {
      const label = c.label || profileDirectory.getAuthorDisplaySync(c.routeId) || "";
      return `<option value="${escapeHtml(c.routeId)}">${escapeHtml(label)}</option>`;
    })
    .join("");

  main.innerHTML = `
    <div class="card">
      <h2 style="margin:0 0 2px;">Mensagens</h2>
      <p class="desc" style="margin:0 0 8px;">Privadas. Só neste aparelho. Criptografia ponta a ponta sem nuvem.</p>
      
      <div style="background:var(--surface-soft); border:1px solid var(--border); padding:8px 12px; border-radius:var(--radius-sm); margin:8px 0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
        <span class="meta" style="font-size:0.8rem;">Seu link de mensagens: <code>${escapeHtml(shortId(myAddress))}</code></span>
        <button id="btn-copy-my-dm-link" class="btn btn-sm btn-outline" data-route="${escapeHtml(myAddress)}">📋 Copiar Link</button>
      </div>

      <form id="form-new-dm" style="display:flex; gap:0.5rem; margin-top:0.75rem;">
        <input type="text" id="dm-peer-input" class="form-control" list="dm-contact-suggestions" placeholder="vx_…, #/connect/… ou contato" required />
        <datalist id="dm-contact-suggestions">${datalistOptions}</datalist>
        <button type="submit" class="btn btn-primary" style="white-space:nowrap;">Conversar →</button>
      </form>
    </div>
    ${contactChips}

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

export function renderTagFeed(main, slug, posts = []) {
  if (!main) return;
  const cleanSlug = hashtags.slugifyTag(slug) || slug;
  const count = posts ? posts.length : 0;
  const countLabel = count === 1 ? "1 post no seu índice" : `${count} posts no seu índice`;

  const headerHtml = `
    <header class="page-header tag-feed-header">
      <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.25rem;">
        <a class="back-link" href="#/" style="margin-bottom:0;">← Início</a>
      </div>
      <h2 class="tag-title" style="margin:0.25rem 0 0.15rem; font-size:1.5rem; display:flex; align-items:center; gap:6px;">
        <span class="tag-hash" style="color:var(--accent);">#</span><span>${escapeHtml(cleanSlug)}</span>
      </h2>
      <div class="tag-meta" style="font-size:0.82rem; color:var(--muted); display:flex; gap:0.75rem; align-items:center;">
        <span>📦 ${escapeHtml(countLabel)}</span>
        <span>·</span>
        <span>Descoberta local gossip (Willow)</span>
      </div>
    </header>
  `;

  if (!posts || posts.length === 0) {
    main.innerHTML = `
      ${headerHtml}
      <div class="empty-state card" style="text-align:center; padding:2.5rem 1.5rem; margin-top:1rem;">
        <div style="font-size:2rem; margin-bottom:0.5rem;">🔍</div>
        <h3 style="margin:0 0 0.5rem; font-size:1.1rem;">Nenhum post com #${escapeHtml(cleanSlug)} no seu índice ainda</h3>
        <p style="color:var(--muted); font-size:0.88rem; max-width:400px; margin:0 auto 1.25rem;">
          No Vox, o índice vive no seu próprio dispositivo. Quando você ou alguém conectado na rede compartilhar posts com esta tag, eles aparecerão aqui.
        </p>
        <a class="btn btn-primary btn-sm" href="#/compose/topic">Criar post com #${escapeHtml(cleanSlug)}</a>
      </div>
    `;
    return;
  }

  const postsHtml = posts.map((p) => renderPostItem(p)).join("");
  main.innerHTML = `
    ${headerHtml}
    <div class="posts-list tag-posts-list" style="margin-top:1rem;">
      ${postsHtml}
    </div>
  `;
}

function renderPolisStatementItem(s) {
  const agreePct = Math.round(Number(s.agreePct) || 0);
  const disagreePct = Math.round(Number(s.disagreePct) || 0);
  const passPct = Math.round(Number(s.passPct) || 0);

  let badge = "";
  if (s.isBridge || s.evaluation?.isConsensusBridge) {
    badge = `<span class="badge-pill consensus-bridge" style="background:var(--success-soft, #e6f4ea); color:var(--success, #137333); font-size:0.75rem; font-weight:700;">★ Ponte de Consenso</span>`;
  } else if (s.isDivisive || s.evaluation?.isDivisive) {
    badge = `<span class="badge-pill divisive-point" style="background:var(--warning-soft, #fef7e0); color:var(--warning, #b06000); font-size:0.75rem; font-weight:700;">⚡ Ponto Divisivo</span>`;
  }

  return `
    <div class="polis-statement-card card" style="margin-bottom:0.75rem; padding:12px 14px;" data-statement-id="${escapeHtml(s.id)}">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:6px;">
        <p class="post-body" style="margin:0; font-weight:600;">${escapeHtml(s.text)}</p>
        ${badge}
      </div>
      <div class="polis-vote-bar" style="height:8px; display:flex; border-radius:4px; overflow:hidden; background:var(--surface-soft); margin:8px 0 4px;">
        <div style="width:${agreePct}%; background:var(--success, #137333);" title="Concordo: ${agreePct}%"></div>
        <div style="width:${passPct}%; background:var(--muted, #80868b);" title="Neutro: ${passPct}%"></div>
        <div style="width:${disagreePct}%; background:var(--danger, #c5221f);" title="Discordo: ${disagreePct}%"></div>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--muted);">
        <span>👍 Concordo: ${agreePct}%</span>
        <span>⚪ Neutro: ${passPct}%</span>
        <span>👎 Discordo: ${disagreePct}%</span>
      </div>
    </div>`;
}

export function renderPolisReportHtml(report, userVotes = {}) {
  if (!report || !Array.isArray(report.statements)) return "";
  const totalVoters = report.totalVoters || 0;
  const bridgesCount = (report.bridgeStatements || report.consensusBridges)?.length || 0;
  const divisiveCount = report.divisiveStatements?.length || 0;

  const header = `
    <div class="polis-report-header" style="margin-bottom:1rem; padding-bottom:0.75rem; border-bottom:1px solid var(--border);">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <span class="badge-pill p2p-pill">🗳️ Deliberação Pol.is-lite</span>
        <span class="meta">${totalVoters} participantes • ${report.totalStatements || report.statements.length} afirmações</span>
      </div>
      <div style="display:flex; gap:8px; margin-top:8px;">
        <span class="badge-pill" style="background:var(--success-soft, #e6f4ea); color:var(--success, #137333); font-weight:700;">★ ${bridgesCount} Pontes de Consenso</span>
        <span class="badge-pill" style="background:var(--warning-soft, #fef7e0); color:var(--warning, #b06000); font-weight:700;">⚡ ${divisiveCount} Pontos Divisivos</span>
      </div>
    </div>`;

  const items = report.statements.map((s) => renderPolisStatementItem(s)).join("");
  return `<div class="polis-deliberation-wrap">${header}${items}</div>`;
}
