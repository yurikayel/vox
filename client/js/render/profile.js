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
import * as localAccount from "../local-account.js";
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
  const following = `<a href="${href("following")}" class="profile-grid-tab profile-grid-tab-text ${currentTab === "following" || currentTab === "followers" ? "active" : ""}">Amizades</a>`;
  const about = showAbout
    ? `<a href="${href("about")}" class="profile-grid-tab profile-grid-tab-text ${currentTab === "about" ? "active" : ""}">Sobre</a>`
    : "";
  return `<nav class="profile-grid-tabs" aria-label="Seções do perfil">
      <a href="${href("posts")}" class="profile-grid-tab ${currentTab === "posts" ? "active" : ""}" aria-label="Publicações">${PROFILE_GRID_TAB_ICON}</a>
      ${following}
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
      <a class="profile-grid-stat" href="#/u/${encodeURIComponent(address)}?tab=posts" role="listitem">
        <span class="profile-grid-stat-value">${pub}</span>
        <span class="profile-grid-stat-label">${pub === 1 ? "publicação" : "publicações"}</span>
      </a>
      <a class="profile-grid-stat" href="#/u/${encodeURIComponent(address)}?tab=followers" role="listitem" title="Ver seguidores">
        <span class="profile-grid-stat-value">${followersCount}</span>
        <span class="profile-grid-stat-label">${followersCount === 1 ? "seguidor" : "seguidores"}</span>
      </a>
      <a class="profile-grid-stat" href="#/u/${encodeURIComponent(address)}?tab=following" role="listitem" title="Ver seguidos">
        <span class="profile-grid-stat-value">${followingCount}</span>
        <span class="profile-grid-stat-label">seguindo</span>
      </a>
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
        <a class="profile-grid-btn profile-grid-btn-outline" href="#/settings/linked-accounts">🔗 Redes</a>
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
      <button type="button" class="profile-grid-btn profile-grid-btn-outline" id="btn-qr-connect-link" data-qr-share="connect" data-qr-id="${escapeHtml(address)}" title="Cartão de Amizade / QR Code">📇 Conectar</button>
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
  const handleLabel = handle ? `@${handle}` : (isWelcomeRouteId(address) ? "@vox" : `@${shortId(address)}`);
  const statsData = stats || mock.getMockProfile(address)?.stats;
  const bioHtml = profileBio ? `<p class="profile-grid-bio desc">${escapeHtml(profileBio)}</p>` : "";
  const pixBadge = renderProfilePixBadge(pixKeyMasked, pixKeyRaw);
  const githubBadge = renderProfileGithubBadge(githubHandle);
  const primaryName = displayName || (isWelcomeRouteId(address) ? "Vox" : handleLabel);
  const secondaryHandle = displayName ? handleLabel : "";

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
        <h1 class="profile-grid-name">${escapeHtml(primaryName)}${renderOfficialPlatformBadge(address)}</h1>
        ${secondaryHandle ? `<p class="profile-grid-handle meta">${escapeHtml(secondaryHandle)}</p>` : ""}
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
  const handleLine = handle ? `<h1 class="profile-grid-handle">@${escapeHtml(handle)}</h1>` : (isWelcomeRouteId(handle) ? '<h1 class="profile-grid-handle">@vox</h1>' : "");
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
  const label = oauthProvider === "google" ? "Google" : oauthProvider === "facebook" ? "Meta" : oauthProvider === "github" ? "GitHub" : oauthProvider;
  const statusLine = oauthProvider
    ? `<p class="desc" style="margin:0 0 0.45rem;">Nome e foto importados via <strong>${escapeHtml(label)}</strong> (opcional). Tokens OAuth não são guardados neste aparelho.</p>`
    : `<p class="desc" style="margin:0 0 0.45rem;">Importe seu nome e foto via <strong>Google, Meta ou GitHub</strong> sem abrir mão da sua chave soberana <code>vx_*</code>.</p>`;
  return `
    <div class="oauth-enrich-notice" style="margin-top:0.65rem; padding:0.55rem 0.65rem; background:var(--surface-soft); border-radius:var(--radius-sm); font-size:0.82rem;">
      ${statusLine}
      <div style="display:flex; flex-wrap:wrap; gap:0.4rem;">
        <button type="button" id="btn-open-oauth-modal" class="btn btn-sm btn-outline">🔐 Entrar com Google / Meta / GitHub</button>
        <a href="#/settings/linked-accounts" class="btn btn-sm btn-outline">🔗 Redes Vinculadas & Auto-Replicação</a>
        ${oauthProvider ? `<button type="button" id="btn-clear-oauth-enrich" class="btn btn-sm btn-outline">Remover nome/foto importados</button>` : ""}
      </div>
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
      ${renderMultiAccountCard(address)}
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
  } else if (currentTab === "following" || currentTab === "followers") {
    html += renderProfileNetworkTab(address, isCurrentWallet, currentTab);
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
    <div class="card compose-card compose-community-card">
      <a class="back-link" href="#/communities">← Voltar</a>
      <h2>Nova Comunidade</h2>
      <form id="form-compose-community">
        <div class="form-group community-compose-photo-group">
          <label style="font-weight:600; display:block; margin-bottom:0.4rem;">Foto da Comunidade (estilo Orkut):</label>
          <div class="community-compose-photo-row" style="display:flex; gap:1rem; align-items:center;">
            <div id="comm-photo-preview" class="community-avatar-box community-avatar-lg" style="--comm-avatar-accent:var(--brand-chrome); width:80px; height:80px; flex-shrink:0;">
              <div class="community-avatar-fallback" style="background:var(--brand-chrome); font-size:1.8rem; display:flex; align-items:center; justify-content:center; width:100%; height:100%; color:#fff; font-weight:800; border-radius:14px;">C</div>
            </div>
            <div style="flex:1;">
              <label class="btn btn-sm btn-outline" style="cursor:pointer; display:inline-block; margin-bottom:0.4rem;">
                📁 Escolher foto do aparelho
                <input type="file" id="comm-photo-file" accept="image/*" style="display:none;" />
              </label>
              <input type="url" id="comm-photo-url" class="form-control" placeholder="Ou cole a URL da imagem (opcional)" style="font-size:0.85rem;" />
            </div>
          </div>
        </div>
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
          <input type="text" id="comm-category" class="form-control" list="comm-category-suggestions" placeholder="ex: Cultura & Artes, Política & Cidadania" maxlength="40" />
          <datalist id="comm-category-suggestions">
            <option value="Política & Cidadania">
            <option value="Cultura & Artes">
            <option value="Tecnologia & Software Livre">
            <option value="Cidades & Bairros">
            <option value="Música & Cinema">
            <option value="Economia Solidária">
            <option value="Educação & Ciência">
            <option value="Humor & Entretenimento">
          </datalist>
        </div>
        <div class="form-group">
          <label for="comm-type">Tipo de Comunidade:</label>
          <select id="comm-type" class="form-control">
            <option value="open">Pública (Aberta a todos)</option>
            <option value="closed">Moderada (Requer aprovação)</option>
          </select>
        </div>
        <div class="form-group">
          <label for="comm-desc">Descrição e Regras:</label>
          <textarea id="comm-desc" class="form-control" rows="3" placeholder="Qual o propósito desta comunidade? Quais as regras de convivência?" required maxlength="500"></textarea>
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
          <label for="topic-body">Mensagem:</label>
          <textarea id="topic-body" class="form-control" rows="5" placeholder="Escreva seu post aqui..." required></textarea>
          <details class="compose-chat-import" style="margin-top:0.65rem; padding:0.6rem 0.75rem; border:1px dashed var(--border); border-radius:var(--radius-sm); background:var(--surface-soft);">
            <summary style="cursor:pointer; font-size:0.82rem; font-weight:600; color:var(--accent);">📥 Importar Ata / Conversa do Slack ou Discord (Memória Anti-90-dias)</summary>
            <div style="margin-top:0.5rem;">
              <p class="meta" style="margin:0 0 0.4rem; font-size:0.76rem;">Cole abaixo o trecho copiado do Slack ou Discord. O Vox formata os turnos de fala em ata Markdown permanente.</p>
              <textarea id="chat-transcript-input" class="form-control" rows="4" placeholder="Ex:\nHelena — Hoje às 14:30\nAprovamos o mutirão de sábado.\nTiago — Hoje às 14:32\nFechado! Levo as mudas."></textarea>
              <div style="display:flex; gap:0.5rem; align-items:center; margin-top:0.45rem; flex-wrap:wrap;">
                <button type="button" id="btn-convert-chat-transcript" class="btn btn-sm btn-outline">Converter em Ata</button>
                <button type="button" id="btn-convert-and-notarize" class="btn btn-sm btn-primary">🏛️ Converter & Selar Cartório (Arweave)</button>
              </div>
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


function renderMultiAccountCard(currentAddress) {
  const accounts = localAccount.listVaultAccountsSync();
  const itemsHtml = accounts.map((acc) => {
    const isCurrent = acc.routeId === currentAddress;
    const name = acc.displayName || shortId(acc.routeId);
    const badge = isCurrent
      ? `<span class="badge-pill p2p-pill" style="font-size:0.75rem;">Ativa</span>`
      : `<button type="button" class="btn btn-xs btn-primary btn-switch-vault-account" data-route="${escapeHtml(acc.routeId)}">Alternar</button>`;
    const removeBtn = !isCurrent && accounts.length > 1
      ? `<button type="button" class="btn btn-xs btn-outline btn-remove-vault-account" data-route="${escapeHtml(acc.routeId)}" title="Remover do cofre local">✕</button>`
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
  }).join("");

  return `
    <div class="card profile-vault-accounts" style="margin-top:0.75rem;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.4rem;">
        <h3 style="margin:0;">Alternador de Contas Locais</h3>
        <span class="badge-pill" style="font-size:0.7rem;">Cofre Seguro</span>
      </div>
      <p class="desc" style="font-size:0.83rem; margin-bottom:0.5rem;">
        Alterne entre identidades soberanas neste navegador para testar amizades, comunidades e publicações de vida real.
      </p>
      <div class="vault-account-list" style="margin-bottom:0.75rem;">
        ${itemsHtml}
      </div>
      <form id="form-create-vault-account" style="display:flex; gap:0.5rem; align-items:center;">
        <input type="text" id="input-new-account-name" class="form-control" placeholder="Nome da nova conta (ex: Alice, Comunidade, Bob)" maxlength="30" required />
        <button type="submit" class="btn btn-sm btn-outline" style="white-space:nowrap;">➕ Nova Conta</button>
      </form>
    </div>`;
}

function renderProfileNetworkTab(address, isCurrentWallet, currentTab) {
  const isFollowing = currentTab !== "followers";
  const list = isCurrentWallet
    ? social.getWatchedProfiles()
    : [];
  const title = isFollowing ? "Acompanhados / Amizades" : "Seguidores";

  if (!list.length) {
    return `
      <div class="profile-grid-network">
        <h3 class="profile-grid-about-heading">${title}</h3>
        <div class="empty">
          <p>Nenhuma conta acompanhada ainda neste perfil.</p>
          <a class="btn btn-primary btn-sm" href="#/pessoas" style="margin-top:0.5rem;">Encontrar pessoas na rede</a>
        </div>
      </div>`;
  }

  const items = list.map((routeId) => {
    const disp = profileDirectory.getAuthorDisplaySync(routeId) || shortId(routeId);
    return `
      <div class="card" style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; margin-top:6px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <div class="avatar">${escapeHtml(disp.slice(0, 1).toUpperCase())}</div>
          <div>
            <a href="#/u/${encodeURIComponent(routeId)}"><strong>${escapeHtml(disp)}</strong></a>
            <div class="meta" style="font-size:0.75rem;"><code>${escapeHtml(shortId(routeId))}</code></div>
          </div>
        </div>
        <div style="display:flex; gap:6px;">
          <a class="btn btn-xs btn-outline" href="#/dm/${encodeURIComponent(routeId)}">💬 DM</a>
          <button type="button" class="btn btn-xs btn-outline btn-watch-profile" data-route="${escapeHtml(routeId)}">Seguindo</button>
        </div>
      </div>`;
  }).join("");

  return `
    <div class="profile-grid-network">
      <h3 class="profile-grid-about-heading">${title} (${list.length})</h3>
      <div class="card-list">${items}</div>
    </div>`;
}
