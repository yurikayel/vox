/**
 * @file Barra lateral e gavetas da shell: sidebar (recolher no desktop, gaveta no celular), rodapé com tema,
 * sync, rede e conta, e a gaveta de identidade.
 *
 * @module render/shell-drawer
 */
import { readColorMode } from "../color-mode.js";
import { escapeHtml } from "./util.js";
import { ICONS, renderFeedNavSlot, renderSidebarNav } from "./shell-nav.js";
import { renderAgoraWordmark, renderThemeModeToggle } from "./shell-chrome.js";

const SIDEBAR_SYNC_PLACEHOLDER = "\u00a0";

/**
 * Rodapé da barra lateral (tema, rede e carteira).
 *
 * @param {string} chipHtml
 * @param {string} walletBadge
 * @returns {string}
 */
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

/**
 * Liga o comportamento da barra lateral (recolher e abrir).
 */
export function attachSidebarBehavior() {
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
 * Linha da chave de identidade na gaveta.
 *
 * @param {object} identity
 * @returns {string}
 */
function renderDrawerKeyRow(identity) {
  return identity.address
    ? `<div class="agora-drawer-key"><span class="agora-label">ID na rede</span><code class="agora-mono">${escapeHtml(identity.address)}</code><button type="button" class="agora-link-btn" id="agora-copy-id">Copiar</button></div>`
    : `<p class="agora-muted">Você ainda não criou uma identidade neste aparelho.</p>`;
}

/**
 * Gaveta de identidade com chave, rede e atalhos.
 *
 * @param {object} identity
 * @param {string} chipHtml
 * @returns {string}
 */
export function renderIdentityDrawer(identity, chipHtml) {
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

/**
 * Liga o botão de copiar o identificador, com aviso de resultado.
 *
 * @param {HTMLElement} drawer
 */
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

/**
 * Liga a gaveta de identidade (abrir, fechar, Esc, backdrop) e o botão de copiar o ID.
 */
export function attachIdentityDrawerBehavior() {
  const toggle = document.getElementById("agora-identity-toggle");
  const drawer = document.getElementById("agora-identity-drawer");
  const backdrop = document.getElementById("agora-drawer-backdrop");
  if (!toggle || !drawer || toggle.dataset.bound === "1") return;
  toggle.dataset.bound = "1";
  /**
   * Abre ou fecha a gaveta de identidade.
   *
   * @param {boolean} open
   */
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

/**
 * Barra lateral completa.
 *
 * @param {string} activeTab
 * @param {object} options
 * @returns {string}
 */
export function renderSidebar(activeTab, { showFeedNav, activeFeed, chipHtml, walletBadge }) {
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

/**
 * Atualiza o hint «Sincronizando…» no rodapé da sidebar (não confundir com topbar mobile).
 * @param {boolean} active Se há sync em andamento.
 * @param {string} [detail=""] Mensagem curta; padrão «Sincronizando…».
 * @returns {void}
 */
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
