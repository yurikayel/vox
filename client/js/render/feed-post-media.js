/**
 * @file Hero de mídia e cabeçalhos IG-style em posts com foto/vídeo/áudio.
 *
 * @module render/feed-post-media
 */
import * as mock from "../mock.js";
import * as social from "../social.js";
import {
  isWelcomeRouteId,
  getWelcomeProfile,
} from "../vox-welcome-profile.js";
import {
  escapeHtml,
  normalizePostAspect,
  renderPostAuthorMetaLines,
  renderAvatarHtml,
  formatTimeAgo,
  postTimeParts,
} from "./util.js";
import { renderPhotoTagLayerHtml } from "./photo-tag-pins.js";
import {
  resolvePostImageAltText,
  renderPostImageLightboxTriggerHtml,
} from "./photo-chrome.js";
import { renderPostOwnerMenu } from "./feed-post-toolbar.js";

/**
 * Layout visual do cartão: `github`, `photo` ou `text`.
 * @param {object|null} t Post ou tópico.
 * @returns {"github"|"photo"|"text"}
 */
export function getPostFeedLayout(t) {
  if (t?.githubGist?.lines?.length) return "github";
  if (t?.image || t?.video || t?.audio || t?.mediaRef?.hash) return "photo";
  return "text";
}

/**
 * Cabeçalho de post de rede externa.
 *
 * @param {object} t
 * @param {object} labels
 * @param {string} ownerMenu
 * @returns {string}
 */
function renderExternalPostHeader(t, labels, ownerMenu) {
  const authorDisplay = labels.authorDisplay;
  const avatarImg = t.authorAvatar
    ? `<img class="avatar avatar-img" src="${escapeHtml(t.authorAvatar)}" alt="${escapeHtml(authorDisplay)}" loading="lazy" />`
    : `<span class="avatar avatar-bsky">🦋</span>`;
  const sourceBadge = `<span class="badge-post-external bsky" title="Post ingerido via AT Protocol"><a href="${escapeHtml(t.externalUrl || '#')}" target="_blank" rel="noopener noreferrer">🦋 Bluesky ↗</a></span>`;
  const cleanHandle = (labels.authorHandle || "").replace(/^@/, "");
  const handleHtml = cleanHandle ? `<span class="post-handle">@${escapeHtml(cleanHandle)}</span>` : "";

  return `
      <header class="post-header-inline post-header-external">
        <div class="post-header-user">
          <a class="avatar-link" href="${escapeHtml(t.externalUrl || '#')}" target="_blank" rel="noopener noreferrer">${avatarImg}</a>
          <div class="post-header-meta">
            <div class="post-author-line">
              <strong class="post-author-name">${escapeHtml(authorDisplay)}</strong>
              ${sourceBadge}
            </div>
            <div class="post-meta-sub">
              ${handleHtml}
              ${handleHtml ? '<span class="post-dot">·</span>' : ''}
              <time class="post-time">${escapeHtml(formatTimeAgo(t.ts))}</time>
            </div>
          </div>
        </div>
        ${ownerMenu ? `<div class="post-header-aside">${ownerMenu}</div>` : ""}
      </header>`;
}

/**
 * Cabeçalho padrão ou overlay administrativo em posts com mídia.
 * @param {object} t Post.
 * @param {string} author Rota do autor.
 * @param {object} labels Rótulos resolvidos.
 * @param {object} [options={}]
 * @param {boolean} [options.photoOverlay=false] Modo overlay em foto.
 * @returns {string} HTML do `<header>`.
 */
export function renderPostHeaderBlock(t, author, labels, { photoOverlay = false } = {}) {
  const authorDisplay = labels.authorDisplay;
  const ownerMenu = renderPostOwnerMenu(t);
  if (photoOverlay) {
    if (!ownerMenu) return "";
    return `<header class="post-header-inline post-header-photo-admin">
      <div class="post-header-aside">${ownerMenu}</div>
    </header>`;
  }
  if (t.isExternal) {
    return renderExternalPostHeader(t, labels, ownerMenu);
  }
  const metaHtml = renderPostAuthorMetaLines(author, labels, formatTimeAgo(t.ts), { ts: t.ts });
  const asideHtml = ownerMenu ? `<div class="post-header-aside">${ownerMenu}</div>` : "";
  return `
    <header class="post-header-inline">
      <div class="post-header-user">
        <a class="avatar-link" href="#/u/${encodeURIComponent(author)}">${renderAvatarHtml(author, authorDisplay, "", t.authorAvatar)}</a>
        ${metaHtml}
      </div>
      ${asideHtml}
    </header>`;
}

/**
 * Diz se o botão de seguir aparece sobre a mídia do post.
 *
 * @param {object} t
 * @param {string} author
 * @returns {boolean}
 */
function shouldShowPostFollowOverlay(t, author) {
  if (!author || t?.isOwnLocalPost) return false;
  if (isWelcomeRouteId(author)) return false;
  return true;
}

/**
 * Botão de seguir sobre a mídia.
 *
 * @param {string} author
 * @returns {string}
 */
function renderPostHeroFollowBtn(author) {
  const watching = social.isWatching(author);
  const label = watching ? "Seguindo" : "Seguir";
  return `<button type="button" class="btn-overlay-follow btn-watch-profile${watching ? " is-following" : ""}" data-route="${escapeHtml(author)}" aria-pressed="${watching ? "true" : "false"}" aria-label="${watching ? "Deixar de seguir autor" : "Seguir autor"}">${label}</button>`;
}

/**
 * Selo de perfil oficial, só para a conta de boas-vindas.
 *
 * @param {string} author
 * @returns {string}
 */
function renderPostHeroVerifiedBadge(author) {
  if (!isWelcomeRouteId(author)) return "";
  const official = getWelcomeProfile();
  if (!official?.isOfficialPlatform) return "";
  return `<span class="post-media-header-verified" title="Conta verificada" aria-label="Conta verificada">✓</span>`;
}

/**
 * UF do autor no cabeçalho da foto, vazia se desconhecida.
 *
 * @param {string} author
 * @returns {string}
 */
function photoHeaderUf(author) {
  const uf = mock.getMockProfile(author)?.uf;
  return uf ? `<span class="post-ig-header-uf">${escapeHtml(uf)}</span>` : "";
}

/**
 * Gatilho do menu Mais do post.
 *
 * @param {object} t
 * @param {string} author
 * @param {string} authorDisplay
 * @returns {string}
 */
function renderPostMoreMenuTrigger(t, author, authorDisplay) {
  const hasImage = t.image || t.mediaRef?.hash ? "1" : "";
  const isOwn = t.isOwnLocalPost ? "1" : "";
  const pix = escapeHtml(t.contactPix || "");
  return `<button type="button" class="btn-post-more-menu" aria-label="Mais opções da publicação" data-post-id="${escapeHtml(t.id)}" data-author-route="${escapeHtml(author)}" data-title="${escapeHtml(t.title || authorDisplay || "")}" data-has-image="${hasImage}" data-is-own="${isOwn}" data-pix="${pix}"><span aria-hidden="true">⋯</span></button>`;
}

/**
 * Cabeçalho estilo Instagram sobre o hero de mídia.
 * @param {object} t Post.
 * @param {string} author Rota do autor.
 * @param {object} labels Rótulos resolvidos.
 * @returns {string} HTML do cabeçalho sobre a foto.
 */
export function renderPostMediaHeader(t, author, labels) {
  const authorDisplay = labels.authorDisplay;
  const { display: timeDisplay, titleAttr: timeTitle } = postTimeParts(t.ts);
  const followBtn = shouldShowPostFollowOverlay(t, author) ? renderPostHeroFollowBtn(author) : "";
  const cleanHandle = (labels.authorHandle || "").replace(/^@/, "");
  const handleHtml = cleanHandle ? `<span class="post-ig-header-handle">@${escapeHtml(cleanHandle)}</span>` : "";
  const ufHtml = photoHeaderUf(author);

  return `<div class="post-media-header post-ig-header">
    <div class="post-media-header-left">
      <a class="avatar-link post-media-header-avatar" href="#/u/${encodeURIComponent(author)}">${renderAvatarHtml(author, authorDisplay, "sm", t.authorAvatar)}</a>
      <div class="post-media-header-text">
        <div class="post-media-header-name-row">
          <a class="post-media-header-username" href="#/u/${encodeURIComponent(author)}">${escapeHtml(authorDisplay)}</a>
          ${renderPostHeroVerifiedBadge(author)}
          ${ufHtml}
        </div>
        <div class="post-media-header-handle-row">
          ${handleHtml}
          ${handleHtml ? '<span class="post-media-header-dot" aria-hidden="true">·</span>' : ''}
          <span class="post-media-header-time"${timeTitle}>${escapeHtml(timeDisplay)}</span>
        </div>
      </div>
    </div>
    <div class="post-ig-header-end">
      ${followBtn}
      ${renderPostMoreMenuTrigger(t, author, authorDisplay)}
    </div>
  </div>`;
}

/**
 * Vídeo em destaque com sobreposições.
 *
 * @param {string} videoSrc
 * @param {string} overlayHeaderHtml
 * @param {string} overlayFooterHtml
 * @returns {string}
 */
function renderVideoHero(videoSrc, overlayHeaderHtml, overlayFooterHtml) {
  const src = escapeHtml(videoSrc);
  return `
    <div class="post-media-container post-media-hero post-media-video-container" style="background:#000; border-radius:var(--radius-sm); overflow:hidden; position:relative;">
      ${overlayHeaderHtml}
      <div class="lofi-video-header" style="position:absolute; top:52px; left:8px; z-index:2; display:flex; align-items:center; gap:6px;">
        <span class="badge-pill" style="font-size:0.7rem; padding:2px 6px; background:rgba(0,0,0,0.65); color:#fff; border:1px solid rgba(255,255,255,0.2);">📼 Lo-Fi 360p</span>
      </div>
      <video class="post-media-video" src="${src}" controls playsinline preload="metadata" style="width:100%; max-height:480px; display:block;"></video>
      ${overlayFooterHtml}
    </div>`;
}

/**
 * Áudio em destaque com sobreposições.
 *
 * @param {string} audioSrc
 * @param {string} overlayHeaderHtml
 * @param {string} overlayFooterHtml
 * @returns {string}
 */
function renderAudioHero(audioSrc, overlayHeaderHtml, overlayFooterHtml) {
  const src = escapeHtml(audioSrc);
  return `
    <div class="post-media-audio-card" style="margin:8px 0; padding:12px 14px; background:var(--surface-soft); border-radius:var(--radius-sm); border:1px solid var(--border);">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:1.1rem;">🎙️</span>
          <strong style="font-size:0.85rem;">Recado de Voz</strong>
        </div>
        <span class="badge-pill" style="font-size:0.7rem; padding:2px 6px; background:var(--surface); border:1px solid var(--border);">⚡ Lo-Fi 48k Opus</span>
      </div>
      <audio class="post-media-audio" src="${src}" controls style="width:100%; outline:none; border-radius:4px;"></audio>
      ${overlayHeaderHtml}
      ${overlayFooterHtml}
    </div>`;
}

/**
 * Imagem em destaque com texto alternativo e proporção.
 *
 * @param {object} t
 * @param {string} layer
 * @param {string} overlayHeaderHtml
 * @param {string} overlayFooterHtml
 * @returns {string}
 */
function renderImageHero(t, layer, overlayHeaderHtml, overlayFooterHtml) {
  const altText = resolvePostImageAltText(t);
  const aspect = normalizePostAspect(t?.aspectRatio);
  const aspectClass = `post-aspect-${aspect.replace(":", "-")}`;
  return `
    <div class="post-media-container post-media-hero ${aspectClass}" data-aspect="${escapeHtml(aspect)}">
      ${overlayHeaderHtml}
      ${renderPostImageLightboxTriggerHtml(t.image, altText)}
      ${layer}
      ${overlayFooterHtml}
    </div>`;
}

/**
 * Espaço de mídia carregada sob demanda pelo hash.
 *
 * @param {object} t
 * @param {string} layer
 * @param {string} overlayHeaderHtml
 * @param {string} overlayFooterHtml
 * @returns {string}
 */
function renderLazyMediaHero(t, layer, overlayHeaderHtml, overlayFooterHtml) {
  return `
    <div class="post-media-container post-media-hero post-media-lazy" data-media-hash="${escapeHtml(t.mediaRef.hash)}">
      <div class="media-placeholder" style="aspect-ratio:4/5; display:flex; align-items:center; justify-content:center; background:var(--surface-soft); color:var(--muted); font-size:0.85rem;">
        <span>📦 Mídia P2P (${escapeHtml(t.mediaRef.mime || "mídia")})</span>
      </div>
      ${layer}
      ${overlayHeaderHtml}
      ${overlayFooterHtml}
    </div>`;
}

/**
 * Bloco hero de mídia (foto, vídeo, áudio ou lazy P2P).
 * @param {object} t Post com campos de mídia.
 * @param {string} [overlayHeaderHtml=""] HTML opcional sobre a mídia.
 * @param {string} [overlayFooterHtml=""] HTML opcional abaixo da mídia.
 * @returns {string} HTML do container de mídia ou `""`.
 */
export function renderPostMediaHero(t, overlayHeaderHtml = "", overlayFooterHtml = "") {
  const layer = renderPhotoTagLayerHtml(t, { isOwn: Boolean(t.isOwnLocalPost) });
  if (t?.video) return renderVideoHero(t.video, overlayHeaderHtml, overlayFooterHtml);
  if (t?.audio) return renderAudioHero(t.audio, overlayHeaderHtml, overlayFooterHtml);
  if (t?.image) return renderImageHero(t, layer, overlayHeaderHtml, overlayFooterHtml);
  if (t?.mediaRef?.hash) return renderLazyMediaHero(t, layer, overlayHeaderHtml, overlayFooterHtml);
  return "";
}