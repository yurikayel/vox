/** @file Global listeners: gossip, DM, social/post interactions. */

import * as render from "../render.js";
import * as mock from "../mock.js";
import * as share from "../share.js";
import * as cacheNode from "../cache-node.js";
import * as peers from "../peers.js";
import * as cryptoDm from "../crypto-dm.js";
import * as localAccount from "../local-account.js";
import * as social from "../social.js";
import * as frames from "../frames.js";
import * as postOwnership from "../post-ownership.js";
import { parseRoute } from "./route-parse.js";
import { getActiveUser } from "./context.js";
import { route } from "./navigation.js";
import { openZapModal } from "./zap-modal.js";
import { showHome, showTagFeed } from "./screens-home.js";
import {
  showCommunity,
  showTopic,
  showProposal,
} from "./screens-community.js";
import { showDmThread, initDmListeners } from "./screens-dm.js";
import { togglePostComments, onInlineReplySubmit } from "./screens-compose.js";

export function initGossipListeners() {
  peers.onGossipPost((item) => {
    const cur = parseRoute();
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
    if (item?.type === "topic") {
      const isUpdate = Boolean(item.editedAt && item.editedAt > 0);
      share.showToast(isUpdate ? "Publicação atualizada na rede." : `Novo post na rede: ${item.title?.slice(0, 24) || "..."}`);
    } else if (item?.type === "listing") {
      share.showToast(`Nova oferta na feira: ${item.title?.slice(0, 24) || "..."}`);
    } else if (item?.type === "governance-proposal") {
      share.showToast(`Nova proposta de governança: ${item.title?.slice(0, 24) || "..."}`);
    } else if (item?.type === "governance-vote") {
      share.showToast(`Novo voto registrado na proposta!`);
    } else if (item?.type === "frame-action") {
      share.showToast(`Nova interação no mini-app do post!`);
    }
  });

  peers.onGossipTombstone((tombstone) => {
    const cur = parseRoute();
    if (cur.name === "home") {
      showHome(cur.feed);
    } else if (cur.name === "community") {
      showCommunity(cur.id, cur.tab);
    } else if (cur.name === "topic" && cur.id === tombstone.id) {
      location.hash = "#/";
    } else if (cur.name === "tag-feed" && cur.slug) {
      showTagFeed(cur.slug);
    }
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
  peers.broadcastGossip(signed);

  frames.saveUserFrameAction(postId, { buttonIndex: index, buttonLabel: label, author: user });
  const localAction = frames.getUserFrameAction(postId);
  const existing = await cacheNode.getLocalPosts({ type: "frame-action", postId });
  return frames.getFrameState(frame, existing, localAction);
}

export async function handleFrameActionClick(btn) {
  const postId = btn.dataset.postId;
  const index = Number(btn.dataset.index) || 1;
  const label = btn.dataset.label || "";
  const action = btn.dataset.action || "post";
  const target = btn.dataset.target || "";

  if (action === "link" && target) {
    window.location.href = target;
    return;
  }

  const container = btn.closest(".vox-frame");
  const buttons = container ? container.querySelectorAll(".btn-frame-action") : [];
  buttons.forEach((b) => (b.disabled = true));

  try {
    const post = await resolvePostForFrame(postId);
    const parsed = frames.parseFrame(post?.frame);
    if (!parsed.valid) throw new Error(parsed.error);

    const state = await executeFrameAction(parsed.frame, postId, index, label);
    const contentEl = document.getElementById(`frame-content-${postId}`);
    if (contentEl) contentEl.innerHTML = render.renderFrameContentHtml(parsed.frame, state);

    buttons.forEach((b) => {
      b.disabled = false;
      b.classList.toggle("active", Number(b.dataset.index) === index);
    });
    const msg = parsed.frame.kind === "poll" ? `Voto "${label}" computado!` : parsed.frame.kind === "petition" ? "Abaixo-assinado assinado! ✓" : "Cálculo CLT atualizado!";
    share.showToast(msg);
  } catch (err) {
    buttons.forEach((b) => (b.disabled = false));
    share.showToast(`Erro no frame: ${err.message}`, "error");
  }
}

export function getPostEditModalContainer() {
  let container = document.getElementById("post-edit-modal-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "post-edit-modal-container";
    document.body.appendChild(container);
  }
  return container;
}

export function closePostEditModalUi() {
  const container = document.getElementById("post-edit-modal-container");
  if (container) render.closePostEditModal(container);
}

export async function openPostEditModal(postId) {
  const user = await getActiveUser();
  const existing = await cacheNode.getLocalPost(postId);
  if (!postOwnership.canMutateLocalPost(existing, user)) {
    share.showToast("Só é possível editar posts seus.", "error");
    return;
  }
  const container = getPostEditModalContainer();
  render.renderPostEditModal(container, {
    id: existing.id,
    title: existing.title || "",
    body: existing.body || "",
    hasImage: Boolean(existing.image),
  });
  const editTextarea = container.querySelector("#post-edit-text");
  const editChar = container.querySelector("#post-edit-char");
  const syncEditChar = () => {
    const len = editTextarea?.value?.length || 0;
    if (editChar) editChar.textContent = `${len} / 5000`;
  };
  editTextarea?.addEventListener("input", syncEditChar);
  editTextarea?.focus();
  const overlay = container.querySelector("#post-edit-modal-overlay");
  overlay?.addEventListener("click", (ev) => {
    if (ev.target === overlay) closePostEditModalUi();
  });
  container.querySelector(".btn-close-post-edit")?.addEventListener("click", closePostEditModalUi);
  container.querySelector(".btn-cancel-post-edit")?.addEventListener("click", closePostEditModalUi);
  overlay?.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") closePostEditModalUi();
  });
  container.querySelector("#form-post-edit")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const btn = document.getElementById("btn-post-edit-save");
    const textRaw = document.getElementById("post-edit-text")?.value?.trim() || "";
    const { title, body } = postOwnership.deriveTopicTitleFromBody(textRaw);
    const removeImage = Boolean(document.getElementById("post-edit-remove-image")?.checked);
    if (!textRaw || !title || !body) return;
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Salvando…";
    }
    try {
      const { sig: _s, pubKey: _p, ...rest } = existing;
      const signed = await localAccount.signPayload({
        ...rest,
        title,
        body,
        image: removeImage ? "" : rest.image || "",
        imageAlt: removeImage ? "" : rest.imageAlt || "",
        ts: rest.ts,
        editedAt: Date.now(),
      });
      await cacheNode.saveLocalPost(signed);
      peers.broadcastGossipUpdate(signed);
      closePostEditModalUi();
      share.showToast("Publicação atualizada.");
      route();
    } catch (err) {
      share.showToast(`Erro ao editar: ${err.message}`, "error");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Salvar";
      }
    }
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
  share.showToast("Publicação apagada.");
  const onTopic = location.hash.replace(/^#\/?/, "").startsWith(`t/${postId}`);
  if (onTopic) location.hash = "#/";
  else route();
}

export function initSocialInteractions() {
  document.addEventListener("click", (e) => {
    const btnEdit = e.target.closest(".btn-post-edit");
    if (btnEdit) {
      e.preventDefault();
      openPostEditModal(btnEdit.dataset.id);
      return;
    }

    const btnDel = e.target.closest(".btn-post-delete");
    if (btnDel) {
      e.preventDefault();
      handleDeletePost(btnDel.dataset.id);
      return;
    }

    // Open Frames (v6.2 Mini-apps)
    const btnFrame = e.target.closest(".btn-frame-action:not([disabled])");
    if (btnFrame) {
      e.preventDefault();
      handleFrameActionClick(btnFrame);
      return;
    }

    const btnComment = e.target.closest(".btn-comment");
    if (btnComment) {
      e.preventDefault();
      togglePostComments(btnComment);
      return;
    }

    // Pix Zap / Apoiar post (v6.0)
    const btnZap = e.target.closest(".btn-zap-post:not(.disabled)");
    if (btnZap) {
      e.preventDefault();
      const pixKey = btnZap.dataset.pix;
      const authorName = btnZap.dataset.authorName || "Autor";
      const title = btnZap.dataset.title || "";
      openZapModal({ pixKey, authorName, title });
      return;
    }

    // Like button
    const btnLike = e.target.closest(".btn-like");
    if (btnLike) {
      e.preventDefault();
      const postId = btnLike.dataset.id;
      const baseCount = btnLike.dataset.count || 0;
      const res = social.toggleLike(postId, baseCount);
      btnLike.classList.toggle("active", res.liked);
      const icon = btnLike.querySelector(".icon-heart");
      if (icon) {
        icon.setAttribute("fill", res.liked ? "currentColor" : "none");
      }
      const countLabel = btnLike.querySelector(".count-likes");
      if (countLabel) {
        countLabel.textContent = res.count > 0 ? res.count : "";
      }
      return;
    }

    // Star button (GitHub UX)
    const btnStar = e.target.closest(".btn-star");
    if (btnStar) {
      e.preventDefault();
      const postId = btnStar.dataset.id;
      const baseCount = btnStar.dataset.count || 0;
      const res = social.toggleStar(postId, baseCount);
      btnStar.classList.toggle("active", res.starred);
      const icon = btnStar.querySelector(".icon-star");
      if (icon) {
        icon.setAttribute("fill", res.starred ? "currentColor" : "none");
      }
      const countLabel = btnStar.querySelector(".count-stars");
      if (countLabel) {
        countLabel.textContent = res.count > 0 ? res.count : "";
      }
      share.showToast(res.starred ? "Estrela adicionada ⭐ (nos seus Estrelados)!" : "Estrela removida.");
      return;
    }

    // Save/Bookmark button
    const btnSave = e.target.closest(".btn-save");
    if (btnSave) {
      e.preventDefault();
      const postId = btnSave.dataset.id;
      const saved = social.toggleSave(postId);
      btnSave.classList.toggle("active", saved);
      const icon = btnSave.querySelector(".icon-bookmark");
      if (icon) {
        icon.setAttribute("fill", saved ? "currentColor" : "none");
      }
      share.showToast(saved ? "Post salvo nos seus favoritos!" : "Post removido dos favoritos.");
      return;
    }

    // Copiar Markdown do post (GH-A)
    const btnCopyMd = e.target.closest(".btn-copy-md");
    if (btnCopyMd) {
      e.preventDefault();
      const mdText = render.formatPostMarkdown({
        id: btnCopyMd.dataset.id,
        title: btnCopyMd.dataset.title || "",
        body: btnCopyMd.dataset.body || "",
        authorDisplay: btnCopyMd.dataset.author || "",
        authorHandle: btnCopyMd.dataset.handle || "",
      });
      if (navigator.clipboard) {
        navigator.clipboard.writeText(mdText).then(() => {
          share.showToast("Post copiado em Markdown! 📋");
        }).catch(() => {
          share.showToast("Erro ao copiar.", "error");
        });
      }
      return;
    }

    // Watch / Acompanhar perfil (GitHub UX) · Seguir no hero do feed (IG)
    const btnWatch = e.target.closest(".btn-watch-profile");
    if (btnWatch) {
      e.preventDefault();
      const routeId = btnWatch.dataset.route;
      const watching = social.toggleWatch(routeId);
      if (btnWatch.classList.contains("btn-overlay-follow")) {
        btnWatch.textContent = watching ? "Seguindo" : "Seguir";
        btnWatch.setAttribute("aria-pressed", watching ? "true" : "false");
        btnWatch.setAttribute("aria-label", watching ? "Deixar de seguir autor" : "Seguir autor");
        btnWatch.classList.toggle("is-following", watching);
      } else {
        btnWatch.classList.toggle("btn-primary", !watching);
        btnWatch.classList.toggle("btn-outline", watching);
        btnWatch.textContent = watching ? "✓ Acompanhando" : "👁️ Acompanhar (Watch)";
      }
      share.showToast(watching ? "Agora você acompanha este autor no feed Seguindo!" : "Deixou de acompanhar este autor.");
      return;
    }
  });

  document.addEventListener("submit", (e) => {
    const form = e.target.closest(".post-comment-composer");
    if (!form) return;
    e.preventDefault();
    onInlineReplySubmit(form);
  });
}

export { initDmListeners } from "./screens-dm.js";
