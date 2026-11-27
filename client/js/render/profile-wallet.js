/**
 * @file Carteira Soberana, consulta Pix no índice local e resolução de conflitos de handle.
 *
 * Exibe saldo Arweave vinculado, formulário de importação JWK e avisos de custódia descentralizada.
 *
 * @module render/profile-wallet
 */
import * as localAccount from "../identity/index.js";
import { escapeHtml, shortId } from "./util.js";

/**
 * Cartão do perfil encontrado pela chave Pix.
 *
 * @param {object} profile
 * @returns {string}
 */
function renderPixFoundCard(profile) {
  const profName = profile.name || shortId(profile.routeId);
  const profHandle = profile.handle ? `@${profile.handle}` : "";
  const pixMasked = profile.pixKeyMasked || profile.pixKey || "";
  return `
    <div class="card pix-lookup-card">
      <div class="pix-lookup-header"><span class="badge-pill p2p-pill">❖ Conta Localizada</span></div>
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
}

/**
 * Cartão de chave Pix não encontrada.
 *
 * @param {string} queryStr
 * @returns {string}
 */
function renderPixNotFoundCard(queryStr) {
  return `
    <div class="card pix-lookup-card empty">
      <h2>Chave Pix não vinculada</h2>
      <p class="desc">A chave <code>${queryStr}</code> não consta no seu índice local (perfis e tour neste navegador).</p>
      <p class="meta" style="margin-top:0.5rem;">Chaves Pix são atributos opcionais declarados localmente — não são posts públicos na malha.</p>
      <div class="actions-row" style="margin-top:1rem;">
        <a class="btn btn-outline" href="#/">← Voltar ao Início</a>
      </div>
    </div>`;
}

/**
 * Resultado da consulta de chave Pix no índice local.
 * @param {HTMLElement} main Container da rota.
 * @param {string} [query=""] Chave buscada (para estado vazio).
 * @param {object|null} [profile=null] Perfil encontrado com Pix mascarado.
 * @returns {void}
 */
export function renderPixLookup(main, query = "", profile = null) {
  const content = profile ? renderPixFoundCard(profile) : renderPixNotFoundCard(escapeHtml(query));
  main.innerHTML = `
    <div class="actions-bar"><span class="section-title">Consulta de Chave Pix</span></div>
    ${content}`;
}

/**
 * Lista reivindicantes quando o mesmo @handle foi publicado por mais de um endereço.
 * @param {HTMLElement} main Container da rota.
 * @param {string} slug Handle em conflito (sem @).
 * @param {object[]} [claimants=[]] Entradas com `owner`, `txId`.
 * @returns {void}
 */
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

/**
 * Linha da chave Pix na carteira.
 *
 * @returns {string}
 */
function renderWalletPixRow() {
  const pix = localAccount.getPixKey?.();
  if (!pix?.normalized) {
    return `<div class="agora-wallet-pix agora-wallet-pix--empty">
        <span class="agora-tile-label">Chave Pix para apoios</span>
        <a class="agora-link-btn" href="#/perfil">Configurar no perfil</a>
      </div>`;
  }
  const shown = pix.masked || pix.normalized;
  return `<div class="agora-wallet-pix">
        <div>
          <span class="agora-tile-label">Chave Pix soberana · ${escapeHtml(pix.type || "chave")}</span>
          <code class="agora-hash">${escapeHtml(shown)}</code>
        </div>
      </div>`;
}

/**
 * Caixa do estado da carteira (conectada ou não).
 *
 * @param {boolean} hasWallet
 * @param {string} address
 * @param {string} balance
 * @returns {string}
 */
function renderWalletStatusBox(hasWallet, address, balance) {
  if (hasWallet && address) {
    return `
      <section class="card wallet-info agora-wallet-hero">
        <span class="agora-tile-label">Saldo vinculado · Arweave</span>
        <p class="balance agora-wallet-balance"><strong>${escapeHtml(balance)} AR</strong></p>
        <p class="agora-wallet-address">Endereço: <code class="agora-hash">${escapeHtml(address)}</code></p>
        ${renderWalletPixRow()}
        <div class="actions-row agora-wallet-actions">
          <a class="agora-btn agora-btn--solid" href="#/perfil">Meu perfil</a>
          <a class="agora-btn agora-btn--secondary" href="#/wallet/guia">Configuração guiada</a>
          <button id="btn-disconnect-wallet" class="agora-btn agora-btn--bronze btn-danger">Desconectar</button>
        </div>
      </section>`;
  }
  return `
    <section class="card wallet-warning agora-wallet-hero">
      <span class="agora-tile-label">Nenhuma carteira neste aparelho</span>
      <p class="agora-wallet-empty">Conecte ou gere uma carteira Arweave se desejar publicar dados no permaweb permanente.</p>
      ${renderWalletPixRow()}
      <div class="agora-wallet-actions">
        <button id="btn-generate-wallet" class="agora-btn agora-btn--primary btn-primary">⚡ Gerar carteira instantânea</button>
      </div>
    </section>`;
}

/**
 * Formulário de importar carteira.
 *
 * @returns {string}
 */
function renderWalletImportHtml() {
  return `
          <section class="card wallet-import agora-tablet">
            <div class="agora-tablet-head"><h3 class="agora-section-title">Importar carteira (JWK)</h3></div>
            <p class="meta">Cole o JSON da sua chave privada:</p>
            <form id="form-import-wallet">
              <textarea id="wallet-jwk-input" rows="4" class="form-control agora-inscription" placeholder='{"kty":"RSA","n":"...","e":"AQAB",...}' required></textarea>
              <div class="form-actions"><button type="submit" class="agora-btn agora-btn--solid btn-primary">Salvar carteira</button></div>
            </form>
          </section>`;
}

/**
 * Texto lateral explicativo da carteira.
 *
 * @returns {string}
 */
function renderWalletAsideHtml() {
  return `
        <aside class="agora-split-aside">
          <section class="agora-tablet agora-tablet--bronze">
            <p class="agora-section-label">Custódia descentralizada</p>
            <p>Fundos, recibos e chave de assinatura residem no armazenamento deste aparelho. Nenhum servidor central retém sua chave.</p>
            <a class="agora-btn agora-btn--secondary agora-btn--block" href="#/settings/linked-accounts">Backup e contas vinculadas</a>
          </section>
          <section class="agora-tablet">
            <p class="agora-section-label agora-section-label--teal">Zaps cívicos</p>
            <p>Apoie autores e pautas direto pelo Pix deles — o pagamento sai do seu banco, sem intermediário.</p>
          </section>
        </aside>`;
}

/**
 * Tela Carteira Soberana (tela 14 do guia de design): saldo Arweave, Pix e importação JWK.
 * @param {HTMLElement} main Container da rota `#/wallet`.
 * @param {object} [options={}]
 * @param {string|null} [options.address=null] Endereço AR conectado.
 * @param {string} [options.balance="0.000"] Saldo formatado.
 * @param {boolean} [options.hasWallet=false] Se há carteira no aparelho.
 * @param {string|null} [options.error=null] Mensagem de erro a exibir.
 * @returns {void}
 */
export function renderWallet(main, { address = null, balance = "0.000", hasWallet = false, error = null } = {}) {
  const statusBox = renderWalletStatusBox(hasWallet, address, balance);
  const errorBox = error ? `<div class="error">${escapeHtml(error)}</div>` : "";

  main.innerHTML += `
    <div class="agora-wide agora-wallet">
      <header class="agora-page-head agora-page-head--wide">
        <div class="agora-page-head-text">
          <h1 class="agora-page-title">Carteira Soberana</h1>
          <p class="agora-page-sub">Sua chave e seus recibos ficam só neste navegador. O Vox não processa pagamentos nem guarda saldo.</p>
        </div>
      </header>
      <div class="actions-bar" hidden><span class="section-title">Carteira Arweave</span></div>
      ${errorBox}
      <div class="agora-split agora-split--right">
        <div class="agora-split-main">${statusBox}${renderWalletImportHtml()}</div>
        ${renderWalletAsideHtml()}
      </div>
    </div>`;
}
