/** @file App shell, sidebar, feed nav, loading/error banners. */
import * as mock from "../mock.js";
import {
  colorModeLabel,
  colorModeToggleHint,
  cycleColorMode,
  readColorMode,
  writeColorMode,
  applyColorModeToRoot,
} from "../color-mode.js";
import { applySkyTheme } from "../sky-theme.js";
import { appShellFooterTagline } from "../i18n-pt-br.js";
import * as localAccount from "../local-account.js";
import { escapeHtml, root, shortId, renderAvatarHtml } from "./util.js";

/** Squircle branco + X azul — mesmo asset em claro/escuro (sem tile navy na shell). */
export const BRAND_MARK_SRC = "icons/icon-white-512.png";

export function brandMarkSrcForColorScheme(_dark) {
  return BRAND_MARK_SRC;
}

function renderHomeIcon() {
  return `<img class="brand-logo brand-mark tab-brand-mark" src="${BRAND_MARK_SRC}" width="22" height="22" alt="" decoding="async" />`;
}

const ICONS = {
  vote: `<svg class="tab-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 12 2 2 4-4"/><path d="M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7Z"/><path d="M22 19H2"/></svg>`,
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
    return `<a class="network-chip paused" href="#/settings/network" title="Modo somente leitura · Toque para configurar" aria-label="Rede em modo somente leitura"><span class="chip-dot"></span><span>Só leitura</span></a>`;
  }
  const isOnline = rtcStatus?.isOnline !== false && (typeof navigator === "undefined" || navigator.onLine !== false);
  if (!isOnline) {
    return `<a class="network-chip offline" href="#/settings/network" title="Dispositivo sem conexão à internet" aria-label="Rede offline"><span class="chip-dot"></span><span>Offline</span></a>`;
  }
  const rtcCount = rtcStatus?.remotePeersConnected || 0;
  let text = "Rede ativa";
  if (rtcCount > 0) {
    text = `${rtcCount} ${rtcCount === 1 ? "aparelho" : "aparelhos"}`;
  } else if (metrics?.blobsServed > 0) {
    text = `${metrics.blobsServed} entregues`;
  }
  return `<a class="network-chip active" href="#/settings/network" title="Sua rede está ajudando outros aparelhos" aria-label="Status da rede: ${escapeHtml(text)}"><span class="chip-dot"></span><span>${escapeHtml(text)}</span></a>`;
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
  const isForYou = activeFeed === "for-you";
  const isFollowing = activeFeed === "following";
  const isExternal = activeFeed === "external";
  const isAll = activeFeed === "all";
  return `
    <nav class="sidebar-feed-nav" aria-label="Alternar feed">
      <a href="#/" class="sidebar-feed-tab ${isForYou ? "active" : ""}"${isForYou ? ' aria-current="page"' : ""}>
        <span class="sidebar-feed-icon" aria-hidden="true">${ICONS.feedForYou}</span>
        <span class="sidebar-feed-label">Para você</span>
      </a>
      <a href="#/?feed=following" class="sidebar-feed-tab ${isFollowing ? "active" : ""}"${isFollowing ? ' aria-current="page"' : ""}>
        <span class="sidebar-feed-icon" aria-hidden="true">${ICONS.following}</span>
        <span class="sidebar-feed-label">Seguindo</span>
      </a>
      <a href="#/?feed=external" class="sidebar-feed-tab ${isExternal ? "active" : ""}"${isExternal ? ' aria-current="page"' : ""}>
        <span class="sidebar-feed-icon" aria-hidden="true">🌐</span>
        <span class="sidebar-feed-label">Redes (Bluesky)</span>
      </a>
      <a href="#/?feed=all" class="sidebar-feed-tab ${isAll ? "active" : ""}"${isAll ? ' aria-current="page"' : ""}>
        <span class="sidebar-feed-icon" aria-hidden="true">🔀</span>
        <span class="sidebar-feed-label">Tudo</span>
      </a>
    </nav>`;
}

function renderFeedNavSlot(showFeedNav, activeFeed) {
  const inner = showFeedNav ? renderFeedNav(activeFeed) : "";
  const hidden = showFeedNav ? "" : ' hidden aria-hidden="true"';
  return `<div class="sidebar-feed-slot"${hidden}>${inner}</div>`;
}

const SIDEBAR_SYNC_PLACEHOLDER = "\u00a0";

const THEME_ICONS = {
  auto: `<svg class="theme-mode-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 2v20M2 12h20"/></svg>`,
  light: `<svg class="theme-mode-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`,
  dark: `<svg class="theme-mode-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
};

function renderThemeModeToggle(mode) {
  const m = mode === "light" || mode === "dark" ? mode : "auto";
  const label = colorModeLabel(m);
  return `<button type="button" class="theme-mode-toggle" id="theme-mode-toggle" aria-label="${escapeHtml(colorModeToggleHint(m))}">
          <span class="theme-mode-icon">${THEME_ICONS[m]}</span>
          <span class="theme-mode-label">${escapeHtml(label)}</span>
        </button>`;
}

function syncThemeModeToggleUi(btn, mode) {
  const m = mode === "light" || mode === "dark" ? mode : "auto";
  btn.setAttribute("aria-label", colorModeToggleHint(m));
  const icon = btn.querySelector(".theme-mode-icon");
  const label = btn.querySelector(".theme-mode-label");
  if (icon) icon.innerHTML = THEME_ICONS[m];
  if (label) label.textContent = colorModeLabel(m);
}

function attachThemeModeToggle() {
  const btn = document.getElementById("theme-mode-toggle");
  if (!btn || btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";
  btn.addEventListener("click", () => {
    const storage = window.localStorage;
    const next = cycleColorMode(readColorMode(storage));
    writeColorMode(storage, next);
    applyColorModeToRoot(document.documentElement, next);
    applySkyTheme(document);
    syncThemeModeToggleUi(btn, next);
  });
}

function renderSidebarFooter(chipHtml, walletBadge) {
  const themeToggle = renderThemeModeToggle(readColorMode(typeof localStorage !== "undefined" ? localStorage : null));
  return `
        <div class="sidebar-footer">
          <div class="sidebar-theme-slot">${themeToggle}</div>
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

/**
 * Itens de navegação primária (Stitch / ADR-016): Ágora, Vote, Comunidades, Mensagens, Perfil.
 * Pessoas e Voxpedia são secundários — ficam no menu lateral do desktop e na gaveta de identidade
 * no celular (a barra inferior mostra só os cinco primários).
 */
const NAV_ITEMS = [
  { tab: "home", href: "#/", label: "Ágora", icon: () => renderHomeIcon() },
  { tab: "vote", href: "#/vote", label: "Vote", icon: () => ICONS.vote },
  { tab: "communities", href: "#/communities", label: "Comunidades", icon: () => ICONS.communities },
  { tab: "dm", href: "#/dm", label: "Mensagens", icon: () => ICONS.dm },
  { tab: "profile", href: "#/perfil", label: "Perfil", icon: () => ICONS.profile, alias: ["wallet"] },
  { tab: "people", href: "#/people", label: "Pessoas", icon: () => ICONS.people, secondary: true },
  { tab: "voxpedia", href: "#/voxpedia", label: "Voxpedia", icon: () => ICONS.voxpedia, secondary: true },
];

function renderSidebarNav(activeTab) {
  return NAV_ITEMS.map((item) => {
    const isActive = activeTab === item.tab || (item.alias || []).includes(activeTab);
    const cls = ["tab-item", isActive ? "active" : "", item.secondary ? "tab-item--secondary" : ""].filter(Boolean).join(" ");
    return `<a href="${item.href}" class="${cls}"${isActive ? ' aria-current="page"' : ""} aria-label="${item.label}">
      <span class="tab-icon">${item.icon()}</span><span class="tab-label">${item.label}</span>
    </a>`;
  }).join("\n    ");
}

function renderAgoraWordmark() {
  return `<a href="#/" class="agora-wordmark" aria-label="Vox — Ágora">
      <img class="agora-wordmark-mark" src="${BRAND_MARK_SRC}" width="28" height="28" alt="" decoding="async" />
      <span class="agora-wordmark-text">VOX</span>
    </a>`;
}

function readIdentitySummary(walletAddress) {
  const enrichment = localAccount.getProfileEnrichment?.() || {};
  const displayName = localAccount.getDisplayName?.() || enrichment.displayName || (walletAddress ? mock.getAuthorDisplay(walletAddress) : "") || "";
  return {
    address: walletAddress || "",
    displayName: displayName || (walletAddress ? "Cidadão" : "Visitante"),
    avatarUrl: enrichment.avatarUrl || "",
  };
}

function renderIdentityChip(identity, chipText) {
  const avatar = identity.address
    ? renderAvatarHtml(identity.address, identity.displayName, "agora-topbar-avatar", identity.avatarUrl)
    : `<span class="avatar agora-topbar-avatar">${ICONS.profile}</span>`;
  const sub = identity.address ? shortId(identity.address) : "sem conta";
  return `<button type="button" class="agora-identity-chip" id="agora-identity-toggle" aria-haspopup="dialog" aria-controls="agora-identity-drawer" aria-expanded="false" aria-label="Identidade e rede">
      <span class="agora-identity-text">
        <span class="agora-identity-name"><span class="agora-presence-dot" aria-hidden="true"></span>${escapeHtml(identity.displayName)}</span>
        <span class="agora-identity-key">${escapeHtml(sub)} · ${escapeHtml(chipText)}</span>
      </span>
      ${avatar}
    </button>`;
}

function renderTopBar(identity, chipText) {
  return `
    <header class="agora-topbar" role="banner">
      <div class="agora-topbar-brand">${renderAgoraWordmark()}</div>
      <form class="agora-search" role="search" id="agora-search-form" action="#/people">
        <svg class="agora-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input type="search" name="q" id="agora-search-input" placeholder="Buscar pessoas e cidadãos…" aria-label="Buscar pessoas" autocomplete="off" />
      </form>
      <a href="#/vote" class="agora-btn agora-btn--ghost agora-topbar-vote">${ICONS.vote}<span>Votar agora</span></a>
      ${renderIdentityChip(identity, chipText)}
    </header>`;
}

function renderIdentityDrawer(identity, chipHtml) {
  const keyRow = identity.address
    ? `<div class="agora-drawer-key"><span class="agora-label">ID na rede</span><code class="agora-mono">${escapeHtml(identity.address)}</code><button type="button" class="agora-link-btn" id="agora-copy-id">Copiar</button></div>`
    : `<p class="agora-muted">Você ainda não criou uma identidade neste aparelho.</p>`;
  return `
    <div class="agora-drawer-backdrop" id="agora-drawer-backdrop" hidden></div>
    <aside class="agora-drawer" id="agora-identity-drawer" role="dialog" aria-modal="true" aria-label="Identidade e rede" hidden>
      <div class="agora-drawer-head">
        <div>
          <p class="agora-title-monument">Identidade</p>
          <h2 class="agora-drawer-name">${escapeHtml(identity.displayName)}</h2>
        </div>
        <button type="button" class="agora-icon-btn" id="agora-drawer-close" aria-label="Fechar">✕</button>
      </div>
      ${keyRow}
      <section class="agora-drawer-section">
        <p class="agora-title-monument">Rede deste aparelho</p>
        <div class="agora-drawer-network">${chipHtml}</div>
        <a class="agora-drawer-link" href="#/status">Saúde do nó e aparelhos conectados<span aria-hidden="true">›</span></a>
        <a class="agora-drawer-link" href="#/settings/network">Configurar participação na rede<span aria-hidden="true">›</span></a>
      </section>
      <section class="agora-drawer-section">
        <p class="agora-title-monument">Opções da identidade</p>
        <a class="agora-drawer-link" href="#/perfil">Ver e editar perfil<span aria-hidden="true">›</span></a>
        <a class="agora-drawer-link" href="#/settings/linked-accounts">Contas vinculadas<span aria-hidden="true">›</span></a>
        <a class="agora-drawer-link agora-drawer-link--mobile" href="#/people">Pessoas<span aria-hidden="true">›</span></a>
        <a class="agora-drawer-link agora-drawer-link--mobile" href="#/voxpedia">Voxpedia<span aria-hidden="true">›</span></a>
      </section>
    </aside>`;
}

function attachTopBarSearch() {
  const form = document.getElementById("agora-search-form");
  if (!form || form.dataset.bound === "1") return;
  form.dataset.bound = "1";
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = document.getElementById("agora-search-input")?.value.trim() || "";
    location.hash = q ? `#/people?q=${encodeURIComponent(q)}` : "#/people";
  });
}

function attachCopyIdentityButton(drawer) {
  document.getElementById("agora-copy-id")?.addEventListener("click", async (e) => {
    const code = drawer.querySelector(".agora-drawer-key code")?.textContent || "";
    try {
      await navigator.clipboard.writeText(code);
      e.target.textContent = "Copiado";
    } catch {
      e.target.textContent = "Selecione e copie";
    }
  });
}

function attachTopBarBehavior() {
  attachTopBarSearch();
  const toggle = document.getElementById("agora-identity-toggle");
  const drawer = document.getElementById("agora-identity-drawer");
  const backdrop = document.getElementById("agora-drawer-backdrop");
  if (!toggle || !drawer || toggle.dataset.bound === "1") return;
  toggle.dataset.bound = "1";
  const setOpen = (open) => {
    drawer.hidden = !open;
    if (backdrop) backdrop.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) document.getElementById("agora-drawer-close")?.focus();
  };
  toggle.addEventListener("click", () => setOpen(drawer.hidden));
  backdrop?.addEventListener("click", () => setOpen(false));
  document.getElementById("agora-drawer-close")?.addEventListener("click", () => { setOpen(false); toggle.focus(); });
  drawer.addEventListener("keydown", (e) => { if (e.key === "Escape") { setOpen(false); toggle.focus(); } });
  drawer.addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });
  attachCopyIdentityButton(drawer);
}

function networkChipText(chipHtml) {
  const m = chipHtml.match(/<span>([^<]*)<\/span><\/a>$/);
  return m ? m[1] : "Rede";
}

function renderSidebar(activeTab, { showFeedNav, activeFeed, chipHtml, walletBadge }) {
  const isCompose = activeTab === "compose";
  const feedSlot = renderFeedNavSlot(showFeedNav, activeFeed);

  return `
    <div class="sidebar-backdrop" id="sidebar-backdrop" hidden aria-hidden="true"></div>
    <aside class="app-sidebar tab-bar" id="app-sidebar" aria-label="Navegação principal">
      <div class="sidebar-scroll">
        <div class="agora-sidebar-brand">${renderAgoraWordmark()}</div>
        <nav class="tab-nav" aria-label="Seções">
          ${renderSidebarNav(activeTab)}
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

function renderShellMarkup({ activeTab, sidebarHtml, identity, chipHtml }) {
  return `
    <div class="app-layout agora-ui" data-active-tab="${escapeHtml(activeTab)}">
      ${sidebarHtml}
      <div class="main-column">
        ${renderTopBar(identity, networkChipText(chipHtml))}
        <main id="app-main"></main>
        <footer class="app-footer">Vox · ${escapeHtml(appShellFooterTagline)} · <a href="#/ajuda/teste">Teste aberto</a> · <a href="./proposta-vox.html" target="_blank">Proposta</a></footer>
      </div>
    </div>
    ${renderIdentityDrawer(identity, chipHtml)}
  `;
}

function attachShellBehaviors() {
  attachSidebarBehavior();
  attachThemeModeToggle();
  attachTopBarBehavior();
}

export function renderShell({
  title: _title,
  subtitle: _subtitle,
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
  const sidebarHtml = renderSidebar(activeTab, { showFeedNav, activeFeed, chipHtml, walletBadge: renderWalletBadge(walletAddress) });
  const identity = readIdentitySummary(walletAddress);

  root().innerHTML = renderShellMarkup({ activeTab, sidebarHtml, identity, chipHtml });

  attachShellBehaviors();
  const main = document.getElementById("app-main");
  if (breadcrumb) main.insertAdjacentHTML("afterbegin", breadcrumb);
  return main;
}

/**
 * Cabeçalho de página no padrão Stitch (título epigráfico + subtítulo + ações).
 * @param {{ kicker?: string, title: string, subtitle?: string, actionsHtml?: string, id?: string }} opts
 */
export function renderPageHead({ kicker = "", title, subtitle = "", actionsHtml = "", id = "" }) {
  const kickerHtml = kicker ? `<p class="agora-kicker"><span class="agora-presence-dot" aria-hidden="true"></span>${escapeHtml(kicker)}</p>` : "";
  const subHtml = subtitle ? `<p class="agora-page-sub">${escapeHtml(subtitle)}</p>` : "";
  const actions = actionsHtml ? `<div class="agora-page-actions">${actionsHtml}</div>` : "";
  return `
    <header class="agora-page-head"${id ? ` id="${escapeHtml(id)}"` : ""}>
      <div class="agora-page-head-text">
        ${kickerHtml}
        <h1 class="agora-page-title">${escapeHtml(title)}</h1>
        ${subHtml}
      </div>
      ${actions}
    </header>`;
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

