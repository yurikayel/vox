/** @file Author post editing modal and deletion handlers with gossip propagation. */
import * as share from "../share.js";
import * as render from "../render.js";
import * as cacheNode from "../cache-node.js";
import * as postOwnership from "../post-ownership.js";
import * as i18n from "../i18n-pt-br.js";
import * as localAccount from "../identity/index.js";
import * as peers from "../peers.js";
import { getActiveUser } from "./context.js";
import { route } from "./navigation.js";

function closePostEditModalUi() {
  render.closePostEditModal(document.getElementById("modal-container"));
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

/**
 * Abre modal de edição para post local mutável pelo autor.
 *
 * @param {string} postId Id do post.
 * @returns {Promise<void>}
 */
export async function openPostEditModal(postId) {
  const user = await getActiveUser();
  const existing = await cacheNode.getLocalPost(postId);
  if (!postOwnership.canMutateLocalPost(existing, user)) {
    share.showToast("Só é possível editar posts seus criados neste navegador.", "error");
    return;
  }
  const container = document.getElementById("modal-container");
  if (!container) return;

  render.renderPostEditModal(container, {
    id: postId,
    title: existing.title,
    body: existing.body,
    hasImage: Boolean(existing.image),
  });
  const overlay = container.querySelector(".modal-overlay");
  overlay?.addEventListener("click", (ev) => { if (ev.target === overlay) closePostEditModalUi(); });
  overlay?.addEventListener("keydown", (ev) => { if (ev.key === "Escape") closePostEditModalUi(); });
  container.querySelector(".btn-close-post-edit")?.addEventListener("click", closePostEditModalUi);
  container.querySelector(".btn-cancel-post-edit")?.addEventListener("click", closePostEditModalUi);
  container.querySelector("#form-post-edit")?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    submitPostEdit(existing, document.getElementById("btn-post-edit-save"));
  });
}

/**
 * Apaga post local do autor após confirmação e propaga tombstone.
 *
 * @param {string} postId Id do post.
 * @returns {Promise<void>}
 */
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
