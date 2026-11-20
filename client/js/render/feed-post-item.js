/**
 * @file Cartão de publicação no feed (texto, gist, foto, frames Open Frame).
 *
 * @module render/feed-post-item
 */
import * as hashtags from "../hashtags.js";
import * as frames from "../frames.js";
import * as postOwnership from "../post-ownership.js";
import * as gossipRetract from "../gossip-retract-ui.js";
import { escapeHtml, resolvePostAuthorLabels } from "./util.js";
import { renderPostBodyMarkdown } from "./markdown-body.js";
import { renderIgToolbar } from "./ig-toolbar.js";
import { renderRepostCiteHtml } from "./repost-cite.js";
import { renderPhotoHiddenMessageHtml } from "./photo-chrome.js";
import { renderCivicBlock, renderCivicPendingNote } from "./civic-block.js";
import { renderPostComments } from "./feed-comments.js";
import { renderPostToolbar } from "./feed-post-toolbar.js";
import {
  getPostFeedLayout,
  renderPostMediaHeader,
  renderPostMediaHero,
  renderPostHeaderBlock,
} from "./feed-post-media.js";

/**
 * Corpo textual do post (markdown leve ou legenda única).
 * @param {object} post Publicação com título/corpo.
 * @returns {string} HTML do corpo ou `""` se vazio.
 */
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

/**
 * Conteúdo dinâmico de Open Frame (enquete, abaixo-assinado ou CLT).
 * @param {object} frame Definição do frame parseado.
 * @param {object|null} state Estado calculado para o visitante.
 * @returns {string} HTML interno do frame ou `""`.
 */
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

/**
 * Cartão Open Frame anexado ao post (mini-app assinado localmente).
 * @param {object} t Post com campo `frame`.
 * @returns {string} HTML do `.vox-frame` ou `""` se inválido.
 */
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

/**
 * Cartão completo de publicação no feed (layout foto, texto ou gist GitHub).
 * @param {object} t Post normalizado.
 * @param {object} [opts={}]
 * @param {boolean} [opts.isPinned] Destaca fita de fixado.
 * @returns {string} HTML do `<article class="post">` ou `""` se apagado por gossip.
 */
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