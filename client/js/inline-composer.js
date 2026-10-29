import * as composerMedia from "./composer-media.js";
import * as share from "./share.js";
import * as upload from "./upload.js";
import * as wallet from "./wallet.js";
import * as cacheNode from "./cache-node.js";
import * as peers from "./peers.js";
import * as localAccount from "./local-account.js";
import * as postOwnership from "./post-ownership.js";
import * as mediaBlob from "./media-blob.js";

let inlineComposerImageDataUrl = "";

function collapseInlineComposer() {
  const root = document.getElementById("feed-inline-composer");
  const collapsed = root?.querySelector(".inline-composer-collapsed");
  const form = document.getElementById("form-inline-topic");
  if (!root || !collapsed || !form) return;
  form.classList.add("hidden");
  collapsed.classList.remove("hidden");
  collapsed.setAttribute("aria-expanded", "false");
  collapsed.focus();
}

function syncInlineComposerUi() {
  const textarea = document.getElementById("inline-topic-body");
  const btn = document.getElementById("btn-inline-submit");
  const charEl = document.getElementById("inline-topic-char");
  const len = textarea?.value?.length || 0;
  const hasText = Boolean(textarea?.value?.trim());
  if (charEl) charEl.textContent = `${len} / 2000`;
  if (btn) btn.disabled = !hasText;
}

function expandInlineComposer() {
  const root = document.getElementById("feed-inline-composer");
  const collapsed = root?.querySelector(".inline-composer-collapsed");
  const form = document.getElementById("form-inline-topic");
  if (!root || !collapsed || !form) return;
  collapsed.classList.add("hidden");
  form.classList.remove("hidden");
  collapsed.setAttribute("aria-expanded", "true");
  const textarea = document.getElementById("inline-topic-body");
  textarea?.focus();
  syncInlineComposerUi();
}

export function attachInlineComposerHandlers(onPublished) {
  const root = document.getElementById("feed-inline-composer");
  if (!root) return;

  const collapsed = root.querySelector(".inline-composer-collapsed");
  const form = document.getElementById("form-inline-topic");
  const fileInput = document.getElementById("inline-topic-file");
  const previewWrap = document.getElementById("inline-topic-preview-wrap");
  const previewImg = document.getElementById("inline-topic-preview");
  const removeBtn = document.getElementById("btn-inline-remove-img");

  let rawSourceFile = null;
  let activeLofiFilter = "normal";

  const clearImage = () => {
    rawSourceFile = null;
    activeLofiFilter = "normal";
    inlineComposerImageDataUrl = "";
    if (fileInput) fileInput.value = "";
    previewWrap?.classList.add("hidden");
    if (previewImg) previewImg.removeAttribute("src");
    const badge = document.getElementById("lofi-weight-badge");
    if (badge) badge.textContent = "⚡ ~45 KB (100% Grátis)";
  };

  const renderLofiPreview = async () => {
    if (!rawSourceFile) return;
    const badge = document.getElementById("lofi-weight-badge");
    if (badge) badge.textContent = "⚡ Processando Lo-Fi…";
    const result = await composerMedia.processComposerLofiImage(rawSourceFile, { filter: activeLofiFilter });
    if (result.ok) {
      inlineComposerImageDataUrl = result.dataUrl;
      if (previewImg) previewImg.src = result.dataUrl;
      const kb = Math.max(1, Math.round((result.byteLength || 0) / 1024));
      if (badge) badge.textContent = `⚡ ~${kb} KB (100% Grátis)`;
    } else {
      share.showToast(result.message || "Erro no processamento da imagem", "error");
    }
  };

  collapsed?.addEventListener("click", () => expandInlineComposer());
  collapsed?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      expandInlineComposer();
    }
  });

  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const check = composerMedia.validateComposerImageFile(file);
    if (!check.ok) {
      share.showToast(check.message, "error");
      clearImage();
      return;
    }
    rawSourceFile = file;
    activeLofiFilter = "normal";
    const filterBar = document.getElementById("lofi-filter-bar");
    filterBar?.querySelectorAll(".lofi-filter-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.filter === "normal");
    });
    previewWrap?.classList.remove("hidden");
    await renderLofiPreview();
    syncInlineComposerUi();
  });

  const filterBar = document.getElementById("lofi-filter-bar");
  filterBar?.addEventListener("click", async (e) => {
    const btn = e.target.closest(".lofi-filter-btn");
    if (!btn || !rawSourceFile) return;
    e.preventDefault();
    filterBar.querySelectorAll(".lofi-filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeLofiFilter = btn.dataset.filter || "normal";
    await renderLofiPreview();
  });

  removeBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    clearImage();
  });

  const textarea = document.getElementById("inline-topic-body");
  textarea?.addEventListener("input", syncInlineComposerUi);
  form?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      form.reset();
      clearImage();
      syncInlineComposerUi();
      collapseInlineComposer();
    }
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn-inline-submit");
    const bodyRaw = document.getElementById("inline-topic-body")?.value?.trim() || "";
    const commSlug =
      document.getElementById("inline-topic-comm")?.value?.trim().toLowerCase() || "geral";
    if (!bodyRaw) return;

    const { title, body } = postOwnership.deriveTopicTitleFromBody(bodyRaw);

    if (btn) {
      btn.disabled = true;
      btn.textContent = "Publicando…";
    }
    try {
      const topicId = "top_" + Math.random().toString(36).slice(2, 10);
      const payload = {
        id: topicId,
        type: "topic",
        communityId: commSlug,
        title,
        body,
      };
      if (inlineComposerImageDataUrl) {
        payload.image = inlineComposerImageDataUrl;
        payload.imageAlt = title;
      }
      const signed = await localAccount.signPayload(payload);
      await cacheNode.saveLocalPost(signed);

      const { detachedPost, mediaBlob: blob } = await mediaBlob.detachMedia(signed);
      if (blob) {
        await mediaBlob.defaultBlobStorage.put(blob);
      }
      peers.broadcastGossip(detachedPost);

      if (wallet.hasWallet()) {
        try {
          const tags = upload.buildTags("topic", {
            "Community-Id": commSlug,
            "Topic-Title": title,
            Title: title,
            "Local-Origin-Id": topicId,
          });
          await upload.postData({ title, body, communityId: commSlug }, tags);
        } catch {}
      }

      share.showToast("Post publicado no feed!");
      const { dispatchAutoReplication, isAutoReplicationEnabled } = await import("./linked-accounts.js");
      if (isAutoReplicationEnabled()) {
        dispatchAutoReplication({ id: topicId, communityId: commSlug, title, body, image: payload.image })
          .then((rep) => {
            if (rep.dispatched && rep.count > 0) {
              share.showToast(`🚀 Replicado para ${rep.count} webhook(s) de redes vinculadas!`);
            }
          })
          .catch(() => {});
      }
      const { openPosseSheetAfterPublish } = await import("./posse-dispatch.js");
      openPosseSheetAfterPublish({ id: topicId, communityId: commSlug, title, body, image: payload.image });
      form.reset();
      clearImage();
      collapseInlineComposer();
      if (typeof onPublished === "function") await onPublished();
    } catch (err) {
      share.showToast(`Erro: ${err.message}`, "error");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Postar";
      }
    }
  });
}
