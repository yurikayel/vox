/**
 * @file Peças de página montadas dentro da shell: avisos (operacional e demonstração), cabeçalho de página,
 * esqueleto de carregamento, erro e faixas de sync.
 *
 * @module render/shell-layout
 */
import * as mock from "../mock.js";
import { getFlags } from "../feature-flags.js";
import { escapeHtml } from "./util.js";
import { updateTopBarSync } from "./shell-drawer.js";

/**
 * Faixa de aviso operacional do kill-switch (LAN-08), definida em `config/flags.json`.
 * @param {string|null|undefined} notice Texto; omitido quando não há aviso.
 * @returns {string} HTML da faixa ou `""`.
 */
export function renderOpsNotice(notice) {
  if (!notice) return "";
  return `<div class="ops-notice-banner" role="status">${escapeHtml(notice)}</div>`;
}

/**
 * Insere no topo do conteúdo o aviso operacional, se houver.
 *
 * @param {HTMLElement|null} main
 */
export function mountOpsNotice(main) {
  const html = renderOpsNotice(getFlags().notice);
  if (html && main?.insertAdjacentHTML) main.insertAdjacentHTML("beforebegin", html);
}

/**
 * Faixa fixa do modo demonstração (LAN-10): deixa explícito que perfis são fictícios.
 * @returns {string} HTML do banner com botão «Sair da demonstração».
 */
export function renderDemoModeBanner() {
  return `
    <div class="demo-mode-banner" role="status" id="demo-mode-banner">
      <strong>Modo demonstração</strong> — perfis, chaves Pix e pessoas "online" de exemplo são <strong>fictícios</strong> (malha local; sem gravação Arweave por padrão).
      <button type="button" class="btn btn-outline btn-sm" id="btn-exit-demo">Sair da demonstração</button>
    </div>`;
}

/**
 * Insere a faixa de modo de demonstração no conteúdo.
 *
 * @param {HTMLElement|null} main
 */
export function mountDemoModeBanner(main) {
  if (!main?.insertAdjacentHTML) return;
  // Antes do #app-main: as telas reescrevem o innerHTML do main e apagariam a faixa.
  main.insertAdjacentHTML("beforebegin", renderDemoModeBanner());
  document.getElementById("btn-exit-demo")?.addEventListener?.("click", () => {
    mock.setDemoMode(false);
    globalThis.location?.reload?.();
  });
}

/**
 * Cabeçalho de página no padrão Stitch (título epigráfico + subtítulo + ações).
 * @param {object} options
 * @param {string} options.title Título principal (H1).
 * @param {string} [options.subtitle=""] Linha de apoio.
 * @param {string} [options.actionsHtml=""] Botões à direita.
 * @param {string} [options.id=""] `id` opcional do `<header>`.
 * @param {boolean} [options.wide=false] Classe `--wide` para layouts full-bleed.
 * @returns {string} HTML do cabeçalho.
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

/**
 * Placeholder esqueleto enquanto a rota carrega dados.
 * @param {HTMLElement} main Container da rota.
 * @param {string} [msg="Carregando…"] Texto para leitores de tela (`aria-label`).
 * @returns {void}
 */
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

/**
 * Mensagem de erro simples ocupando a rota.
 * @param {HTMLElement} main Container da rota.
 * @param {string} message Texto escapado para o usuário.
 * @returns {void}
 */
export function renderError(main, message) {
  main.innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
}

/**
 * Aviso no topo do feed quando não há rede (conteúdo só local, sem demo fake).
 * @param {HTMLElement} main Container do feed.
 * @returns {void}
 */
export function renderDemoBanner(main) {
  main.insertAdjacentHTML(
    "afterbegin",
    `<p class="feed-notice demo" role="status">Sem conexão com a rede agora: mostramos só o que está salvo no seu aparelho. Nada aqui é conteúdo de exemplo.</p>`
  );
}

/**
 * Ativa o indicador de sync no rodapé durante ingestão via gateway.
 * @param {HTMLElement} main Container (não alterado diretamente).
 * @param {string} label Rótulo curto opcional no hint de sync.
 * @returns {void}
 */
export function renderGatewayBanner(main, label) {
  updateTopBarSync(true, label ? "Sincronizando conteúdos…" : "Sincronizando…");
}
