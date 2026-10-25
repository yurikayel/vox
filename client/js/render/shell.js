/** @file App shell, sidebar, feed nav, loading/error banners. */
import * as mock from "../mock.js";
import { appShellFooterTagline } from "../i18n-pt-br.js";
import { escapeHtml, root } from "./util.js";

/** Light theme: navy tile; dark theme: white tile — clipped by `.brand-mark` squircle. */
const BRAND_MARK_LIGHT = "icons/icon-512.png";
const BRAND_MARK_DARK = "icons/icon-white-512.png";

export function brandMarkSrcForColorScheme(dark) {
  return dark ? BRAND_MARK_DARK : BRAND_MARK_LIGHT;
}

function renderBrandLink() {
  return `<a class="brand-link" href="#/" aria-label="Vox — início"><img class="brand-logo brand-mark" src="${BRAND_MARK_LIGHT}" width="32" height="32" alt="" decoding="async" /><span class="brand-word">Vox</span></a>`;
}

let brandMarkThemeBound = false;

function syncBrandMarkTheme() {
  const img = document.querySelector(".sidebar-brand .brand-mark");
  if (!img) return;
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  img.src = brandMarkSrcForColorScheme(dark);
}

function attachBrandMarkTheme() {
  syncBrandMarkTheme();
  if (brandMarkThemeBound) return;
  brandMarkThemeBound = true;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => syncBrandMarkTheme();
  if (typeof mq.addEventListener === "function") mq.addEventListener("change", onChange);
  else mq.addListener(onChange);
}

const ICONS = {
  home: `<svg class="tab-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  communities: `<svg class="tab-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  people: `<svg class="tab-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>`,
  feedForYou: `<svg class="tab-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 14.5 8.5 20 9l-4 3.5L17 18l-5-3-5 3 1-5.5L4 9l5.5-.5Z"/></svg>`,
  following: `<svg class="tab-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>`,
  compose: `<svg class="tab-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
  dm: `<svg class="tab-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  profile: `<svg class="tab-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  voxpedia: `<svg class="tab-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`,
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
        <span class="sidebar-feed-icon" aria-hidden="true">${ICONS.feedForYou}</span>
        <span class="sidebar-feed-label">Para você</span>
      </a>
      <a href="#/?feed=following" class="sidebar-feed-tab ${!isForYou ? "active" : ""}"${!isForYou ? ' aria-current="page"' : ""}>
        <span class="sidebar-feed-icon" aria-hidden="true">${ICONS.following}</span>
        <span class="sidebar-feed-label">Seguindo</span>
      </a>
    </nav>`;
}

function renderFeedNavSlot(showFeedNav, activeFeed) {
  const inner = showFeedNav ? renderFeedNav(activeFeed) : "";
  const hidden = showFeedNav ? "" : ' hidden aria-hidden="true"';
  return `<div class="sidebar-feed-slot"${hidden}>${inner}</div>`;
}

const SIDEBAR_SYNC_PLACEHOLDER = "\u00a0";

function renderSidebarFooter(chipHtml, walletBadge) {
  return `
        <div class="sidebar-footer">
          <div class="sidebar-sync-slot">
            <span class="sidebar-sync-hint" id="top-sync-hint" aria-live="polite">${SIDEBAR_SYNC_PLACEHOLDER}</span>
          </div>
          <div class="sidebar-network-slot">${chipHtml}</div>
          <div class="sidebar-account-slot">${walletBadge}</div>
        </div>`;
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
  const isVoxpedia = activeTab === "voxpedia";
  const feedSlot = renderFeedNavSlot(showFeedNav, activeFeed);

  return `
    <div class="sidebar-backdrop" id="sidebar-backdrop" hidden aria-hidden="true"></div>
    <aside class="app-sidebar tab-bar" id="app-sidebar" aria-label="Navegação principal">
      <div class="sidebar-brand">
        ${renderBrandLink()}
      </div>
      <div class="sidebar-scroll">
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
            <span class="tab-icon">${ICONS.people}</span>
            <span class="tab-label">Pessoas</span>
          </a>
          <a href="#/dm" class="tab-item ${isDm ? "active" : ""}"${isDm ? ' aria-current="page"' : ""}>
            <span class="tab-icon">${ICONS.dm}</span>
            <span class="tab-label">Mensagens</span>
          </a>
          <a href="#/perfil" class="tab-item ${isProfile ? "active" : ""}"${isProfile ? ' aria-current="page"' : ""}>
            <span class="tab-icon">${ICONS.profile}</span>
            <span class="tab-label">Perfil</span>
          </a>
          <a href="#/voxpedia" class="tab-item ${isVoxpedia ? "active" : ""}"${isVoxpedia ? ' aria-current="page"' : ""}>
            <span class="tab-icon">${ICONS.voxpedia}</span>
            <span class="tab-label">Voxpedia</span>
          </a>
        </nav>
        <div class="sidebar-compose-slot">
          <a href="#/compose/topic" class="tab-item compose-tab ${isCompose ? "active" : ""}"${isCompose ? ' aria-current="page"' : ""}>
            <span class="tab-icon">${ICONS.compose}</span>
            <span class="tab-label">Postar</span>
          </a>
        </div>
        ${feedSlot}
      </div>
      ${renderSidebarFooter(chipHtml, walletBadge)}
      <button type="button" class="sidebar-collapse-btn" id="sidebar-collapse-btn" aria-expanded="true" aria-controls="app-sidebar" aria-label="Recolher ou expandir menu">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
    </aside>`;
}

export function updateTopBarSync(active, detail = "") {
  const el = document.getElementById("top-sync-hint");
  if (!el) return;
  if (active) {
    el.classList.add("is-active");
    el.textContent = detail || "Sincronizando…";
  } else {
    el.classList.remove("is-active");
    el.textContent = SIDEBAR_SYNC_PLACEHOLDER;
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

  root().innerHTML = `
    <div class="app-layout">
      ${sidebarHtml}
      <div class="main-column">
        <main id="app-main"></main>
        <footer class="app-footer">Vox · ${escapeHtml(appShellFooterTagline)} · <a href="./proposta-vox.html" target="_blank">Proposta</a></footer>
      </div>
    </div>
  `;

  attachSidebarBehavior();
  attachBrandMarkTheme();
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

