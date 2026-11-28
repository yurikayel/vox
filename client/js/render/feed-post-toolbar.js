/**
 * @file Barra de ações do post, quarentena local e menu de dono.
 *
 * @module render/feed-post-toolbar
 */
import * as mock from "../mock.js";
import * as social from "../social.js";
import * as mod from "../moderation.js";
import * as i18n from "../i18n-pt-br.js";
import { escapeHtml, renderReportMenuItem } from "./util.js";
import { renderRepostBtn } from "./repost-btn.js";
import { commentsPanelId } from "./feed-comments.js";

/**
 * Atributos `disabled`/`title` quando o post está em quarentena local (compartilhar bloqueado).
 * @param {string} postId ID do post.
 * @returns {string} Fragmento HTML de atributos ou `""`.
 */
export function quarantineShareAttrs(postId) {
  if (!mod.isPostQuarantined(postId)) return "";
  return ` disabled aria-disabled="true" title="${escapeHtml(mod.QUARANTINE_HINT)}"`;
}

/**
 * Botão para alternar quarentena local do post.
 * @param {string} postId ID do post.
 * @param {object} [options={}]
 * @param {boolean} [options.asMenuItem=true] Usa `role="menuitem"` no menu overflow.
 * @returns {string} HTML do botão de quarentena.
 */
export function renderQuarantineAction(postId, { asMenuItem = true } = {}) {
  const id = String(postId || "");
  const on = mod.isPostQuarantined(id);
  const label = on ? "Tirar da quarentena local" : mod.QUARANTINE_ACTION_LABEL;
  const role = asMenuItem ? ' role="menuitem"' : "";
  return `<button type="button" class="action-btn btn-quarantine-post${on ? " is-quarantined" : ""}" data-id="${escapeHtml(id)}" title="${escapeHtml(mod.QUARANTINE_HINT)}" aria-label="${escapeHtml(label)}" aria-pressed="${on ? "true" : "false"}"${role}>
    <svg class="action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="4.93" x2="19.07" y1="4.93" y2="19.07"/></svg>
    <span class="toolbar-overflow-label">${escapeHtml(label)}</span>
  </button>`;
}

/**
 * Ações Editar/Apagar para publicação própria local (não em replies).
 * @param {object} t Post com `isOwnLocalPost` e `id`.
 * @returns {string} HTML do menu ou `""` se não for dono local.
 */
export function renderPostOwnerMenu(t) {
  if (!t?.isOwnLocalPost || t.type === "reply") return "";
  const syncTip = escapeHtml(i18n.localMutateEditDeleteTooltip);
  const hintId = `post-local-sync-hint-${escapeHtml(t.id)}`;
  return `<div class="post-owner-block">
    <div class="post-owner-menu" role="group" aria-label="Gerenciar publicação">
      <button type="button" class="btn-post-edit btn-text-quiet" data-id="${escapeHtml(t.id)}" title="${syncTip}" aria-describedby="${hintId}">Editar</button>
      <button type="button" class="btn-post-delete btn-text-quiet" data-id="${escapeHtml(t.id)}" title="${syncTip}" aria-describedby="${hintId}">Apagar</button>
      <button type="button" class="post-local-sync-hint" id="${hintId}" title="${syncTip}" aria-label="${syncTip}"><span aria-hidden="true">ⓘ</span></button>
    </div>
  </div>`;
}

/**
 * Barra de ações (curtir, comentar, repostar, compartilhar) de um post texto/github.
 * @param {object} t Post normalizado.
 * @param {string} author Rota do autor.
 * @param {string} authorDisplay Nome exibido.
 * @param {string} authorHandle Handle secundário.
 * @returns {string} HTML da `.post-actions`.
 */
export function renderPostToolbar(t, author, authorDisplay, authorHandle) {
  const baseLikes = Number(t.likesCount) || 0;
  const liked = social.isLiked(t.id);
  const likes = social.getLikesCount(t.id, baseLikes);
  const baseStars = Number(t.starsCount) || 0;
  const starred = social.isStarred(t.id);
  const stars = social.getStarsCount(t.id, baseStars);
  const saved = social.isSaved(t.id);

  return `
    <div class="post-actions insta-actions post-toolbar">
      ${renderToolbarPrimary(t, liked, baseLikes, likes, authorDisplay)}
      <div class="toolbar-secondary">
        ${renderToolbarOverflow({ t, author, authorDisplay, authorHandle, baseStars, starred, stars })}
        <button class="action-btn btn-save ${saved ? "active" : ""}" data-id="${escapeHtml(t.id)}" aria-label="Salvar post" aria-pressed="${saved}">
          <svg class="action-icon icon-bookmark" width="16" height="16" viewBox="0 0 24 24" fill="${saved ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
        </button>
      </div>
    </div>`;
}

/**
 * Botão de comentários do post com a contagem.
 *
 * @param {object} t
 * @param {object} [options={}]
 * @returns {string}
 */
function renderCommentButton(t, { overlay = false } = {}) {
  const n = Number(t.repliesCount) || 0;
  const panelId = commentsPanelId(t.id);
  const overlayCls = overlay ? " overlay-action-btn" : "";
  const label = overlay
    ? `<span class="overlay-action-count count-replies">${n > 0 ? n : ""}</span>`
    : `<span class="action-count count-replies">${n > 0 ? n : ""}</span>`;
  return `<button type="button" class="action-btn btn-comment${overlayCls}" data-id="${escapeHtml(t.id)}" data-comm="${escapeHtml(t.communityId || "")}" aria-expanded="false" aria-controls="${escapeHtml(panelId)}" aria-label="Comentar${n > 0 ? `, ${n} comentários` : ""}">
            <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            ${label}
          </button>`;
}

/**
 * Botão de Pix (zap) quando o autor tem chave.
 *
 * @param {object} t
 * @param {string} author
 * @param {string} authorDisplay
 * @returns {string}
 */
function renderZapToolbarBtn(t, author, authorDisplay) {
  const pix = t.contactPix || (author ? mock.getAuthorPixKey(author) : "") || "";
  const icon = `<svg class="action-icon icon-zap" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
  if (!pix) {
    return `<button class="action-btn btn-zap-post disabled" disabled role="menuitem" aria-label="Autor sem Pix informado" title="Autor sem chave Pix informada" style="opacity:0.35; cursor:not-allowed;">${icon}</button>`;
  }
  return `<button class="action-btn btn-zap-post" data-id="${escapeHtml(t.id)}" data-author="${escapeHtml(author)}" data-author-name="${escapeHtml(authorDisplay)}" data-pix="${escapeHtml(pix)}" data-title="${escapeHtml(t.title)}" role="menuitem" aria-label="Apoiar com Pix" title="Apoiar com Pix">${icon}</button>`;
}

/**
 * Menu de ações extras da barra do post.
 *
 * @param {object} options
 * @returns {string}
 */
function renderToolbarOverflow({ t, author, authorDisplay, authorHandle, baseStars, starred, stars }) {
  return `<details class="toolbar-overflow">
    <summary class="action-btn btn-toolbar-more" aria-label="Mais ações do post"><span aria-hidden="true">⋯</span></summary>
    <div class="toolbar-overflow-menu" role="menu">
      ${renderZapToolbarBtn(t, author, authorDisplay)}
      <button type="button" class="action-btn btn-star ${starred ? " active" : ""}" data-id="${escapeHtml(t.id)}" data-count="${baseStars}" role="menuitemcheckbox" aria-checked="${starred}" aria-label="Dar estrela ao post">
        <svg class="action-icon icon-star" width="18" height="18" viewBox="0 0 24 24" fill="${starred ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        <span class="action-count count-stars">${stars > 0 ? stars : ""}</span>
        <span class="toolbar-overflow-label">Estrela</span>
      </button>
      <button type="button" class="action-btn btn-copy-md" data-id="${escapeHtml(t.id)}" data-title="${escapeHtml(t.title)}" data-body="${escapeHtml(t.body || "")}" data-author="${escapeHtml(authorDisplay)}" data-handle="${escapeHtml(authorHandle)}" role="menuitem" aria-label="Copiar post como Markdown">
        <svg class="action-icon icon-copy" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
        <span class="toolbar-overflow-label">Copiar .md</span>
      </button>
      ${renderQuarantineAction(t.id)}
      ${renderReportMenuItem(t.id, author, t.communityId || "")}
    </div>
  </details>`;
}

/**
 * Botão de compartilhar com a contagem.
 *
 * @param {object} t
 * @param {string} authorDisplay
 * @returns {string}
 */
function renderToolbarShareBtn(t, authorDisplay) {
  const baseExplodes = Number(t.explodesCount) || 0;
  const explodes = social.getExplodesCount(t.id, baseExplodes);
  const exploded = social.isExploded(t.id);
  const countSpan = explodes > 0 ? `<span class="action-count count-explodes">${explodes}</span>` : `<span class="action-count count-explodes"></span>`;
  const bodySlice = escapeHtml((t.body || t.title || "").slice(0, 200));

  return `<button class="action-btn btn-share btn-share-post ${exploded ? "exploded" : ""}" data-id="${escapeHtml(t.id)}" data-count="${baseExplodes}" data-title="${escapeHtml(t.title)}" data-author="${escapeHtml(authorDisplay || "")}" data-body="${bodySlice}" data-comm="${escapeHtml(t.communityId || "")}" aria-label="Compartilhar post" title="Compartilhar"${quarantineShareAttrs(t.id)}>
    <svg class="action-icon icon-share" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
    ${countSpan}
  </button>`;
}

/**
 * Ações principais da barra do post (curtir, citar, comentar).
 *
 * @param {object} t
 * @param {boolean} liked
 * @param {number} baseLikes
 * @param {number} likes
 * @param {string} authorDisplay
 * @returns {string}
 */
function renderToolbarPrimary(t, liked, baseLikes, likes, authorDisplay) {
  const quoteBtn = t.isExternal ? `
    <button class="action-btn btn-quote-external" data-id="${escapeHtml(t.id)}" data-title="${escapeHtml(t.title)}" data-author="${escapeHtml(authorDisplay || "")}" data-handle="${escapeHtml(t.authorHandle || "")}" data-body="${escapeHtml((t.body || t.title || "").slice(0, 280))}" data-url="${escapeHtml(t.externalUrl || "")}" aria-label="Citar e debater no Vox" title="💬 Citar e debater no Vox">
      <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <span class="action-count">Citar</span>
    </button>` : "";

  return `
    <div class="toolbar-primary">
      <button class="action-btn btn-like ${liked ? "active" : ""}" data-id="${escapeHtml(t.id)}" data-count="${baseLikes}" aria-label="Curtir post" aria-pressed="${liked}">
        <svg class="action-icon icon-heart" width="16" height="16" viewBox="0 0 24 24" fill="${liked ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
        <span class="action-count count-likes">${likes > 0 ? likes : ""}</span>
      </button>
      ${renderCommentButton(t)}
      ${renderRepostBtn(t, { size: 16 })}
      ${renderToolbarShareBtn(t, authorDisplay)}
      ${quoteBtn}
    </div>`;
}