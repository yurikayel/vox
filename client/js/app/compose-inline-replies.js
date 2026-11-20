/**
 * @file Painéis e envios de comentários inline e respostas aninhadas nos cartões do feed.
 *
 * @module app/compose-inline-replies
 */

import * as render from "../render.js";
import * as mock from "../mock.js";
import * as share from "../share.js";
import * as cacheNode from "../cache-node.js";
import * as localAccount from "../identity/index.js";
import { persistLocalReply } from "./compose-reply.js";

function commentListContext(panel) {
  return {
    topicId: panel?.dataset.topic || "",
    commId: panel?.dataset.comm || "",
  };
}

/**
 * Carrega respostas inline de um post (cache local P2P + mock deduplicado).
 *
 * @param {string} topicId ID do tópico.
 * @returns {Promise<object[]>} Lista consolidada de respostas.
 */
export async function loadInlineReplies(topicId) {
  let local = [];
  try {
    local = await cacheNode.getLocalPosts({ type: "reply", replyTo: topicId });
  } catch {
    local = [];
  }
  const myId = localAccount.getCachedRouteIdSync();
  const myName = localAccount.getDisplayName() || localAccount.getProfileEnrichment()?.displayName || "";
  const seen = new Set();
  const out = [];
  for (const r of local) {
    seen.add(r.id);
    const isOwn = Boolean(myId && r.author === myId);
    out.push({
      ...r,
      isLocalP2p: true,
      isOwnLocalPost: isOwn,
      authorDisplay: r.authorDisplay || (isOwn ? myName : ""),
    });
  }
  for (const r of mock.mockReplies(topicId).items) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

/**
 * Abre ou fecha painel de comentários de um post.
 *
 * @param {HTMLElement} btn Botão acionador.
 * @param {HTMLElement} panel Painel de comentários.
 * @param {boolean} open Estado desejado.
 * @returns {void}
 */
export function setCommentOpen(btn, panel, open) {
  panel.hidden = !open;
  panel.classList.toggle("is-open", open);
  btn.setAttribute("aria-expanded", open ? "true" : "false");
  btn.classList.toggle("active", open);
}

/**
 * Fecha outros painéis de comentário abertos na página.
 *
 * @param {HTMLElement} keep Painel que deve permanecer aberto.
 * @returns {void}
 */
export function closeOtherCommentPanels(keep) {
  document.querySelectorAll(".post-comments.is-open").forEach((panel) => {
    if (panel === keep) return;
    const article = panel.closest("article");
    const otherBtn = article?.querySelector(".btn-comment");
    if (otherBtn) setCommentOpen(otherBtn, panel, false);
  });
}

/**
 * Preenche feed de comentários no painel.
 *
 * @param {HTMLElement} panel Painel de comentários.
 * @param {object[]} replies Respostas a renderizar.
 * @returns {void}
 */
export function fillCommentFeed(panel, replies) {
  const slot = panel.querySelector(".post-comments-feed");
  if (slot) {
    slot.outerHTML = render.renderCommentList(replies, {
      topicId: panel.dataset.topic || "",
      commId: panel.dataset.comm || "",
    });
  }
  panel.dataset.loaded = "1";
}

/**
 * Alterna painel de comentários e carrega respostas sob demanda.
 *
 * @param {HTMLElement} btn Botão de comentários do artigo.
 * @returns {Promise<void>}
 */
export async function togglePostComments(btn) {
  const article = btn.closest("article");
  const panel = article?.querySelector(".post-comments");
  if (!panel) return;
  const opening = panel.hasAttribute("hidden");
  if (!opening) {
    setCommentOpen(btn, panel, false);
    return;
  }
  closeOtherCommentPanels(panel);
  setCommentOpen(btn, panel, true);
  if (panel.dataset.loaded === "1") {
    panel.querySelector(".post-comment-input")?.focus();
    return;
  }
  const slot = panel.querySelector(".post-comments-feed");
  if (slot) slot.innerHTML = `<p class="post-comments-empty">Carregando respostas…</p>`;
  const replies = await loadInlineReplies(panel.dataset.topic);
  fillCommentFeed(panel, replies);
  const countEls = article.querySelectorAll(".count-replies");
  for (const el of countEls) {
    el.textContent = replies.length > 0 ? String(replies.length) : "";
  }
  panel.querySelector(".post-comment-input")?.focus();
}

/**
 * Insere resposta inline no DOM do painel de comentários.
 *
 * @param {HTMLElement} panel Painel de comentários.
 * @param {object} reply Resposta a inserir.
 * @returns {void}
 */
export function appendInlineReply(panel, reply) {
  const parentId = reply.parentId || "";
  if (parentId) {
    appendNestedInlineReply(panel, parentId, reply);
    return;
  }
  let list = panel?.querySelector(".post-comment-list");
  if (!list) {
    const feed = panel?.querySelector(".post-comments-feed");
    if (feed) feed.innerHTML = `<ul class="post-comment-list"></ul>`;
    list = panel?.querySelector(".post-comment-list");
  }
  panel?.querySelector(".post-comments-empty")?.remove();
  if (list) {
    list.insertAdjacentHTML(
      "beforeend",
      render.renderInlineReplyItem(reply, commentListContext(panel)),
    );
  }
}

/**
 * Insere resposta aninhada sob o comentário pai no DOM.
 *
 * @param {HTMLElement} panel Painel de comentários.
 * @param {string} parentId ID do comentário pai.
 * @param {object} reply Resposta aninhada a inserir.
 * @returns {void}
 */
export function appendNestedInlineReply(panel, parentId, reply) {
  const parentItem = panel?.querySelector(`[data-comment-id="${parentId}"]`);
  if (!parentItem) {
    appendInlineReply(panel, { ...reply, parentId: "" });
    return;
  }
  let nested = parentItem.querySelector(":scope > .post-comment-body > .post-comment-nested-list");
  if (!nested) {
    parentItem
      .querySelector(".post-comment-body")
      ?.insertAdjacentHTML("beforeend", `<ul class="post-comment-nested-list"></ul>`);
    nested = parentItem.querySelector(":scope > .post-comment-body > .post-comment-nested-list");
  }
  if (nested) {
    nested.insertAdjacentHTML(
      "beforeend",
      render.renderInlineReplyItem(reply, commentListContext(panel)),
    );
  }
}

/**
 * Alterna compositor de resposta aninhada de um comentário.
 *
 * @param {HTMLElement} item Item de comentário pai.
 * @param {boolean} open Estado desejado.
 * @returns {void}
 */
export function toggleCommentReplyComposer(item, open) {
  const form = item?.querySelector(".post-comment-nested-reply");
  if (!form) return;
  form.hidden = !open;
  if (open) {
    const ta = form.querySelector("textarea");
    ta?.focus();
    if (ta && typeof ta.setSelectionRange === "function") {
      const len = ta.value.length;
      ta.setSelectionRange(len, len);
    }
  }
}

function updateFormAfterReplySent(form, signed) {
  const myName = localAccount.getDisplayName() || localAccount.getProfileEnrichment()?.displayName || "";
  appendInlineReply(form.closest(".post-comments"), {
    ...signed,
    isOwnLocalPost: true,
    authorDisplay: signed.authorDisplay || myName,
  });
  bumpReplyCount(form.closest("article"));
  form.reset();
  toggleCommentReplyComposer(form.closest(".post-comment-item"), false);
  const panel = form.closest(".post-comments");
  if (panel) panel.dataset.loaded = "1";
}

/**
 * Envia resposta aninhada inline a partir do formulário do comentário.
 *
 * @param {HTMLFormElement} form Formulário de resposta aninhada.
 * @returns {Promise<void>}
 */
export async function onNestedCommentReplySubmit(form) {
  const body = form.querySelector(".post-comment-nested-input")?.value.trim();
  if (!body) return;
  const btn = form.querySelector(".btn-comment-nested-send");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Enviando…";
  }
  try {
    const signed = await persistLocalReply(form.dataset.topic, form.dataset.comm || "", body, {
      parentId: form.dataset.parent || "",
    });
    updateFormAfterReplySent(form, signed);
    share.showToast("Resposta enviada!");
  } catch (err) {
    share.showToast(`Erro: ${err.message}`, "error");
  }
  if (btn) {
    btn.disabled = false;
    btn.textContent = "Enviar";
  }
}

/**
 * Atualiza contador de respostas na UI do artigo.
 *
 * @param {HTMLElement} article Elemento `<article>` do post.
 * @returns {void}
 */
export function bumpReplyCount(article) {
  if (!article) return;
  const countEls = article.querySelectorAll(".count-replies");
  for (const el of countEls) {
    const next = (Number(el.textContent) || 0) + 1;
    el.textContent = String(next);
  }
  const btns = article.querySelectorAll(".btn-comment");
  for (const btn of btns) {
    const n = Number(btn.querySelector(".count-replies")?.textContent) || 0;
    btn.setAttribute("aria-label", `Comentar${n > 0 ? `, ${n} comentários` : ""}`);
  }
}

/**
 * Envia resposta inline no feed.
 *
 * @param {HTMLFormElement} form Formulário de resposta inline.
 * @returns {Promise<void>}
 */
export async function onInlineReplySubmit(form) {
  const body = form.querySelector(".post-comment-input")?.value.trim();
  if (!body) return;
  const btn = form.querySelector(".btn-inline-reply");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Enviando…";
  }
  try {
    const signed = await persistLocalReply(form.dataset.topic, form.dataset.comm || "", body);
    const myName = localAccount.getDisplayName() || localAccount.getProfileEnrichment()?.displayName || "";
    appendInlineReply(form.closest(".post-comments"), {
      ...signed,
      isOwnLocalPost: true,
      authorDisplay: signed.authorDisplay || myName,
    });
    bumpReplyCount(form.closest("article"));
    form.reset();
    const panel = form.closest(".post-comments");
    if (panel) panel.dataset.loaded = "1";
    share.showToast("Resposta enviada!");
  } catch (err) {
    share.showToast(`Erro: ${err.message}`, "error");
  }
  if (btn) {
    btn.disabled = false;
    btn.textContent = "Responder";
  }
}
