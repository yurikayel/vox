/** @file App initialization, social interactions, and gossip routing. */
import * as share from "../share.js";
import * as mock from "../mock.js";
import * as render from "../render.js";
import * as cacheNode from "../cache-node.js";
import * as social from "../social.js";
import * as postOwnership from "../post-ownership.js";
import * as frames from "../open-frames-host.js";
import { i18n } from "../i18n-pt-br.js";
import { parseRoute, route } from "./route.js";
import { getActiveUser } from "./context.js";
import { openZapModal } from "./zap-modal.js";
import * as peers from "../peers.js";
import * as localAccount from "../local-account.js";
import {
  showHome,
  showTagFeed,
  togglePostComments,
  toggleCommentReplyComposer,
  onInlineReplySubmit,
  onNestedCommentReplySubmit,
} from "./screens-home.js";
import {
  showCommunity,
  showTopic,
  showProposal,
} from "./screens-community.js";
import {
  bumpReplyCount,
  appendInlineReply,
} from "./screens-compose.js";
import { handleRepostClick } from "./repost-ui.js";

function handleGossipReply(item, cur) {
  const topicArticle = document.querySelector(`article[data-id="${item.replyTo}"]`);
  if (topicArticle) {
    bumpReplyCount(topicArticle);
    const panel = topicArticle.querySelector(".post-comments");
    if (panel && !panel.hidden) {
      appendInlineReply(panel, item);
    }
  }
  if (cur.name === "topic" && (cur.id === item.id || cur.id === item.replyTo)) {
    showTopic(cur.id, cur.communityId);
  }
  share.showToast(`Nova resposta na publicação: ${(item.body || "").slice(0, 24)}…`);
}

function refreshRouteForGossip(cur, item) {
  if (cur.name === "home") {
    showHome(cur.feed);
  } else if (cur.name === "community" && cur.id === item.communityId) {
    showCommunity(cur.id, cur.tab);
  } else if (cur.name === "proposal" && (cur.proposalId === item.proposalId || cur.proposalId === item.id)) {
    showProposal(cur.communityId, cur.proposalId);
  } else if (cur.name === "topic" && (cur.id === item.id || cur.id === item.replyTo)) {
    showTopic(cur.id, cur.communityId);
  } else if (cur.name === "tag-feed" && cur.slug) {
    showTagFeed(cur.slug);
  }
}

const GOSSIP_TOAST_MAP = {
  listing: (item) => `Nova oferta na feira: ${item.title?.slice(0, 24) || "..."}`,
  "governance-proposal": (item) => `Nova proposta de governança: ${item.title?.slice(0, 24) || "..."}`,
  "governance-vote": () => "Novo voto registrado na proposta!",
  "frame-action": () => "Nova interação no mini-app do post!",
};

function showGossipToast(item) {
  if (!item?.type) return;
  if (item.type === "topic") {
    const isUpdate = Boolean(item.editedAt && item.editedAt > 0);
    share.showToast(isUpdate ? "Publicação atualizada na rede." : `Novo post na rede: ${item.title?.slice(0, 24) || "..."}`);
    return;
  }
  const msgFn = GOSSIP_TOAST_MAP[item.type];
  if (msgFn) share.showToast(msgFn(item));
}

function handleGossipTombstone(tombstone, cur) {
  if (cur.name === "home") {
    showHome(cur.feed);
  } else if (cur.name === "community") {
    showCommunity(cur.id, cur.tab);
  } else if (cur.name === "topic" && cur.id === tombstone.id) {
    location.hash = "#/";
  } else if (cur.name === "tag-feed" && cur.slug) {
    showTagFeed(cur.slug);
  }
}

export function initGossipListeners() {
  peers.onGossipPost((item) => {
    const cur = parseRoute();
    if (item?.type === "reply" && item.replyTo) {
      handleGossipReply(item, cur);
      return;
    }
    refreshRouteForGossip(cur, item);
    showGossipToast(item);
  });

  peers.onGossipTombstone((tombstone) => {
    handleGossipTombstone(tombstone, parseRoute());
  });
}

export async function resolvePostForFrame(postId) {
  let post = await cacheNode.getLocalPost(postId);
  if (!post?.frame) {
    const tour = mock.mockRecentTopics()?.items || [];
    post = tour.find((p) => p.id === postId) || null;
  }
  return post;
}

export async function executeFrameAction(frame, postId, index, label) {
  const user = await getActiveUser();
  const payload = frames.buildFrameActionPayload({
    postId,
    frameKind: frame.kind,
    buttonIndex: index,
    buttonLabel: label,
    userAddress: user,
  });
  const signed = await localAccount.signPayload(payload);
  await cacheNode.saveLocalPost(signed);
  peers.broadcastGossipUpdate(signed);

  const container = document.getElementById(`post-frame-container-${postId}`);
  if (container) {
    const updatedPost = await resolvePostForFrame(postId);
    const updatedFrame = frames.applyFrameActionToPost(updatedPost, signed);
    if (updatedFrame) {
      container.innerHTML = render.renderFrameCardHtml(updatedFrame, postId, { previewOnly: false });
    }
  }
  share.showToast(i18n.frameActionRecordedToast || "Ação registrada no mini-app!");
}

export async function handleFrameActionClick(btn) {
  const postId = btn.dataset.postId;
  const index = parseInt(btn.dataset.btnIndex, 10);
  const label = btn.dataset.btnLabel;
  if (!postId || isNaN(index)) return;

  const post = await resolvePostForFrame(postId);
  if (!post?.frame) return;

  btn.disabled = true;
  const origText = btn.textContent;
  btn.textContent = "Gravando…";
  try {
    await executeFrameAction(post.frame, postId, index, label);
  } catch (err) {
    console.warn("Frame action failed", err);
    share.showToast("Falha ao executar ação no frame", "error");
    btn.disabled = false;
    btn.textContent = origText;
  }
}

function closePostEditModalUi() {
  const container = document.getElementById("post-edit-modal-container");
  if (container) container.innerHTML = "";
}

function createEditedPayload(existing, title, body, removeImage) {
  const { sig: _s, pubKey: _p, ...rest } = existing;
  return {
    ...rest,
    title,
    body,
    image: removeImage ? "" : rest.image || "",
    imageAlt: removeImage ? "" : rest.imageAlt || "",
    ts: rest.ts,
    editedAt: Date.now(),
  };
}

async function submitPostEdit(existing, btn) {
  const textRaw = document.getElementById("post-edit-text")?.value?.trim() || "";
  const { title, body } = postOwnership.deriveTopicTitleFromBody(textRaw);
  const removeImage = Boolean(document.getElementById("post-edit-remove-image")?.checked);
  if (!textRaw || !title || !body) return;

  if (btn) { btn.disabled = true; btn.textContent = "Salvando…"; }
  try {
    const payload = createEditedPayload(existing, title, body, removeImage);
    const signed = await localAccount.signPayload(payload);
    await cacheNode.saveLocalPost(signed);
    peers.broadcastGossipUpdate(signed);
    closePostEditModalUi();
    share.showToast(i18n.localMutateUpdatedToast);
    route();
  } catch (err) {
    share.showToast(`Erro ao editar: ${err.message}`, "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Salvar"; }
  }
}

export async function openPostEditModal(postId) {
  const user = await getActiveUser();
  const existing = await cacheNode.getLocalPost(postId);
  if (!postOwnership.canMutateLocalPost(existing, user)) {
    share.showToast("Só é possível editar posts seus criados neste navegador.", "error");
    return;
  }
  const container = document.getElementById("post-edit-modal-container");
  if (!container) return;

  container.innerHTML = render.renderPostEditModalHtml(existing);
  container.querySelector(".modal-backdrop")?.addEventListener("click", closePostEditModalUi);
  container.querySelector(".btn-modal-close")?.addEventListener("click", closePostEditModalUi);
  container.querySelector("#btn-post-edit-cancel")?.addEventListener("click", closePostEditModalUi);
  container.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") closePostEditModalUi();
  });
  container.querySelector("#form-post-edit")?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    submitPostEdit(existing, document.getElementById("btn-post-edit-save"));
  });
}

export async function handleDeletePost(postId) {
  const user = await getActiveUser();
  const existing = await cacheNode.getLocalPost(postId);
  if (!postOwnership.canMutateLocalPost(existing, user)) {
    share.showToast("Só é possível apagar posts seus.", "error");
    return;
  }
  const label = (existing.title || "esta publicação").slice(0, 80);
  if (!confirm(`Apagar "${label}"? Esta ação não pode ser desfeita.`)) return;
  const tombstone = await postOwnership.createPostTombstone(existing);
  await cacheNode.saveTombstone(tombstone);
  peers.broadcastGossipDelete(tombstone);
  share.showToast(i18n.localMutateDeletedToast);
  const onTopic = location.hash.replace(/^#\/?/, "").startsWith(`t/${postId}`);
  if (onTopic) location.hash = "#/";
  else route();
}

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

function handleCommentReplyClick(btn) {
  const item = btn.closest(".post-comment-item");
  const form = item?.querySelector(".post-comment-nested-reply");
  const opening = form?.hidden !== false;
  document.querySelectorAll(".post-comment-nested-reply:not([hidden])").forEach((f) => {
    if (f !== form) toggleCommentReplyComposer(f.closest(".post-comment-item"), false);
  });
  toggleCommentReplyComposer(item, opening);
}

function handleLikeClick(btn) {
  const postId = btn.dataset.id;
  const baseCount = btn.dataset.count || 0;
  const res = social.toggleLike(postId, baseCount);
  btn.classList.toggle("active", res.liked);
  const icon = btn.querySelector(".icon-heart");
  if (icon) icon.setAttribute("fill", res.liked ? "currentColor" : "none");
  const countLabel = btn.querySelector(".count-likes");
  if (countLabel) countLabel.textContent = res.count > 0 ? res.count : "";
}

function handleStarClick(btn) {
  const postId = btn.dataset.id;
  const baseCount = btn.dataset.count || 0;
  const res = social.toggleStar(postId, baseCount);
  btn.classList.toggle("active", res.starred);
  const icon = btn.querySelector(".icon-star");
  if (icon) icon.setAttribute("fill", res.starred ? "currentColor" : "none");
  const countLabel = btn.querySelector(".count-stars");
  if (countLabel) countLabel.textContent = res.count > 0 ? res.count : "";
  share.showToast(res.starred ? "Estrela adicionada ⭐ (nos seus Estrelados)!" : "Estrela removida.");
}

function handleSaveClick(btn) {
  const postId = btn.dataset.id;
  const saved = social.toggleSave(postId);
  btn.classList.toggle("active", saved);
  const icon = btn.querySelector(".icon-bookmark");
  if (icon) icon.setAttribute("fill", saved ? "currentColor" : "none");
  share.showToast(saved ? "Post salvo nos seus favoritos!" : "Post removido dos favoritos.");
}

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
    handleRepostClick(btnRepost).then((res) => { if (res?.ok) route(); });
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

export function initSocialInteractions() {
  document.addEventListener("click", (e) => {
    if (dispatchPostActionClicks(e)) return;
    dispatchSocialFeedbackClicks(e);
  });

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

export { initDmListeners } from "./screens-dm.js";
