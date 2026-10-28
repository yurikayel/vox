/** @file Profiles, wallet, Pix, compose screens. */
import * as mock from "../mock.js";
import * as social from "../social.js";
import * as listing from "../listing.js";
import * as profileDirectory from "../profile-directory.js";
import {
  escapeHtml,
  shortId,
  renderAvatarHtml,
  renderMarkdownLight,
} from "./util.js";
import { renderPostItem } from "./feed.js";
import { isWelcomeRouteId } from "../vox-welcome-profile.js";
import { LOCAL_WIPE_NOTICE } from "../local-account.js";
import { renderProfileNoteBubbleHtml } from "./profile-note-bubble.js";

function renderProfileGithubBadge(githubHandle) {
  if (!githubHandle) return "";
  const clean = escapeHtml(String(githubHandle).replace(/^@+/, ""));
  return `
    <div class="profile-github-badge">
      <span class="github-badge-icon">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
      </span>
      <span>GitHub: <a href="https://github.com/${clean}" target="_blank" rel="noopener"><strong>@${clean}</strong></a></span>
      <span class="badge-pill gh-pill">Informado</span>
    </div>`;
}

function renderProfileReadme(address, displayName, readme, isCurrentWallet) {
  if (!readme && !isCurrentWallet) return "";
  const contentHtml = readme
    ? renderMarkdownLight(readme)
    : `<p class="desc" style="font-style:italic;">Nenhum README.md adicionado ainda. Conte sobre seus projetos e ideias!</p>`;
  return `
    <div class="card profile-readme" style="margin-top:0.75rem;">
      <div class="readme-header">
        <span class="readme-title"><span class="readme-icon">📖</span> <strong>README.md</strong></span>
        ${isCurrentWallet ? `<button type="button" id="btn-toggle-edit-readme" class="btn btn-xs btn-outline">Editar README</button>` : ""}
      </div>
      <div class="readme-body" id="readme-view">
        ${contentHtml}
      </div>
      ${isCurrentWallet ? `
        <form id="form-edit-readme" style="display:none; margin-top:0.6rem;">
          <textarea id="input-profile-readme" class="form-control" rows="5" placeholder="Escreva seu README em Markdown...">${escapeHtml(readme || "")}</textarea>
          <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
            <button type="submit" class="btn btn-sm btn-primary">Salvar README</button>
            <button type="button" id="btn-cancel-readme" class="btn btn-sm btn-outline">Cancelar</button>
          </div>
        </form>
      ` : ""}
    </div>`;
}

const PROFILE_GRID_TAB_ICON = `<svg class="profile-grid-tab-icon" aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`;
const PROFILE_SAVED_TAB_ICON = `<svg class="profile-grid-tab-icon" aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>`;

function renderProfileGridTabs(address, currentTab, showAbout, showSaved) {
  const href = (tab) => `#/u/${encodeURIComponent(address)}?tab=${tab}`;
  const saved = showSaved
    ? `<a href="${href("saved")}" class="profile-grid-tab ${currentTab === "saved" ? "active" : ""}" aria-label="Salvos">${PROFILE_SAVED_TAB_ICON}</a>`
    : "";
  const about = showAbout
    ? `<a href="${href("about")}" class="profile-grid-tab profile-grid-tab-text ${currentTab === "about" ? "active" : ""}">Sobre</a>`
    : "";
  return `<nav class="profile-grid-tabs" aria-label="Seções do perfil">
      <a href="${href("posts")}" class="profile-grid-tab ${currentTab === "posts" ? "active" : ""}" aria-label="Publicações">${PROFILE_GRID_TAB_ICON}</a>
      ${saved}
      ${about}
    </nav>`;
}

function renderProfileGridStats(postsCount, statsData, address, isCurrentWallet) {
  const baseFollowers = statsData?.followers || 0;
  const followersCount = social.getFollowersCount(address, baseFollowers);
  const followingCount = isCurrentWallet
    ? social.getWatchedProfiles().length
    : (statsData?.following ?? 0);
  const pub = Number(postsCount) || 0;
  return `
    <div class="profile-grid-stats" role="list">
      <div class="profile-grid-stat" role="listitem">
        <span class="profile-grid-stat-value">${pub}</span>
        <span class="profile-grid-stat-label">${pub === 1 ? "publicação" : "publicações"}</span>
      </div>
      <div class="profile-grid-stat" role="listitem">
        <span class="profile-grid-stat-value">${followersCount}</span>
        <span class="profile-grid-stat-label">${followersCount === 1 ? "seguidor" : "seguidores"}</span>
      </div>
      <div class="profile-grid-stat" role="listitem">
        <span class="profile-grid-stat-value">${followingCount}</span>
        <span class="profile-grid-stat-label">seguindo</span>
      </div>
    </div>`;
}

function renderStereotypeDemoBanner(address) {
  const prof = mock.getMockProfile(address);
  if (!prof?.isStereotypeDemo && !prof?.stereotypeTitle) return "";
  const title = prof.stereotypeTitle || "Perfil estereótipo 🇧🇷";
  const greeting =
    prof.stereotypeGreeting || "Oi, sou só um estereótipo respeitoso — não me leve a mal!";
  const disclaimerNote =
    prof.stereotypeDisclaimerNote ||
    "Perfil fictício para demo e educação no Vox — clichês regionais leves, nunca para ridicularizar pessoas reais.";
  const ufLine = prof.uf && prof.stateName
    ? `<p class="meta" style="margin:0.35rem 0 0;">${escapeHtml(prof.stateName)} (${escapeHtml(prof.uf)}) — humor educativo, não pessoa real.</p>`
    : "";
  return `
    <details class="profile-grid-disclaimer profile-stereotype-banner">
      <summary>🧪 ${escapeHtml(title)} — toque para o aviso demo</summary>
      <div class="profile-grid-disclaimer-body">
        <p style="margin:0;"><strong>👋 ${escapeHtml(greeting)}</strong></p>
        <p class="desc" style="margin:0.45rem 0 0; font-size:0.88rem;">
          ${escapeHtml(disclaimerNote)}
          Este é um <strong>perfil estereótipo</strong> para <strong>testes da plataforma</strong> e explicação lúdica de demografia regional. O clichê está no texto — nunca na zombaria de aparência.
        </p>
        ${ufLine}
      </div>
    </details>`;
}

function renderOfficialPlatformBadge(address) {
  if (!isWelcomeRouteId(address)) return "";
  return `<span class="profile-grid-verified" title="Conta oficial Vox">✓</span>`;
}

function renderOfficialPlatformAboutBlurb(address) {
  if (!isWelcomeRouteId(address)) return "";
  return `
    <p class="profile-grid-official-note desc">
      Conta oficial da plataforma — voz institucional do Vox (não é pessoa física).
      <a href="#/voxpedia">Voxpedia</a> · DM de boas-vindas
    </p>`;
}

function renderProfilePixBadge(pixKeyMasked, pixKeyRaw) {
  if (!pixKeyMasked) return "";
  const query = encodeURIComponent(pixKeyRaw || pixKeyMasked);
  return `
    <div class="profile-pix-badge">
      <span class="pix-badge-icon">❖</span>
      <span>Chave Pix: <strong>${escapeHtml(pixKeyMasked)}</strong></span>
      <a class="pix-badge-link" href="#/pix/${query}">Consultar</a>
    </div>`;
}

function renderProfileGridAvatarInner(address, displayName, handle) {
  const initial = (displayName || handle || address || "U").slice(0, 1).toUpperCase();
  const avatarUrl = profileDirectory.getAuthorAvatarSync(address) || mock.getAuthorAvatar(address);
  const squircle = isWelcomeRouteId(address) ? " avatar-squircle" : "";
  if (avatarUrl) {
    return `<div class="profile-grid-avatar-wrap">
      <img class="profile-grid-avatar-img${squircle}" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(displayName || address)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
      <span class="avatar profile-grid-avatar-fallback${squircle}" style="display:none;">${initial}</span>
    </div>`;
  }
  return `<div class="profile-grid-avatar-wrap"><span class="avatar profile-grid-avatar-fallback${squircle}">${initial}</span></div>`;
}

function renderProfileGridAvatar(address, displayName, handle, isOwn) {
  const inner = renderProfileGridAvatarInner(address, displayName, handle);
  const bubble = renderProfileNoteBubbleHtml(address, { isOwn });
  return `<div class="profile-grid-avatar-stage">${inner}${bubble}</div>`;
}

function renderProfileGridActionRow(address, isCurrentWallet, isBlocked, isMuted, pixKeyRaw = "", displayName = "") {
  if (isCurrentWallet) {
    return `
      <div class="profile-grid-actions">
        <a class="profile-grid-btn profile-grid-btn-outline" href="#/u/${encodeURIComponent(address)}?tab=about">Editar perfil</a>
        <button type="button" class="profile-grid-btn profile-grid-btn-outline" id="btn-copy-my-dm-link" data-route="${escapeHtml(address)}">Compartilhar</button>
        <button type="button" class="profile-grid-btn profile-grid-btn-outline" id="btn-copy-connect-link" data-route="${escapeHtml(address)}">Link connect</button>
        <button type="button" class="profile-grid-btn profile-grid-btn-outline" id="btn-qr-connect-link" data-qr-share="connect" data-qr-id="${escapeHtml(address)}">QR deste link</button>
      </div>`;
  }
  if (isWelcomeRouteId(address)) {
    return `
      <div class="profile-grid-actions">
        <a class="profile-grid-btn profile-grid-btn-outline" href="#/voxpedia">Voxpedia</a>
        <a class="profile-grid-btn profile-grid-btn-outline" href="#/dm/${encodeURIComponent(address)}">Mensagem</a>
      </div>`;
  }
  const isWatchingAuthor = social.isWatching(address);
  const followClass = isWatchingAuthor ? "profile-grid-btn-outline is-following" : "profile-grid-btn-primary";
  const zapBtn = pixKeyRaw
    ? `<button type="button" class="profile-grid-btn profile-grid-btn-outline btn-zap-profile" data-pix="${escapeHtml(pixKeyRaw)}" data-author="${escapeHtml(address)}" data-author-name="${escapeHtml(displayName || address)}" aria-label="Apoiar com Pix">⚡ Apoiar</button>`
    : "";
  return `
    <div class="profile-grid-actions">
      <button type="button" class="profile-grid-btn ${followClass} btn-watch-profile" data-route="${escapeHtml(address)}" aria-pressed="${isWatchingAuthor ? "true" : "false"}">
        ${isWatchingAuthor ? "Seguindo" : "Seguir"}
      </button>
      ${zapBtn}
      <a class="profile-grid-btn profile-grid-btn-outline" href="#/dm/${encodeURIComponent(address)}">Mensagem</a>
      <button type="button" class="profile-grid-btn profile-grid-btn-outline" id="btn-copy-author-route" data-route="${escapeHtml(address)}">Copiar ID</button>
    </div>
    <details class="profile-grid-mod-actions">
      <summary>Moderação local</summary>
      <div class="profile-grid-mod-actions-body">
        <button type="button" class="btn btn-sm ${isBlocked ? "btn-outline" : "btn-danger"}" id="btn-toggle-block" data-route="${escapeHtml(address)}">
          ${isBlocked ? "Desbloquear Autor" : "Bloquear"}
        </button>
        <button type="button" class="btn btn-sm btn-outline" id="btn-toggle-mute" data-route="${escapeHtml(address)}">
          ${isMuted ? "Desilenciar no Feed" : "Silenciar"}
        </button>
      </div>
    </details>`;
}

function renderProfileGridHeader(
  address,
  isCurrentWallet,
  handle,
  isConflict,
  claimants,
  displayName,
  profileBio = "",
  stats = null,
  postsCount = 0,
  pixKeyMasked = "",
  pixKeyRaw = "",
  githubHandle = "",
  isBlocked = false,
  isMuted = false,
) {
  const handleLabel = handle ? `@${handle}` : `@${shortId(address)}`;
  const statsData = stats || mock.getMockProfile(address)?.stats;
  const bioHtml = profileBio ? `<p class="profile-grid-bio desc">${escapeHtml(profileBio)}</p>` : "";
  const pixBadge = renderProfilePixBadge(pixKeyMasked, pixKeyRaw);
  const githubBadge = renderProfileGithubBadge(githubHandle);
  const nameHtml = displayName
    ? `<p class="profile-grid-display-name">${escapeHtml(displayName)}</p>`
    : "";

  const conflictBanner = isConflict
    ? `<div class="card error profile-grid-conflict">
        ⚠️ <strong>Conflito de Handle:</strong> <code>@${escapeHtml(handle)}</code> reivindicado por mais de uma conta.
        <div style="font-size:0.8rem; margin-top:0.3rem;">
          ${claimants.map((c) => `<div>• <a href="#/u/${c.owner}">${escapeHtml(shortId(c.owner))}</a></div>`).join("")}
        </div>
      </div>`
    : "";

  return `
    <header class="profile-grid-header">
      <div class="profile-grid-top">
        ${renderProfileGridAvatar(address, displayName, handle, isCurrentWallet)}
        ${renderProfileGridStats(postsCount, statsData, address, isCurrentWallet)}
      </div>
      <div class="profile-grid-identity">
        <h1 class="profile-grid-handle">${escapeHtml(handleLabel)}${renderOfficialPlatformBadge(address)}</h1>
        ${nameHtml}
        ${bioHtml}
        ${isCurrentWallet ? `<p class="profile-grid-self-badge meta">Sua conta neste aparelho</p>` : ""}
        ${(pixBadge || githubBadge) ? `<div class="profile-grid-meta-badges">${pixBadge}${githubBadge}</div>` : ""}
      </div>
      ${renderProfileGridActionRow(address, isCurrentWallet, isBlocked, isMuted, pixKeyRaw, displayName)}
      ${renderStereotypeDemoBanner(address)}
      ${conflictBanner}
    </header>`;
}

function renderProfilePostGrid(posts, pinnedPostId = "") {
  if (!posts?.length) {
    return `<div class="profile-grid-empty empty"><p>Nenhuma publicação ainda.</p></div>`;
  }
  const tiles = posts.map((p) => {
    const img = p.image || p.thumbnail || "";
    const pinned = p.id === pinnedPostId
      ? `<span class="profile-grid-pin" aria-label="Fixado">📌</span>`
      : "";
    const inner = img
      ? `<img src="${escapeHtml(img)}" alt="" loading="lazy" />`
      : `<span class="profile-grid-placeholder" aria-hidden="true">${escapeHtml(String(p.title || "?").slice(0, 1))}</span>`;
    return `<a class="profile-grid-item" href="#/t/${encodeURIComponent(p.id)}" aria-label="${escapeHtml(p.title || "Post")}">${inner}${pinned}</a>`;
  }).join("");
  return `<div class="profile-grid">${tiles}</div>`;
}

/** Minimal IG shell for handle-not-found and similar states. */
export function renderProfileGridNotFound(main, { handle = "", title = "", bodyHtml = "", actionsHtml = "" } = {}) {
  const handleLine = handle ? `<h1 class="profile-grid-handle">@${escapeHtml(handle)}</h1>` : "";
  main.innerHTML = `
    <div class="profile-grid-layout profile-grid-not-found">
      <header class="profile-grid-header profile-grid-header-minimal">${handleLine}</header>
      <div class="card profile-grid-not-found-card">
        ${title ? `<h2>${escapeHtml(title)}</h2>` : ""}
        ${bodyHtml}
        ${actionsHtml ? `<div class="profile-grid-not-found-actions">${actionsHtml}</div>` : ""}
      </div>
    </div>`;
}

function renderPixForm(currentPixKey) {
  return `
    <div class="pix-section">
      <label for="input-pix-key" class="pix-label">Chave Pix (opcional no perfil):</label>
      <p class="desc pix-desc">Chave para apoios diretos. Não é login nem valida titularidade bancária. Seu ID de conta continua sendo sua chave criptográfica local.</p>
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
  if (!oauthProvider) return "";
  const label = oauthProvider === "google" ? "Google" : oauthProvider === "facebook" ? "Meta" : oauthProvider;
  return `
    <div class="oauth-enrich-notice" style="margin-top:0.65rem; padding:0.55rem 0.65rem; background:var(--surface-soft); border-radius:var(--radius-sm); font-size:0.82rem;">
      <p class="desc" style="margin:0 0 0.45rem;">Nome e foto importados via <strong>${escapeHtml(label)}</strong> (opcional). Tokens OAuth não são guardados neste aparelho.</p>
      <button type="button" id="btn-clear-oauth-enrich" class="btn btn-sm btn-outline">Remover nome/foto importados</button>
    </div>`;
}

function renderSovereigntyCard() {
  return `
      <div class="card profile-sovereignty-export" style="margin-top:0.75rem;">
        <h3>Arquivo de soberania</h3>
        <p class="desc" style="font-size:0.85rem; margin-bottom:0.5rem;">
          Chaves P-256 de assinatura e chaves de DM <strong>deste aparelho</strong>.
          Não inclui o IndexedDB completo nem a lista de seguidores.
          Sem senha o JSON sai em claro (kind <code>vox-account-backup</code>); senha opcional cifra com AES-GCM.
          Extensão <code>.voxid</code> é o mesmo payload que <code>.json</code>.
        </p>
        <label for="input-sovereignty-passphrase" class="desc" style="display:block; font-size:0.82rem; margin-bottom:0.25rem;">
          Senha opcional para cifrar o arquivo
        </label>
        <input type="password" id="input-sovereignty-passphrase" class="form-control" autocomplete="new-password" placeholder="Senha (opcional)" style="margin-bottom:0.5rem;" />
        <div style="display:flex; flex-wrap:wrap; gap:0.5rem;">
          <button type="button" id="btn-export-account" class="btn btn-sm btn-primary">Baixar arquivo de soberania (.voxid)</button>
          <button type="button" id="btn-export-account-alt" class="btn btn-sm btn-outline" hidden aria-hidden="true">💾 Exportar Identidade (.json)</button>
          <label class="btn btn-sm btn-outline" style="margin:0; cursor:pointer;">
            📥 Restaurar Backup
            <input type="file" id="file-import-account" accept=".json,.voxid,application/json" style="display:none;" />
          </label>
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

function renderProfileActions(
  address,
  isCurrentWallet,
  handle,
  displayName,
  hasWallet,
  balance,
  currentPixKey = "",
  currentGithub = "",
  oauthProvider = "",
  isBlocked = false,
  isMuted = false,
  meshDiscoverable = false,
) {
  if (isCurrentWallet) {
    return `
      <div class="card profile-grid-settings-card" style="margin-top:0.75rem;">
        <h3>Identidade Local</h3>
        <form id="form-display-name" style="margin-top:0.5rem; display:flex; gap:0.5rem;">
          <input type="text" id="input-display-name" class="form-control" placeholder="Seu apelido ou nome..." value="${escapeHtml(displayName || "")}" maxlength="30" />
          <button type="submit" class="btn btn-sm btn-primary" style="white-space:nowrap;">Salvar Nome</button>
        </form>
        ${renderOAuthEnrichmentBlock(oauthProvider)}
        ${renderPixForm(currentPixKey)}
        ${renderGithubForm(currentGithub)}
      </div>

      <div class="card" style="margin-top:0.75rem;">
        <h3>Descoberta na malha</h3>
        <div class="form-group" style="display:flex; align-items:flex-start; gap:0.6rem; margin-top:0.5rem;">
          <input type="checkbox" id="profile-mesh-discoverable" ${meshDiscoverable ? "checked" : ""} style="width:1.1rem; height:1.1rem; margin-top:0.2rem;" />
          <div>
            <label for="profile-mesh-discoverable" style="margin:0; font-weight:600;">Aparecer na busca da malha</label>
            <p class="desc" style="font-size:0.82rem; margin:0.25rem 0 0;">Cartão assinado opt-in para pares conectados; sem ranking nem servidor central.</p>
          </div>
        </div>
      </div>

      ${renderSovereigntyCard()}
      ${renderLocalWipeCard()}

      <details class="advanced-settings card" style="margin-top:0.75rem;">
        <summary>Avançado — Arquivamento Permanente & Carteira</summary>
        <div style="margin-top:0.75rem;">
          <p class="desc">Por padrão, o Vox opera na rede distribuída com custo zero entre aparelhos. Se quiser arquivar publicações e seu @handle permanentemente no permaweb, configure sua carteira Arweave abaixo:</p>

          <form id="form-claim-handle" style="margin-top:0.75rem;">
            <label style="font-size:0.85rem; font-weight:600;">Reivindicar @handle on-chain:</label>
            <div style="display:flex; gap:0.5rem; margin-top:0.25rem;">
              <input type="text" id="input-handle-slug" class="form-control" placeholder="ex: maria" value="${handle || ""}" />
              <button type="submit" id="btn-submit-handle" class="btn btn-sm btn-primary" style="white-space:nowrap;">Salvar @handle</button>
            </div>
          </form>

          <div style="margin-top:0.75rem; border-top:1px solid var(--border); padding-top:0.6rem; display:flex; flex-wrap:wrap; gap:0.4rem;">
            <button id="btn-copy-dmpub" class="btn btn-sm btn-outline">📋 Copiar Chave Pública</button>
            <button id="btn-publish-dmpub" class="btn btn-sm btn-primary">🌐 Publicar Chave on-chain</button>
          </div>

          <div style="margin-top:0.75rem; border-top:1px solid var(--border); padding-top:0.6rem;">
            <h4>Carteira Arweave</h4>
            ${hasWallet ? `
              <p class="meta">Status: Conectada · Saldo: <strong>${escapeHtml(balance || "0.000")} AR</strong></p>
              <button id="btn-disconnect-wallet" class="btn btn-danger btn-sm">Desconectar Carteira</button>
            ` : `
              <p class="meta">Nenhuma carteira Arweave conectada.</p>
              <div style="display:flex; gap:0.5rem; margin-top:0.4rem;">
                <button id="btn-generate-wallet" class="btn btn-primary btn-sm">⚡ Gerar Carteira Arweave</button>
                <a href="#/wallet" class="btn btn-outline btn-sm">Importar JWK</a>
              </div>
            `}
          </div>
        </div>
      </details>`;
  }
  return "";
}

export function renderProfile(main, address, memberships = [], isCurrentWallet = false, dmPubStr = "", {
  handle = "",
  isConflict = false,
  claimants = [],
  displayName = "",
  profileBio = "",
  stats = null,
  posts = [],
  starredPosts = [],
  savedPosts = [],
  hasWallet = false,
  balance = "0.000",
  pixKey = "",
  pixKeyMasked = "",
  githubHandle = "",
  readme = "",
  activeTab = "posts",
  pinnedPostId = "",
  oauthProvider = "",
  isBlocked = false,
  isMuted = false,
  meshDiscoverable = false,
} = {}) {
  const finalGithub = githubHandle || (isCurrentWallet ? social.getLocalGithubHandle() : mock.getAuthorGithub(address));
  const finalReadme = readme || (isCurrentWallet ? social.getLocalReadme() : mock.getAuthorReadme(address));
  const finalPinned = pinnedPostId || (isCurrentWallet ? social.getPinnedPostId(address) : mock.getAuthorPinnedPostId(address));

  const authorPostList = [...(posts || [])];
  if (finalPinned) {
    const pinIdx = authorPostList.findIndex((p) => p.id === finalPinned);
    if (pinIdx > 0) {
      const [pinnedItem] = authorPostList.splice(pinIdx, 1);
      authorPostList.unshift(pinnedItem);
    }
  }

  const starredList = starredPosts || [];
  const savedList = savedPosts || [];
  const postsCount = authorPostList.length || stats?.posts || 0;
  const mockProf = mock.getMockProfile(address);
  const hasStereotypeAbout = Boolean(mockProf?.isStereotypeDemo || mockProf?.stereotypeTitle);
  const showAboutTab = isCurrentWallet || finalReadme || hasStereotypeAbout || isWelcomeRouteId(address)
    || starredList.length || memberships.length;

  let currentTab = activeTab || "posts";
  if (currentTab === "starred" || currentTab === "communities") currentTab = "about";
  if (currentTab === "saved" && !isCurrentWallet) currentTab = "posts";

  let html = `<div class="profile-grid-layout">`;
  html += renderProfileGridHeader(
    address,
    isCurrentWallet,
    handle,
    isConflict,
    claimants,
    displayName,
    profileBio,
    stats,
    postsCount,
    pixKeyMasked,
    pixKey,
    finalGithub,
    isBlocked,
    isMuted,
  );

  html += renderProfileGridTabs(address, currentTab, showAboutTab, isCurrentWallet);

  if (currentTab === "posts") {
    html += renderProfilePostGrid(authorPostList, finalPinned);
  } else if (currentTab === "saved") {
    html += savedList.length
      ? renderProfilePostGrid(savedList)
      : `<div class="profile-grid-empty empty"><p>Nenhum post salvo neste aparelho.</p></div>`;
  } else {
    html += `<div class="profile-grid-about">`;
    html += renderOfficialPlatformAboutBlurb(address);
    html += `<p class="meta profile-route-id">ID de rede: <code>${escapeHtml(address)}</code></p>`;
    html += renderProfileReadme(address, displayName, finalReadme, isCurrentWallet);
    if (isCurrentWallet) {
      html += renderProfileActions(
        address,
        isCurrentWallet,
        handle,
        displayName,
        hasWallet,
        balance,
        pixKey,
        finalGithub,
        oauthProvider,
        isBlocked,
        isMuted,
        meshDiscoverable,
      );
    }
    if (starredList.length) {
      html += `<h3 class="profile-grid-about-heading">Estrelados (${starredList.length})</h3>`;
      html += `<div class="feed-container profile-grid-about-feed">${starredList.map((p) => renderPostItem(p)).join("")}</div>`;
    }
    if (memberships.length) {
      html += `<h3 class="profile-grid-about-heading">Comunidades (${memberships.length})</h3>`;
      html += `<div class="card-list">${memberships.map((m) => `
        <div class="card" style="padding:10px 14px; margin-top:0.5rem;">
          <a href="#/c/${encodeURIComponent(m.communityId)}"><h3 style="margin:0 0 2px;">${escapeHtml(m.communityId)}</h3></a>
          <span class="meta">Membro confirmado</span>
        </div>`).join("")}</div>`;
    }
    if (activeTab === "starred" && !starredList.length) {
      html += `<div class="empty"><p>Nenhum post favoritado com estrela ⭐ ainda.</p></div>`;
    }
    if (activeTab === "communities" && !memberships.length) {
      html += `<div class="empty"><p>Nenhuma comunidade registrada neste perfil.</p></div>`;
    }
    html += `</div>`;
  }

  html += `</div>`;
  main.innerHTML = html;
}

export function renderPixLookup(main, query = "", profile = null) {
  const queryStr = escapeHtml(query);
  let content = "";
  if (profile) {
    const profName = profile.name || shortId(profile.routeId);
    const profHandle = profile.handle ? `@${profile.handle}` : "";
    const pixMasked = profile.pixKeyMasked || profile.pixKey || "";
    content = `
      <div class="card pix-lookup-card">
        <div class="pix-lookup-header">
          <span class="badge-pill p2p-pill">❖ Conta Localizada</span>
        </div>
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
  } else {
    content = `
      <div class="card pix-lookup-card empty">
        <h2>Chave Pix não vinculada</h2>
        <p class="desc">A chave <code>${queryStr}</code> não consta no seu índice local (perfis e tour neste navegador).</p>
        <p class="meta" style="margin-top:0.5rem;">Chaves Pix são atributos opcionais declarados localmente — não são posts públicos na malha.</p>
        <div class="actions-row" style="margin-top:1rem;">
          <a class="btn btn-outline" href="#/">← Voltar ao Início</a>
        </div>
      </div>`;
  }

  main.innerHTML = `
    <div class="actions-bar">
      <span class="section-title">Consulta de Chave Pix</span>
    </div>
    ${content}
  `;
}

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

export function renderWallet(main, { address = null, balance = "0.000", hasWallet = false, error = null } = {}) {
  let statusBox = "";
  if (hasWallet && address) {
    statusBox = `
      <div class="card wallet-info">
        <h3>Carteira Conectada</h3>
        <p class="meta">Endereço: <code>${escapeHtml(address)}</code></p>
        <p class="balance">Saldo: <strong>${escapeHtml(balance)} AR</strong></p>
        <div class="actions-row">
          <a class="btn btn-outline" href="#/perfil">Meu Perfil</a>
          <button id="btn-disconnect-wallet" class="btn btn-danger">Desconectar</button>
        </div>
      </div>`;
  } else {
    statusBox = `
      <div class="card wallet-warning">
        <p>Conecte ou gere uma carteira Arweave se desejar publicar dados no permaweb permanente.</p>
        <button id="btn-generate-wallet" class="btn btn-primary">⚡ Gerar Carteira Instantânea</button>
      </div>`;
  }

  let html = `
    <div class="actions-bar">
      <span class="section-title">Carteira Arweave</span>
    </div>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
    ${statusBox}
    <div class="card wallet-import">
      <h3>Importar Carteira (JWK)</h3>
      <p class="meta">Cole o JSON da sua chave privada:</p>
      <form id="form-import-wallet">
        <textarea id="wallet-jwk-input" rows="4" class="form-control" placeholder='{"kty":"RSA","n":"...","e":"AQAB",...}' required></textarea>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Salvar Carteira</button>
        </div>
      </form>
    </div>`;

  main.innerHTML += html;
}

export function renderComposeCommunity(main) {
  main.innerHTML = `
    <div class="card compose-card">
      <a class="back-link" href="#/communities">← Voltar</a>
      <h2>Nova Comunidade</h2>
      <form id="form-compose-community">
        <div class="form-group">
          <label for="comm-id">Identificador único (slug):</label>
          <input type="text" id="comm-id" class="form-control" placeholder="ex: cinema-nacional" required pattern="^[a-z0-9-]+$" title="Apenas letras minúsculas, números e hífens." />
        </div>
        <div class="form-group">
          <label for="comm-title">Título:</label>
          <input type="text" id="comm-title" class="form-control" placeholder="ex: Cinema Brasileiro" required maxlength="100" />
        </div>
        <div class="form-group">
          <label for="comm-category">Categoria:</label>
          <input type="text" id="comm-category" class="form-control" placeholder="ex: Cultura, Tecnologia" maxlength="40" />
        </div>
        <div class="form-group">
          <label for="comm-desc">Descrição e Regras:</label>
          <textarea id="comm-desc" class="form-control" rows="3" placeholder="Qual o propósito desta comunidade?" required maxlength="500"></textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" id="btn-submit-comm">Publicar Comunidade</button>
        </div>
      </form>
    </div>`;
}

export function renderComposeTopic(main, communityId) {
  const backLink = communityId
    ? `<a class="back-link" href="#/c/${encodeURIComponent(communityId)}">← Voltar à comunidade</a>`
    : `<a class="back-link" href="#/">← Voltar</a>`;

  main.innerHTML = `
    <div class="card compose-card">
      ${backLink}
      <h2>${communityId ? `Postar em ${escapeHtml(communityId)}` : "Novo Post na Rede"}</h2>
      <form id="form-compose-topic">
        ${communityId ? `<input type="hidden" id="topic-comm-id" value="${escapeHtml(communityId)}" />` : `
          <div class="form-group">
            <label for="topic-comm-id">Slug da Comunidade:</label>
            <input type="text" id="topic-comm-id" class="form-control" placeholder="ex: cinema-nacional" required />
          </div>
        `}
        <div class="form-group">
          <label for="topic-title">Título:</label>
          <input type="text" id="topic-title" class="form-control" placeholder="O que está acontecendo?" required maxlength="120" />
        </div>
        <div class="form-group">
          <label for="topic-body">Mensagem:</label>
          <textarea id="topic-body" class="form-control" rows="5" placeholder="Escreva seu post aqui..." required></textarea>
          <details class="compose-chat-import" style="margin-top:0.65rem; padding:0.6rem 0.75rem; border:1px dashed var(--border); border-radius:var(--radius-sm); background:var(--surface-soft);">
            <summary style="cursor:pointer; font-size:0.82rem; font-weight:600; color:var(--accent);">📥 Importar Ata / Conversa do Slack ou Discord (Memória Anti-90-dias)</summary>
            <div style="margin-top:0.5rem;">
              <p class="meta" style="margin:0 0 0.4rem; font-size:0.76rem;">Cole abaixo o trecho copiado do Slack ou Discord. O Vox formata os turnos de fala em ata Markdown permanente.</p>
              <textarea id="chat-transcript-input" class="form-control" rows="4" placeholder="Ex:\nHelena — Hoje às 14:30\nAprovamos o mutirão de sábado.\nTiago — Hoje às 14:32\nFechado! Levo as mudas."></textarea>
              <button type="button" id="btn-convert-chat-transcript" class="btn btn-sm btn-outline" style="margin-top:0.45rem;">Converter em Ata Formatada</button>
            </div>
          </details>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" id="btn-submit-topic">Publicar Post</button>
        </div>
      </form>
    </div>`;
}

export function renderComposeReply(main, topicId, communityId) {
  main.innerHTML = `
    <div class="card compose-card">
      <a class="back-link" href="#/t/${encodeURIComponent(topicId)}">← Voltar ao post</a>
      <h2>Responder</h2>
      <form id="form-compose-reply">
        <input type="hidden" id="reply-topic-id" value="${escapeHtml(topicId)}" />
        <input type="hidden" id="reply-comm-id" value="${escapeHtml(communityId)}" />
        <div class="form-group">
          <textarea id="reply-body" class="form-control" rows="4" placeholder="Sua resposta..." required></textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" id="btn-submit-reply">Enviar Resposta</button>
        </div>
      </form>
    </div>`;
}

export function renderComposeListing(main, communityId, commTitle = "", prefill = {}) {
  const titleDisplay = commTitle || communityId || "Feira";
  const backLink = `<a class="back-link" href="#/c/${encodeURIComponent(communityId)}?tab=listings">← Voltar à feira</a>`;
  const defaultPix = prefill.defaultPix || "";

  main.innerHTML = `
    <div class="card compose-card compose-listing-card">
      ${backLink}
      <h2>Nova Oferta — ${escapeHtml(titleDisplay)}</h2>
      <p class="listing-form-disclaimer" style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1rem;">
        ⚡ ${escapeHtml(listing.LISTING_DISCLAIMER)}
      </p>
      <form id="form-compose-listing">
        <input type="hidden" id="listing-comm-id" value="${escapeHtml(communityId)}" />
        <div class="form-group">
          <label for="listing-title">O que você está ofertando?</label>
          <input type="text" id="listing-title" class="form-control" placeholder="Ex: Pão artesanal de fermentação natural" required maxlength="120" />
        </div>
        <div class="form-row" style="display:flex; gap:0.75rem; flex-wrap:wrap;">
          <div class="form-group" style="flex:1 1 140px;">
            <label for="listing-price">Preço sugerido:</label>
            <input type="text" id="listing-price" class="form-control" placeholder="Ex: R$ 35" />
          </div>
          <div class="form-group" style="flex:1 1 180px;">
            <label for="listing-location">Bairro / Região:</label>
            <input type="text" id="listing-location" class="form-control" placeholder="Ex: Vila Madalena, SP" maxlength="60" />
          </div>
        </div>
        <div class="form-group">
          <label for="listing-pix">Chave Pix para recebimento direto (opcional):</label>
          <input type="text" id="listing-pix" class="form-control" placeholder="E-mail, celular, CPF ou chave aleatória" value="${escapeHtml(defaultPix)}" />
        </div>
        <div class="form-group">
          <label for="listing-image">Foto do item (URL opcional):</label>
          <input type="text" id="listing-image" class="form-control" placeholder="images/posts/tour-helena.jpg ou https://..." />
        </div>
        <div class="form-group">
          <label for="listing-body">Descrição da oferta:</label>
          <textarea id="listing-body" class="form-control" rows="4" placeholder="Descreva os detalhes do produto ou serviço, prazos e forma de entrega..." required></textarea>
        </div>
        <div class="form-actions" style="margin-top:1rem;">
          <button type="submit" class="btn btn-primary" id="btn-submit-listing">Publicar na Feira</button>
        </div>
      </form>
    </div>`;
}
