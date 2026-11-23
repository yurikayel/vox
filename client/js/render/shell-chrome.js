/**
 * @file Cromo da shell: marca Vox, barra superior (busca, atalhos, identidade), selos de rede e da carteira
 * e o botão de tema claro/escuro.
 *
 * @module render/shell-chrome
 */
import * as mock from "../mock.js";
import * as localAccount from "../identity/index.js";
import {
  colorModeLabel,
  colorModeToggleHint,
  cycleColorMode,
  readColorMode,
  writeColorMode,
  applyColorModeToRoot,
} from "../color-mode.js";
import { applySkyTheme } from "../sky-theme.js";
import { escapeHtml, renderAvatarHtml } from "./util.js";
import { ICONS, DM_BADGE_HTML } from "./shell-nav.js";

/** Squircle branco + X azul — mesmo asset em claro/escuro (sem tile navy na shell). */
export const BRAND_MARK_SRC = "icons/logo-mark.png";

/**
 * URL do mark Vox; não varia com tema (mesmo PNG em claro e escuro).
 * @param {boolean} _dark Reservado para skins futuras; ignorado hoje.
 * @returns {string} Caminho relativo do ícone ({@link BRAND_MARK_SRC}).
 */
export function brandMarkSrcForColorScheme(_dark) {
  return BRAND_MARK_SRC;
}

/**
 * Chip de estado da rede no rodapé da sidebar (ativo, offline ou somente leitura).
 * @param {object|null} metrics Métricas locais do nó (ex.: blobs entregues).
 * @param {object|null} rtcStatus Pares RTC e flag `isOnline`.
 * @param {object|null} settings Preferências de participação (`enabled`).
 * @returns {string} HTML do link para `#/settings/network`.
 */
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

/**
 * Selo da carteira no rodapé, com estado vazio quando não há.
 *
 * @param {string} walletAddress
 * @returns {string}
 */
export function renderWalletBadge(walletAddress) {
  if (!walletAddress) {
    return `<a class="wallet-badge account-access" href="#/perfil" aria-label="Abrir perfil">${USER_ICON_SVG}<span class="wallet-badge-label">Perfil</span></a>`;
  }
  const display = mock.getAuthorDisplay(walletAddress) || "Conta";
  const shortName = display.split(/\s+/)[0] || display;
  const tip = `${display} · ID ${walletAddress}`;
  return `<a class="wallet-badge account-access connected" href="#/perfil" title="${escapeHtml(tip)}" aria-label="Perfil de ${escapeHtml(display)}">${USER_ICON_SVG}<span class="wallet-badge-label">${escapeHtml(shortName)}</span></a>`;
}

/**
 * Marca Vox e Ágora no topo.
 *
 * @returns {string}
 */
export function renderAgoraWordmark() {
  return `<a href="#/" class="agora-wordmark" aria-label="Vox — Ágora">
      <img class="agora-wordmark-mark" src="${BRAND_MARK_SRC}" width="28" height="28" alt="" decoding="async" />
      <span class="agora-wordmark-text" aria-label="VOX"><span class="agora-wordmark-v">V</span><span class="agora-wordmark-o">O</span><span class="agora-wordmark-x">X</span></span>
    </a>`;
}

/**
 * Resumo da identidade (nome, avatar e endereço) para o cabeçalho.
 *
 * @param {string} walletAddress
 * @returns {object}
 */
export function readIdentitySummary(walletAddress) {
  const enrichment = localAccount.getProfileEnrichment?.() || {};
  const displayName = localAccount.getDisplayName?.() || enrichment.displayName || (walletAddress ? mock.getAuthorDisplay(walletAddress) : "") || "";
  return {
    address: walletAddress || "",
    displayName: displayName || (walletAddress ? "Cidadão" : "Visitante"),
    avatarUrl: enrichment.avatarUrl || "",
  };
}

/**
 * Botão da identidade na barra superior.
 *
 * @param {object} identity
 * @param {string} chipText
 * @returns {string}
 */
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

/**
 * Classe e rótulo do estado da malha a partir do selo de rede.
 *
 * @param {string} chipHtml
 * @returns {object}
 */
function meshChipState(chipHtml) {
  if (chipHtml.includes("network-chip offline")) return { cls: "is-offline", label: "Offline" };
  if (chipHtml.includes("network-chip paused")) return { cls: "is-paused", label: "Só leitura" };
  return { cls: "is-active", label: "Malha ativa" };
}

/**
 * Selo "Malha ativa / Offline / Só leitura" da tela de configurações da rede. Saiu da barra do topo
 * (pedido do mantenedor): o estado da malha é assunto de configuração, não de toda tela.
 * @param {string} chipHtml Saída de {@link renderNetworkChip}; o selo segue o mesmo estado.
 * @returns {string} HTML do link para `#/status` (Saúde do nó), com o detalhe (ex.: "2 aparelhos") no `title`.
 */
export function renderMeshStatusChip(chipHtml) {
  const mesh = meshChipState(chipHtml);
  return `<a href="#/status" class="agora-mesh-chip ${mesh.cls}" title="${escapeHtml(networkChipText(chipHtml))}"><span class="agora-presence-dot" aria-hidden="true"></span><span>${escapeHtml(mesh.label)}</span></a>`;
}

/**
 * Barra superior com busca, rede e identidade.
 *
 * @param {object} identity
 * @param {string} chipText
 * @returns {string}
 */
export function renderTopBar(identity, chipText) {
  return `
    <header class="agora-topbar" role="banner">
      <div class="agora-topbar-brand">${renderAgoraWordmark()}</div>
      <form class="agora-search" role="search" id="agora-search-form" action="#/people">
        <svg class="agora-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input type="search" name="q" id="agora-search-input" placeholder="Buscar cidadãos, @arrobas ou chaves cívicas…" aria-label="Buscar pessoas" autocomplete="off" />
      </form>
      <div class="agora-topbar-tools">
        <a href="#/dm" class="agora-topbar-icon agora-topbar-icon--mobile" aria-label="Mensagens">${ICONS.dmTop}${DM_BADGE_HTML}</a>
        <a href="#/status" class="agora-topbar-icon" aria-label="Saúde do nó">${ICONS.shield}</a>
        <a href="#/settings/network" class="agora-topbar-icon" aria-label="Configurações da rede">${ICONS.gear}</a>
      </div>
      ${renderIdentityChip(identity, chipText)}
    </header>`;
}

/**
 * Liga o formulário de busca da barra superior.
 */
export function attachTopBarSearch() {
  const form = document.getElementById("agora-search-form");
  if (!form || form.dataset.bound === "1") return;
  form.dataset.bound = "1";
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = document.getElementById("agora-search-input")?.value.trim() || "";
    location.hash = q ? `#/people?q=${encodeURIComponent(q)}` : "#/people";
  });
}

/**
 * Texto visível do selo de rede.
 *
 * @param {string} chipHtml
 * @returns {string}
 */
export function networkChipText(chipHtml) {
  const m = chipHtml.match(/<span>([^<]*)<\/span><\/a>$/);
  return m ? m[1] : "Rede";
}

const THEME_ICONS = {
  auto: `<svg class="theme-mode-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 2v20M2 12h20"/></svg>`,
  light: `<svg class="theme-mode-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`,
  dark: `<svg class="theme-mode-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
};

/**
 * Botão de alternar tema (automático, claro, escuro).
 *
 * @param {string} mode
 * @returns {string}
 */
export function renderThemeModeToggle(mode) {
  const m = mode === "light" || mode === "dark" ? mode : "auto";
  const label = colorModeLabel(m);
  return `<button type="button" class="theme-mode-toggle" id="theme-mode-toggle" aria-label="${escapeHtml(colorModeToggleHint(m))}">
          <span class="theme-mode-icon">${THEME_ICONS[m]}</span>
          <span class="theme-mode-label">${escapeHtml(label)}</span>
        </button>`;
}

/**
 * Atualiza rótulo e estado do botão de tema.
 *
 * @param {HTMLElement} btn
 * @param {string} mode
 */
function syncThemeModeToggleUi(btn, mode) {
  const m = mode === "light" || mode === "dark" ? mode : "auto";
  btn.setAttribute("aria-label", colorModeToggleHint(m));
  const icon = btn.querySelector(".theme-mode-icon");
  const label = btn.querySelector(".theme-mode-label");
  if (icon) icon.innerHTML = THEME_ICONS[m];
  if (label) label.textContent = colorModeLabel(m);
}

/**
 * Liga o botão de tema, que gira entre os modos e guarda a escolha.
 */
export function attachThemeModeToggle() {
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
