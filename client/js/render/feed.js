/** @file Feed, composer, post cards, comments, stories. */
import * as mock from "../mock.js";
import * as social from "../social.js";
import * as hashtags from "../hashtags.js";
import * as frames from "../frames.js";
import * as postOwnership from "../post-ownership.js";
import { renderPostBodyMarkdown } from "./markdown-body.js";
import * as i18n from "../i18n-pt-br.js";
import * as gossipRetract from "../gossip-retract-ui.js";
import * as profileDirectory from "../profile-directory.js";
import * as mod from "../moderation.js";
import {
  WELCOME_ROUTE_ID,
  isWelcomeRouteId,
  shouldShowWelcomeFeedHint,
  getWelcomeProfile,
} from "../vox-welcome-profile.js";
import {
  escapeHtml,
  shortId,
  resolvePostAuthorLabels,
  renderPostAuthorMetaLines,
  renderAvatarHtml,
  formatTimeAgo,
  postTimeParts,
} from "./util.js";
import { renderIgToolbar } from "./ig-toolbar.js";
import { renderPhotoTagLayerHtml } from "./photo-tag-pins.js";
import { renderRepostCiteHtml } from "./repost-cite.js";
import { renderRepostBtn } from "./repost-btn.js";
import { rememberVisible } from "../repost-index.js";
import { renderPhotoTitleHtml, renderPhotoHiddenMessageHtml } from "./photo-chrome.js";

export function renderComposerStrip(displayName = "") {
  return renderInlineComposer({ displayName });
}

export function renderInlineComposer({ userRouteId = "", displayName = "" } = {}) {
  const label = displayName || (userRouteId ? mock.getAuthorDisplay(userRouteId) : "") || "Você";
  const avatarHtml = userRouteId
    ? renderAvatarHtml(userRouteId, label)
    : `<span class="avatar">✍</span>`;
  return `
    <div class="inline-composer" id="feed-inline-composer" data-user-route="${escapeHtml(userRouteId || "")}">
      <div class="inline-composer-collapsed" tabindex="0" role="button" aria-expanded="false" aria-controls="form-inline-topic">
        <div class="inline-composer-avatar">${avatarHtml}</div>
        <span class="inline-composer-placeholder">O que está acontecendo na sua rede?</span>
      </div>
      <form class="inline-composer-form hidden" id="form-inline-topic" aria-label="Nova publicação">
        <div class="inline-composer-form-head">
          ${avatarHtml}
          <textarea id="inline-topic-body" class="inline-composer-textarea" rows="3" maxlength="2000" placeholder="Compartilhe texto, #hashtags ou anexe uma foto…" required aria-label="Texto da publicação"></textarea>
        </div>
                <div class="inline-composer-preview hidden" id="inline-topic-preview-wrap">
          <img id="inline-topic-preview" class="inline-composer-preview-img hidden" alt="Prévia da imagem" />
          <div id="inline-topic-preview-audio-wrap" class="hidden" style="margin:8px 0; padding:10px 14px; background:var(--surface-soft); border-radius:var(--radius-sm); border:1px solid var(--border);">
            <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px;">
              <span>🎙️</span>
              <strong style="font-size:0.85rem;">Recado de Voz (Lo-Fi 48kbps)</strong>
            </div>
            <audio id="inline-topic-preview-audio" controls style="width:100%;"></audio>
          </div>
          <div id="inline-topic-preview-video-wrap" class="hidden" style="margin:8px 0; background:#000; border-radius:var(--radius-sm); overflow:hidden;">
            <video id="inline-topic-preview-video" controls playsinline style="width:100%; max-height:240px; display:block;"></video>
          </div>
          <div class="lofi-filter-bar" id="lofi-filter-bar">
            <span class="meta lofi-filter-label">Estilo Lo-Fi:</span>
            <button type="button" class="lofi-filter-btn active" data-filter="normal">Padrão</button>
            <button type="button" class="lofi-filter-btn" data-filter="xerox">📰 Xerox</button>
            <button type="button" class="lofi-filter-btn" data-filter="vhs">📼 VHS 90s</button>
            <button type="button" class="lofi-filter-btn" data-filter="risograph">🎨 Risógrafo</button>
            <span class="lofi-weight-pill" id="lofi-weight-badge">⚡ ~45 KB (100% Grátis)</span>
          </div>
          <button type="button" class="btn btn-outline btn-sm inline-composer-remove-img" id="btn-inline-remove-img" style="margin-top:8px;">Remover anexo</button>
        </div>
        <div id="inline-recording-indicator" class="hidden" style="margin:8px 0; padding:10px 14px; background:rgba(220, 53, 69, 0.08); border:1px solid rgba(220, 53, 69, 0.4); border-radius:var(--radius-sm); display:flex; align-items:center; justify-content:space-between;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="recording-pulse" style="width:12px; height:12px; background:#dc3545; border-radius:50%; display:inline-block;"></span>
            <strong style="color:var(--danger, #dc3545); font-size:0.85rem;">Gravando voz:</strong>
            <span id="inline-recording-timer" style="font-family:monospace; font-weight:700;">00:00 / 01:00</span>
          </div>
          <div style="display:flex; gap:6px;">
            <button type="button" id="btn-inline-stop-rec" class="btn btn-xs btn-primary">⏹ Concluir</button>
            <button type="button" id="btn-inline-cancel-rec" class="btn btn-xs btn-outline">❌ Cancelar</button>
          </div>
        </div>
        <div class="inline-composer-toolbar">
          <div class="inline-composer-tools" style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">
            <label class="inline-composer-tool" title="Anexar foto (até 99 KB)">
              <input type="file" id="inline-topic-file" accept="image/jpeg,image/png,image/webp,image/gif" hidden />
              <span aria-hidden="true">📷</span> Foto
            </label>
            <button type="button" class="inline-composer-tool" id="btn-inline-mic" title="Gravar voz pelo microfone (até 60s)">
              <span aria-hidden="true">🔴</span> Gravar
            </button>
            <label class="inline-composer-tool" title="Anexar áudio (até 60s)">
              <input type="file" id="inline-topic-audio" accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/webm,audio/aac,audio/m4a" hidden />
              <span aria-hidden="true">🎙️</span> Áudio
            </label>
            <label class="inline-composer-tool" title="Anexar vídeo (até 10s)">
              <input type="file" id="inline-topic-video" accept="video/mp4,video/webm,video/ogg" hidden />
              <span aria-hidden="true">🎬</span> Vídeo
            </label>
            <input type="text" id="inline-topic-comm" class="inline-composer-comm" list="inline-comm-list" placeholder="Comunidade (opcional)" maxlength="64" aria-label="Slug da comunidade" />
            <datalist id="inline-comm-list"></datalist>
          </div>
          <button type="submit" class="btn btn-primary btn-sm" id="btn-inline-submit" disabled>Postar</button>
        </div>
        <p class="inline-composer-meta" aria-live="polite">
          <span class="inline-composer-char" id="inline-topic-char">0 / 2000</span>
          <span class="inline-composer-hint meta"> · assinado no aparelho · <a href="#/compose/topic">formulário completo</a> · <a href="#/wallet">Criar ou importar chave</a></span>
          <span class="inline-composer-local-hint meta" title="${escapeHtml(i18n.localMutateEditDeleteTooltip)}"> · ${escapeHtml(i18n.localMutateComposerHint)}</span>
        </p>
      </form>
    </div>`;
}

export function getPostFeedLayout(t) {
  if (t?.githubGist?.lines?.length) return "github";
  if (t?.image || t?.video || t?.audio || t?.mediaRef?.hash) return "photo";
  return "text";
}

function renderPostGithubGist(t) {
  const gist = t.githubGist;
  if (!gist?.lines?.length) return "";
  const label = gist.label || "README / diff";
  const lines = gist.lines.map((line) => escapeHtml(line)).join("\n");
  return `<div class="post-github-gist" role="region" aria-label="${escapeHtml(label)}">
    <div class="post-github-gist-label">${escapeHtml(label)}</div>
    <pre class="post-github-gist-body">${lines}</pre>
  </div>`;
}

export function formatPostMarkdown(post) {
  if (!post) return "";
  const author = post.author || post.owner || "";
  const { authorDisplay, authorHandle } = resolvePostAuthorLabels(author, {
    authorDisplay: post.authorDisplay,
    isOwnLocalPost: post.isOwnLocalPost,
  });
  const title = post.title || "Publicação";
  const body = post.body || "";
  const host = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "https://yurikayel.github.io/vox";
  const url = `${host}/#/t/${encodeURIComponent(post.id)}`;
  return `> **${authorDisplay}** (@${authorHandle}) · *Vox*\n>\n> **${title}**\n>\n> ${body}\n>\n> 🔗 Ver no Vox: ${url}`;
}

export function commentsPanelId(topicId) {
  return `post-comments-${String(topicId || "").replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

export function renderCommentNestedReplyComposer(parentId, topicId, commId, mentionHandle = "") {
  const mention = mentionHandle ? `@${mentionHandle} ` : "";
  return `
    <form class="post-comment-nested-reply" data-parent="${escapeHtml(parentId)}" data-topic="${escapeHtml(topicId)}" data-comm="${escapeHtml(commId || "")}" hidden>
      <textarea class="form-control post-comment-input post-comment-nested-input" rows="2" maxlength="500" required placeholder="Responder…" aria-label="Responder comentário">${escapeHtml(mention)}</textarea>
      <div class="post-comment-composer-actions post-comment-nested-actions">
        <button type="button" class="btn btn-sm btn-outline btn-comment-reply-cancel">Cancelar</button>
        <button type="submit" class="btn btn-primary btn-sm btn-comment-nested-send">Enviar</button>
      </div>
    </form>`;
}

function renderCommentReactBtn(r) {
  const baseReactions = Number(r.reactionsCount) || 0;
  const reacted = social.isCommentReacted(r.id);
  const reactCount = social.getCommentReactCount(r.id, baseReactions);
  const countHtml =
    reactCount > 0
      ? `<span class="action-count count-comment-reacts">${reactCount}</span>`
      : `<span class="action-count count-comment-reacts" hidden></span>`;
  return `<button type="button" class="post-comment-action btn-comment-react${reacted ? " active" : ""}" data-id="${escapeHtml(r.id)}" data-count="${baseReactions}" aria-pressed="${reacted ? "true" : "false"}" aria-label="Reagir${reactCount > 0 ? `, ${reactCount}` : ""}">
      <span class="post-comment-action-icon" aria-hidden="true">♥</span>${countHtml}
    </button>`;
}

export function renderInlineReplyItem(r, { byParent = null, topicId = "", commId = "" } = {}) {
  const rAuthor = r.author || r.owner || "";
  const rLabels = resolvePostAuthorLabels(rAuthor, {
    authorDisplay: r.authorDisplay,
    isOwnLocalPost: r.isOwnLocalPost,
  });
  const rAuthorDisplay = rLabels.authorDisplay;
  const handleHtml = rLabels.secondaryHandle
    ? `<span class="post-handle" title="${escapeHtml(rLabels.routeTitle)}">@${escapeHtml(rLabels.secondaryHandle)}</span>`
    : "";
  const mentionHandle = rLabels.secondaryHandle || rLabels.authorHandle || "";
  const children = byParent && byParent[r.id] ? byParent[r.id] : [];
  const nestedList =
    children.length > 0
      ? `<ul class="post-comment-nested-list">${children
          .map((child) => renderInlineReplyItem(child, { byParent, topicId, commId }))
          .join("")}</ul>`
      : "";
  return `
    <li class="post-comment-item" id="inline-reply-${escapeHtml(r.id)}" data-comment-id="${escapeHtml(r.id)}">
      <a class="avatar-link" href="#/u/${encodeURIComponent(rAuthor)}">${renderAvatarHtml(rAuthor, rAuthorDisplay, "sm")}</a>
      <div class="post-comment-body">
        <div class="post-comment-meta">
          <a class="post-author" href="#/u/${encodeURIComponent(rAuthor)}">${escapeHtml(rAuthorDisplay)}</a>
          ${handleHtml}
        </div>
        <p class="reply-body">${hashtags.linkifyHashtags(escapeHtml(r.body || ""))}</p>
        <div class="post-comment-actions">
          ${renderCommentReactBtn(r)}
          <button type="button" class="post-comment-action btn-comment-reply" data-comment-id="${escapeHtml(r.id)}" aria-label="Responder a ${escapeHtml(rAuthorDisplay)}">Responder</button>
        </div>
        ${nestedList}
        ${topicId ? renderCommentNestedReplyComposer(r.id, topicId, commId, mentionHandle) : ""}
      </div>
    </li>`;
}

function groupRepliesForThread(replies) {
  const byParent = {};
  const tops = [];
  for (const r of replies) {
    const pid = r.parentId || "";
    if (pid) {
      if (!byParent[pid]) byParent[pid] = [];
      byParent[pid].push(r);
    } else {
      tops.push(r);
    }
  }
  return { tops, byParent };
}

export function renderCommentList(replies = [], { topicId = "", commId = "" } = {}) {
  if (!replies.length) {
    return `<div class="post-comments-feed"><p class="post-comments-empty">Nenhuma resposta ainda.</p></div>`;
  }
  const { tops, byParent } = groupRepliesForThread(replies);
  const items = tops.map((r) => renderInlineReplyItem(r, { byParent, topicId, commId }));
  return `<div class="post-comments-feed"><ul class="post-comment-list">${items.join("")}</ul></div>`;
}

function renderInlineReplyComposer(topicId, commId) {
  return `
    <form class="post-comment-composer" data-topic="${escapeHtml(topicId)}" data-comm="${escapeHtml(commId || "")}">
      <textarea class="form-control post-comment-input" rows="2" maxlength="500" required placeholder="Responder…" aria-label="Escrever resposta"></textarea>
      <div class="post-comment-composer-actions">
        <a class="post-comments-thread" href="#/t/${encodeURIComponent(topicId)}">Abrir thread</a>
        <button type="submit" class="btn btn-primary btn-sm btn-inline-reply">Responder</button>
      </div>
    </form>`;
}

/** Comentários ficam **fora** de `.post-media-hero` — superfície normal do card, nunca overlay na foto. */
export function renderPostComments(topicId, commId = "", { replies = [], expanded = false, prefaceHtml = "" } = {}) {
  const panelId = commentsPanelId(topicId);
  const openCls = expanded ? " is-open" : "";
  const hid = expanded ? "" : " hidden";
  return `<div class="post-comments post-comments-surface${openCls}" id="${escapeHtml(panelId)}"${hid} data-topic="${escapeHtml(topicId)}" data-comm="${escapeHtml(commId)}">${prefaceHtml}${renderCommentList(replies, { topicId, commId })}${renderInlineReplyComposer(topicId, commId)}</div>`;
}

export function quarantineShareAttrs(postId) {
  if (!mod.isPostQuarantined(postId)) return "";
  return ` disabled aria-disabled="true" title="${escapeHtml(mod.QUARANTINE_HINT)}"`;
}

export function renderQuarantineAction(postId, { asMenuItem = true } = {}) {
  const id = String(postId || "");
  const on = mod.isPostQuarantined(id);
  const label = on ? "Tirar da quarentena local" : mod.QUARANTINE_ACTION_LABEL;
  const role = asMenuItem ? ' role="menuitem"' : "";
  return `<button type="button" class="action-btn btn-quarantine-post${on ? " is-quarantined" : ""}" data-id="${escapeHtml(id)}" title="${escapeHtml(mod.QUARANTINE_HINT)}" aria-label="${escapeHtml(label)}" aria-pressed="${on ? "true" : "false"}"${role}>
    <span class="toolbar-overflow-label">${escapeHtml(label)}</span>
  </button>`;
}

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

function renderPostHeaderBlock(t, author, labels, { photoOverlay = false } = {}) {
  const authorDisplay = labels.authorDisplay;
  const ownerMenu = renderPostOwnerMenu(t);
  if (photoOverlay) {
    if (!ownerMenu) return "";
    return `<header class="post-header-inline post-header-photo-admin">
      <div class="post-header-aside">${ownerMenu}</div>
    </header>`;
  }
  if (t.isExternal) {
    const avatarImg = t.authorAvatar
      ? `<img class="avatar avatar-img" src="${escapeHtml(t.authorAvatar)}" alt="${escapeHtml(authorDisplay)}" loading="lazy" />`
      : `<span class="avatar avatar-bsky">🦋</span>`;
    const sourceBadge = `<span class="badge-post-external bsky" title="Post ingerido via AT Protocol"><a href="${escapeHtml(t.externalUrl || '#')}" target="_blank" rel="noopener noreferrer">🦋 Bluesky ↗</a></span>`;
    return `
      <header class="post-header-inline post-header-external">
        <div class="post-header-user">
          <a class="avatar-link" href="${escapeHtml(t.externalUrl || '#')}" target="_blank" rel="noopener noreferrer">${avatarImg}</a>
          <div class="post-header-meta">
            <div class="post-author-line">
              <strong class="post-author-name">${escapeHtml(authorDisplay)}</strong>
              <span class="post-handle">${escapeHtml(labels.authorHandle || "")}</span>
              ${sourceBadge}
            </div>
            <div class="post-meta-sub">
              <time class="post-time">${escapeHtml(formatTimeAgo(t.ts))}</time>
            </div>
          </div>
        </div>
        ${ownerMenu ? `<div class="post-header-aside">${ownerMenu}</div>` : ""}
      </header>`;
  }
  const metaHtml = renderPostAuthorMetaLines(author, labels, formatTimeAgo(t.ts), { ts: t.ts });
  const asideHtml = ownerMenu ? `<div class="post-header-aside">${ownerMenu}</div>` : "";
  return `
    <header class="post-header-inline">
      <div class="post-header-user">
        <a class="avatar-link" href="#/u/${encodeURIComponent(author)}">${renderAvatarHtml(author, authorDisplay)}</a>
        ${metaHtml}
      </div>
      ${asideHtml}
    </header>`;
}

function shouldShowPostFollowOverlay(t, author) {
  if (!author || t?.isOwnLocalPost) return false;
  if (isWelcomeRouteId(author)) return false;
  return true;
}

function renderPostHeroFollowBtn(author) {
  const watching = social.isWatching(author);
  const label = watching ? "Seguindo" : "Seguir";
  return `<button type="button" class="btn-overlay-follow btn-watch-profile${watching ? " is-following" : ""}" data-route="${escapeHtml(author)}" aria-pressed="${watching ? "true" : "false"}" aria-label="${watching ? "Deixar de seguir autor" : "Seguir autor"}">${label}</button>`;
}

function renderPostHeroVerifiedBadge(author) {
  if (!isWelcomeRouteId(author)) return "";
  const official = getWelcomeProfile();
  if (!official?.isOfficialPlatform) return "";
  return `<span class="post-media-header-verified" title="Conta verificada" aria-label="Conta verificada">✓</span>`;
}

function photoHeaderUf(author) {
  const uf = mock.getMockProfile(author)?.uf;
  return uf ? `<span class="post-ig-header-uf">${escapeHtml(uf)}</span>` : "";
}

function renderPostMoreMenuTrigger(t, author, authorDisplay) {
  const hasImage = t.image || t.mediaRef?.hash ? "1" : "";
  const isOwn = t.isOwnLocalPost ? "1" : "";
  const pix = escapeHtml(t.contactPix || "");
  return `<button type="button" class="btn-post-more-menu" aria-label="Mais opções da publicação" data-post-id="${escapeHtml(t.id)}" data-author-route="${escapeHtml(author)}" data-title="${escapeHtml(t.title || authorDisplay || "")}" data-has-image="${hasImage}" data-is-own="${isOwn}" data-pix="${pix}"><span aria-hidden="true">⋯</span></button>`;
}

function renderPostMediaHeader(t, author, labels) {
  const authorDisplay = labels.authorDisplay;
  const { display: timeDisplay, titleAttr: timeTitle } = postTimeParts(t.ts);
  const followBtn = shouldShowPostFollowOverlay(t, author) ? renderPostHeroFollowBtn(author) : "";
  const handle = labels.authorHandle ? `<span class="post-ig-header-handle">@${escapeHtml(labels.authorHandle)}</span>` : "";
  return `<div class="post-media-header post-ig-header">
    <a class="avatar-link post-media-header-avatar" href="#/u/${encodeURIComponent(author)}">${renderAvatarHtml(author, authorDisplay, "sm")}</a>
    <a class="post-media-header-username" href="#/u/${encodeURIComponent(author)}">${escapeHtml(authorDisplay)}</a>
    ${renderPostHeroVerifiedBadge(author)}
    ${handle}
    <span class="post-media-header-dot" aria-hidden="true">·</span>
    <span class="post-media-header-time"${timeTitle}>${escapeHtml(timeDisplay)}</span>
    ${photoHeaderUf(author)}
    <div class="post-ig-header-end">
      ${followBtn}
      ${renderPostMoreMenuTrigger(t, author, authorDisplay)}
    </div>
  </div>`;
}

function renderPostMediaHero(t, overlayHeaderHtml = "") {
  const layer = renderPhotoTagLayerHtml(t, { isOwn: Boolean(t.isOwnLocalPost) });
  if (t?.video) {
    const src = escapeHtml(t.video);
    return `<div class="post-media-container post-media-hero post-media-video-container" style="background:#000; border-radius:var(--radius-sm); overflow:hidden; position:relative;">
      <div class="lofi-video-header" style="position:absolute; top:8px; left:8px; z-index:2; display:flex; align-items:center; gap:6px;">
        <span class="badge-pill" style="font-size:0.7rem; padding:2px 6px; background:rgba(0,0,0,0.65); color:#fff; border:1px solid rgba(255,255,255,0.2);">📼 Lo-Fi 360p</span>
      </div>
      <video class="post-media-video" src="${src}" controls playsinline preload="metadata" style="width:100%; max-height:480px; display:block;"></video>
      ${overlayHeaderHtml}
    </div>`;
  }
  if (t?.audio) {
    const src = escapeHtml(t.audio);
    return `<div class="post-media-audio-card" style="margin:8px 0; padding:12px 14px; background:var(--surface-soft); border-radius:var(--radius-sm); border:1px solid var(--border);">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:1.1rem;">🎙️</span>
          <strong style="font-size:0.85rem;">Recado de Voz</strong>
        </div>
        <span class="badge-pill" style="font-size:0.7rem; padding:2px 6px; background:var(--surface); border:1px solid var(--border);">⚡ Lo-Fi 48k Opus</span>
      </div>
      <audio class="post-media-audio" src="${src}" controls style="width:100%; outline:none; border-radius:4px;"></audio>
      ${overlayHeaderHtml}
    </div>`;
  }
  if (t?.image) {
    const altRaw = t.imageAlt || t.title || "";
    const alt = escapeHtml(altRaw);
    const src = escapeHtml(t.image);
    return `<div class="post-media-container post-media-hero">
      <button type="button" class="post-media-lightbox-trigger" aria-label="Ver imagem em tela cheia" data-media-src="${src}" data-media-alt="${alt}">
        <img class="post-media post-media-hero-img" src="${src}" alt="${alt}" loading="lazy" />
      </button>
      ${layer}
      ${overlayHeaderHtml}
    </div>`;
  }
  if (t?.mediaRef?.hash) {
    return `<div class="post-media-container post-media-hero post-media-lazy" data-media-hash="${escapeHtml(t.mediaRef.hash)}">
      <div class="media-placeholder" style="aspect-ratio:4/5; display:flex; align-items:center; justify-content:center; background:var(--surface-soft); color:var(--muted); font-size:0.85rem;"><span>📦 Mídia P2P (${escapeHtml(t.mediaRef.mime || "mídia")})</span></div>
      ${layer}
      ${overlayHeaderHtml}
    </div>`;
  }
  return "";
}

export function renderPostTextHtml(post) {
  const id = post?.id || "";
  const href = id ? `#/t/${encodeURIComponent(id)}` : "#";
  const disp = postOwnership.formatPostDisplay({ title: post?.title, body: post?.body });
  if (disp.mode === "empty") return "";
  if (disp.mode === "caption") {
    const linked = hashtags.linkifyHashtags(escapeHtml(disp.text));
    return `<p class="post-body post-caption-only"><a href="${href}">${linked}</a></p>`;
  }
  const fullText = post?.body || (disp.title ? `${disp.title}\n${disp.body}` : disp.body);
  return `<div class="post-body post-body-md">${renderPostBodyMarkdown(fullText)}</div>`;
}

function renderPostText(t) {
  return renderPostTextHtml(t);
}

export function renderFrameContentHtml(frame, state) {
  if (!state) return "";
  if (state.kind === "poll") {
    if (state.userVotedIndex) {
      const bars = state.options
        .map((opt) => {
          const isUser = state.userVotedIndex === opt.index;
          return `<div class="frame-poll-bar-wrapper ${isUser ? "user-choice" : ""}">
            <div class="frame-poll-bar-fill" style="width:${opt.percent}%"></div>
            <div class="frame-poll-bar-label"><span>${escapeHtml(opt.label)} ${isUser ? "✓" : ""}</span> <strong>${opt.percent}% (${opt.count})</strong></div>
          </div>`;
        })
        .join("");
      return `<div class="frame-poll-results">${bars}</div>`;
    }
    return `<p class="frame-prompt">Vote na enquete abaixo para ver os resultados parciais em tempo real:</p>`;
  }

  if (state.kind === "petition") {
    return `<div class="frame-petition-box">
      <div class="frame-petition-metric"><strong>${state.signaturesCount}</strong> assinaturas (meta: ${state.goal}) · ${state.percent}%</div>
      <div class="frame-petition-bar"><div class="frame-petition-bar-fill" style="width:${state.percent}%"></div></div>
      ${state.hasSigned ? '<p class="frame-signed-msg">✓ Você assinou este abaixo-assinado.</p>' : '<p class="frame-prompt">Adicione sua assinatura com 1 clique (identidade criptográfica local):</p>'}
    </div>`;
  }

  if (state.kind === "clt") {
    return `<div class="frame-clt-box">
      <h4 class="frame-clt-title">${escapeHtml(state.title)}</h4>
      ${state.result ? `<div class="frame-clt-result">${escapeHtml(state.result)}</div>` : ""}
      <p class="frame-clt-detail">${escapeHtml(state.detail)}</p>
    </div>`;
  }
  return "";
}

function renderFrameButtons(t, frame, localAction) {
  const activeIndex = localAction?.buttonIndex || 0;
  return frame.buttons
    .map(
      (b) => `<button type="button" class="btn btn-sm btn-frame-action ${activeIndex === b.index ? "active" : ""}" data-post-id="${escapeHtml(t.id)}" data-index="${b.index}" data-action="${escapeHtml(b.action)}" data-label="${escapeHtml(b.label)}" ${b.target ? `data-target="${escapeHtml(b.target)}"` : ""}>${escapeHtml(b.label)}</button>`
    )
    .join("");
}

export function renderPostFrame(t) {
  if (!t.frame) return "";
  const parsed = frames.parseFrame(t.frame);
  if (!parsed.valid) return "";
  const frame = parsed.frame;
  const localAction = frames.getUserFrameAction(t.id);
  const state = frames.getFrameState(frame, [], localAction);

  const imgHtml = frame["of:image"]
    ? `<div class="vox-frame-media"><img class="vox-frame-img" src="${escapeHtml(frame["of:image"])}" alt="${escapeHtml(frame.title || t.title)}" loading="lazy" /></div>`
    : "";

  return `
    <div class="vox-frame" data-post-id="${escapeHtml(t.id)}" data-kind="${escapeHtml(frame.kind)}">
      <div class="vox-frame-badge"><span class="pill pill-frame">⚡ Mini-App · Open Frame</span> <span class="vox-frame-tag">${frame.kind.toUpperCase()}</span></div>
      ${imgHtml}
      <div class="vox-frame-body">
        <div class="vox-frame-content" id="frame-content-${escapeHtml(t.id)}">
          ${renderFrameContentHtml(frame, state)}
        </div>
        <div class="vox-frame-buttons">
          ${renderFrameButtons(t, frame, localAction)}
        </div>
        <div class="vox-frame-footer">
          <small class="meta">Open Frames FOSS · Assinatura ECDSA P-256 local · Sem iframes</small>
        </div>
      </div>
    </div>`;
}

function renderCommentButton(t, { overlay = false } = {}) {
  const n = Number(t.repliesCount) || 0;
  const panelId = commentsPanelId(t.id);
  const overlayCls = overlay ? " overlay-action-btn" : "";
  const label = overlay
    ? (n > 0 ? `<span class="overlay-action-count count-replies">${n}</span>` : "")
    : `<span class="action-count count-replies">${n > 0 ? n : ""}</span>`;
  return `<button type="button" class="action-btn btn-comment${overlayCls}" data-id="${escapeHtml(t.id)}" data-comm="${escapeHtml(t.communityId || "")}" aria-expanded="false" aria-controls="${escapeHtml(panelId)}" aria-label="Comentar${n > 0 ? `, ${n} comentários` : ""}">
            <svg class="action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            ${label}
          </button>`;
}

function renderZapToolbarBtn(t, author, authorDisplay) {
  const pix = t.contactPix || (author ? mock.getAuthorPixKey(author) : "") || "";
  const icon = `<svg class="action-icon icon-zap" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
  if (!pix) {
    return `<button class="action-btn btn-zap-post disabled" disabled aria-label="Autor sem Pix informado" title="Autor sem chave Pix informada" style="opacity:0.35; cursor:not-allowed;">${icon}</button>`;
  }
  return `<button class="action-btn btn-zap-post" data-id="${escapeHtml(t.id)}" data-author="${escapeHtml(author)}" data-author-name="${escapeHtml(authorDisplay)}" data-pix="${escapeHtml(pix)}" data-title="${escapeHtml(t.title)}" aria-label="Apoiar com Pix" title="Apoiar com Pix">${icon}</button>`;
}

function renderToolbarUtilityMenu(t, author, authorDisplay, authorHandle, baseStars, starred, stars, saved, { overlay = false } = {}) {
  const pix = t.contactPix || (author ? mock.getAuthorPixKey(author) : "") || "";
  const overflowCls = overlay ? "toolbar-overflow post-overlay-actions-more" : "toolbar-overflow";
  const menuCls = overlay ? "toolbar-overflow-menu toolbar-overflow-menu--overlay" : "toolbar-overflow-menu";
  const zapItem = pix
    ? `<button type="button" class="action-btn btn-zap-post" data-id="${escapeHtml(t.id)}" data-author="${escapeHtml(author)}" data-author-name="${escapeHtml(authorDisplay)}" data-pix="${escapeHtml(pix)}" data-title="${escapeHtml(t.title)}" role="menuitem" aria-label="Apoiar com Pix">
        <svg class="action-icon icon-zap" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        <span class="toolbar-overflow-label">Apoiar</span>
      </button>`
    : `<button type="button" class="action-btn btn-zap-post disabled" disabled role="menuitem" aria-label="Autor sem Pix informado">
        <svg class="action-icon icon-zap" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        <span class="toolbar-overflow-label">Apoiar</span>
      </button>`;
  return `<details class="${overflowCls}">
    <summary class="action-btn btn-toolbar-more${overlay ? " overlay-action-btn btn-post-actions-more" : ""}" aria-label="Mais ações"><span aria-hidden="true">⋯</span></summary>
    <div class="${menuCls}" role="menu">
      ${zapItem}
      <button type="button" class="action-btn btn-save ${saved ? "active" : ""}" data-id="${escapeHtml(t.id)}" role="menuitem" aria-label="Salvar post">
        <svg class="action-icon icon-bookmark" width="18" height="18" viewBox="0 0 24 24" fill="${saved ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
        <span class="toolbar-overflow-label">Salvar</span>
      </button>
      <button type="button" class="action-btn btn-star ${starred ? "active" : ""}" data-id="${escapeHtml(t.id)}" data-count="${baseStars}" role="menuitem" aria-label="Estrelar post">
        <svg class="action-icon icon-star" width="18" height="18" viewBox="0 0 24 24" fill="${starred ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        <span class="action-count count-stars">${stars > 0 ? stars : ""}</span>
        <span class="toolbar-overflow-label">Estrelar</span>
      </button>
      <button type="button" class="action-btn btn-copy-md" data-id="${escapeHtml(t.id)}" data-title="${escapeHtml(t.title)}" data-body="${escapeHtml(t.body || "")}" data-author="${escapeHtml(authorDisplay)}" data-handle="${escapeHtml(authorHandle)}" role="menuitem" aria-label="Copiar Markdown">
        <svg class="action-icon icon-copy" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
        <span class="toolbar-overflow-label">Copiar .md</span>
      </button>
      ${renderQuarantineAction(t.id)}
    </div>
  </details>`;
}

function renderToolbarOverflow(t, author, authorDisplay, authorHandle, baseStars, starred, stars) {
  return `<details class="toolbar-overflow">
    <summary class="action-btn btn-toolbar-more" aria-label="Mais ações do post"><span aria-hidden="true">⋯</span></summary>
    <div class="toolbar-overflow-menu" role="menu">
      ${renderZapToolbarBtn(t, author, authorDisplay)}
      <button type="button" class="action-btn btn-star ${starred ? "active" : ""}" data-id="${escapeHtml(t.id)}" data-count="${baseStars}" role="menuitem" aria-label="Dar estrela ao post">
        <svg class="action-icon icon-star" width="18" height="18" viewBox="0 0 24 24" fill="${starred ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        <span class="action-count count-stars">${stars > 0 ? stars : ""}</span>
        <span class="toolbar-overflow-label">Estrela</span>
      </button>
      <button type="button" class="action-btn btn-copy-md" data-id="${escapeHtml(t.id)}" data-title="${escapeHtml(t.title)}" data-body="${escapeHtml(t.body || "")}" data-author="${escapeHtml(authorDisplay)}" data-handle="${escapeHtml(authorHandle)}" role="menuitem" aria-label="Copiar post como Markdown">
        <svg class="action-icon icon-copy" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
        <span class="toolbar-overflow-label">Copiar .md</span>
      </button>
      ${renderQuarantineAction(t.id)}
    </div>
  </details>`;
}

function renderExplodeButton(t, authorDisplay) {
  const baseExplodes = Number(t.explodesCount) || 0;
  const explodes = social.getExplodesCount(t.id, baseExplodes);
  const exploded = social.isExploded(t.id);
  const countSpan = `<span class="action-count count-explodes">${explodes > 0 ? explodes : ""}</span>`;
  return `<button class="action-btn btn-explode btn-explode-post ${exploded ? "exploded" : ""}" data-id="${escapeHtml(t.id)}" data-count="${baseExplodes}" data-title="${escapeHtml(t.title)}" data-author="${escapeHtml(authorDisplay || "")}" data-body="${escapeHtml((t.body || t.title || "").slice(0, 200))}" data-comm="${escapeHtml(t.communityId || "")}" aria-label="Explodir nas redes (EXPLODE!)" title="EXPLODE! Disparo multi-redes (Shift+clique para disparo rápido)">
    <svg class="action-icon icon-explode" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>${countSpan}
  </button>`;
}

function renderPostToolbar(t, author, authorDisplay, authorHandle) {
  const baseLikes = Number(t.likesCount) || 0;
  const liked = social.isLiked(t.id);
  const likes = social.getLikesCount(t.id, baseLikes);
  const baseStars = Number(t.starsCount) || 0;
  const starred = social.isStarred(t.id);
  const stars = social.getStarsCount(t.id, baseStars);
  const saved = social.isSaved(t.id);
  return `
        <div class="post-actions insta-actions post-toolbar">
          <div class="toolbar-primary">
            <button class="action-btn btn-like ${liked ? "active" : ""}" data-id="${escapeHtml(t.id)}" data-count="${baseLikes}" aria-label="Curtir post">
              <svg class="action-icon icon-heart" width="20" height="20" viewBox="0 0 24 24" fill="${liked ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
              <span class="action-count count-likes">${likes > 0 ? likes : ""}</span>
            </button>
            ${renderCommentButton(t)}
            ${renderRepostBtn(t, { size: 20 })}
            <button class="action-btn btn-share btn-share-post" data-id="${escapeHtml(t.id)}" data-title="${escapeHtml(t.title)}" data-author="${escapeHtml(authorDisplay || "")}" data-body="${escapeHtml((t.body || "").slice(0, 160))}" aria-label="Compartilhar post"${quarantineShareAttrs(t.id)}>
              <svg class="action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
            </button>
            ${renderExplodeButton(t, authorDisplay)}
            ${t.isExternal ? `
            <button class="action-btn btn-quote-external" data-id="${escapeHtml(t.id)}" data-title="${escapeHtml(t.title)}" data-author="${escapeHtml(authorDisplay || "")}" data-handle="${escapeHtml(t.authorHandle || "")}" data-body="${escapeHtml((t.body || t.title || "").slice(0, 280))}" data-url="${escapeHtml(t.externalUrl || "")}" aria-label="Citar e debater no Vox" title="💬 Citar e debater no Vox">
              <svg class="action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <span class="action-count">Citar</span>
            </button>` : ""}
          </div>
          <div class="toolbar-secondary">
            ${renderToolbarOverflow(t, author, authorDisplay, authorHandle, baseStars, starred, stars)}
            <button class="action-btn btn-save ${saved ? "active" : ""}" data-id="${escapeHtml(t.id)}" aria-label="Salvar post">
              <svg class="action-icon icon-bookmark" width="19" height="19" viewBox="0 0 24 24" fill="${saved ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
            </button>
          </div>
        </div>`;
}

export function renderPostItem(t, { isPinned = false } = {}) {
  if (gossipRetract.shouldHideGossipDeletedPost(t)) return "";
  const author = t.author || t.owner || "";
  const labels = resolvePostAuthorLabels(author, {
    authorDisplay: t.authorDisplay,
    isOwnLocalPost: t.isOwnLocalPost,
  });
  const { authorDisplay, authorHandle } = labels;
  const layout = getPostFeedLayout(t);
  const isPhoto = layout === "photo";
  const header = renderPostHeaderBlock(t, author, labels, { photoOverlay: isPhoto });

  const igHead = isPhoto ? renderPostMediaHeader(t, author, labels) : "";
  const media = isPhoto ? renderPostMediaHero(t, igHead) : "";
  const frame = renderPostFrame(t);

  const igBar = isPhoto ? renderIgToolbar(t, authorDisplay) : "";

  const toolbar = isPhoto ? "" : renderPostToolbar(t, author, authorDisplay, authorHandle);
  const caption = isPhoto ? "" : `<div class="post-caption-block">${renderPostText(t)}${renderRepostCiteHtml(t)}</div>`;
  const gist = layout === "github" ? renderPostGithubGist(t) : "";
  const preface = isPhoto ? renderPhotoHiddenMessageHtml(t) : "";
  const comments = renderPostComments(t.id, t.communityId, { prefaceHtml: preface });
  const isPostPinned = Boolean(isPinned || t.isPinned);
  const dismissBtn = t.id === "vox-official-manifesto-welcome" || t.isDismissable
    ? `<button type="button" class="btn-dismiss-welcome-topic" title="Dispensar este post" aria-label="Dispensar post de boas-vindas" style="margin-left:auto; background:none; border:none; color:inherit; cursor:pointer; font-size:0.9rem; padding:0 4px; opacity:0.8;">✕</button>`
    : "";
  const pinnedRibbon = isPostPinned
    ? `<div class="post-pinned-ribbon"><span class="pin-icon">📌</span> <span>${t.isOfficial ? "Bem-vindo à Vox" : "Publicação Fixada"}</span>${dismissBtn}</div>`
    : "";

  if (layout === "text" || layout === "github") {
    return `
    <article class="post insta-post post-layout-${layout}${isPostPinned ? " post-pinned-highlight" : ""}" data-id="${escapeHtml(t.id)}" data-layout="${layout}">
      ${pinnedRibbon}
      ${header}
      ${caption}
      ${gist}
      ${frame}
      ${toolbar}
      ${comments}
    </article>`;
  }

  return `
    <article class="post insta-post post-layout-photo post-photo-bleed" data-id="${escapeHtml(t.id)}" data-layout="photo">
      ${media}
      ${header}


      ${igBar}

      ${frame}
      ${comments}
    </article>`;
}

export function renderStoriesStrip(customProfiles = null) {
  const profiles = customProfiles || Object.values(mock.MOCK_DEMO_PROFILES || {});
  if (!profiles.length) return '<div class="stories-strip stories-strip--empty" style="display:none;"></div>';
  const items = profiles
    .map((p) => {
      const avatarSrc = p.avatar || "icons/icon.svg";
      const firstName = (p.name || p.handle || "Autor").split(" ")[0];
      const ringClass = isWelcomeRouteId(p.routeId) ? "story-ring story-ring--official" : "story-ring";
      return `
        <a class="story-item" href="#/u/${encodeURIComponent(p.routeId)}" title="Ver perfil de ${escapeHtml(p.name)}">
          <div class="${ringClass}">
            <img class="story-avatar" src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(p.name)}" loading="lazy" />
          </div>
          <span class="story-name">${escapeHtml(firstName)}</span>
        </a>`;
    })
    .join("");

  return `<div class="stories-strip" aria-label="Stories em destaque">${items}</div>`;
}

export function renderWelcomeFeedHintHtml() {
  if (!shouldShowWelcomeFeedHint()) return "";
  const dmHref = `#/dm/${encodeURIComponent(WELCOME_ROUTE_ID)}`;
  return `
    <div class="welcome-feed-hint" id="welcome-feed-hint" role="status">
      <span class="welcome-feed-hint-text">
        💬 <strong>Vox</strong> te mandou uma mensagem —
        <a href="${dmHref}">Abrir conversa</a>
      </span>
      <button type="button" class="welcome-feed-hint-dismiss" id="btn-welcome-hint-dismiss" aria-label="Dispensar aviso">×</button>
    </div>`;
}

export function renderFeedTabsBar(activeFeed = "for-you") {
  const isForYou = activeFeed === "for-you";
  const isExternal = activeFeed === "external";
  const isAll = activeFeed === "all";
  const isFollowing = activeFeed === "following";

  return `
    <div class="feed-tabs-bar" role="tablist" aria-label="Filtro de feeds">
      <a href="#/" class="feed-tab-chip ${isForYou ? "active" : ""}" role="tab" aria-selected="${isForYou}">🏛️ Vox</a>
      <a href="#/?feed=external" class="feed-tab-chip ${isExternal ? "active" : ""}" role="tab" aria-selected="${isExternal}">🌐 Redes (Bluesky)</a>
      <a href="#/?feed=all" class="feed-tab-chip ${isAll ? "active" : ""}" role="tab" aria-selected="${isAll}">🔀 Tudo</a>
      <a href="#/?feed=following" class="feed-tab-chip ${isFollowing ? "active" : ""}" role="tab" aria-selected="${isFollowing}">⭐ Seguindo</a>
    </div>`;
}

function renderCitizenShieldBarHtml() {
  return `
    <div class="vox-citizen-shield-bar" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; padding:6px 10px; margin-bottom:0.65rem; border-radius:var(--radius-sm); background:rgba(22,163,74,0.1); border:1px solid rgba(22,163,74,0.35); font-size:0.75rem;">
      <span>🛡️ <strong>Escudo Cidadão Vox Ativo:</strong> 0 Rastreadores · 0 Algoritmo de Ódio · 100% Cronológico</span>
      <a href="#/settings/linked-accounts" style="font-weight:700; color:var(--accent); text-decoration:none;">🔗 Configurar Redes →</a>
    </div>`;
}

export function renderExternalFeedManagerHtml(subscriptions = []) {
  const list = Array.isArray(subscriptions) ? subscriptions : [];
  const chips = list
    .map(
      (h) => `<span class="bsky-sub-chip"><span class="bsky-sub-name">@${escapeHtml(h)}</span><button type="button" class="btn-remove-bsky-sub" data-handle="${escapeHtml(h)}" aria-label="Remover @${escapeHtml(h)}" title="Deixar de acompanhar">×</button></span>`,
    )
    .join("");

  return `
    <div class="bsky-feed-manager" role="region" aria-label="Gerenciador de feeds externos">
      ${renderCitizenShieldBarHtml()}
      <div class="bsky-manager-head">
        <span class="bsky-badge">🌐 INGESTÃO PREDATÓRIA · AT PROTOCOL</span>
        <h3 class="bsky-manager-title">Feeds Externos sob Proteção Cívica</h3>
        <p class="bsky-manager-desc">Consuma e interaja (curta, salve, comente, cite e exploda) com perfis externos dentro da soberania do Vox.</p>
      </div>
      <form id="form-add-bsky" class="bsky-add-form" aria-label="Adicionar perfil do Bluesky">
        <div class="bsky-input-group">
          <input type="text" id="input-bsky-handle" class="bsky-input" placeholder="Digite @handle.bsky.social..." required aria-label="Handle do Bluesky" />
          <button type="submit" class="btn btn-primary btn-sm btn-submit-bsky">+ Acompanhar no Vox</button>
        </div>
      </form>
      <div class="bsky-import-section">
        <div class="bsky-import-follows-row">
          <input type="text" id="input-bsky-import-me" class="bsky-input" placeholder="Seu @handle para importar quem você segue..." aria-label="Seu perfil do Bluesky" />
          <button type="button" id="btn-import-bsky-follows" class="btn btn-outline btn-sm">📥 Puxar quem eu sigo</button>
        </div>
        <div class="bsky-suggestions-row">
          <span class="bsky-sugg-label">Sugestões cívicas:</span>
          <button type="button" class="btn-add-suggestion" data-handle="lula.com.br">+ @lula.com.br</button>
          <button type="button" class="btn-add-suggestion" data-handle="brasildefato.com.br">+ @brasildefato.com.br</button>
          <button type="button" class="btn-add-suggestion" data-handle="theintercept.com">+ @theintercept.com</button>
          <button type="button" class="btn-add-suggestion" data-handle="apublica.org">+ @apublica.org</button>
          <button type="button" class="btn-add-suggestion" data-handle="cartacapital.com.br">+ @cartacapital.com.br</button>
        </div>
      </div>
      <div class="bsky-subs-list">
        <span class="bsky-subs-label">Perfis integrados:</span>
        <div class="bsky-subs-chips">${chips || '<span class="meta">Nenhum perfil cadastrado.</span>'}</div>
      </div>
    </div>`;
}

export function renderFeed(main, topics = [], { activeFeed = "for-you", userRouteId = "", externalSubs = null } = {}) {
  const isForYou = activeFeed !== "following" && activeFeed !== "external" && activeFeed !== "all";
  const displayName =
    userRouteId ? profileDirectory.getAuthorDisplaySync(userRouteId) || mock.getAuthorDisplay(userRouteId) : "";
  const welcomeHint = isForYou ? renderWelcomeFeedHintHtml() : "";
  const tabsBar = renderFeedTabsBar(activeFeed);
  const managerHtml = activeFeed === "external" ? renderExternalFeedManagerHtml(externalSubs) : "";

  let html = `
    <div class="feed-chrome">
      ${renderStoriesStrip()}
      ${tabsBar}
      ${managerHtml}
      ${welcomeHint}
      <div class="feed-composer-section">
        ${renderInlineComposer({ userRouteId, displayName })}
      </div>
    </div>`;

  if (!topics.length) {
    if (activeFeed === "external") {
      html += `
        <div class="empty external-empty">
          <p><strong>Nenhum post externo encontrado.</strong></p>
          <p class="desc" style="max-width:440px; margin:0.4rem auto 0.8rem;">Adicione um perfil do Bluesky acima ou verifique sua conexão com a internet.</p>
        </div>`;
    } else if (activeFeed === "following") {
      html += `
        <div class="empty following-empty">
          <div style="font-size:2rem; margin-bottom:0.5rem;">👥</div>
          <p><strong>Você ainda não acompanha ninguém.</strong></p>
          <p class="desc" style="max-width:440px; margin:0.4rem auto 0.8rem;">Clique em <strong>👁️ Acompanhar (Watch)</strong> nos perfis de autores para ver as publicações deles reunidas nesta aba.</p>
          <div style="display:flex; gap:0.5rem; justify-content:center; flex-wrap:wrap;">
            <a class="btn btn-primary btn-sm" href="#/">Explorar feed "Para você"</a>
            <a class="btn btn-outline btn-sm" href="#/pessoas">Encontrar pessoas na rede</a>
          </div>
        </div>`;
    } else {
      html += `
        <div class="empty">
          <div style="font-size:2rem; margin-bottom:0.5rem;">🌱</div>
          <p><strong>Nenhuma publicação no feed ainda.</strong></p>
          <p class="desc" style="max-width:440px; margin:0.4rem auto 0.8rem;">Seja a primeira voz soberana a compartilhar uma ideia, foto Lo-Fi, áudio ou vídeo nesta rede.</p>
          <div style="display:flex; gap:0.5rem; justify-content:center; flex-wrap:wrap;">
            <button type="button" class="btn btn-primary btn-sm" onclick="document.querySelector('#feed-inline-composer .inline-composer-collapsed')?.click()">Criar publicação</button>
            <a class="btn btn-outline btn-sm" href="#/pessoas">Encontrar pessoas</a>
          </div>
        </div>`;
    }
    main.innerHTML += html;
    return;
  }

  const visible = gossipRetract.filterFeedTopicsForGossipRetract(topics);
  rememberVisible(visible, userRouteId);
  const items = visible.map((t) => renderPostItem(t)).join("");
  html += `<div class="feed-container">${items}</div>`;
  main.innerHTML += html;
}
