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
  isWelcomeRouteId,
  getWelcomeProfile,
} from "../vox-welcome-profile.js";
import {
  escapeHtml,
  resolvePostAuthorLabels,
  renderPostAuthorMetaLines,
  renderAvatarHtml,
  formatTimeAgo,
  postTimeParts,
  renderReportMenuItem,
} from "./util.js";
import { renderIgToolbar } from "./ig-toolbar.js";
import { renderPhotoTagLayerHtml } from "./photo-tag-pins.js";
import { renderRepostCiteHtml } from "./repost-cite.js";
import { renderRepostBtn } from "./repost-btn.js";
import { rememberVisible } from "../repost-index.js";
import { groupRepliesForThread } from "../reply-thread.js";
import { renderPhotoHiddenMessageHtml } from "./photo-chrome.js";
import { renderCivicBlock, renderCivicPendingNote, renderCivicFeedIntro } from "./civic-block.js";
import { isElectoralModeActive } from "../electoral-period.js";

export function renderComposerStrip(displayName = "") {
  return renderInlineComposer({ displayName });
}

function renderComposerFilterBar() {
  return `
    <div class="lofi-filter-bar" id="lofi-filter-bar">
      <span class="meta lofi-filter-label">Estilo Lo-Fi:</span>
      <button type="button" class="lofi-filter-btn active" data-filter="normal">Padrão</button>
      <button type="button" class="lofi-filter-btn" data-filter="xerox">📰 Xerox</button>
      <button type="button" class="lofi-filter-btn" data-filter="vhs">📼 VHS 90s</button>
      <button type="button" class="lofi-filter-btn" data-filter="risograph">🎨 Risógrafo</button>
    </div>`;
}

function renderComposerAspectBar() {
  return `
    <div class="composer-aspect-bar" id="composer-aspect-bar" style="display:none;">
      <span class="meta composer-aspect-label">Proporção:</span>
      <button type="button" class="composer-aspect-btn active" data-aspect="original">Original (padrão)</button>
      <button type="button" class="composer-aspect-btn" data-aspect="16:9">16:9</button>
      <button type="button" class="composer-aspect-btn" data-aspect="9:16">9:16</button>
      <button type="button" class="composer-aspect-btn" data-aspect="4:3">4:3</button>
      <button type="button" class="composer-aspect-btn" data-aspect="3:4">3:4</button>
      <button type="button" class="composer-aspect-btn" data-aspect="1:1">1:1</button>
    </div>`;
}

function renderComposerPreviewWrap() {
  return `
    <div class="inline-composer-preview hidden" id="inline-topic-preview-wrap" hidden>
      <img id="inline-topic-preview" class="inline-composer-preview-img hidden" alt="Prévia da imagem" hidden />
      <div id="inline-topic-preview-audio-wrap" class="inline-composer-preview-audio hidden" hidden>
        <div class="inline-composer-preview-audio-header">
          <span>🎙️</span>
          <strong style="font-size:0.85rem;">Recado de Voz (Lo-Fi 48kbps)</strong>
        </div>
        <audio id="inline-topic-preview-audio" controls style="width:100%;"></audio>
      </div>
      <div id="inline-topic-preview-video-wrap" class="inline-composer-preview-video hidden" hidden>
        <video id="inline-topic-preview-video" controls playsinline preload="metadata" style="width:100%; max-height:240px; display:block;"></video>
      </div>
      <div class="composer-attach-line">
        <p id="inline-topic-attach-meta" class="inline-composer-attach-meta hidden" hidden aria-live="polite"></p>
        <button type="button" class="composer-attach-remove inline-composer-remove-img" id="btn-inline-remove-img" aria-label="Remover anexo" title="Remover anexo">✕</button>
      </div>
      <span class="lofi-weight-pill composer-attach-weight" id="lofi-weight-badge">⚡ ~45 KB (100% Grátis)</span>
      <div class="composer-tag-bar composer-edit-row" id="composer-tag-bar" style="display:none;">
        <button type="button" class="composer-edit-btn" data-edit-panel="style" aria-expanded="false">🎨 Estilo</button>
        <button type="button" class="composer-edit-btn" data-edit-panel="aspect" aria-expanded="false">⬚ Proporção</button>
        <button type="button" class="composer-edit-btn" id="btn-inline-tag-people" aria-haspopup="dialog" aria-expanded="false">🏷️ Marcar pessoas</button>
        <div id="inline-composer-tags-chips" class="inline-composer-tags-chips"></div>
      </div>
      ${renderComposerFilterBar()}
      ${renderComposerAspectBar()}
    </div>`;
}

function iconMediaPhoto() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`;
}

function iconMediaMic() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`;
}

function iconMediaAudio() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
}

function iconMediaVideo() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="2" y="5" rx="2"/><polygon points="22 8 16 12 22 16 22 8"/></svg>`;
}

function iconCommunity() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
}

function renderMediaTools() {
  return `
    <label class="inline-composer-tool" title="Foto (até 99 KB)" aria-label="Anexar foto">
      <input type="file" id="inline-topic-file" accept="image/jpeg,image/png,image/webp,image/gif" hidden />
      ${iconMediaPhoto()}
    </label>
    <div class="inline-mic-wrapper">
      <button type="button" class="inline-composer-tool btn-inline-mic" id="btn-inline-mic" title="Gravar voz (toque para iniciar, até 1 min)" aria-label="Gravar voz pelo microfone (até 60s)" aria-pressed="false">
        <span class="btn-mic-icon" aria-hidden="true">${iconMediaMic()}</span>
        <span class="btn-mic-recording-content" aria-hidden="true">
          <span class="recording-pulse"></span>
          <span id="inline-recording-timer" class="recording-timer">00:00 / 01:00</span>
          <span class="recording-stop-icon">⏹</span>
        </span>
      </button>
      <button type="button" id="btn-inline-cancel-rec" class="btn-rec-cancel hidden" title="Cancelar gravação" aria-label="Cancelar gravação">✕</button>
    </div>
    <label class="inline-composer-tool" title="Áudio (até 60s)" aria-label="Anexar áudio">
      <input type="file" id="inline-topic-audio" accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/webm,audio/aac,audio/m4a" hidden />
      ${iconMediaAudio()}
    </label>
    <label class="inline-composer-tool" title="Vídeo (até 10s)" aria-label="Anexar vídeo">
      <input type="file" id="inline-topic-video" accept="video/mp4,video/webm,video/ogg" hidden />
      ${iconMediaVideo()}
    </label>`;
}

function renderComposerAudience() {
  return `
    <div class="inline-composer-audience">
      <div class="inline-composer-comm-wrap" title="Comunidade de destino">
        ${iconCommunity()}
        <input type="text" id="inline-topic-comm" class="inline-composer-comm" list="inline-comm-list" placeholder="Comunidade (opcional)" maxlength="64" aria-label="Slug da comunidade" />
      </div>
      <datalist id="inline-comm-list"></datalist>
    </div>`;
}

function renderComposerToolbar() {
  return `
    <div class="inline-composer-toolbar">
      <div class="inline-composer-tools">
        ${renderMediaTools()}
      </div>
      <div class="inline-composer-actions">
        <span class="inline-composer-char" id="inline-topic-char">0 / 2000</span>
        <button type="submit" class="btn btn-outline btn-sm btn-inline-echo" id="btn-inline-echo" aria-label="Publicar e ecoar em outras redes" disabled title="Publica no Vox e abre o Cockpit POSSE para WhatsApp, Bluesky, Telegram, X, etc.">🚀 Postar & Ecoar</button>
        <button type="submit" class="btn btn-primary btn-sm btn-inline-submit" aria-label="Publicar mensagem no feed" id="btn-inline-submit" disabled>Postar</button>
      </div>
    </div>`;
}

function renderComposerMeta() {
  return `
    <div class="inline-composer-meta" aria-live="polite">
      <div class="inline-composer-meta-left">
        <span class="inline-composer-badge-sovereign" title="Assinado no aparelho e sincronizado na malha peer-to-peer sem controle central.">🔒 Soberano</span>
        <span class="inline-composer-hint meta"> · <a href="#/compose/topic">Formulário completo</a> · <a href="#/wallet">Criar ou importar chave</a></span>
        <span class="inline-composer-local-hint meta" title="${escapeHtml(i18n.localMutateEditDeleteTooltip)}"> · ${escapeHtml(i18n.localMutateComposerHint)}</span>
      </div>
    </div>`;
}

export function renderInlineComposer({ userRouteId = "", displayName = "" } = {}) {
  const label = displayName || (userRouteId ? mock.getAuthorDisplay(userRouteId) : "") || "Você";
  const avatarHtml = userRouteId ? renderAvatarHtml(userRouteId, label) : '<span class="avatar">✍</span>';
  return `
    <div class="inline-composer" id="feed-inline-composer" data-user-route="${escapeHtml(userRouteId || "")}">
      <div class="inline-composer-collapsed" tabindex="0" role="button" aria-expanded="false" aria-controls="form-inline-topic" aria-label="Abrir formulário de publicação">
        <div class="inline-composer-avatar">${avatarHtml}</div>
        <span class="inline-composer-placeholder">O que está acontecendo na sua rede?</span>
      </div>
      <form class="inline-composer-form hidden" id="form-inline-topic" aria-label="Nova publicação">
        <div class="inline-composer-form-head">
          ${avatarHtml}
          <textarea id="inline-topic-body" class="inline-composer-textarea" rows="3" maxlength="2000" placeholder="Compartilhe texto, #hashtags ou anexe uma foto…" aria-label="Texto da publicação"></textarea>
        </div>
        ${renderComposerAudience()}
        ${renderComposerPreviewWrap()}
        ${renderComposerToolbar()}
        ${renderComposerMeta()}
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
    authorHandle: post.authorHandle,
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

function renderReplyNestedList(children, byParent, topicId, commId) {
  if (!children || !children.length) return "";
  const items = children.map((c) => renderInlineReplyItem(c, { byParent, topicId, commId })).join("");
  return `<ul class="post-comment-nested-list">${items}</ul>`;
}

export function renderInlineReplyItem(r, { byParent = null, topicId = "", commId = "" } = {}) {
  const rAuthor = r.author || r.owner || "";
  const rLabels = resolvePostAuthorLabels(rAuthor, {
    authorDisplay: r.authorDisplay,
    authorHandle: r.authorHandle,
    isOwnLocalPost: r.isOwnLocalPost,
  });
  const handleHtml = rLabels.secondaryHandle ? `<span class="post-handle" title="${escapeHtml(rLabels.routeTitle)}">@${escapeHtml(rLabels.secondaryHandle)}</span>` : "";
  const mentionHandle = rLabels.secondaryHandle || rLabels.authorHandle || "";
  const children = byParent && byParent[r.id] ? byParent[r.id] : [];
  const nestedList = renderReplyNestedList(children, byParent, topicId, commId);
  const composerHtml = topicId ? renderCommentNestedReplyComposer(r.id, topicId, commId, mentionHandle) : "";

  return `
    <li class="post-comment-item" id="inline-reply-${escapeHtml(r.id)}" data-comment-id="${escapeHtml(r.id)}">
      <a class="avatar-link" href="#/u/${encodeURIComponent(rAuthor)}">${renderAvatarHtml(rAuthor, rLabels.authorDisplay, "sm", r.authorAvatar)}</a>
      <div class="post-comment-body">
        <div class="post-comment-meta">
          <a class="post-author" href="#/u/${encodeURIComponent(rAuthor)}">${escapeHtml(rLabels.authorDisplay)}</a>
          ${handleHtml}
        </div>
        <p class="reply-body">${hashtags.linkifyHashtags(escapeHtml(r.body || ""))}</p>
        <div class="post-comment-actions">
          ${renderCommentReactBtn(r)}
          <button type="button" class="post-comment-action btn-comment-reply" data-comment-id="${escapeHtml(r.id)}" aria-label="Responder a ${escapeHtml(rLabels.authorDisplay)}">Responder</button>
        </div>
        ${nestedList}
        ${composerHtml}
      </div>
    </li>`;
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
    <svg class="action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="4.93" x2="19.07" y1="4.93" y2="19.07"/></svg>
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

function renderImageHero(t, layer, overlayHeaderHtml, overlayFooterHtml) {
  const alt = escapeHtml(t.imageAlt || t.title || "");
  const src = escapeHtml(t.image);
  const aspect = t?.aspectRatio || "original";
  const aspectClass = `post-aspect-${aspect.replace(":", "-")}`;
  return `
    <div class="post-media-container post-media-hero ${aspectClass}" data-aspect="${escapeHtml(aspect)}">
      ${overlayHeaderHtml}
      <button type="button" class="post-media-lightbox-trigger" aria-label="Ver imagem em tela cheia" data-media-src="${src}" data-media-alt="${alt}">
        <img class="post-media post-media-hero-img" src="${src}" alt="${alt}" loading="lazy" />
      </button>
      ${layer}
      ${overlayFooterHtml}
    </div>`;
}

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

function renderPostMediaHero(t, overlayHeaderHtml = "", overlayFooterHtml = "") {
  const layer = renderPhotoTagLayerHtml(t, { isOwn: Boolean(t.isOwnLocalPost) });
  if (t?.video) return renderVideoHero(t.video, overlayHeaderHtml, overlayFooterHtml);
  if (t?.audio) return renderAudioHero(t.audio, overlayHeaderHtml, overlayFooterHtml);
  if (t?.image) return renderImageHero(t, layer, overlayHeaderHtml, overlayFooterHtml);
  if (t?.mediaRef?.hash) return renderLazyMediaHero(t, layer, overlayHeaderHtml, overlayFooterHtml);
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
  const bodyPart = disp.body ? String(disp.body) : "";
  const fullText = disp.title ? `${disp.title}\n\n${bodyPart}`.trim() : bodyPart;
  return `<div class="post-body post-body-md">${renderPostBodyMarkdown(fullText)}</div>`;
}

function renderPostText(t) {
  return renderPostTextHtml(t);
}

function renderFramePollContent(state) {
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

function renderFramePetitionContent(state) {
  const msg = state.hasSigned
    ? '<p class="frame-signed-msg">✓ Você assinou este abaixo-assinado.</p>'
    : '<p class="frame-prompt">Adicione sua assinatura com 1 clique (identidade criptográfica local):</p>';
  return `
    <div class="frame-petition-box">
      <div class="frame-petition-metric"><strong>${state.signaturesCount}</strong> assinaturas (meta: ${state.goal}) · ${state.percent}%</div>
      <div class="frame-petition-bar"><div class="frame-petition-bar-fill" style="width:${state.percent}%"></div></div>
      ${msg}
    </div>`;
}

function renderFrameCltContent(state) {
  return `
    <div class="frame-clt-box">
      <h4 class="frame-clt-title">${escapeHtml(state.title)}</h4>
      ${state.result ? `<div class="frame-clt-result">${escapeHtml(state.result)}</div>` : ""}
      <p class="frame-clt-detail">${escapeHtml(state.detail)}</p>
    </div>`;
}

export function renderFrameContentHtml(frame, state) {
  if (!state) return "";
  if (state.kind === "poll") return renderFramePollContent(state);
  if (state.kind === "petition") return renderFramePetitionContent(state);
  if (state.kind === "clt") return renderFrameCltContent(state);
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
    ? `<span class="overlay-action-count count-replies">${n > 0 ? n : ""}</span>`
    : `<span class="action-count count-replies">${n > 0 ? n : ""}</span>`;
  return `<button type="button" class="action-btn btn-comment${overlayCls}" data-id="${escapeHtml(t.id)}" data-comm="${escapeHtml(t.communityId || "")}" aria-expanded="false" aria-controls="${escapeHtml(panelId)}" aria-label="Comentar${n > 0 ? `, ${n} comentários` : ""}">
            <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
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
      ${renderReportMenuItem(t.id, author, t.communityId || "")}
    </div>
  </details>`;
}

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

function renderToolbarPrimary(t, liked, baseLikes, likes, authorDisplay) {
  const quoteBtn = t.isExternal ? `
    <button class="action-btn btn-quote-external" data-id="${escapeHtml(t.id)}" data-title="${escapeHtml(t.title)}" data-author="${escapeHtml(authorDisplay || "")}" data-handle="${escapeHtml(t.authorHandle || "")}" data-body="${escapeHtml((t.body || t.title || "").slice(0, 280))}" data-url="${escapeHtml(t.externalUrl || "")}" aria-label="Citar e debater no Vox" title="💬 Citar e debater no Vox">
      <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <span class="action-count">Citar</span>
    </button>` : "";

  return `
    <div class="toolbar-primary">
      <button class="action-btn btn-like ${liked ? "active" : ""}" data-id="${escapeHtml(t.id)}" data-count="${baseLikes}" aria-label="Curtir post">
        <svg class="action-icon icon-heart" width="16" height="16" viewBox="0 0 24 24" fill="${liked ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
        <span class="action-count count-likes">${likes > 0 ? likes : ""}</span>
      </button>
      ${renderCommentButton(t)}
      ${renderRepostBtn(t, { size: 16 })}
      ${renderToolbarShareBtn(t, authorDisplay)}
      ${quoteBtn}
    </div>`;
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
      ${renderToolbarPrimary(t, liked, baseLikes, likes, authorDisplay)}
      <div class="toolbar-secondary">
        ${renderToolbarOverflow(t, author, authorDisplay, authorHandle, baseStars, starred, stars)}
        <button class="action-btn btn-save ${saved ? "active" : ""}" data-id="${escapeHtml(t.id)}" aria-label="Salvar post">
          <svg class="action-icon icon-bookmark" width="16" height="16" viewBox="0 0 24 24" fill="${saved ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
        </button>
      </div>
    </div>`;
}

function renderPostPinnedRibbon(t, isPinned) {
  const isPostPinned = Boolean(isPinned || t.isPinned);
  if (!isPostPinned) return "";
  const dismissBtn = t.id === "vox-official-manifesto-welcome" || t.isDismissable
    ? '<button type="button" class="btn-dismiss-welcome-topic" title="Dispensar este post" aria-label="Dispensar post de boas-vindas" style="margin-left:auto; background:none; border:none; color:inherit; cursor:pointer; font-size:0.9rem; padding:0 4px; opacity:0.8;">✕</button>'
    : "";
  return `<div class="post-pinned-ribbon"><span class="pin-icon">📌</span> <span>${t.isOfficial ? "Bem-vindo ao Vox" : "Publicação Fixada"}</span>${dismissBtn}</div>`;
}

function renderPhotoPostItem(t, author, labels) {
  const igHead = renderPostMediaHeader(t, author, labels);
  const igBar = renderIgToolbar(t, labels.authorDisplay);
  const media = renderPostMediaHero(t, "", "");
  const preface = renderPhotoHiddenMessageHtml(t);
  const textHtml = renderPostText(t);
  const captionHtml = textHtml ? `<div class="post-photo-caption post-photo-message"><strong class="post-photo-caption-author">${escapeHtml(labels.authorDisplay)}</strong> ${textHtml}${renderRepostCiteHtml(t)}</div>` : "";
  const comments = renderPostComments(t.id, t.communityId, { prefaceHtml: preface });

  return `
    <article class="post insta-post post-layout-photo post-photo-bleed" data-id="${escapeHtml(t.id)}" data-layout="photo"${t.isOwnLocalPost ? ' data-is-own="true"' : ""}>
      ${igHead}
      ${media}
      ${igBar}
      ${captionHtml}
      ${renderPostFrame(t)}
      ${renderCivicBlock(t)}
      ${renderCivicPendingNote(t)}
      ${comments}
    </article>`;
}

function renderTextOrGithubPostItem(t, author, labels, layout, isPinned) {
  const isPostPinned = Boolean(isPinned || t.isPinned);
  const pinnedRibbon = renderPostPinnedRibbon(t, isPinned);
  const header = renderPostHeaderBlock(t, author, labels, { photoOverlay: false });
  const caption = `<div class="post-caption-block">${renderPostText(t)}${renderRepostCiteHtml(t)}</div>`;
  const gist = layout === "github" ? renderPostGithubGist(t) : "";
  const toolbar = renderPostToolbar(t, author, labels.authorDisplay, labels.authorHandle);
  const comments = renderPostComments(t.id, t.communityId);

  return `
    <article class="post insta-post post-layout-${layout}${isPostPinned ? " post-pinned-highlight" : ""}" data-id="${escapeHtml(t.id)}" data-layout="${layout}">
      ${pinnedRibbon}
      ${header}
      ${caption}
      ${gist}
      ${renderPostFrame(t)}
      ${renderCivicBlock(t)}
      ${renderCivicPendingNote(t)}
      ${toolbar}
      ${comments}
    </article>`;
}

export function renderPostItem(t, opts = {}) {
  if (gossipRetract.shouldHideGossipDeletedPost(t)) return "";
  const author = t.author || t.owner || "";
  const labels = resolvePostAuthorLabels(author, {
    authorDisplay: t.authorDisplay,
    authorHandle: t.authorHandle,
    isOwnLocalPost: t.isOwnLocalPost,
  });
  const layout = getPostFeedLayout(t);
  if (layout === "photo") {
    return renderPhotoPostItem(t, author, labels);
  }
  return renderTextOrGithubPostItem(t, author, labels, layout, opts.isPinned);
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

const FEED_TAB_ICONS = {
  social: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/></svg>`,
  vox: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18"/><path d="M5 21V10M9 21V10M15 21V10M19 21V10"/><path d="M2 10 12 3l10 7Z"/></svg>`,
  external: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>`,
  all: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`,
  following: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/></svg>`,
};

export function renderFeedTabsBar(activeFeed = "for-you") {
  const tabs = [
    { key: "for-you", href: "#/", icon: FEED_TAB_ICONS.social, label: "Social" },
    { key: "civic", href: "#/?feed=civic", icon: FEED_TAB_ICONS.vox, label: "Cívico" },
    { key: "external", href: "#/?feed=external", icon: FEED_TAB_ICONS.external, label: "Redes (Bluesky)" },
    { key: "all", href: "#/?feed=all", icon: FEED_TAB_ICONS.all, label: "Tudo" },
    { key: "following", href: "#/?feed=following", icon: FEED_TAB_ICONS.following, label: "Seguindo" },
  ];
  const items = tabs
    .map((t) => {
      const active = activeFeed === t.key;
      return `<a href="${t.href}" class="feed-tab-chip ${active ? "active" : ""}" role="tab" aria-selected="${active}">${t.icon}<span>${t.label}</span></a>`;
    })
    .join("\n      ");
  return `
    <div class="feed-tabs-bar" role="tablist" aria-label="Filtro de feeds">
      ${items}
    </div>`;
}

function renderCitizenShieldBarHtml() {
  return `
    <div class="vox-citizen-shield-bar" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; padding:6px 10px; margin-bottom:0.65rem; border-radius:var(--radius-sm); background:rgba(22,163,74,0.1); border:1px solid rgba(22,163,74,0.35); font-size:0.75rem;">
      <span>🛡️ <strong>Escudo Cidadão Vox Ativo:</strong> 0 Rastreadores · 0 Algoritmo de Ódio · 100% Cronológico</span>
      <a href="#/settings/linked-accounts" style="font-weight:700; color:var(--accent); text-decoration:none;">🔗 Configurar Redes →</a>
    </div>`;
}

function renderBskySuggestionsRow() {
  if (isElectoralModeActive()) {
    return '<p class="meta bsky-suggestions-row" role="note">Período eleitoral: o Vox não sugere perfis nem ranqueia conteúdo político (Res. TSE 23.755/2026).</p>';
  }
  return `
    <div class="bsky-suggestions-row">
      <span class="bsky-sugg-label">Sugestões cívicas:</span>
      <button type="button" class="btn-add-suggestion" data-handle="lula.com.br">+ @lula.com.br</button>
      <button type="button" class="btn-add-suggestion" data-handle="brasildefato.com.br">+ @brasildefato.com.br</button>
      <button type="button" class="btn-add-suggestion" data-handle="theintercept.com">+ @theintercept.com</button>
      <button type="button" class="btn-add-suggestion" data-handle="apublica.org">+ @apublica.org</button>
      <button type="button" class="btn-add-suggestion" data-handle="cartacapital.com.br">+ @cartacapital.com.br</button>
    </div>`;
}

function renderBskyFormAndImport() {
  return `
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
      ${renderBskySuggestionsRow()}
    </div>`;
}

export function renderExternalFeedManagerHtml(subscriptions = []) {
  const list = Array.isArray(subscriptions) ? subscriptions : [];
  const chips = list
    .map((h) => `<span class="bsky-sub-chip"><span class="bsky-sub-name">@${escapeHtml(h)}</span><button type="button" class="btn-remove-bsky-sub" data-handle="${escapeHtml(h)}" aria-label="Remover @${escapeHtml(h)}" title="Deixar de acompanhar">×</button></span>`)
    .join("");

  return `
    <div class="bsky-feed-manager" role="region" aria-label="Gerenciador de feeds externos">
      ${renderCitizenShieldBarHtml()}
      <div class="bsky-manager-head">
        <span class="bsky-badge">🌐 INGESTÃO PREDATÓRIA · AT PROTOCOL</span>
        <h3 class="bsky-manager-title">Feeds Externos sob Proteção Cívica</h3>
        <p class="bsky-manager-desc">Consuma e interaja (curta, salve, comente, cite e exploda) com perfis externos dentro da soberania do Vox.</p>
      </div>
      ${renderBskyFormAndImport()}
      <div class="bsky-subs-list">
        <span class="bsky-subs-label">Perfis integrados:</span>
        <div class="bsky-subs-chips">${chips || '<span class="meta">Nenhum perfil cadastrado.</span>'}</div>
      </div>
    </div>`;
}

const CIVIC_EMPTY_HTML = `<div class="empty civic-empty">
    <p><strong>Nenhum post cívico ainda.</strong></p>
    <p class="desc">Publique uma pauta, ideia, debate ou enquete com título e argumento — ela aparece aqui para posicionamento assinado.</p>
  </div>`;

function renderFeedEmptyState(activeFeed) {
  if (activeFeed === "civic") return CIVIC_EMPTY_HTML;
  if (activeFeed === "external") {
    return `<div class="empty external-empty">
      <p><strong>Nenhum post externo encontrado.</strong></p>
      <p class="desc" style="max-width:440px; margin:0.4rem auto 0.8rem;">Adicione um perfil do Bluesky acima ou verifique sua conexão com a internet.</p>
    </div>`;
  }
  if (activeFeed === "following") {
    return `<div class="empty following-empty">
      <div style="font-size:2rem; margin-bottom:0.5rem;">👥</div>
      <p><strong>Você ainda não acompanha ninguém.</strong></p>
      <p class="desc" style="max-width:440px; margin:0.4rem auto 0.8rem;">Clique em <strong>👁️ Acompanhar (Watch)</strong> nos perfis de autores para ver as publicações deles reunidas nesta aba.</p>
      <div style="display:flex; gap:0.5rem; justify-content:center; flex-wrap:wrap;">
        <a class="btn btn-primary btn-sm" href="#/">Explorar feed "Para você"</a>
        <a class="btn btn-outline btn-sm" href="#/pessoas">Encontrar pessoas na rede</a>
      </div>
    </div>`;
  }
  return `<div class="empty">
    <div style="font-size:2rem; margin-bottom:0.5rem;">🌱</div>
    <p><strong>Nenhuma publicação no feed ainda.</strong></p>
    <p class="desc" style="max-width:440px; margin:0.4rem auto 0.8rem;">Seja a primeira voz soberana a compartilhar uma ideia, foto Lo-Fi, áudio ou vídeo nesta rede.</p>
    <div style="display:flex; gap:0.5rem; justify-content:center; flex-wrap:wrap;">
      <button type="button" class="btn btn-primary btn-sm" data-click-target="#feed-inline-composer .inline-composer-collapsed">Criar publicação</button>
      <a class="btn btn-outline btn-sm" href="#/pessoas">Encontrar pessoas</a>
    </div>
  </div>`;
}

export function renderFeed(main, topics = [], opts = {}) {
  const activeFeed = opts.activeFeed || "for-you";
  const userRouteId = opts.userRouteId || "";
  const isCivic = activeFeed === "civic";
  const displayName = userRouteId ? profileDirectory.getAuthorDisplaySync(userRouteId) || mock.getAuthorDisplay(userRouteId) : "";
  const tabsBar = renderFeedTabsBar(activeFeed);
  const managerHtml = activeFeed === "external" ? renderExternalFeedManagerHtml(opts.externalSubs) : "";

  let html = `
    <div class="feed-chrome">
      ${isCivic ? "" : renderStoriesStrip()}
      ${tabsBar}
      ${managerHtml}
      ${isCivic ? renderCivicFeedIntro() : `<div class="feed-composer-section">
        ${renderInlineComposer({ userRouteId, displayName })}
      </div>`}
    </div>`;

  if (!topics.length) {
    main.innerHTML += html + renderFeedEmptyState(activeFeed);
    return;
  }

  const visible = gossipRetract.filterFeedTopicsForGossipRetract(topics);
  rememberVisible(visible, userRouteId);
  const items = visible.map((t) => renderPostItem(t)).join("");
  main.innerHTML += `${html}<div class="feed-container">${items}</div>`;
}
