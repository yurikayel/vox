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
          <img id="inline-topic-preview" class="inline-composer-preview-img" alt="Prévia da imagem" />
          <button type="button" class="btn btn-outline btn-sm inline-composer-remove-img" id="btn-inline-remove-img">Remover foto</button>
        </div>
        <div class="inline-composer-toolbar">
          <div class="inline-composer-tools">
            <label class="inline-composer-tool" title="Anexar imagem">
              <input type="file" id="inline-topic-file" accept="image/jpeg,image/png,image/webp,image/gif" hidden />
              <span aria-hidden="true">🖼</span> Foto
            </label>
            <input type="text" id="inline-topic-comm" class="inline-composer-comm" placeholder="Comunidade (opcional)" maxlength="64" aria-label="Slug da comunidade" />
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
  if (t?.image || t?.mediaRef?.hash) return "photo";
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
  return `> **${authorDisplay}** (@${authorHandle}) · *Vox Brasil*\n>\n> **${title}**\n>\n> ${body}\n>\n> 🔗 Ver no Vox: ${url}`;
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
export function renderPostComments(topicId, commId = "", { replies = [], expanded = false } = {}) {
  const panelId = commentsPanelId(topicId);
  const openCls = expanded ? " is-open" : "";
  const hid = expanded ? "" : " hidden";
  return `<div class="post-comments post-comments-surface${openCls}" id="${escapeHtml(panelId)}"${hid} data-topic="${escapeHtml(topicId)}" data-comm="${escapeHtml(commId)}">${renderCommentList(replies, { topicId, commId })}${renderInlineReplyComposer(topicId, commId)}</div>`;
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

export function renderPostOverlayTextHtml(post) {
  const id = post?.id || "";
  const href = id ? `#/t/${encodeURIComponent(id)}` : "#";
  const disp = postOwnership.formatPostDisplay({ title: post?.title, body: post?.body });
  if (disp.mode === "empty") return "";
  if (disp.mode === "caption") {
    const linked = hashtags.linkifyHashtags(escapeHtml(disp.text));
    return `<p class="post-overlay-excerpt post-overlay-caption-only"><a href="${href}">${linked}</a></p>`;
  }
  const titleBlock = `<h3 class="post-overlay-title"><a href="${href}">${escapeHtml(disp.title)}</a></h3>`;
  const bodyBlock = disp.body ? `<div class="post-overlay-excerpt post-body-md">${renderPostBodyMarkdown(disp.body)}</div>` : "";
  return `${titleBlock}${bodyBlock}`;
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

function renderPostHeroSubtitle(author) {
  const prof = mock.getMockProfile(author);
  if (prof?.uf) {
    return `<div class="post-media-header-subtitle">Demo · ${escapeHtml(prof.uf)}</div>`;
  }
  return "";
}

function renderPostMoreMenuTrigger(t, author, authorDisplay) {
  return `<button type="button" class="btn-post-more-menu" aria-label="Mais opções da publicação" data-post-id="${escapeHtml(t.id)}" data-author-route="${escapeHtml(author)}" data-title="${escapeHtml(t.title || authorDisplay || "")}"><span aria-hidden="true">⋯</span></button>`;
}

function renderPostMediaHeader(t, author, labels) {
  const authorDisplay = labels.authorDisplay;
  const { display: timeDisplay, titleAttr: timeTitle } = postTimeParts(t.ts);
  const followBtn = shouldShowPostFollowOverlay(t, author) ? renderPostHeroFollowBtn(author) : "";
  const subtitle = renderPostHeroSubtitle(author);
  return `<div class="post-media-header">
    <div class="post-media-header-left">
      <a class="avatar-link post-media-header-avatar" href="#/u/${encodeURIComponent(author)}">${renderAvatarHtml(author, authorDisplay, "sm")}</a>
      <div class="post-media-header-lines">
        <div class="post-media-header-primary">
          <a class="post-media-header-username" href="#/u/${encodeURIComponent(author)}">${escapeHtml(authorDisplay)}</a>
          ${renderPostHeroVerifiedBadge(author)}
          <span class="post-media-header-dot" aria-hidden="true">·</span>
          <span class="post-media-header-time"${timeTitle}>${escapeHtml(timeDisplay)}</span>
        </div>
        ${subtitle}
      </div>
    </div>
    <div class="post-media-header-right">
      ${followBtn}
      ${renderPostMoreMenuTrigger(t, author, authorDisplay)}
    </div>
  </div>`;
}

function renderPostActionsOverlay(t, author, authorDisplay, authorHandle) {
  const baseLikes = Number(t.likesCount) || 0;
  const liked = social.isLiked(t.id);
  const likes = social.getLikesCount(t.id, baseLikes);
  const baseStars = Number(t.starsCount) || 0;
  const starred = social.isStarred(t.id);
  const stars = social.getStarsCount(t.id, baseStars);
  const saved = social.isSaved(t.id);
  const likeCountHtml = likes > 0 ? `<span class="overlay-action-count count-likes">${likes}</span>` : "";
  return `<div class="post-actions-overlay" role="toolbar" aria-label="Ações da publicação">
    <button class="action-btn btn-like overlay-action-btn ${liked ? "active" : ""}" data-id="${escapeHtml(t.id)}" data-count="${baseLikes}" aria-label="Gostei${likes > 0 ? `, ${likes}` : ""}">
      <svg class="action-icon icon-heart" width="22" height="22" viewBox="0 0 24 24" fill="${liked ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
      ${likeCountHtml}
    </button>
    ${renderCommentButton(t, { overlay: true })}
    ${renderZapOverlayBtn(t, author, authorDisplay)}
    <button class="action-btn btn-share btn-share-post overlay-action-btn" data-id="${escapeHtml(t.id)}" data-title="${escapeHtml(t.title)}" data-author="${escapeHtml(authorDisplay || "")}" data-body="${escapeHtml((t.body || "").slice(0, 160))}" aria-label="Compartilhar">
      <svg class="action-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
    </button>
    ${renderToolbarUtilityMenu(t, author, authorDisplay, authorHandle, baseStars, starred, stars, saved, { overlay: true })}
  </div>`;
}

function renderPostMediaHero(t, author, labels) {
  const overlayText = renderPostOverlayTextHtml(t);
  const authorDisplay = labels.authorDisplay;
  const authorHandle = labels.authorHandle;
  const mediaHeader = renderPostMediaHeader(t, author, labels);
  const scrimTop = `<div class="post-media-scrim-top" aria-hidden="true"></div>`;
  const scrimBottom = `<div class="post-media-scrim-bottom" aria-hidden="true"></div>`;
  const actionsOverlay = renderPostActionsOverlay(t, author, authorDisplay, authorHandle);
  const captionBlock = overlayText
    ? `<div class="post-overlay-content">${overlayText}</div>`
    : "";
  const overlayBlock = `<div class="post-overlay">${captionBlock}</div>`;

  if (t?.image) {
    const altRaw = t.imageAlt || t.title || "";
    const alt = escapeHtml(altRaw);
    const src = escapeHtml(t.image);
    return `<div class="post-media-container post-media-hero">
      ${mediaHeader}
      <button type="button" class="post-media-lightbox-trigger" aria-label="Ver imagem em tela cheia" data-media-src="${src}" data-media-alt="${alt}">
        <img class="post-media post-media-hero-img" src="${src}" alt="${alt}" loading="lazy" />
      </button>
      ${scrimTop}
      ${scrimBottom}
      ${overlayBlock}
      ${actionsOverlay}
    </div>`;
  }
  if (t?.mediaRef?.hash) {
    return `<div class="post-media-container post-media-hero post-media-lazy" data-media-hash="${escapeHtml(t.mediaRef.hash)}">
      ${mediaHeader}
      <div class="media-placeholder" style="aspect-ratio:4/5; display:flex; align-items:center; justify-content:center; background:var(--surface-soft); color:var(--muted); font-size:0.85rem;"><span>📷 Mídia P2P (${escapeHtml(t.mediaRef.mime || "imagem")})</span></div>
      ${scrimTop}
      ${scrimBottom}
      ${overlayBlock}
      ${actionsOverlay}
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
  const titleBlock = `<div class="post-title"><a href="${href}">${escapeHtml(disp.title)}</a></div>`;
  const bodyBlock = disp.body ? `<div class="post-body post-body-md">${renderPostBodyMarkdown(disp.body)}</div>` : "";
  return `${titleBlock}${bodyBlock}`;
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

function renderZapOverlayBtn(t, author, authorDisplay) {
  const pix = t.contactPix || (author ? mock.getAuthorPixKey(author) : "") || "";
  const icon = `<svg class="action-icon icon-zap" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
  if (!pix) {
    return `<button class="action-btn btn-zap-post overlay-action-btn disabled" disabled aria-label="Autor sem Pix informado" title="Autor sem chave Pix informada" style="opacity:0.35;">${icon}</button>`;
  }
  return `<button class="action-btn btn-zap-post overlay-action-btn" data-id="${escapeHtml(t.id)}" data-author="${escapeHtml(author)}" data-author-name="${escapeHtml(authorDisplay)}" data-pix="${escapeHtml(pix)}" data-title="${escapeHtml(t.title)}" aria-label="Apoiar com Pix" title="Apoiar com Pix">${icon}</button>`;
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
    </div>
  </details>`;
}

function renderToolbarOverflow(t, author, authorDisplay, authorHandle, baseStars, starred, stars) {
  return `<details class="toolbar-overflow">
    <summary class="action-btn btn-toolbar-more" aria-label="Mais ações do post"><span aria-hidden="true">⋯</span></summary>
    <div class="toolbar-overflow-menu" role="menu">
      <button type="button" class="action-btn btn-star ${starred ? "active" : ""}" data-id="${escapeHtml(t.id)}" data-count="${baseStars}" role="menuitem" aria-label="Dar estrela ao post">
        <svg class="action-icon icon-star" width="18" height="18" viewBox="0 0 24 24" fill="${starred ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        <span class="action-count count-stars">${stars > 0 ? stars : ""}</span>
        <span class="toolbar-overflow-label">Estrela</span>
      </button>
      <button type="button" class="action-btn btn-copy-md" data-id="${escapeHtml(t.id)}" data-title="${escapeHtml(t.title)}" data-body="${escapeHtml(t.body || "")}" data-author="${escapeHtml(authorDisplay)}" data-handle="${escapeHtml(authorHandle)}" role="menuitem" aria-label="Copiar post como Markdown">
        <svg class="action-icon icon-copy" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
        <span class="toolbar-overflow-label">Copiar .md</span>
      </button>
    </div>
  </details>`;
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
            <button class="action-btn btn-share btn-share-post" data-id="${escapeHtml(t.id)}" data-title="${escapeHtml(t.title)}" data-author="${escapeHtml(authorDisplay || "")}" data-body="${escapeHtml((t.body || "").slice(0, 160))}" aria-label="Compartilhar post">
              <svg class="action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
            </button>
            ${renderZapToolbarBtn(t, author, authorDisplay)}
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
  const media = isPhoto ? renderPostMediaHero(t, author, labels) : "";
  const frame = renderPostFrame(t);
  const toolbar = isPhoto ? "" : renderPostToolbar(t, author, authorDisplay, authorHandle);
  const caption = isPhoto ? "" : `<div class="post-caption-block">${renderPostText(t)}</div>`;
  const gist = layout === "github" ? renderPostGithubGist(t) : "";
  const comments = renderPostComments(t.id, t.communityId);

  if (layout === "text" || layout === "github") {
    return `
    <article class="post insta-post post-layout-${layout}" data-id="${escapeHtml(t.id)}" data-layout="${layout}">
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
      ${header}
      ${media}
      ${frame}
      ${toolbar}
      ${comments}
    </article>`;
}

export function renderStoriesStrip() {
  const profiles = Object.values(mock.MOCK_DEMO_PROFILES || {});
  if (!profiles.length) return "";
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
        💬 <strong>Vox Brasil</strong> te mandou uma mensagem —
        <a href="${dmHref}">Abrir conversa</a>
      </span>
      <button type="button" class="welcome-feed-hint-dismiss" id="btn-welcome-hint-dismiss" aria-label="Dispensar aviso">×</button>
    </div>`;
}

export function renderFeed(main, topics = [], { activeFeed = "for-you", userRouteId = "" } = {}) {
  const isForYou = activeFeed !== "following";
  const displayName =
    userRouteId ? profileDirectory.getAuthorDisplaySync(userRouteId) || mock.getAuthorDisplay(userRouteId) : "";
  const welcomeHint = isForYou ? renderWelcomeFeedHintHtml() : "";
  let html = `
    <div class="feed-chrome">
      ${renderStoriesStrip()}
      ${welcomeHint}
      <div class="feed-composer-section">
        ${renderInlineComposer({ userRouteId, displayName })}
      </div>
    </div>`;

  if (!topics.length) {
    if (!isForYou) {
      html += `
        <div class="empty following-empty">
          <p><strong>Você ainda não acompanha ninguém.</strong></p>
          <p class="desc" style="max-width:440px; margin:0.4rem auto 0.8rem;">Clique em <strong>👁️ Acompanhar (Watch)</strong> nos perfis de autores para ver as publicações deles reunidas nesta aba.</p>
          <div style="display:flex; gap:0.5rem; justify-content:center; flex-wrap:wrap;">
            <a class="btn btn-primary btn-sm" href="#/">Explorar feed "Para você"</a>
            <a class="btn btn-outline btn-sm" href="#/c/demo-aprenda-vox">Conhecer perfis do tour</a>
          </div>
        </div>`;
    } else {
      html += `
        <div class="empty">
          <p>Nenhuma voz recente na rede — seja a primeira.</p>
          <a class="btn btn-primary" href="#/compose/topic">Publicar primeiro post</a>
        </div>`;
    }
    main.innerHTML += html;
    return;
  }

  const visible = gossipRetract.filterFeedTopicsForGossipRetract(topics);
  const items = visible.map((t) => renderPostItem(t)).join("");
  html += `<div class="feed-container">${items}</div>`;
  main.innerHTML += html;
}
