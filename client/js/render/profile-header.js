/**
 * @file Cabeçalho do perfil, avatar com nota efêmera, insígnias cívicas e estado não encontrado.
 *
 * Gera o topo em grade estilo Instagram/PWA, estatísticas de seguidores e barras de ações de amizade.
 *
 * @module render/profile-header
 */
import * as mock from "../mock.js";
import * as social from "../social.js";
import * as profileDirectory from "../profile-directory.js";
import { escapeHtml, shortId } from "./util.js";
import { isWelcomeRouteId } from "../vox-welcome-profile.js";
import { renderProfileNoteBubbleHtml } from "./profile-note-bubble.js";
import { renderIdentityMetaPills } from "./profile-identity-meta.js";
import { ACHIEVEMENT_CATALOG, evaluateAchievements, loadVoxelReceipts } from "../voxels.js";

const PROFILE_GRID_TAB_ICON = `<svg class="profile-grid-tab-icon" aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`;
const PROFILE_SAVED_TAB_ICON = `<svg class="profile-grid-tab-icon" aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>`;
const CATEGORY_RING = { forja: "ring-cobalt", agora: "ring-emerald", cuidado: "ring-amber" };

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

/**
 * Renderiza as abas de navegação do perfil em grade (posts, amizades, voxels, salvos, sobre).
 * @param {string} address Rota do perfil.
 * @param {string} currentTab Aba atualmente ativa.
 * @param {boolean} showAbout Se exibe a aba Sobre.
 * @param {boolean} showSaved Se exibe a aba Salvos.
 * @returns {string} Fragmento HTML da barra de abas.
 */
export function renderProfileGridTabs(address, currentTab, showAbout, showSaved) {
  const href = (tab) => `#/u/${encodeURIComponent(address)}?tab=${tab}`;
  const saved = showSaved
    ? `<a href="${href("saved")}" class="profile-grid-tab ${currentTab === "saved" ? "active" : ""}" data-tab="saved" aria-label="Salvos">${PROFILE_SAVED_TAB_ICON}</a>`
    : "";
  const following = `<a href="${href("following")}" class="profile-grid-tab profile-grid-tab-text ${currentTab === "following" || currentTab === "followers" ? "active" : ""}" data-tab="following">Amizades</a>`;
  const voxelsTab = `<a href="${href("voxels")}" class="profile-grid-tab profile-grid-tab-text ${currentTab === "voxels" ? "active" : ""}" data-tab="voxels">Voxels</a>`;
  const about = showAbout
    ? `<a href="${href("about")}" class="profile-grid-tab profile-grid-tab-text ${currentTab === "about" ? "active" : ""}" data-tab="about">Sobre</a>`
    : "";
  return `<nav class="profile-grid-tabs" aria-label="Seções do perfil">
      <a href="${href("posts")}" class="profile-grid-tab ${currentTab === "posts" ? "active" : ""}" data-tab="posts" aria-label="Publicações">${PROFILE_GRID_TAB_ICON}</a>
      ${following}
      ${voxelsTab}
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

/**
 * Selo de conta institucional oficial da plataforma Vox.
 * @param {string} address Rota do perfil.
 * @returns {string} Fragmento HTML do selo verificado ou vazio.
 */
export function renderOfficialPlatformBadge(address) {
  if (!isWelcomeRouteId(address)) return "";
  return `<span class="profile-grid-verified" title="Conta oficial Vox">✓</span>`;
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
  const initial = escapeHtml((displayName || handle || address || "U").slice(0, 1).toUpperCase());
  const avatarUrl = profileDirectory.getAuthorAvatarSync(address) || mock.getAuthorAvatar(address);
  const squircle = "";
  if (avatarUrl) {
    return `<div class="profile-grid-avatar-wrap">
      <img class="profile-grid-avatar-img${squircle}" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(displayName || address)}" data-fallback-next="1" />
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

function renderCurrentWalletActionRow(address) {
  return `
    <div class="profile-grid-actions">
      <a class="profile-grid-btn profile-grid-btn-outline" href="#/u/${encodeURIComponent(address)}?tab=about">Editar perfil</a>
      <a class="profile-grid-btn profile-grid-btn-outline" href="#/settings/linked-accounts">🔗 Redes</a>
      <button type="button" class="profile-grid-btn profile-grid-btn-outline" id="btn-copy-my-dm-link" data-route="${escapeHtml(address)}">Compartilhar</button>
      <button type="button" class="profile-grid-btn profile-grid-btn-outline" id="btn-copy-connect-link" data-route="${escapeHtml(address)}">Link connect</button>
      <button type="button" class="profile-grid-btn profile-grid-btn-outline" id="btn-qr-connect-link" data-qr-share="connect" data-qr-invite="1" data-qr-id="${escapeHtml(address)}">QR deste link</button>
    </div>`;
}

function renderWelcomeActionRow(address) {
  return `
    <div class="profile-grid-actions">
      <a class="profile-grid-btn profile-grid-btn-outline" href="#/voxpedia">Voxpedia</a>
      <a class="profile-grid-btn profile-grid-btn-outline" href="#/dm/${encodeURIComponent(address)}">Mensagem</a>
    </div>`;
}

function renderOtherUserActionRow(address, isBlocked, isMuted, pixKeyRaw = "", displayName = "") {
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

function renderProfileGridActionRow({ address, isCurrentWallet, isBlocked, isMuted, pixKeyRaw = "", displayName = "" }) {
  if (isCurrentWallet) return renderCurrentWalletActionRow(address);
  if (isWelcomeRouteId(address)) return renderWelcomeActionRow(address);
  return renderOtherUserActionRow(address, isBlocked, isMuted, pixKeyRaw, displayName);
}

function renderProfileConflictBanner(isConflict, claimants, handle) {
  if (!isConflict || !claimants?.length) return "";
  const claimantItems = claimants.map((c) => `<div>• <a href="#/u/${c.owner}">${escapeHtml(shortId(c.owner))}</a></div>`).join("");
  return `
    <div class="card error profile-grid-conflict">
      ⚠️ <strong>Conflito de Handle:</strong> <code>@${escapeHtml(handle)}</code> reivindicado por mais de uma conta.
      <div style="font-size:0.8rem; margin-top:0.3rem;">${claimantItems}</div>
    </div>`;
}

function renderProfileIdentityBlock({ address, displayName, handleLabel, profileBio, identityMeta, isCurrentWallet, pixBadge, githubBadge }) {
  const primaryName = displayName || (isWelcomeRouteId(address) ? "Vox" : handleLabel);
  const secondaryHandle = displayName ? handleLabel : "";
  const pillsHtml = renderIdentityMetaPills(identityMeta);
  const bioHtml = profileBio ? `<p class="profile-grid-bio desc">${escapeHtml(profileBio)}</p>` : "";
  const badgesHtml = (pixBadge || githubBadge) ? `<div class="profile-grid-meta-badges">${pixBadge}${githubBadge}</div>` : "";
  const selfBadge = isCurrentWallet ? '<p class="profile-grid-self-badge meta">Sua conta neste aparelho</p>' : "";

  return `
    <div class="profile-grid-identity">
      <h1 class="profile-grid-name">${escapeHtml(primaryName)}${renderOfficialPlatformBadge(address)}</h1>
      ${secondaryHandle ? `<p class="profile-grid-handle meta">${escapeHtml(secondaryHandle)}</p>` : ""}
      ${pillsHtml}
      ${bioHtml}
      ${selfBadge}
      ${badgesHtml}
    </div>`;
}

function readOwnUnlockedAchievementIds(address) {
  try {
    const receipts = loadVoxelReceipts(address);
    return new Set(evaluateAchievements(receipts).unlocked.map((a) => a.id));
  } catch {
    return new Set();
  }
}

function renderProfileCivicHighlights(address, isCurrentWallet) {
  if (!isCurrentWallet || !address) return "";
  const unlockedIds = readOwnUnlockedAchievementIds(address);
  const voxelsHref = `#/u/${encodeURIComponent(address)}?tab=voxels`;
  const items = ACHIEVEMENT_CATALOG.map((item) => {
    const unlocked = unlockedIds.has(item.id);
    const state = unlocked ? "Conquistado" : "Ainda não conquistado";
    return `
    <a class="civic-highlight-item${unlocked ? "" : " is-locked"}" href="${voxelsHref}" title="${escapeHtml(item.title)} — ${escapeHtml(item.description)} (${state})">
      <div class="civic-highlight-ring ${CATEGORY_RING[item.category] || "ring-emerald"}">
        <div class="civic-highlight-inner" aria-hidden="true">${item.icon}</div>
      </div>
      <span class="civic-highlight-name">${escapeHtml(item.title)}</span>
    </a>`;
  }).join("");

  return `
    <div class="profile-civic-highlights" aria-label="Selos e Insígnias Cívicas">
      <div class="profile-civic-highlights-header">
        <div class="profile-civic-highlights-title">
          <span>Selos &amp; Insígnias Cívicas</span>
        </div>
        <span class="profile-civic-highlights-meta">${unlockedIds.size}/${ACHIEVEMENT_CATALOG.length} conquistados</span>
      </div>
      <div class="profile-civic-highlights-scroll">
        ${items}
      </div>
    </div>`;
}

/**
 * Renderiza o cabeçalho completo do perfil em grade (avatar, bio, métricas, ações e selos).
 * @param {object} options Opções de montagem do cabeçalho.
 * @param {string} options.address Rota do autor.
 * @param {boolean} options.isCurrentWallet Se é a conta ativa local.
 * @param {string} [options.handle=""] Handle do autor.
 * @param {boolean} [options.isConflict=false] Se há conflito de handle.
 * @param {object[]} [options.claimants=[]] Reivindicantes em conflito.
 * @param {string} [options.displayName=""] Nome de exibição.
 * @param {string} [options.profileBio=""] Biografia do autor.
 * @param {object} [options.identityMeta={}] Metadados de identidade.
 * @param {object} [options.stats=null] Estatísticas sociais.
 * @param {number} [options.postsCount=0] Contagem de posts.
 * @param {string} [options.pixKeyMasked=""] Chave Pix mascarada.
 * @param {string} [options.pixKeyRaw=""] Chave Pix bruta.
 * @param {string} [options.githubHandle=""] Handle do GitHub.
 * @param {boolean} [options.isBlocked=false] Se o autor está bloqueado.
 * @param {boolean} [options.isMuted=false] Se o autor está silenciado.
 * @returns {string} Fragmento HTML do cabeçalho do perfil.
 */
export function renderProfileGridHeader({ address, isCurrentWallet, handle, isConflict, claimants, displayName, profileBio, identityMeta, stats, postsCount, pixKeyMasked, pixKeyRaw, githubHandle, isBlocked, isMuted }) {
  const handleLabel = handle ? `@${handle}` : (isWelcomeRouteId(address) ? "@vox" : `@${shortId(address)}`);
  const statsData = stats || mock.getMockProfile(address)?.stats;
  const pixBadge = renderProfilePixBadge(pixKeyMasked, pixKeyRaw);
  const githubBadge = renderProfileGithubBadge(githubHandle);
  const conflictBanner = renderProfileConflictBanner(isConflict, claimants, handle);
  const topDiv = `<div class="profile-grid-top">${renderProfileGridAvatar(address, displayName, handle, isCurrentWallet)}${renderProfileGridStats(postsCount, statsData, address, isCurrentWallet)}</div>`;
  const identity = renderProfileIdentityBlock({ address, displayName, handleLabel, profileBio, identityMeta, isCurrentWallet, pixBadge, githubBadge });
  const actions = renderProfileGridActionRow({ address, isCurrentWallet, isBlocked, isMuted, pixKeyRaw, displayName });
  const highlights = renderProfileCivicHighlights(address, isCurrentWallet);

  return `<header class="profile-grid-header">${topDiv}${identity}${actions}${highlights}${renderStereotypeDemoBanner(address)}${conflictBanner}</header>`;
}

/**
 * Shell mínimo estilo Instagram para @ não encontrado ou estados vazios.
 * @param {HTMLElement} main Container da rota.
 * @param {object} [options={}]
 * @param {string} [options.handle=""] @handle buscado.
 * @param {string} [options.title=""] Título do cartão.
 * @param {string} [options.bodyHtml=""] Corpo HTML já seguro.
 * @param {string} [options.actionsHtml=""] Botões de ação.
 * @returns {void}
 */
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
