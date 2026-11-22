/**
 * @file Abas do perfil (publicações, amizades, salvos, sobre) e orquestração da grade.
 *
 * Resolve metadados de identidade e campos personalizados antes da montagem no DOM.
 *
 * @module render/profile-tabs
 */
import * as mock from "../mock.js";
import * as social from "../social.js";
import * as profileDirectory from "../profile-directory.js";
import {
  escapeHtml,
  shortId,
  renderMarkdownLight,
} from "./util.js";
import { renderPostItem } from "./feed.js";
import { isWelcomeRouteId } from "../vox-welcome-profile.js";
import { getLocalIdentityMeta } from "../profile-identity-meta.js";
import { renderProfileVoxelsTab } from "./profile-voxels.js";
import { renderProfileGridHeader, renderProfileGridTabs } from "./profile-header.js";
import { renderProfileActions } from "./profile-settings.js";

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

function renderOfficialPlatformAboutBlurb(address) {
  if (!isWelcomeRouteId(address)) return "";
  return `
    <p class="profile-grid-official-note desc">
      Conta oficial da plataforma — voz institucional do Vox (não é pessoa física).
      <a href="#/voxpedia">Voxpedia</a> · DM de boas-vindas
    </p>`;
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

function resolveProfileIdentityMeta(address, isCurrentWallet, optMeta) {
  if (optMeta && (optMeta.pronouns || optMeta.gender || optMeta.orientation)) return optMeta;
  if (isCurrentWallet) return getLocalIdentityMeta(address);
  const mockProf = mock.getMockProfile(address);
  return {
    pronouns: mockProf?.pronouns || "",
    gender: mockProf?.gender || "",
    orientation: mockProf?.orientation || "",
  };
}

function resolveProfileCustomFields(address, isCurrentWallet, githubHandle, readme, pinnedPostId) {
  const finalGithub = githubHandle || (isCurrentWallet ? social.getLocalGithubHandle() : mock.getAuthorGithub(address));
  const finalReadme = readme || (isCurrentWallet ? social.getLocalReadme() : mock.getAuthorReadme(address));
  const finalPinned = pinnedPostId || (isCurrentWallet ? social.getPinnedPostId(address) : mock.getAuthorPinnedPostId(address));
  return { finalGithub, finalReadme, finalPinned };
}

function prepareAuthorPostList(posts, finalPinned) {
  const list = [...(posts || [])];
  if (finalPinned) {
    const idx = list.findIndex((p) => p.id === finalPinned);
    if (idx > 0) {
      const [item] = list.splice(idx, 1);
      list.unshift(item);
    }
  }
  return list;
}

function shouldShowProfileAboutTab(address, isCurrentWallet, finalReadme, starredList, memberships) {
  const mockProf = mock.getMockProfile(address);
  const hasStereotype = Boolean(mockProf?.isStereotypeDemo || mockProf?.stereotypeTitle);
  return isCurrentWallet || finalReadme || hasStereotype || isWelcomeRouteId(address) || starredList.length || memberships.length;
}

/**
 * Normaliza query `?tab=` do perfil (legado `starred`/`communities` → `about`).
 * @param {string} tab Valor da URL.
 * @param {boolean} isCurrentWallet Se é o próprio perfil (permite aba Salvos).
 * @returns {string} Chave canônica da aba.
 */
export function normalizeProfileTab(tab, isCurrentWallet) {
  let t = tab || "posts";
  if (t === "starred" || t === "communities") return "about";
  if (t === "saved" && !isCurrentWallet) return "posts";
  return t;
}

function renderProfileAboutStarredSection(starredList, activeTab) {
  if (starredList.length) {
    return `<h3 class="profile-grid-about-heading">Estrelados (${starredList.length})</h3><div class="feed-container profile-grid-about-feed">${starredList.map((p) => renderPostItem(p)).join("")}</div>`;
  }
  if (activeTab === "starred") {
    return `<div class="empty"><p>Nenhum post favoritado com estrela ⭐ ainda.</p></div>`;
  }
  return "";
}

function renderProfileAboutCommunitiesSection(memberships, activeTab) {
  if (memberships.length) {
    const items = memberships.map((m) => `
      <div class="card" style="padding:10px 14px; margin-top:0.5rem;">
        <a href="#/c/${encodeURIComponent(m.communityId)}"><h3 style="margin:0 0 2px;">${escapeHtml(m.communityId)}</h3></a>
        <span class="meta">Membro confirmado</span>
      </div>`).join("");
    return `<h3 class="profile-grid-about-heading">Comunidades (${memberships.length})</h3><div class="card-list">${items}</div>`;
  }
  if (activeTab === "communities") {
    return `<div class="empty"><p>Nenhuma comunidade registrada neste perfil.</p></div>`;
  }
  return "";
}

function renderProfileAboutTab(p) {
  const blurb = renderOfficialPlatformAboutBlurb(p.address);
  const routeIdLine = `<p class="meta profile-route-id">ID de rede: <code>${escapeHtml(p.address)}</code></p>`;
  const readmeHtml = renderProfileReadme(p.address, p.displayName, p.finalReadme, p.isCurrentWallet);
  const actionsHtml = p.isCurrentWallet
    ? renderProfileActions({ address: p.address, isCurrentWallet: p.isCurrentWallet, handle: p.handle, displayName: p.displayName, hasWallet: p.hasWallet, balance: p.balance, currentPixKey: p.pixKey, currentGithub: p.finalGithub, oauthProvider: p.oauthProvider, identityMeta: p.identityMeta, _isBlocked: p.isBlocked, _isMuted: p.isMuted, meshDiscoverable: p.meshDiscoverable })
    : "";
  const starredHtml = renderProfileAboutStarredSection(p.starredList || [], p.activeTab);
  const commHtml = renderProfileAboutCommunitiesSection(p.memberships || [], p.activeTab);

  return `<div class="profile-grid-about">${blurb}${routeIdLine}${readmeHtml}${actionsHtml}${starredHtml}${commHtml}</div>`;
}

function renderProfileSavedTab(savedList) {
  if (savedList && savedList.length) {
    return renderProfilePostGrid(savedList);
  }
  return `<div class="profile-grid-empty empty"><p>Nenhum post salvo neste aparelho.</p></div>`;
}

function renderNetworkUserRow(routeId) {
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
}

function renderProfileNetworkTab(address, isCurrentWallet, currentTab) {
  const isFollowing = currentTab !== "followers";
  const list = isCurrentWallet ? social.getWatchedProfiles() : [];
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

  const items = list.map(renderNetworkUserRow).join("");
  return `
    <div class="profile-grid-network">
      <h3 class="profile-grid-about-heading">${title} (${list.length})</h3>
      <div class="card-list">${items}</div>
    </div>`;
}

/**
 * HTML interno de uma aba do perfil (posts, amizades, voxels, sobre, salvos).
 * @param {string} [currentTab="posts"] Aba solicitada.
 * @param {object} [params={}] Dados passados por {@link renderProfile}.
 * @returns {string} HTML do slot da aba.
 */
export function renderProfileTabContent(currentTab = "posts", params = {}) {
  const norm = normalizeProfileTab(currentTab, params.isCurrentWallet);
  if (norm === "posts") return renderProfilePostGrid(params.authorPostList, params.finalPinned);
  if (norm === "following" || norm === "followers") return renderProfileNetworkTab(params.address, params.isCurrentWallet, norm);
  if (norm === "saved") return renderProfileSavedTab(params.savedList);
  if (norm === "voxels") return renderProfileVoxelsTab(params);
  return renderProfileAboutTab(params);
}

/**
 * Monta o perfil em grade (cabeçalho, abas e slot de conteúdo).
 * @param {HTMLElement} main Container da rota `#/u/…`.
 * @param {string} address Rota `vx_…` do perfil.
 * @param {object[]} [memberships=[]] Comunidades do autor.
 * @param {boolean} [isCurrentWallet=false] Se é a conta local.
 * @param {object} [opts={}] Posts, aba ativa, Pix, carteira Arweave, etc.
 * @returns {void}
 */
export function renderProfile(main, address, memberships = [], isCurrentWallet = false, opts = {}) {
  const { finalGithub, finalReadme, finalPinned } = resolveProfileCustomFields(address, isCurrentWallet, opts.githubHandle, opts.readme, opts.pinnedPostId);
  const identityMeta = resolveProfileIdentityMeta(address, isCurrentWallet, opts.identityMeta);
  const authorPostList = prepareAuthorPostList(opts.posts, finalPinned);
  const starredList = opts.starredPosts || [];
  const savedList = opts.savedPosts || [];
  const postsCount = authorPostList.length || opts.stats?.posts || 0;
  const showAboutTab = shouldShowProfileAboutTab(address, isCurrentWallet, finalReadme, starredList, memberships);
  const currentTab = normalizeProfileTab(opts.activeTab, isCurrentWallet);

  const headerHtml = renderProfileGridHeader({ address, isCurrentWallet, handle: opts.handle || "", isConflict: opts.isConflict, claimants: opts.claimants, displayName: opts.displayName, profileBio: opts.profileBio, identityMeta, stats: opts.stats, postsCount, pixKeyMasked: opts.pixKeyMasked, pixKeyRaw: opts.pixKey, githubHandle: finalGithub, isBlocked: opts.isBlocked, isMuted: opts.isMuted });
  const tabsHtml = renderProfileGridTabs(address, currentTab, showAboutTab, isCurrentWallet);
  const contentHtml = renderProfileTabContent(currentTab, {
    address, isCurrentWallet, handle: opts.handle, authorPostList, finalPinned, savedList, displayName: opts.displayName,
    finalReadme, hasWallet: opts.hasWallet, balance: opts.balance, pixKey: opts.pixKey, finalGithub, identityMeta,
    oauthProvider: opts.oauthProvider, isBlocked: opts.isBlocked, isMuted: opts.isMuted,
    meshDiscoverable: opts.meshDiscoverable, starredList, memberships, activeTab: opts.activeTab,
  });

  main.innerHTML = `<div class="profile-grid-layout" data-profile-address="${escapeHtml(address)}">${headerHtml}${tabsHtml}<div class="profile-tab-content-slot" id="profile-tab-content">${contentHtml}</div></div>`;
}
