/**
 * @file Shell do PWA: fachada que monta o layout (sidebar, topbar, gaveta) e reexporta a API pública.
 *
 * Injeta layout fixo em `#app-root`; o conteúdo das rotas preenche `#app-main` retornado por {@link renderShell}.
 * As partes moram em `shell-nav.js` (navegação), `shell-chrome.js` (marca e barra superior),
 * `shell-drawer.js` (barra lateral e gavetas) e `shell-layout.js` (avisos e peças de página).
 *
 * @module render/shell
 */
import * as mock from "../mock.js";
import { appShellFooterTagline } from "../i18n-pt-br.js";
import { escapeHtml, root } from "./util.js";
import { renderToastLiveRegionsHtml } from "../honest-errors.js";
import {
  attachThemeModeToggle, attachTopBarSearch, networkChipText, readIdentitySummary, renderNetworkChip, renderTopBar, renderWalletBadge,
} from "./shell-chrome.js";
import { attachIdentityDrawerBehavior, attachSidebarBehavior, renderIdentityDrawer, renderSidebar } from "./shell-drawer.js";
import { mountDemoModeBanner, mountOpsNotice } from "./shell-layout.js";

export { renderFeedNav, sumUnreadDms, formatDmBadge, renderCirclesList } from "./shell-nav.js";
export { BRAND_MARK_SRC, brandMarkSrcForColorScheme, renderNetworkChip, renderMeshStatusChip } from "./shell-chrome.js";
export { updateTopBarSync } from "./shell-drawer.js";
export {
  renderOpsNotice, renderDemoModeBanner, renderPageHead, renderLoading, renderError, renderDemoBanner, renderGatewayBanner,
} from "./shell-layout.js";

/** @type {Set<() => void>} Callbacks da camada `app` após cada montagem da shell. */
const afterShellMountFns = new Set();

/**
 * Registra callback pós-montagem da shell (badge DM, círculos, etc.). Idempotente por referência.
 * @param {() => void} fn Função a chamar após o HTML da shell.
 * @returns {() => void} Função que remove o registro.
 */
export function setAfterShellMount(fn) {
  if (typeof fn !== "function") return () => {};
  afterShellMountFns.add(fn);
  return () => afterShellMountFns.delete(fn);
}

/**
 * Estrutura do app (barra lateral, barra superior e conteúdo).
 *
 * @param {object} options
 * @returns {string}
 */
function renderShellMarkup({ activeTab, sidebarHtml, identity, chipHtml }) {
  return `
    <div class="app-layout agora-ui" data-active-tab="${escapeHtml(activeTab)}">
      ${sidebarHtml}
      <div class="main-column">
        ${renderTopBar(identity, networkChipText(chipHtml))}
        <main id="app-main"></main>
        <footer class="app-footer">Vox · ${escapeHtml(appShellFooterTagline)} · <a href="#/ajuda/teste">Teste aberto</a> · <a href="#/sobre">Sobre &amp; DPO</a> · <a href="./proposta-vox.html" target="_blank">Proposta</a> · <button type="button" class="app-footer-feedback" data-app-feedback>Algo errado aqui?</button></footer>
      </div>
    </div>
    ${renderIdentityDrawer(identity, chipHtml)}
    ${renderToastLiveRegionsHtml()}
  `;
}

/**
 * Liga todos os comportamentos do shell após desenhá-lo.
 */
function attachShellBehaviors() {
  attachSidebarBehavior();
  attachThemeModeToggle();
  attachTopBarSearch();
  attachIdentityDrawerBehavior();
}

/**
 * Monta o layout completo do app e devolve o elemento `#app-main` para a rota preencher.
 * @param {object} options Metadados da tela e estado de rede.
 * @param {string} [options.title] Reservado (título por rota no `main`).
 * @param {string} [options.subtitle] Reservado.
 * @param {string} [options.breadcrumb] HTML opcional inserido no topo do `main`.
 * @param {string|null} [options.walletAddress] Conta ativa para badge e gaveta.
 * @param {string} [options.activeTab="home"] Aba destacada na sidebar.
 * @param {object} [options.metrics] Métricas do nó para o chip de rede.
 * @param {object} [options.rtcStatus] Estado RTC.
 * @param {object} [options.settings] Configuração de participação na malha.
 * @param {string} [options.activeFeed="for-you"] Feed ativo quando `showFeedNav` é verdadeiro.
 * @param {boolean} [options.showFeedNav=false] Exibe abas de feed na sidebar.
 * @returns {HTMLElement|null} Elemento `#app-main`.
 */
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
  for (const fn of afterShellMountFns) fn();
  const main = document.getElementById("app-main");
  if (breadcrumb) main.insertAdjacentHTML("afterbegin", breadcrumb);
  if (mock.isDemoMode()) mountDemoModeBanner(main);
  mountOpsNotice(main);
  return main;
}
