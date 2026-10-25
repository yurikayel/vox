/** @file Feed, composer, post cards, comments, stories. */
import * as mock from "../mock.js";
import * as social from "../social.js";
import * as hashtags from "../hashtags.js";
import * as frames from "../frames.js";
import * as postOwnership from "../post-ownership.js";
import * as i18n from "../i18n-pt-br.js";
import * as gossipRetract from "../gossip-retract-ui.js";
import * as profileDirectory from "../profile-directory.js";
import {
  getWelcomeProfile,
  WELCOME_ROUTE_ID,
  shouldShowWelcomeCard,
} from "../vox-welcome-profile.js";
import {
  escapeHtml,
  shortId,
  resolvePostAuthorLabels,
  renderPostAuthorMetaLines,
  renderAvatarHtml,
  formatTimeAgo,
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
          <span class="inline-composer-hint meta"> · assinado no aparelho · <a href="#/compose/topic">formulário completo</a></span>
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

export function renderInlineReplyItem(r) {
  const rAuthor = r.author || r.owner || "";
  const rLabels = resolvePostAuthorLabels(rAuthor, {
    authorDisplay: r.authorDisplay,
    isOwnLocalPost: r.isOwnLocalPost,
  });
  const rAuthorDisplay = rLabels.authorDisplay;
  const handleHtml = rLabels.secondaryHandle
    ? `<span class="post-handle" title="${escapeHtml(rLabels.routeTitle)}">@${escapeHtml(rLabels.secondaryHandle)}</span>`
    : "";
  return `
    <li class="post-comment-item" id="inline-reply-${escapeHtml(r.id)}">
      <a class="avatar-link" href="#/u/${encodeURIComponent(rAuthor)}">${renderAvatarHtml(rAuthor, rAuthorDisplay, "sm")}</a>
      <div class="post-comment-body">
        <div class="post-comment-meta">
          <a class="post-author" href="#/u/${encodeURIComponent(rAuthor)}">${escapeHtml(rAuthorDisplay)}</a>
          ${handleHtml}
        </div>
        <p class="reply-body">${hashtags.linkifyHashtags(escapeHtml(r.body || ""))}</p>
      </div>
    </li>`;
}

export function renderCommentList(replies = []) {
  if (!replies.length) {
    return `<div class="post-comments-feed"><p class="post-comments-empty">Nenhuma resposta ainda.</p></div>`;
  }
  return `<div class="post-comments-feed"><ul class="post-comment-list">${replies.map(renderInlineReplyItem).join("")}</ul></div>`;
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

export function renderPostComments(topicId, commId = "", { replies = [], expanded = false } = {}) {
  const panelId = commentsPanelId(topicId);
  const openCls = expanded ? " is-open" : "";
  const hid = expanded ? "" : " hidden";
  return `<div class="post-comments${openCls}" id="${escapeHtml(panelId)}"${hid} data-topic="${escapeHtml(topicId)}" data-comm="${escapeHtml(commId)}">${renderCommentList(replies)}${renderInlineReplyComposer(topicId, commId)}</div>`;
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

function renderPostHeaderBlock(t, author, labels) {
  const authorDisplay = labels.authorDisplay;
  const ownerMenu = renderPostOwnerMenu(t);
  const metaHtml = renderPostAuthorMetaLines(author, labels, formatTimeAgo(t.ts));
  const asideHtml = ownerMenu ? `<div class="post-header-aside">${ownerMenu}</div>` : "";
  return `
    <header class="post-header-ig">
      <div class="post-header-user">
        <a class="avatar-link" href="#/u/${encodeURIComponent(author)}">${renderAvatarHtml(author, authorDisplay)}</a>
        ${metaHtml}
      </div>
      ${asideHtml}
    </header>`;
}

function renderPostMedia(t) {
  if (t?.image) {
    const alt = escapeHtml(t.imageAlt || t.title);
    return `<div class="post-media-container"><img class="post-media" src="${escapeHtml(t.image)}" alt="${alt}" loading="lazy" /></div>`;
  }
  if (t?.mediaRef?.hash) {
    const alt = escapeHtml(t.imageAlt || t.title || "Mídia P2P");
    return `<div class="post-media-container post-media-lazy" data-media-hash="${escapeHtml(t.mediaRef.hash)}"><div class="media-placeholder" style="aspect-ratio:4/5; display:flex; align-items:center; justify-content:center; background:var(--surface-soft); color:var(--muted); font-size:0.85rem;"><span>📷 Mídia P2P (${escapeHtml(t.mediaRef.mime || "imagem")})</span></div></div>`;
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
  const bodyBlock = disp.body
    ? `<p class="post-body">${hashtags.linkifyHashtags(escapeHtml(disp.body))}</p>`
    : "";
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

function renderCommentButton(t) {
  const n = Number(t.repliesCount) || 0;
  const panelId = commentsPanelId(t.id);
  return `<button type="button" class="action-btn btn-comment" data-id="${escapeHtml(t.id)}" data-comm="${escapeHtml(t.communityId || "")}" aria-expanded="false" aria-controls="${escapeHtml(panelId)}" aria-label="Ver comentários">
            <svg class="action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span class="action-count count-replies">${n > 0 ? n : ""}</span>
          </button>`;
}

function renderZapToolbarBtn(t, author, authorDisplay) {
  const pix = t.contactPix || (author ? mock.getAuthorPixKey(author) : "") || "";
  const icon = `<svg class="action-icon icon-zap" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
  if (!pix) {
    return `<button class="action-btn btn-zap-post disabled" disabled aria-label="Autor sem Pix informado" title="Autor sem chave Pix informada" style="opacity:0.35; cursor:not-allowed;">${icon}</button>`;
  }
  return `<button class="action-btn btn-zap-post" data-id="${escapeHtml(t.id)}" data-author="${escapeHtml(author)}" data-author-name="${escapeHtml(authorDisplay)}" data-pix="${escapeHtml(pix)}" data-title="${escapeHtml(t.title)}" aria-label="Apoiar com Pix Zap" title="Apoiar com Pix Zap">${icon}<span class="action-label zap-label" style="font-size:0.75rem; font-weight:600; margin-left:2px;">Apoiar</span></button>`;
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
          <div class="toolbar-left">
            <button class="action-btn btn-like ${liked ? "active" : ""}" data-id="${escapeHtml(t.id)}" data-count="${baseLikes}" aria-label="Curtir post">
              <svg class="action-icon icon-heart" width="20" height="20" viewBox="0 0 24 24" fill="${liked ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
              <span class="action-count count-likes">${likes > 0 ? likes : ""}</span>
            </button>
            ${renderCommentButton(t)}
            <button class="action-btn btn-share btn-share-post" data-id="${escapeHtml(t.id)}" data-title="${escapeHtml(t.title)}" aria-label="Compartilhar post">
              <svg class="action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
            </button>
          </div>
          <div class="toolbar-center">
            ${renderZapToolbarBtn(t, author, authorDisplay)}
            <button class="action-btn btn-star ${starred ? "active" : ""}" data-id="${escapeHtml(t.id)}" data-count="${baseStars}" aria-label="Dar estrela ao post">
              <svg class="action-icon icon-star" width="19" height="19" viewBox="0 0 24 24" fill="${starred ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              <span class="action-count count-stars">${stars > 0 ? stars : ""}</span>
            </button>
          </div>
          <div class="toolbar-right">
            <button class="action-btn btn-copy-md" data-id="${escapeHtml(t.id)}" data-title="${escapeHtml(t.title)}" data-body="${escapeHtml(t.body || "")}" data-author="${escapeHtml(authorDisplay)}" data-handle="${escapeHtml(authorHandle)}" aria-label="Copiar post como Markdown">
              <svg class="action-icon icon-copy" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
            </button>
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
  const header = renderPostHeaderBlock(t, author, labels);
  const media = layout === "photo" ? renderPostMedia(t) : "";
  const frame = renderPostFrame(t);
  const toolbar = renderPostToolbar(t, author, authorDisplay, authorHandle);
  const caption = `<div class="post-caption-block">${renderPostText(t)}</div>`;
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
    <article class="post insta-post post-layout-photo" data-id="${escapeHtml(t.id)}" data-layout="photo">
      ${header}
      ${media}
      ${frame}
      ${caption}
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
      return `
        <a class="story-item" href="#/u/${encodeURIComponent(p.routeId)}" title="Ver perfil de ${escapeHtml(p.name)}">
          <div class="story-ring">
            <img class="story-avatar" src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(p.name)}" loading="lazy" />
          </div>
          <span class="story-name">${escapeHtml(firstName)}</span>
        </a>`;
    })
    .join("");

  return `<div class="stories-strip" aria-label="Stories em destaque">${items}</div>`;
}

export function renderWelcomeCardHtml() {
  if (!shouldShowWelcomeCard()) return "";
  const w = getWelcomeProfile();
  const av = renderAvatarHtml(WELCOME_ROUTE_ID, w.name);
  return `
    <div class="card welcome-first-contact" id="welcome-first-contact-card" style="margin-bottom:0.75rem; border:1px solid var(--border);">
      <div style="display:flex; gap:0.75rem; align-items:flex-start;">
        <div>${av}</div>
        <div style="flex:1; min-width:0;">
          <h3 style="margin:0 0 4px; font-size:1rem;">Primeiro contato: ${escapeHtml(w.name)}</h3>
          <p class="desc" style="margin:0 0 0.65rem; font-size:0.88rem;">${escapeHtml(w.bio)}</p>
          <div style="display:flex; flex-wrap:wrap; gap:0.4rem;">
            <a class="btn btn-primary btn-sm" href="#/u/${encodeURIComponent(WELCOME_ROUTE_ID)}">Ver perfil</a>
            <a class="btn btn-outline btn-sm" href="#/dm/${encodeURIComponent(WELCOME_ROUTE_ID)}">Mensagem</a>
            <a class="btn btn-outline btn-sm" href="#/people">Encontrar pessoas</a>
            <button type="button" class="btn btn-sm btn-outline" id="btn-welcome-card-dismiss">Ok, entendi</button>
          </div>
        </div>
      </div>
    </div>`;
}

export function renderFeed(main, topics = [], { activeFeed = "for-you", userRouteId = "" } = {}) {
  const isForYou = activeFeed !== "following";
  const displayName =
    userRouteId ? profileDirectory.getAuthorDisplaySync(userRouteId) || mock.getAuthorDisplay(userRouteId) : "";
  const welcomeCard = isForYou ? renderWelcomeCardHtml() : "";
  let html = `
    <div class="feed-chrome">
      ${renderStoriesStrip()}
      <div class="feed-composer-section">
        ${renderInlineComposer({ userRouteId, displayName })}
      </div>
      ${welcomeCard}
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
          <p>Nenhum post recente na rede.</p>
          <a class="btn btn-primary" href="#/compose/topic">Criar primeiro post</a>
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
