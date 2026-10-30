/** @file Single-topic thread view and detail text. */
import * as mock from "../mock.js";
import * as social from "../social.js";
import * as hashtags from "../hashtags.js";
import * as postOwnership from "../post-ownership.js";
import * as gossipRetract from "../gossip-retract-ui.js";
import {
  escapeHtml,
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
import { renderNotaryBadgeHtml } from "../perma-notary.js";

function shareTopicAria(topicId) {
  if (mod.canEchoPost(topicId)) return "Compartilhar post";
  return `Compartilhar desativado. ${mod.QUARANTINE_HINT}`;
}

export function renderTopicDetailText(topicId, title, bodyText, notaryRecord = null) {
  const disp = postOwnership.formatPostDisplay({ title, body: bodyText });
  if (disp.mode === "empty") return "";
  const fullText = bodyText || disp.body || disp.text || "";
  const notaryHtml = notaryRecord ? renderNotaryBadgeHtml(notaryRecord) : "";
  return `<div class="post-body post-body-md post-topic-detail" style="font-size:0.98rem; line-height:1.5; margin:0.75rem 0 0;">${renderPostBodyMarkdown(fullText)}${notaryHtml}</div>`;
}

function renderTopicVideoHtml(v) {
  return `<div class="post-media-container post-media-hero post-media-video-container" style="background:#000; border-radius:var(--radius-sm); overflow:hidden; margin-bottom:12px;"><video class="post-media-video" src="${escapeHtml(v)}" controls playsinline style="width:100%; max-height:480px; display:block;"></video></div>`;
}

function renderTopicAudioHtml(a) {
  return `<div class="post-media-audio-card" style="margin:10px 0 14px; padding:12px 14px; background:var(--surface-soft); border-radius:var(--radius-sm); border:1px solid var(--border);"><div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;"><span style="font-size:1.1rem;">🎙️</span><strong style="font-size:0.85rem;">Recado de Voz</strong> <span class="badge-pill" style="font-size:0.7rem; padding:2px 6px;">Lo-Fi 48k</span></div><audio class="post-media-audio" src="${escapeHtml(a)}" controls style="width:100%;"></audio></div>`;
}

function renderTopicImageHtml(img, topic, topicData) {
  const imgAlt = topic?.imageAlt || topicData?.imageAlt || topic?.title || "Foto da publicação";
  const aspect = topic?.aspectRatio || "original";
  const aspectClass = `post-aspect-${aspect.replace(":", "-")}`;
  const pinsHtml = renderPhotoTagLayerHtml(topic || topicData || {}, { isOwn: Boolean(topic?.isOwnLocalPost) });
  return `<div class="post-media-container post-media-hero ${aspectClass}" data-aspect="${escapeHtml(aspect)}"><button type="button" class="post-media-lightbox-trigger" aria-label="Ver imagem em tela cheia" data-media-src="${escapeHtml(img)}" data-media-alt="${escapeHtml(imgAlt)}"><img class="post-media post-media-hero-img" src="${escapeHtml(img)}" alt="${escapeHtml(imgAlt)}" /></button>${pinsHtml}</div>`;
}

function renderTopicMediaHero(topic, topicData) {
  const v = topic?.video || topicData?.video;
  if (v) return renderTopicVideoVideo(v);
  const a = topic?.audio || topicData?.audio;
  if (a) return renderTopicAudioHtml(a);
  const img = topic?.image || topicData?.image;
  if (img) return renderTopicImageHtml(img, topic, topicData);
  return "";
}

function renderTopicVideoVideo(v) {
  return renderTopicVideoHtml(v);
}

function renderTopicZapButton(topicId, topic, author, authorDisplay) {
  const pix = topic?.contactPix || (author ? mock.getAuthorPixKey(author) : "") || "";
  if (pix) {
    return `<button class="action-btn btn-zap-post" data-id="${escapeHtml(topicId)}" data-author="${escapeHtml(author)}" data-author-name="${escapeHtml(authorDisplay)}" data-pix="${escapeHtml(pix)}" data-title="${escapeHtml(topic?.title || "")}" aria-label="Apoiar com Pix Zap" title="Apoiar com Pix Zap">
      <svg class="action-icon icon-zap" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
      <span class="action-label zap-label" style="font-size:0.75rem; font-weight:600; margin-left:2px;">Apoiar</span>
    </button>`;
  }
  return `<button class="action-btn btn-zap-post disabled" disabled aria-label="Autor sem Pix informado" title="Autor sem chave Pix informada" style="opacity:0.35; cursor:not-allowed;">
    <svg class="action-icon icon-zap" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
  </button>`;
}

function renderTopicFeedbackActions(topicId, topic, author, authorDisplay) {
  const baseLikes = Number(topic?.likesCount) || 0;
  const liked = social.isLiked(topicId);
  const curLikes = social.getLikesCount(topicId, baseLikes);

  const baseStars = Number(topic?.starsCount) || 0;
  const starred = social.isStarred(topicId);
  const curStars = social.getStarsCount(topicId, baseStars);

  const likeBtn = `<button class="action-btn btn-like ${liked ? "active" : ""}" data-id="${escapeHtml(topicId)}" data-count="${baseLikes}" aria-label="Curtir post">
    <svg class="action-icon icon-heart" width="18" height="18" viewBox="0 0 24 24" fill="${liked ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
    <span class="action-count count-likes">${curLikes > 0 ? curLikes : ""}</span>
  </button>`;

  const repostBtn = renderRepostBtn({ ...(topic || {}), id: topicId, title: topic?.title || "", author }, { size: 18 });

  const starBtn = `<button class="action-btn btn-star ${starred ? "active" : ""}" data-id="${escapeHtml(topicId)}" data-count="${baseStars}" aria-label="Dar estrela ao post">
    <svg class="action-icon icon-star" width="18" height="18" viewBox="0 0 24 24" fill="${starred ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
    <span class="action-count count-stars">${curStars > 0 ? curStars : ""}</span>
  </button>`;

  return `${likeBtn}${repostBtn}${starBtn}${renderTopicZapButton(topicId, topic, author, authorDisplay)}`;
}

function renderTopicExplodeButton(topicId, topic, authorDisplay, bodyText, commId) {
  const baseExpl = Number(topic?.explodesCount) || 0;
  const curExpl = social.getExplodesCount(topicId, baseExpl);
  const expl = social.isExploded(topicId);
  const label = curExpl > 0 ? `${curExpl} disparos` : "EXPLODE!";
  return `<button id="btn-explode-topic" class="action-btn btn-explode btn-explode-post ${expl ? "exploded" : ""}" data-id="${escapeHtml(topicId)}" data-count="${baseExpl}" data-title="${escapeHtml(topic?.title || "")}" data-author="${escapeHtml(authorDisplay || "")}" data-body="${escapeHtml((bodyText || "").slice(0, 200))}" data-comm="${escapeHtml(commId || "")}" aria-label="Explodir nas redes (EXPLODE!)" title="EXPLODE! Disparo multi-redes (Shift+clique para disparo rápido)">
    <svg class="action-icon icon-explode" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>
    <span class="action-count count-explodes">${label}</span>
  </button>`;
}

function renderTopicDistributeActions(topicId, topic, authorDisplay, authorHandle, bodyText, commId, isMod) {
  const saved = social.isSaved(topicId);
  const shareBtn = `<button id="btn-share-topic" class="action-btn btn-share btn-share-post" data-id="${escapeHtml(topicId)}" data-title="${escapeHtml(topic?.title || "")}" data-author="${escapeHtml(authorDisplay || "")}" data-body="${escapeHtml((bodyText || "").slice(0, 160))}" aria-label="${escapeHtml(shareTopicAria(topicId))}"${quarantineShareAttrs(topicId)}>
    <svg class="action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
    <span class="action-count">Compartilhar</span>
  </button>`;
  const explodeBtn = renderTopicExplodeButton(topicId, topic, authorDisplay, bodyText, commId);
  const copyMdBtn = `<button class="action-btn btn-copy-md" data-id="${escapeHtml(topicId)}" data-title="${escapeHtml(topic?.title || "")}" data-body="${escapeHtml(bodyText)}" data-author="${escapeHtml(authorDisplay)}" data-handle="${escapeHtml(authorHandle)}" aria-label="Copiar post como Markdown">
    <svg class="action-icon icon-copy" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
  </button>`;
  const saveBtn = `<button class="action-btn btn-save ${saved ? "active" : ""}" data-id="${escapeHtml(topicId)}" aria-label="Salvar post">
    <svg class="action-icon icon-bookmark" width="18" height="18" viewBox="0 0 24 24" fill="${saved ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
  </button>`;
  const replyLink = `<a class="btn btn-primary btn-sm" href="#/compose/reply?t=${encodeURIComponent(topicId)}&c=${encodeURIComponent(commId)}" style="margin-left:auto;">💬 Responder</a>`;
  const modBtn = isMod ? `<button class="btn btn-sm btn-danger btn-mod-hide" data-id="${escapeHtml(topicId)}" data-type="topic">🛡️ Ocultar</button>` : "";
  const quarAction = renderQuarantineAction(topicId, { asMenuItem: false });

  return `${shareBtn}${explodeBtn}${copyMdBtn}${saveBtn}${replyLink}${modBtn}${quarAction}`;
}

function renderTopicToolbar(topicId, topic, author, authorDisplay, authorHandle, bodyText, commId, isMod) {
  const fb = renderTopicFeedbackActions(topicId, topic, author, authorDisplay);
  const dist = renderTopicDistributeActions(topicId, topic, authorDisplay, authorHandle, bodyText, commId, isMod);
  return `<div class="post-actions insta-actions post-toolbar" style="margin-top:12px; padding-top:8px;">${fb}${dist}</div>`;
}

function renderTopicHeader(author, labels, topic, topicTs) {
  const { authorDisplay } = labels;
  const originBadge = topic?.isLocalP2p ? `<span class="badge-pill p2p-pill">Na rede</span>` : `<span class="badge-pill permanent-pill">Guardado</span>`;
  const timeLabel = formatTimeAgo(topicTs);
  const metaLines = renderPostAuthorMetaLines(author, labels, timeLabel, { ts: topicTs });
  const ownerMenu = renderPostOwnerMenu(topic);

  return `
    <div class="post-header post-header-inline">
      <div class="post-header-user">
        <a class="avatar-link" href="#/u/${encodeURIComponent(author)}">${renderAvatarHtml(author, authorDisplay, "", topic?.authorAvatar)}</a>
        ${metaLines}
      </div>
      <div class="post-header-aside">
        <div class="post-header-tags">${originBadge}</div>
        ${ownerMenu}
      </div>
    </div>`;
}

function renderTopicReplyRow(r, isMod) {
  const rAuthor = r.author || r.owner || "";
  const rLabels = resolvePostAuthorLabels(rAuthor, { authorDisplay: r.authorDisplay, isOwnLocalPost: r.isOwnLocalPost });
  const rBadge = r.isLocalP2p ? `<span class="badge-pill p2p-pill">Na rede</span>` : `<span class="badge-pill permanent-pill">Guardado</span>`;
  const rTime = postTimeParts(r.ts);
  const modBtn = isMod ? `<button class="btn btn-sm btn-danger btn-mod-hide" data-id="${escapeHtml(r.id)}" data-type="reply">🛡️</button>` : "";

  return `
    <div class="reply-item card reply" id="reply-${escapeHtml(r.id)}">
      <a class="avatar-link" href="#/u/${encodeURIComponent(rAuthor)}">${renderAvatarHtml(rAuthor, rLabels.authorDisplay, "", r.authorAvatar)}</a>
      <div class="post-content">
        <div class="reply-header" style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <a class="post-author" href="#/u/${encodeURIComponent(rAuthor)}">${escapeHtml(rLabels.authorDisplay)}</a>
            <span class="post-time"${rTime.titleAttr} style="font-size:0.74rem; color:var(--muted); margin-left:6px;">${escapeHtml(rTime.display)}</span>
            ${rBadge}
          </div>
          ${modBtn}
        </div>
        <p class="reply-body">${hashtags.linkifyHashtags(escapeHtml(r.body || "(carregando conteúdo...)"))}</p>
      </div>
    </div>`;
}

function renderTopicRepliesBlock(topicId, commId, replies, isMod) {
  const actionBar = `
    <div class="actions-bar">
      <span class="section-title">Respostas (${replies.length})</span>
      <a class="btn btn-sm btn-primary" href="#/compose/reply?t=${encodeURIComponent(topicId)}&c=${encodeURIComponent(commId)}">+ Responder</a>
    </div>`;
  if (!replies.length) {
    return `${actionBar}<div class="empty"><p>Sem respostas ainda. Inicie o debate!</p></div>`;
  }
  const rows = replies.map((r) => renderTopicReplyRow(r, isMod)).join("");
  return `${actionBar}<div class="thread-replies">${rows}</div>`;
}

function extractTopicViewContext(topic, topicData, communityId) {
  const t = topic || {};
  const d = topicData || {};
  const commId = communityId || t.communityId || "";
  const bodyText = d.body || t.body || "Sem conteúdo textual.";
  const author = t.author || t.owner || "";
  const labels = resolvePostAuthorLabels(author, { authorDisplay: t.authorDisplay, isOwnLocalPost: t.isOwnLocalPost });
  const topicTs = t.ts || d.ts;
  const notary = t.notaryRecord || d.notaryRecord || null;
  return { commId, bodyText, author, labels, topicTs, notary };
}

export function renderTopic(main, topicId, topic, replies, { topicData = null, isMod = false, communityId = "" } = {}) {
  const ctx = extractTopicViewContext(topic, topicData, communityId);
  const backLink = ctx.commId ? `<a class="back-link" href="#/c/${encodeURIComponent(ctx.commId)}">← Voltar à comunidade</a>` : "";
  if (gossipRetract.shouldHideGossipDeletedPost(topic)) {
    main.innerHTML = `${backLink}${gossipRetract.renderGossipDeletedTopicShellHtml()}`;
    return;
  }

  const headerHtml = renderTopicHeader(ctx.author, ctx.labels, topic, ctx.topicTs);
  const mediaHtml = renderTopicMediaHero(topic, topicData);
  const citeHtml = renderRepostCiteHtml(topic || {});
  const detailHtml = renderTopicDetailText(topicId, topic?.title || "", ctx.bodyText, ctx.notary);
  const toolbarHtml = renderTopicToolbar(topicId, topic, ctx.author, ctx.labels.authorDisplay, ctx.labels.authorHandle, ctx.bodyText, ctx.commId, isMod);
  const repliesHtml = renderTopicRepliesBlock(topicId, ctx.commId, replies, isMod);

  main.innerHTML = `
    ${backLink}
    <article class="topic-root insta-topic-root card" style="padding:1.25rem;">
      ${headerHtml}
      ${mediaHtml}
      ${citeHtml}
      ${detailHtml}
      ${toolbarHtml}
    </article>
    ${repliesHtml}`;
}
