/**
 * @file Painel de configurações locais da conta soberana (aba Sobre do próprio perfil).
 *
 * Gerencia identidade local, alternador do cofre multi-contas, importação OAuth, Pix, GitHub,
 * descoberta na malha e carteira Arweave opcional.
 *
 * @module render/profile-settings
 */
import * as localAccount from "../identity/index.js";
import { LOCAL_WIPE_NOTICE } from "../identity/index.js";
import { PIX_RECEIVER_NAME_NOTICE_PT } from "../pix-key.js";
import { escapeHtml, shortId } from "./util.js";
import { renderIdentityMetaForm } from "./profile-identity-meta.js";
import { renderSovereigntyCard } from "./profile-sovereignty.js";

function renderPixForm(currentPixKey) {
  return `
    <div class="pix-section">
      <label for="input-pix-key" class="pix-label">Chave Pix (opcional no perfil):</label>
      <p class="desc pix-desc">Chave para apoios diretos. Não é login nem valida titularidade bancária. Seu ID de conta continua sendo sua chave criptográfica local.</p>
      <p class="desc pix-desc pix-name-notice" role="note">${escapeHtml(PIX_RECEIVER_NAME_NOTICE_PT)}</p>
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
  const label = oauthProvider === "google" ? "Google" : oauthProvider === "facebook" ? "Meta" : oauthProvider === "github" ? "GitHub" : oauthProvider;
  const statusLine = oauthProvider
    ? `<p class="desc" style="margin:0 0 0.45rem;">Nome e foto importados via <strong>${escapeHtml(label)}</strong> (opcional). Tokens OAuth não são guardados neste aparelho.</p>`
    : `<p class="desc" style="margin:0 0 0.45rem;">Importe seu nome e foto via <strong>Google, Meta ou GitHub</strong>. Isso não guarda sua conta: a saída fica em <a href="#/backup">Backup</a>.</p>`;
  return `
    <div class="oauth-enrich-notice" style="margin-top:0.65rem; padding:0.55rem 0.65rem; background:var(--surface-soft); border-radius:var(--radius-sm); font-size:0.82rem;">
      ${statusLine}
      <div style="display:flex; flex-wrap:wrap; gap:0.4rem;">
        <button type="button" id="btn-open-oauth-modal" class="btn btn-sm btn-outline">Importar nome e foto (Google, Meta ou GitHub)</button>
        <a href="#/settings/linked-accounts" class="btn btn-sm btn-outline">🔗 Redes Vinculadas & Auto-Replicação</a>
        ${oauthProvider ? `<button type="button" id="btn-clear-oauth-enrich" class="btn btn-sm btn-outline">Remover nome/foto importados</button>` : ""}
      </div>
    </div>`;
}

function renderLocalWipeCard() {
  return `
      <div class="card profile-local-wipe" style="margin-top:0.75rem;">
        <h3>Apagar chaves deste navegador</h3>
        <p class="desc" style="font-size:0.85rem; margin-bottom:0.5rem;">${escapeHtml(LOCAL_WIPE_NOTICE)}</p>
        <button type="button" id="btn-wipe-local-account" class="btn btn-sm btn-danger">Apagar chaves deste navegador</button>
      </div>`;
}

function renderProfileIdentitySettingsCard({ displayName, oauthProvider, currentPixKey, currentGithub, identityMeta }) {
  return `
    <div class="card profile-grid-settings-card" style="margin-top:0.75rem;">
      <h3>Identidade Local</h3>
      <form id="form-display-name" style="margin-top:0.5rem; display:flex; gap:0.5rem;">
        <input type="text" id="input-display-name" class="form-control" placeholder="Seu apelido ou nome..." value="${escapeHtml(displayName || "")}" maxlength="30" />
        <button type="submit" class="btn btn-sm btn-primary" style="white-space:nowrap;">Salvar Nome</button>
      </form>
      ${renderOAuthEnrichmentBlock(oauthProvider)}
      ${renderIdentityMetaForm(identityMeta)}
      ${renderPixForm(currentPixKey)}
      ${renderGithubForm(currentGithub)}
    </div>`;
}

function renderProfileMeshDiscoverableCard(meshDiscoverable) {
  return `
    <div class="card" style="margin-top:0.75rem;">
      <h3>Descoberta na malha</h3>
      <div class="form-group" style="display:flex; align-items:flex-start; gap:0.6rem; margin-top:0.5rem;">
        <input type="checkbox" id="profile-mesh-discoverable" ${meshDiscoverable ? "checked" : ""} style="width:1.1rem; height:1.1rem; margin-top:0.2rem;" />
        <div>
          <label for="profile-mesh-discoverable" style="margin:0; font-weight:600;">Aparecer na busca da malha</label>
          <p class="desc" style="font-size:0.82rem; margin:0.25rem 0 0;">Cartão assinado opt-in para pares conectados; sem ranking nem servidor central.</p>
        </div>
      </div>
    </div>`;
}

function renderArweaveWalletBox(hasWallet, balance) {
  if (hasWallet) {
    return `
      <p class="meta">Status: Conectada · Saldo: <strong>${escapeHtml(balance || "0.000")} AR</strong></p>
      <button id="btn-disconnect-wallet" class="btn btn-danger btn-sm">Desconectar Carteira</button>`;
  }
  return `
    <p class="meta">Nenhuma carteira Arweave conectada.</p>
    <div style="display:flex; gap:0.5rem; margin-top:0.4rem;">
      <button id="btn-generate-wallet" class="btn btn-primary btn-sm">⚡ Gerar Carteira Arweave</button>
      <a href="#/wallet" class="btn btn-outline btn-sm">Importar JWK</a>
    </div>`;
}

function renderProfileAdvancedSettingsDetails(handle, hasWallet, balance) {
  return `
    <details class="advanced-settings card" style="margin-top:0.75rem;">
      <summary>Avançado — Carteira Arweave (opcional)</summary>
      <div style="margin-top:0.75rem;">
        <p class="desc">Hoje o Vox preserva posts pela <strong>malha</strong> e pelos seguidores — sem taxa e com <code>arweaveUpload: false</code> (nada vai ao Arweave por padrão). Use a carteira abaixo só para reivindicar @handle on-chain ou para quando o arquivamento no permaweb estiver ligado de propósito:</p>
        <form id="form-claim-handle" style="margin-top:0.75rem;">
          <label style="font-size:0.85rem; font-weight:600;">Reivindicar @handle on-chain:</label>
          <div style="display:flex; gap:0.5rem; margin-top:0.25rem;">
            <input type="text" id="input-handle-slug" class="form-control" placeholder="ex: maria" value="${escapeHtml(handle || "")}" />
            <button type="submit" id="btn-submit-handle" class="btn btn-sm btn-primary" style="white-space:nowrap;">Salvar @handle</button>
          </div>
        </form>
        <div style="margin-top:0.75rem; border-top:1px solid var(--border); padding-top:0.6rem; display:flex; flex-wrap:wrap; gap:0.4rem;">
          <button id="btn-copy-dmpub" class="btn btn-sm btn-outline">📋 Copiar Chave Pública</button>
          <button id="btn-publish-dmpub" class="btn btn-sm btn-primary">🌐 Publicar Chave on-chain</button>
        </div>
        <div style="margin-top:0.75rem; border-top:1px solid var(--border); padding-top:0.6rem;">
          <h4>Carteira Arweave</h4>
          ${renderArweaveWalletBox(hasWallet, balance)}
        </div>
      </div>
    </details>`;
}

function renderVaultAccountRow(acc, currentAddress, totalAccounts) {
  const isCurrent = acc.routeId === currentAddress;
  const name = acc.displayName || shortId(acc.routeId);
  const badge = isCurrent
    ? '<span class="badge-pill p2p-pill" style="font-size:0.75rem;">Ativa</span>'
    : `<button type="button" class="btn btn-xs btn-primary btn-switch-vault-account" data-route="${escapeHtml(acc.routeId)}">Alternar</button>`;
  const removeBtn = !isCurrent && totalAccounts > 1
    ? `<button type="button" class="btn btn-xs btn-outline btn-remove-vault-account" data-route="${escapeHtml(acc.routeId)}" title="Remover do cofre local" aria-label="Remover do cofre local"><span aria-hidden="true">✕</span></button>`
    : "";

  return `
    <div class="card vault-account-item" style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; margin-top:6px; background:var(--surface-soft); border-radius:var(--radius-sm);">
      <div style="display:flex; align-items:center; gap:8px;">
        <div class="avatar" style="width:32px; height:32px; font-size:0.85rem;">${escapeHtml(name.slice(0, 1).toUpperCase())}</div>
        <div>
          <strong>${escapeHtml(name)}</strong>
          <div class="meta" style="font-size:0.72rem;"><code>${escapeHtml(shortId(acc.routeId))}</code></div>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        ${badge}
        ${removeBtn}
      </div>
    </div>`;
}

function renderMultiAccountCard(currentAddress) {
  const accounts = localAccount.listVaultAccountsSync();
  const itemsHtml = accounts.map((acc) => renderVaultAccountRow(acc, currentAddress, accounts.length)).join("");

  return `
    <div class="card profile-vault-accounts" style="margin-top:0.75rem;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.4rem;">
        <h3 style="margin:0;">Alternador de Contas Locais</h3>
        <span class="badge-pill" style="font-size:0.7rem;">Cofre Seguro</span>
      </div>
      <p class="desc" style="font-size:0.83rem; margin-bottom:0.5rem;">
        Alterne entre identidades soberanas neste navegador para testar amizades, comunidades e publicações de vida real.
      </p>
      <div class="vault-account-list" style="margin-bottom:0.75rem;">${itemsHtml}</div>
      <form id="form-create-vault-account" style="display:flex; gap:0.5rem; align-items:center;">
        <input type="text" id="input-new-account-name" class="form-control" placeholder="Nome da nova conta (ex: Alice, Comunidade, Bob)" maxlength="30" required />
        <button type="submit" class="btn btn-sm btn-outline" style="white-space:nowrap;">➕ Nova Conta</button>
      </form>
    </div>`;
}

/**
 * Renderiza o conjunto de cartões de ação e configurações exibidos na aba Sobre da própria conta.
 * @param {object} options Opções de configuração e estado da conta local.
 * @param {string} options.address Rota do perfil.
 * @param {boolean} options.isCurrentWallet Se é a conta ativa local.
 * @param {string} [options.handle=""] Handle do autor.
 * @param {string} [options.displayName=""] Nome de exibição.
 * @param {boolean} [options.hasWallet=false] Se tem carteira conectada.
 * @param {string} [options.balance="0.000"] Saldo formatado.
 * @param {string} [options.currentPixKey=""] Chave Pix atual.
 * @param {string} [options.currentGithub=""] Handle GitHub atual.
 * @param {string} [options.oauthProvider=""] Provedor OAuth importado.
 * @param {object} [options.identityMeta={}] Metadados de identidade.
 * @param {boolean} [options._isBlocked=false] Se está bloqueado.
 * @param {boolean} [options._isMuted=false] Se está silenciado.
 * @param {boolean} [options.meshDiscoverable=false] Se está visível na malha.
 * @returns {string} Fragmento HTML com os cartões de configuração.
 */
export function renderProfileActions({ address, isCurrentWallet, handle, displayName, hasWallet, balance, currentPixKey = "", currentGithub = "", oauthProvider = "", identityMeta = {}, _isBlocked = false, _isMuted = false, meshDiscoverable = false }) {
  if (!isCurrentWallet) return "";
  return `
    ${renderMultiAccountCard(address)}
    ${renderProfileIdentitySettingsCard({ displayName, oauthProvider, currentPixKey, currentGithub, identityMeta })}
    ${renderProfileMeshDiscoverableCard(meshDiscoverable)}
    ${renderSovereigntyCard(address)}
    ${renderLocalWipeCard()}
    ${renderProfileAdvancedSettingsDetails(handle, hasWallet, balance)}`;
}
