/** @file App shell, sidebar, feed nav, loading/error banners. */
import * as mock from "../mock.js";
import { getFlags } from "../feature-flags.js";
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
import { escapeHtml, root, renderAvatarHtml } from "./util.js";

/** Squircle branco + X azul — mesmo asset em claro/escuro (sem tile navy na shell). */
export const BRAND_MARK_SRC = "icons/logo-mark.png";

export function brandMarkSrcForColorScheme(_dark) {
  return BRAND_MARK_SRC;
}

/** Ícones de linha no vocabulário Stitch (Material Symbols outline, traço 1.75). */
const svg = (body, cls = "tab-svg", size = 22) =>
  `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const ICONS = {
  agora: svg(`<path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/>`),
  vote: svg(`<path d="m9 12 2 2 4-4"/><path d="M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7Z"/><path d="M22 19H2"/>`),
  communities: svg(`<circle cx="12" cy="12" r="2.2"/><circle cx="5" cy="5" r="1.8"/><circle cx="19" cy="5" r="1.8"/><circle cx="5" cy="19" r="1.8"/><circle cx="19" cy="19" r="1.8"/><path d="M6.4 6.4 10.4 10.4M17.6 6.4l-4 4M6.4 17.6l4-4M17.6 17.6l-4-4"/>`),
  lock: svg(`<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/><path d="M12 15v2"/>`),
  badge: svg(`<rect x="3" y="6" width="18" height="15" rx="2"/><path d="M9 6V3h6v3"/><circle cx="9" cy="13" r="2"/><path d="M6 18c.5-1.4 1.7-2.3 3-2.3s2.5.9 3 2.3"/><path d="M15 12h3M15 15h3"/>`),
  shield: svg(`<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>`, "agora-topbar-svg", 20),
  gear: svg(`<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>`, "agora-topbar-svg", 20),
  dmTop: svg(`<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>`, "agora-topbar-svg", 20),
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
  const isCivic = activeFeed === "civic";
  const isFollowing = activeFeed === "following";
  const isExternal = activeFeed === "external";
  const isAll = activeFeed === "all";
  return `
    <nav class="sidebar-feed-nav" aria-label="Alternar feed">
      <a href="#/" class="sidebar-feed-tab ${isForYou ? "active" : ""}"${isForYou ? ' aria-current="page"' : ""}>
        <span class="sidebar-feed-icon" aria-hidden="true">${ICONS.agora}</span>
        <span class="sidebar-feed-label">Social</span>
      </a>
      <a href="#/?feed=civic" class="sidebar-feed-tab ${isCivic ? "active" : ""}"${isCivic ? ' aria-current="page"' : ""}>
        <span class="sidebar-feed-icon" aria-hidden="true">${ICONS.vote}</span>
        <span class="sidebar-feed-label">Cívico</span>
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
  { tab: "home", href: "#/", label: "Ágora", icon: () => ICONS.agora },
  { tab: "vote", href: "#/vote", label: "Vote", icon: () => ICONS.vote },
  { tab: "communities", href: "#/communities", label: "Comunidades", icon: () => ICONS.communities },
  { tab: "dm", href: "#/dm", label: "Mensagens", icon: () => ICONS.lock },
  { tab: "profile", href: "#/perfil", label: "Perfil", icon: () => ICONS.badge, alias: ["wallet"] },
  { tab: "people", href: "#/people", label: "Pessoas", icon: () => ICONS.people, secondary: true },
  { tab: "voxpedia", href: "#/voxpedia", label: "Voxpedia", icon: () => ICONS.voxpedia, secondary: true },
];

const DM_BADGE_HTML = `<span class="agora-dm-badge" data-dm-badge hidden aria-hidden="true"></span>`;

/** Total de mensagens recebidas e não lidas, somando todas as conversas. */
export function sumUnreadDms(conversations = []) {
  return conversations.reduce((acc, c) => acc + (Number(c?.unreadCount) || 0), 0);
}

/** Texto do contador: vazio quando zero, "99+" acima de 99. */
export function formatDmBadge(count) {
  const n = Number(count) || 0;
  if (n <= 0) return "";
  return n > 99 ? "99+" : String(n);
}

function applyDmBadge(count) {
  const label = formatDmBadge(count);
  document.querySelectorAll("[data-dm-badge]").forEach((el) => {
    el.textContent = label;
    el.hidden = !label;
  });
  document.querySelectorAll('a[href="#/dm"]').forEach((a) => {
    const base = "Mensagens";
    a.setAttribute("aria-label", label ? `${base} · ${count} não ${count === 1 ? "lida" : "lidas"}` : base);
  });
}

async function refreshDmBadge() {
  try {
    const cacheNode = await import("../cache-node.js");
    applyDmBadge(sumUnreadDms(await cacheNode.getDmConversations()));
  } catch {
    /* sem IndexedDB: contador fica oculto */
  }
}

let dmBadgeListenerBound = false;

function bindDmBadge() {
  void refreshDmBadge();
  if (dmBadgeListenerBound || typeof window?.addEventListener !== "function") return;
  dmBadgeListenerBound = true;
  window.addEventListener("vox:dm-changed", () => { void refreshDmBadge(); });
}

function renderSidebarNav(activeTab) {
  return NAV_ITEMS.map((item) => {
    const isActive = activeTab === item.tab || (item.alias || []).includes(activeTab);
    const cls = ["tab-item", isActive ? "active" : "", item.secondary ? "tab-item--secondary" : ""].filter(Boolean).join(" ");
    return `<a href="${item.href}" class="${cls}" data-tab="${item.tab}"${isActive ? ' aria-current="page"' : ""} aria-label="${item.label}">
      <span class="tab-icon">${item.icon()}</span><span class="tab-label">${item.label}</span>${item.tab === "dm" ? DM_BADGE_HTML : ""}
    </a>`;
  }).join("\n    ");
}

function renderAgoraWordmark() {
  return `<a href="#/" class="agora-wordmark" aria-label="Vox — Ágora">
      <img class="agora-wordmark-mark" src="${BRAND_MARK_SRC}" width="28" height="28" alt="" decoding="async" />
      <span class="agora-wordmark-text" aria-label="VOX"><span class="agora-wordmark-v">V</span><span class="agora-wordmark-o">O</span><span class="agora-wordmark-x">X</span></span>
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
  return `<button type="button" class="agora-identity-chip" id="agora-identity-toggle" aria-haspopup="dialog" aria-controls="agora-identity-drawer" aria-expanded="false" aria-label="Identidade e rede · ${escapeHtml(chipText)}">
      <span class="agora-identity-text">
        <span class="agora-identity-name">${escapeHtml(identity.displayName)}</span>
      </span>
      ${avatar}
    </button>`;
}

function meshChipState(chipHtml) {
  if (chipHtml.includes("network-chip offline")) return { cls: "is-offline", label: "Offline" };
  if (chipHtml.includes("network-chip paused")) return { cls: "is-paused", label: "Só leitura" };
  return { cls: "is-active", label: "Malha ativa" };
}

function renderTopBar(identity, chipText, chipHtml) {
  const mesh = meshChipState(chipHtml);
  return `
    <header class="agora-topbar" role="banner">
      <div class="agora-topbar-brand">${renderAgoraWordmark()}</div>
      <form class="agora-search" role="search" id="agora-search-form" action="#/people">
        <svg class="agora-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input type="search" name="q" id="agora-search-input" placeholder="Buscar cidadãos, @arrobas ou chaves cívicas…" aria-label="Buscar pessoas" autocomplete="off" />
      </form>
      <div class="agora-topbar-tools">
        <a href="#/status" class="agora-mesh-chip ${mesh.cls}" title="${escapeHtml(chipText)}"><span class="agora-presence-dot" aria-hidden="true"></span><span>${escapeHtml(mesh.label)}</span></a>
        <a href="#/dm" class="agora-topbar-icon agora-topbar-icon--mobile" aria-label="Mensagens">${ICONS.dmTop}${DM_BADGE_HTML}</a>
        <a href="#/status" class="agora-topbar-icon" aria-label="Saúde do nó">${ICONS.shield}</a>
        <a href="#/settings/network" class="agora-topbar-icon" aria-label="Configurações da rede">${ICONS.gear}</a>
      </div>
      ${renderIdentityChip(identity, chipText)}
    </header>`;
}

function renderDrawerKeyRow(identity) {
  return identity.address
    ? `<div class="agora-drawer-key"><span class="agora-label">ID na rede</span><code class="agora-mono">${escapeHtml(identity.address)}</code><button type="button" class="agora-link-btn" id="agora-copy-id">Copiar</button></div>`
    : `<p class="agora-muted">Você ainda não criou uma identidade neste aparelho.</p>`;
}

function renderIdentityDrawer(identity, chipHtml) {
  const keyRow = renderDrawerKeyRow(identity);
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
        <a class="agora-drawer-link" href="#/backup">Backup da Senha Soberana<span aria-hidden="true">›</span></a>
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

/**
 * Círculos territoriais (Stitch): comunidades locais deste aparelho. Renderizado vazio e
 * hidratado de forma assíncrona a partir do IndexedDB — nenhuma contagem fictícia.
 * @param {Array<{id:string,name?:string,title?:string,unread?:number}>} communities
 */
export function renderCirclesList(communities = []) {
  const items = communities.filter((c) => c && c.id).slice(0, 6);
  if (!items.length) return "";
  const rows = items.map((c) => {
    const name = c.name || c.title || c.id;
    const unread = Number(c.unread || 0);
    const meta = unread > 0 ? `<span class="agora-circle-meta">${unread} ${unread === 1 ? "nova" : "novas"}</span>` : "";
    return `<a class="agora-circle-row" href="#/c/${encodeURIComponent(c.id)}"><span class="agora-circle-name">${escapeHtml(name)}</span>${meta}</a>`;
  }).join("");
  return `
      <div class="agora-circles-head">
        <span class="agora-circles-title">Círculos territoriais</span>
        <span class="agora-circles-count">${items.length} ${items.length === 1 ? "ativo" : "ativos"}</span>
      </div>
      ${rows}`;
}

async function hydrateSidebarCircles() {
  const slot = document.getElementById("agora-sidebar-circles");
  if (!slot) return;
  try {
    const cacheNode = await import("../cache-node.js");
    const list = await cacheNode.getLocalCommunities?.();
    const html = renderCirclesList(Array.isArray(list) ? list : []);
    if (!html || !document.body.contains(slot)) return;
    slot.innerHTML = html;
    slot.hidden = false;
  } catch {
    /* sem IndexedDB (modo privado/teste): a seção permanece oculta */
  }
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
        <section class="agora-circles" id="agora-sidebar-circles" aria-label="Círculos territoriais" hidden></section>
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
        ${renderTopBar(identity, networkChipText(chipHtml), chipHtml)}
        <main id="app-main"></main>
        <footer class="app-footer">Vox · ${escapeHtml(appShellFooterTagline)} · <a href="#/ajuda/teste">Teste aberto</a> · <a href="./proposta-vox.html" target="_blank">Proposta</a> · <button type="button" class="app-footer-feedback" data-app-feedback>Algo errado aqui?</button></footer>
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
  hydrateSidebarCircles();
  bindDmBadge();
  const main = document.getElementById("app-main");
  if (breadcrumb) main.insertAdjacentHTML("afterbegin", breadcrumb);
  if (mock.isDemoMode()) mountDemoModeBanner(main);
  mountOpsNotice(main);
  return main;
}

/** Aviso operacional do kill-switch (LAN-08), definido em config/flags.json. */
export function renderOpsNotice(notice) {
  if (!notice) return "";
  return `<div class="ops-notice-banner" role="status">${escapeHtml(notice)}</div>`;
}

function mountOpsNotice(main) {
  const html = renderOpsNotice(getFlags().notice);
  if (html && main?.insertAdjacentHTML) main.insertAdjacentHTML("beforebegin", html);
}

/** Faixa fixa do modo demonstração (LAN-10): nunca deixa perfil fictício parecer real. */
export function renderDemoModeBanner() {
  return `
    <div class="demo-mode-banner" role="status" id="demo-mode-banner">
      <strong>Modo demonstração</strong> — perfis, chaves Pix e pessoas "online" de exemplo são <strong>fictícios</strong>.
      <button type="button" class="btn btn-outline btn-sm" id="btn-exit-demo">Sair da demonstração</button>
    </div>`;
}

function mountDemoModeBanner(main) {
  if (!main?.insertAdjacentHTML) return;
  // Antes do #app-main: as telas reescrevem o innerHTML do main e apagariam a faixa.
  main.insertAdjacentHTML("beforebegin", renderDemoModeBanner());
  document.getElementById("btn-exit-demo")?.addEventListener?.("click", () => {
    mock.setDemoMode(false);
    globalThis.location?.reload?.();
  });
}

/**
 * Cabeçalho de página no padrão Stitch (título epigráfico + subtítulo + ações), sem etiquetas.
 * @param {{ title: string, subtitle?: string, actionsHtml?: string, id?: string, wide?: boolean }} opts
 */
export function renderPageHead({ title, subtitle = "", actionsHtml = "", id = "", wide = false }) {
  const subHtml = subtitle ? `<p class="agora-page-sub">${escapeHtml(subtitle)}</p>` : "";
  const actions = actionsHtml ? `<div class="agora-page-actions">${actionsHtml}</div>` : "";
  return `
    <header class="agora-page-head${wide ? " agora-page-head--wide" : ""}"${id ? ` id="${escapeHtml(id)}"` : ""}>
      <div class="agora-page-head-text">
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
    `<p class="feed-notice demo" role="status">Sem conexão com a rede agora: mostramos só o que está salvo no seu aparelho. Nada aqui é conteúdo de exemplo.</p>`
  );
}

export function renderGatewayBanner(main, label) {
  updateTopBarSync(true, label ? "Sincronizando conteúdos…" : "Sincronizando…");
}

