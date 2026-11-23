/**
 * @file Comentários inline no feed e formatação Markdown para compartilhamento.
 *
 * @module render/feed-comments
 */
import * as social from "../social.js";
import * as hashtags from "../hashtags.js";
import { escapeHtml, resolvePostAuthorLabels, renderAvatarHtml } from "./util.js";
import { groupRepliesForThread } from "../reply-thread.js";

/**
 * Copia o post como citação Markdown para compartilhar fora do Vox.
 * @param {object|null} post Publicação com `id`, título, corpo e autor.
 * @returns {string} Bloco Markdown ou `""` se `post` for nulo.
 */
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

/**
 * ID estável do painel de comentários para `aria-controls`.
 * @param {string} topicId ID do tópico.
 * @returns {string} Identificador DOM sanitizado.
 */
export function commentsPanelId(topicId) {
  return `post-comments-${String(topicId || "").replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

/**
 * Formulário oculto de resposta aninhada a um comentário.
 * @param {string} parentId ID do comentário pai.
 * @param {string} topicId Tópico raiz.
 * @param {string} commId Comunidade (pode ser vazia no feed global).
 * @param {string} [mentionHandle=""] @handle pré-preenchido.
 * @returns {string} HTML do `<form class="post-comment-nested-reply">`.
 */
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

/**
 * Botão de reação do comentário com a contagem atual.
 *
 * @param {object} r
 * @returns {string}
 */
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

/**
 * Lista aninhada de respostas filhas.
 *
 * @param {object[]} children
 * @param {object} byParent
 * @param {string} topicId
 * @param {string} commId
 * @returns {string}
 */
function renderReplyNestedList(children, byParent, topicId, commId) {
  if (!children || !children.length) return "";
  const items = children.map((c) => renderInlineReplyItem(c, { byParent, topicId, commId })).join("");
  return `<ul class="post-comment-nested-list">${items}</ul>`;
}

/**
 * Uma resposta na lista inline (com reações, aninhamento e composer filho).
 * @param {object} r Comentário ou reply.
 * @param {object} [options={}]
 * @param {object|null} [options.byParent=null] Mapa `parentId → filhos` para threads.
 * @param {string} [options.topicId=""] Tópico para links e composer.
 * @param {string} [options.commId=""] Comunidade do tópico.
 * @returns {string} HTML de `<li class="post-comment-item">`.
 */
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

/**
 * Lista de comentários agrupados em thread.
 * @param {object[]} [replies=[]] Respostas brutas.
 * @param {object} [options={}]
 * @param {string} [options.topicId=""] ID do tópico.
 * @param {string} [options.commId=""] ID da comunidade.
 * @returns {string} HTML da área `.post-comments-feed`.
 */
export function renderCommentList(replies = [], { topicId = "", commId = "" } = {}) {
  if (!replies.length) {
    return `<div class="post-comments-feed"><p class="post-comments-empty">Nenhuma resposta ainda.</p></div>`;
  }
  const { tops, byParent } = groupRepliesForThread(replies);
  const items = tops.map((r) => renderInlineReplyItem(r, { byParent, topicId, commId }));
  return `<div class="post-comments-feed"><ul class="post-comment-list">${items.join("")}</ul></div>`;
}

/**
 * Formulário de resposta inline do comentário.
 *
 * @param {string} topicId
 * @param {string} commId
 * @returns {string}
 */
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

/**
 * Painel de comentários do cartão (fora do hero de mídia, nunca sobre a foto).
 * @param {string} topicId ID do tópico.
 * @param {string} [commId=""] Comunidade associada.
 * @param {object} [options={}]
 * @param {object[]} [options.replies=[]] Respostas a listar.
 * @param {boolean} [options.expanded=false] Se o painel abre expandido.
 * @param {string} [options.prefaceHtml=""] Aviso antes da lista (ex.: foto oculta).
 * @returns {string} HTML do container `.post-comments`.
 */
export function renderPostComments(topicId, commId = "", { replies = [], expanded = false, prefaceHtml = "" } = {}) {
  const panelId = commentsPanelId(topicId);
  const openCls = expanded ? " is-open" : "";
  const hid = expanded ? "" : " hidden";
  return `<div class="post-comments post-comments-surface${openCls}" id="${escapeHtml(panelId)}"${hid} data-topic="${escapeHtml(topicId)}" data-comm="${escapeHtml(commId)}">${prefaceHtml}${renderCommentList(replies, { topicId, commId })}${renderInlineReplyComposer(topicId, commId)}</div>`;
}