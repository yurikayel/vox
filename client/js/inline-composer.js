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

  const clearImage = () => {
    inlineComposerImageDataUrl = "";
    if (fileInput) fileInput.value = "";
    previewWrap?.classList.add("hidden");
    if (previewImg) previewImg.removeAttribute("src");
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
    const result = await composerMedia.readComposerImageFromFile(file);
    if (!result.ok) {
      share.showToast(result.message, "error");
      clearImage();
      return;
    }
    inlineComposerImageDataUrl = result.dataUrl;
    if (previewImg) previewImg.src = inlineComposerImageDataUrl;
    previewWrap?.classList.remove("hidden");
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
