/**
 * @file Navegação da shell: ícones, itens primários e secundários, abas de feed, badge de DM e círculos.
 *
 * Sem dependência dos outros módulos `shell-*`; a fachada {@link module:render/shell} reexporta a API pública.
 *
 * @module render/shell-nav
 */
import { escapeHtml } from "./util.js";

/** Ícones de linha no vocabulário do guia de design (Material Symbols outline, traço 1.75). */
const svg = (body, cls = "tab-svg", size = 22) =>
  `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;


/** Ícones SVG da shell, por nome (navegação, barra superior e gaveta). */
export const ICONS = {
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

/**
 * Abas de filtro de feed na sidebar (Social, Cívico, Seguindo, externo, Tudo).
 * @param {string} [activeFeed="for-you"] Chave do feed ativo (`for-you`, `civic`, etc.).
 * @returns {string} HTML do `<nav class="sidebar-feed-nav">`.
 */
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

/**
 * Espaço da navegação do feed, vazio fora das telas de feed.
 *
 * @param {boolean} showFeedNav
 * @param {string} activeFeed
 * @returns {string}
 */
export function renderFeedNavSlot(showFeedNav, activeFeed) {
  const inner = showFeedNav ? renderFeedNav(activeFeed) : "";
  const hidden = showFeedNav ? "" : ' hidden aria-hidden="true"';
  return `<div class="sidebar-feed-slot"${hidden}>${inner}</div>`;
}

/**
 * Itens de navegação primária (guia de design / ADR-016): Ágora, Vote, Comunidades, Mensagens, Perfil.
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


/** Badge de DM vazio; `app/dm-badge-live.js` preenche e mostra. */
export const DM_BADGE_HTML = `<span class="agora-dm-badge" data-dm-badge hidden aria-hidden="true"></span>`;

/**
 * Total de mensagens recebidas e não lidas, somando todas as conversas.
 * @param {object[]} [conversations=[]] Conversas do cache com campo `unreadCount`.
 * @returns {number} Soma de não lidas.
 */
export function sumUnreadDms(conversations = []) {
  return conversations.reduce((acc, c) => acc + (Number(c?.unreadCount) || 0), 0);
}

/**
 * Texto do contador de DM para badge: vazio quando zero, `99+` acima de 99.
 * @param {number} count Total de não lidas.
 * @returns {string} Rótulo curto ou string vazia.
 */
export function formatDmBadge(count) {
  const n = Number(count) || 0;
  if (n <= 0) return "";
  return n > 99 ? "99+" : String(n);
}

/**
 * Itens de navegação da barra lateral, marcando a aba ativa.
 *
 * @param {string} activeTab
 * @returns {string}
 */
export function renderSidebarNav(activeTab) {
  return NAV_ITEMS.map((item) => {
    const isActive = activeTab === item.tab || (item.alias || []).includes(activeTab);
    const cls = ["tab-item", isActive ? "active" : "", item.secondary ? "tab-item--secondary" : ""].filter(Boolean).join(" ");
    return `<a href="${item.href}" class="${cls}" data-tab="${item.tab}"${isActive ? ' aria-current="page"' : ""} aria-label="${item.label}">
      <span class="tab-icon">${item.icon()}</span><span class="tab-label">${item.label}</span>${item.tab === "dm" ? DM_BADGE_HTML : ""}
    </a>`;
  }).join("\n    ");
}

/**
 * Círculos territoriais (guia de design): comunidades locais deste aparelho. Renderizado vazio e
 * hidratado de forma assíncrona a partir do IndexedDB — nenhuma contagem fictícia.
 * @param {Array<{id:string,name?:string,title?:string,unread?:number}>} communities Comunidades locais conhecidas.
 * @returns {string} HTML da seção de círculos, ou `""` se a lista estiver vazia.
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
