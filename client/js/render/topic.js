/** @file Single-topic thread view and detail text. */
import * as mock from "../mock.js";
import * as social from "../social.js";
import * as hashtags from "../hashtags.js";
import * as postOwnership from "../post-ownership.js";
import * as gossipRetract from "../gossip-retract-ui.js";
import {
  escapeHtml,
  shortId,
  resolvePostAuthorLabels,
  renderPostAuthorMetaLines,
  renderAvatarHtml,
  formatTimeAgo,
  postTimeParts,
} from "./util.js";
import { renderPostOwnerMenu, renderQuarantineAction, quarantineShareAttrs } from "./feed.js";
import { renderPhotoTagLayerHtml } from "./photo-tag-pins.js";
import { renderRepostCiteHtml } from "./repost-cite.js";
import { renderRepostBtn } from "./repost-btn.js";
import * as mod from "../moderation.js";
import { renderPostBodyMarkdown } from "./markdown-body.js";

function shareTopicAria(topicId) {
  if (mod.canEchoPost(topicId)) return "Compartilhar post";
  return `Compartilhar desativado. ${mod.QUARANTINE_HINT}`;
}

function renderTopicDetailText(topicId, title, bodyText) {
  const disp = postOwnership.formatPostDisplay({ title, body: bodyText });
  if (disp.mode === "caption") {
    return `<div class="post-body post-caption-only post-topic-detail" style="font-size:0.98rem; line-height:1.5; margin:0.75rem 0 0;">${hashtags.linkifyHashtags(escapeHtml(disp.text))}</div>`;
  }
  const titleBlock = `<h2 class="post-title post-topic-detail-title" style="margin:0.75rem 0 0.5rem; font-size:1.25rem;">${escapeHtml(disp.title || "Post")}</h2>`;
  const bodyBlock = `<div class="post-body post-body-md" style="font-size:0.98rem; line-height:1.5;">${renderPostBodyMarkdown(disp.body || "")}</div>`;
  return `${titleBlock}${bodyBlock}`;
}
export function renderTopic(main, topicId, topic, replies, { topicData = null, isMod = false, communityId = "" } = {}) {
  const commId = communityId || topic?.communityId || "";
  const backLink = commId ? `<a class="back-link" href="#/c/${encodeURIComponent(commId)}">← Voltar à comunidade</a>` : "";
  if (gossipRetract.shouldHideGossipDeletedPost(topic)) {
    main.innerHTML = `${backLink}${gossipRetract.renderGossipDeletedTopicShellHtml()}`;
    return;
  }
  const bodyText = topicData?.body || topic?.body || "Sem conteúdo textual.";
  const author = topic?.author || topic?.owner || "";
  const labels = resolvePostAuthorLabels(author, {
    authorDisplay: topic?.authorDisplay,
    isOwnLocalPost: topic?.isOwnLocalPost,
  });
  const { authorDisplay, authorHandle } = labels;
  const originBadge = topic?.isLocalP2p
    ? `<span class="badge-pill p2p-pill">Na rede</span>`
    : `<span class="badge-pill permanent-pill">Guardado</span>`;
  const topicTs = topic?.ts || topicData?.ts;
  const timeLabel = formatTimeAgo(topicTs);
  const topicAuthorMeta = renderPostAuthorMetaLines(author, labels, timeLabel, { ts: topicTs });
  const ownerMenuHeader = renderPostOwnerMenu(topic);

  const topicImage = topic?.image || topicData?.image || "";
  const topicImageAlt = topic?.imageAlt || topicData?.imageAlt || topic?.title || "Foto da publicação";
  const imageHtml = topicImage
    ? `<div class="post-media-container post-media-hero"><img class="post-media post-media-hero-img" src="${escapeHtml(topicImage)}" alt="${escapeHtml(topicImageAlt)}" />${renderPhotoTagLayerHtml(topic || topicData || {}, { isOwn: Boolean(topic?.isOwnLocalPost) })}</div>`
    : "";

  const baseLikes = Number(topic?.likesCount) || 0;
  const liked = social.isLiked(topicId);
  const currentLikes = social.getLikesCount(topicId, baseLikes);

  const baseStars = Number(topic?.starsCount) || 0;
  const starred = social.isStarred(topicId);
  const currentStars = social.getStarsCount(topicId, baseStars);

  const saved = social.isSaved(topicId);
  const authorPixKey = topic?.contactPix || (author ? mock.getAuthorPixKey(author) : "") || "";

  const modBtn = isMod
    ? `<button class="btn btn-sm btn-danger btn-mod-hide" data-id="${escapeHtml(topicId)}" data-type="topic">🛡️ Ocultar</button>`
    : "";

  let html = `
    ${backLink}
    <article class="topic-root insta-topic-root card" style="padding:1.25rem;">
      <div class="post-header post-header-inline">
        <div class="post-header-user">
          <a class="avatar-link" href="#/u/${encodeURIComponent(author)}">${renderAvatarHtml(author, authorDisplay)}</a>
          ${topicAuthorMeta}
        </div>
        <div class="post-header-aside">
          <div class="post-header-tags">${originBadge}</div>
          ${ownerMenuHeader}
        </div>
      </div>
      ${imageHtml}
      ${renderRepostCiteHtml(topic || {})}
      ${renderTopicDetailText(topicId, topic?.title || "", bodyText)}
      <div class="post-actions insta-actions post-toolbar" style="margin-top:12px; padding-top:8px;">
        <button class="action-btn btn-like ${liked ? "active" : ""}" data-id="${escapeHtml(topicId)}" data-count="${baseLikes}" aria-label="Curtir post">
          <svg class="action-icon icon-heart" width="18" height="18" viewBox="0 0 24 24" fill="${liked ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
          <span class="action-count count-likes">${currentLikes > 0 ? currentLikes : ""}</span>
        </button>
        ${renderRepostBtn({ ...(topic || {}), id: topicId, title: topic?.title || "", author }, { size: 18 })}
        <button class="action-btn btn-star ${starred ? "active" : ""}" data-id="${escapeHtml(topicId)}" data-count="${baseStars}" aria-label="Dar estrela ao post">
          <svg class="action-icon icon-star" width="18" height="18" viewBox="0 0 24 24" fill="${starred ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          <span class="action-count count-stars">${currentStars > 0 ? currentStars : ""}</span>
        </button>
        ${authorPixKey
          ? `<button class="action-btn btn-zap-post" data-id="${escapeHtml(topicId)}" data-author="${escapeHtml(author)}" data-author-name="${escapeHtml(authorDisplay)}" data-pix="${escapeHtml(authorPixKey)}" data-title="${escapeHtml(topic?.title || "")}" aria-label="Apoiar com Pix Zap" title="Apoiar com Pix Zap">
          <svg class="action-icon icon-zap" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          <span class="action-label zap-label" style="font-size:0.75rem; font-weight:600; margin-left:2px;">Apoiar</span>
        </button>`
          : `<button class="action-btn btn-zap-post disabled" disabled aria-label="Autor sem Pix informado" title="Autor sem chave Pix informada" style="opacity:0.35; cursor:not-allowed;">
          <svg class="action-icon icon-zap" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        </button>`
        }
        <button id="btn-share-topic" class="action-btn btn-share btn-share-post" data-id="${escapeHtml(topicId)}" data-title="${escapeHtml(topic?.title || "")}" data-author="${escapeHtml(authorDisplay || "")}" data-body="${escapeHtml((bodyText || "").slice(0, 160))}" aria-label="${escapeHtml(shareTopicAria(topicId))}"${quarantineShareAttrs(topicId)}>
          <svg class="action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          <span class="action-count">Compartilhar</span>
        </button>
        <button class="action-btn btn-copy-md" data-id="${escapeHtml(topicId)}" data-title="${escapeHtml(topic?.title || "")}" data-body="${escapeHtml(bodyText)}" data-author="${escapeHtml(authorDisplay)}" data-handle="${escapeHtml(authorHandle)}" aria-label="Copiar post como Markdown">
          <svg class="action-icon icon-copy" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
        </button>
        <button class="action-btn btn-save ${saved ? "active" : ""}" data-id="${escapeHtml(topicId)}" aria-label="Salvar post">
          <svg class="action-icon icon-bookmark" width="18" height="18" viewBox="0 0 24 24" fill="${saved ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
        </button>
        <a class="btn btn-primary btn-sm" href="#/compose/reply?t=${encodeURIComponent(topicId)}&c=${encodeURIComponent(commId)}" style="margin-left:auto;">💬 Responder</a>
        ${modBtn}
        ${renderQuarantineAction(topicId, { asMenuItem: false })}
      </div>
    </article>

    <div class="actions-bar">
      <span class="section-title">Respostas (${replies.length})</span>
      <a class="btn btn-sm btn-primary" href="#/compose/reply?t=${encodeURIComponent(topicId)}&c=${encodeURIComponent(commId)}">+ Responder</a>
    </div>`;

  if (!replies.length) {
    html += `<div class="empty"><p>Sem respostas ainda. Inicie o debate!</p></div>`;
    main.innerHTML += html;
    return;
  }

  const replyItems = replies.map((r) => {
    const rAuthor = r.author || r.owner || "";
    const rAuthorDisplay = r.authorDisplay || (rAuthor ? mock.getAuthorDisplay(rAuthor) : "") || shortId(rAuthor);
    const rBadge = r.isLocalP2p
      ? `<span class="badge-pill p2p-pill">Na rede</span>`
      : `<span class="badge-pill permanent-pill">Guardado</span>`;
    const rTime = postTimeParts(r.ts);
    const replyModBtn = isMod
      ? `<button class="btn btn-sm btn-danger btn-mod-hide" data-id="${escapeHtml(r.id)}" data-type="reply">🛡️</button>`
      : "";
    return `
      <div class="reply-item card reply" id="reply-${escapeHtml(r.id)}">
        <a class="avatar-link" href="#/u/${encodeURIComponent(rAuthor)}">${renderAvatarHtml(rAuthor, rAuthorDisplay)}</a>
        <div class="post-content">
          <div class="reply-header" style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <a class="post-author" href="#/u/${encodeURIComponent(rAuthor)}">${escapeHtml(rAuthorDisplay)}</a>
              <span class="post-time"${rTime.titleAttr} style="font-size:0.74rem; color:var(--muted); margin-left:6px;">${escapeHtml(rTime.display)}</span>
              ${rBadge}
            </div>
            ${replyModBtn}
          </div>
          <p class="reply-body">${hashtags.linkifyHashtags(escapeHtml(r.body || "(carregando conteúdo...)"))}</p>
        </div>
      </div>`;
  }).join("");

  html += `<div class="thread-replies">${replyItems}</div>`;
  main.innerHTML += html;
}
