/** Barra IG-like: like, comentar, republicar, compartilhar (avião), salvar. Sem zap. */

import * as social from "../social.js";
import * as mod from "../moderation.js";
import { escapeHtml } from "./util.js";
import { renderRepostBtn } from "./repost-btn.js";

function iconHeart(on) {
  return `<svg class="action-icon icon-heart" width="18" height="18" viewBox="0 0 24 24" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;
}

function iconComment() {
  return `<svg class="action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
}

function iconPlane() {
  return `<svg class="action-icon icon-plane" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22 11 13 2 9z"/></svg>`;
}

function iconBookmark(on) {
  return `<svg class="action-icon icon-bookmark" width="18" height="18" viewBox="0 0 24 24" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>`;
}

function iconExplode() {
  return `<svg class="action-icon icon-explode" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>`;
}

function shareAttrs(postId) {
  if (!mod.isPostQuarantined(postId)) return "";
  return ` disabled aria-disabled="true" title="${escapeHtml(mod.QUARANTINE_HINT)}"`;
}

function commentBtn(t) {
  const n = Number(t.repliesCount) || 0;
  const count = `<span class="overlay-action-count count-replies">${n > 0 ? n : ""}</span>`;
  return `<button type="button" class="action-btn btn-comment" data-id="${escapeHtml(t.id)}" data-comm="${escapeHtml(t.communityId || "")}" aria-label="Comentar${n > 0 ? `, ${n} comentários` : ""}">${iconComment()}${count}</button>`;
}

function explodeBtn(t, authorDisplay) {
  const n = social.getExplodesCount(t.id, Number(t.explodesCount) || 0);
  const exploded = social.isExploded(t.id);
  const count = n > 0 ? `<span class="overlay-action-count count-explodes">${n}</span>` : `<span class="overlay-action-count count-explodes"></span>`;
  return `<button class="action-btn btn-explode btn-explode-post ${exploded ? "exploded" : ""}" data-id="${escapeHtml(t.id)}" data-count="${Number(t.explodesCount) || 0}" data-title="${escapeHtml(t.title)}" data-author="${escapeHtml(authorDisplay || "")}" data-body="${escapeHtml((t.body || t.title || "").slice(0, 200))}" data-comm="${escapeHtml(t.communityId || "")}" aria-label="Explodir nas redes (EXPLODE!)" title="EXPLODE! (Shift+clique para disparo rápido)">${iconExplode()}${count}</button>`;
}

export function renderIgToolbar(t, authorDisplay) {
  const liked = social.isLiked(t.id);
  const likes = social.getLikesCount(t.id, Number(t.likesCount) || 0);
  const saved = social.isSaved(t.id);
  const likeN = likes > 0 ? `<span class="overlay-action-count count-likes">${likes}</span>` : "";
  return `<div class="post-ig-toolbar" role="toolbar" aria-label="Ações da publicação">
    <div class="post-ig-toolbar-left">
      <button class="action-btn btn-like ${liked ? "active" : ""}" data-id="${escapeHtml(t.id)}" data-count="${Number(t.likesCount) || 0}" aria-label="Gostei${likes > 0 ? `, ${likes}` : ""}">${iconHeart(liked)}${likeN}</button>
      ${commentBtn(t)}
      ${renderRepostBtn(t)}
      <button class="action-btn btn-share btn-share-post" data-id="${escapeHtml(t.id)}" data-title="${escapeHtml(t.title)}" data-author="${escapeHtml(authorDisplay || "")}" data-body="${escapeHtml((t.title || "").slice(0, 160))}" aria-label="Compartilhar"${shareAttrs(t.id)}>${iconPlane()}</button>
      ${explodeBtn(t, authorDisplay)}
      ${t.isExternal ? `<button class="action-btn btn-quote-external" data-id="${escapeHtml(t.id)}" data-title="${escapeHtml(t.title)}" data-author="${escapeHtml(authorDisplay || "")}" data-handle="${escapeHtml(t.authorHandle || "")}" data-body="${escapeHtml((t.body || t.title || "").slice(0, 200))}" data-url="${escapeHtml(t.externalUrl || "")}" aria-label="Citar e debater no Vox" title="💬 Citar e debater no Vox"><svg class="action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>` : ""}
    </div>
    <button class="action-btn btn-save ${saved ? "active" : ""}" data-id="${escapeHtml(t.id)}" aria-label="Salvar post">${iconBookmark(saved)}</button>
  </div>`;
}

export function renderIgLikesLine(t) {
  const n = social.getLikesCount(t.id, Number(t.likesCount) || 0);
  if (n <= 0) return "";
  const label = n === 1 ? "1 curtida" : `${n} curtidas`;
  return `<p class="post-ig-likes">${escapeHtml(label)}</p>`;
}
