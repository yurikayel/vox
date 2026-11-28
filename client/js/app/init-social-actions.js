/** @file Global delegated event listeners for social feedback and comment interactions. */
import * as share from "../share.js";
import * as render from "../render.js";
import * as social from "../social.js";
import { route } from "./navigation.js";
import { openZapModal } from "./zap-modal.js";
import {
  togglePostComments,
  toggleCommentReplyComposer,
  onInlineReplySubmit,
  onNestedCommentReplySubmit,
} from "./screens-compose.js";
import { handleRepostClick } from "./repost-ui.js";
import { runButtonAction } from "./action-runner.js";
import { openPostEditModal, handleDeletePost } from "./init-post-mutation.js";
import { handleFrameActionClick } from "./init-frame-actions.js";

/**
 * Há modal aberto (o do Pix não move o foco: ele continua no menu atrás do overlay). Os diálogos fixos do shell (a
 * visualização de imagem e a gaveta de identidade) ficam no DOM com `hidden` e não contam.
 */
function isModalOpen() {
  return Boolean(document.querySelector('[aria-modal="true"]:not([hidden]), .modal-overlay:not([hidden])'));
}

/**
 * Esc fecha o menu ⋯ (`<details class="toolbar-overflow">`) em que está o foco e devolve o foco ao `<summary>`.
 * Não age se outro ouvinte já tratou o Esc ou se há modal aberto: o Esc é do modal, não da página atrás dele.
 *
 * @param {KeyboardEvent} e
 */
export function closeOverflowMenuOnEscape(e) {
  if (e.key !== "Escape" || e.defaultPrevented || isModalOpen()) return;
  const menu = e.target?.closest?.("details.toolbar-overflow[open]");
  if (!menu) return;
  menu.removeAttribute("open");
  menu.querySelector("summary")?.focus();
  e.preventDefault();
}

/**
 * Alterna a reação a um comentário e atualiza o botão.
 *
 * @param {HTMLElement} btn
 */
function handleCommentReactClick(btn) {
  const commentId = btn.dataset.id;
  const baseCount = btn.dataset.count || 0;
  const res = social.toggleCommentReact(commentId, baseCount);
  btn.classList.toggle("active", res.reacted);
  btn.setAttribute("aria-pressed", res.reacted ? "true" : "false");
  const countEl = btn.querySelector(".count-comment-reacts");
  if (countEl) {
    if (res.count > 0) {
      countEl.textContent = String(res.count);
      countEl.hidden = false;
    } else {
      countEl.textContent = "";
      countEl.hidden = true;
    }
  }
}

/**
 * Abre ou fecha o campo de resposta de um comentário (só um aberto por vez).
 *
 * @param {HTMLElement} btn
 */
function handleCommentReplyClick(btn) {
  const item = btn.closest(".post-comment-item");
  const form = item?.querySelector(".post-comment-nested-reply");
  const opening = form?.hidden !== false;
  document.querySelectorAll(".post-comment-nested-reply:not([hidden])").forEach((f) => {
    if (f !== form) toggleCommentReplyComposer(f.closest(".post-comment-item"), false);
  });
  toggleCommentReplyComposer(item, opening);
}

/**
 * Marca o botão de alternância como ligado ou desligado: `aria-checked` no item de menu, `aria-pressed` nos demais.
 *
 * @param {HTMLElement} btn
 * @param {boolean} on
 */
function setToggleState(btn, on) {
  const attr = btn.getAttribute("role") === "menuitemcheckbox" ? "aria-checked" : "aria-pressed";
  btn.setAttribute(attr, on ? "true" : "false");
}

/**
 * Alterna a curtida do post e atualiza o botão.
 *
 * @param {HTMLElement} btn
 */
function handleLikeClick(btn) {
  const postId = btn.dataset.id;
  const baseCount = btn.dataset.count || 0;
  const res = social.toggleLike(postId, baseCount);
  btn.classList.toggle("active", res.liked);
  setToggleState(btn, res.liked);
  const icon = btn.querySelector(".icon-heart");
  if (icon) icon.setAttribute("fill", res.liked ? "currentColor" : "none");
  const countLabel = btn.querySelector(".count-likes");
  if (countLabel) countLabel.textContent = res.count > 0 ? res.count : "";
}

/**
 * Alterna a estrela do post e atualiza o botão.
 *
 * @param {HTMLElement} btn
 */
function handleStarClick(btn) {
  const postId = btn.dataset.id;
  const baseCount = btn.dataset.count || 0;
  const res = social.toggleStar(postId, baseCount);
  btn.classList.toggle("active", res.starred);
  setToggleState(btn, res.starred);
  const icon = btn.querySelector(".icon-star");
  if (icon) icon.setAttribute("fill", res.starred ? "currentColor" : "none");
  const countLabel = btn.querySelector(".count-stars");
  if (countLabel) countLabel.textContent = res.count > 0 ? res.count : "";
  share.showToast(res.starred ? "Estrela adicionada ⭐ (nos seus Estrelados)!" : "Estrela removida.");
}

/**
 * Alterna o item salvo do post e atualiza o botão.
 *
 * @param {HTMLElement} btn
 */
function handleSaveClick(btn) {
  const postId = btn.dataset.id;
  const saved = social.toggleSave(postId);
  btn.classList.toggle("active", saved);
  setToggleState(btn, saved);
  const icon = btn.querySelector(".icon-bookmark");
  if (icon) icon.setAttribute("fill", saved ? "currentColor" : "none");
  share.showToast(saved ? "Post salvo nos seus favoritos!" : "Post removido dos favoritos.");
}

/**
 * Copia o post em Markdown para a área de transferência.
 *
 * @param {HTMLElement} btn
 */
function handleCopyMdClick(btn) {
  const mdText = render.formatPostMarkdown({
    id: btn.dataset.id,
    title: btn.dataset.title || "",
    body: btn.dataset.body || "",
    authorDisplay: btn.dataset.author || "",
    authorHandle: btn.dataset.handle || "",
  });
  if (navigator.clipboard) {
    navigator.clipboard.writeText(mdText).then(() => {
      share.showToast("Post copiado em Markdown! 📋");
    }).catch(() => {
      share.showToast("Erro ao copiar.", "error");
    });
  }
}

/**
 * Alterna o acompanhamento de uma pessoa e atualiza o botão.
 *
 * @param {HTMLElement} btn
 */
function handleWatchClick(btn) {
  const routeId = btn.dataset.route;
  const watching = social.toggleWatch(routeId);
  if (btn.classList.contains("btn-overlay-follow")) {
    btn.textContent = watching ? "Seguindo" : "Seguir";
    btn.setAttribute("aria-pressed", watching ? "true" : "false");
    btn.setAttribute("aria-label", watching ? "Deixar de seguir autor" : "Seguir autor");
    btn.classList.toggle("is-following", watching);
  } else {
    btn.classList.toggle("btn-primary", !watching);
    btn.classList.toggle("btn-outline", watching);
    btn.textContent = watching ? "✓ Acompanhando" : "👁️ Acompanhar (Watch)";
  }
  share.showToast(watching ? "Agora você acompanha este autor no feed Seguindo!" : "Deixou de acompanhar este autor.");
}

/**
 * Despacha cliques das ações do post (editar, excluir e afins).
 *
 * @param {Event} e Clique delegado.
 * @returns {boolean}
 */
function dispatchPostActionClicks(e) {
  const btnEdit = e.target.closest(".btn-post-edit");
  if (btnEdit) { e.preventDefault(); openPostEditModal(btnEdit.dataset.id); return true; }

  const btnDel = e.target.closest(".btn-post-delete");
  if (btnDel) { e.preventDefault(); handleDeletePost(btnDel.dataset.id); return true; }

  const btnFrame = e.target.closest(".btn-frame-action:not([disabled])");
  if (btnFrame) { e.preventDefault(); handleFrameActionClick(btnFrame); return true; }

  const btnComment = e.target.closest(".btn-comment");
  if (btnComment) { e.preventDefault(); togglePostComments(btnComment); return true; }

  const btnCommentReact = e.target.closest(".btn-comment-react");
  if (btnCommentReact) { e.preventDefault(); handleCommentReactClick(btnCommentReact); return true; }

  const btnCancel = e.target.closest(".btn-comment-reply-cancel");
  if (btnCancel) {
    e.preventDefault();
    toggleCommentReplyComposer(btnCancel.closest(".post-comment-item"), false);
    return true;
  }

  const btnReply = e.target.closest(".btn-comment-reply");
  if (btnReply) { e.preventDefault(); handleCommentReplyClick(btnReply); return true; }

  return false;
}

/**
 * Despacha cliques de reação e apoio (zap, curtida e afins).
 *
 * @param {Event} e Clique delegado.
 * @returns {boolean}
 */
function dispatchSocialFeedbackClicks(e) {
  const btnZap = e.target.closest(".btn-zap-post:not(.disabled), .btn-zap-profile");
  if (btnZap) {
    e.preventDefault();
    openZapModal({ pixKey: btnZap.dataset.pix, authorName: btnZap.dataset.authorName || "Autor", title: btnZap.dataset.title || "" });
    return true;
  }

  const btnRepost = e.target.closest(".btn-repost");
  if (btnRepost) {
    e.preventDefault();
    void runButtonAction(btnRepost, async () => {
      const res = await handleRepostClick(btnRepost);
      if (res?.ok) void route();
    });
    return true;
  }

  const btnLike = e.target.closest(".btn-like");
  if (btnLike) { e.preventDefault(); handleLikeClick(btnLike); return true; }

  const btnStar = e.target.closest(".btn-star");
  if (btnStar) { e.preventDefault(); handleStarClick(btnStar); return true; }

  const btnSave = e.target.closest(".btn-save");
  if (btnSave) { e.preventDefault(); handleSaveClick(btnSave); return true; }

  const btnCopyMd = e.target.closest(".btn-copy-md");
  if (btnCopyMd) { e.preventDefault(); handleCopyMdClick(btnCopyMd); return true; }

  const btnWatch = e.target.closest(".btn-watch-profile");
  if (btnWatch) { e.preventDefault(); handleWatchClick(btnWatch); return true; }

  return false;
}

/**
 * Liga cliques sociais globais (curtir, compartilhar, comentários inline, etc.).
 *
 * @returns {void}
 */
export function initSocialInteractions() {
  document.addEventListener("click", (e) => {
    if (dispatchPostActionClicks(e)) return;
    dispatchSocialFeedbackClicks(e);
  });

  document.addEventListener("keydown", closeOverflowMenuOnEscape);

  document.addEventListener("submit", (e) => {
    const nestedForm = e.target.closest(".post-comment-nested-reply");
    if (nestedForm) {
      e.preventDefault();
      onNestedCommentReplySubmit(nestedForm);
      return;
    }
    const form = e.target.closest(".post-comment-composer");
    if (form) {
      e.preventDefault();
      onInlineReplySubmit(form);
    }
  });
}
