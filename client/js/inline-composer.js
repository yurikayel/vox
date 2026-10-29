import * as composerMedia from "./composer-media.js";
import * as share from "./share.js";
import * as upload from "./upload.js";
import * as localAccount from "./local-account.js";
import * as peers from "./peers.js";
import * as cacheNode from "./cache-node.js";
import * as wallet from "./wallet.js";
import * as postOwnership from "./post-ownership.js";
import * as mediaBlob from "./media-blob.js";

let inlineComposerImageDataUrl = "";
let inlineComposerMedia = { type: "", dataUrl: "", byteLength: 0 };

export function isInlineComposerActive() {
  const root = document.getElementById("feed-inline-composer");
  return Boolean(root && !root.classList.contains("is-collapsed"));
}

export function syncInlineComposerUi() {
  const root = document.getElementById("feed-inline-composer");
  if (!root) return;
  const textarea = document.getElementById("inline-topic-body");
  const charEl = document.getElementById("inline-topic-char");
  const submitBtn = document.getElementById("btn-inline-submit");
  const text = textarea ? textarea.value : "";
  const len = text.length;
  if (charEl) charEl.textContent = `${len} / 2000`;
  const hasContent = Boolean(text.trim() || inlineComposerImageDataUrl || inlineComposerMedia.dataUrl);
  if (submitBtn) submitBtn.disabled = !hasContent;
}

export function collapseInlineComposer() {
  const root = document.getElementById("feed-inline-composer");
  if (!root) return;
  root.classList.add("is-collapsed");
  const form = document.getElementById("form-inline-topic");
  const collapsed = root.querySelector(".inline-composer-collapsed");
  form?.classList.add("hidden");
  collapsed?.classList.remove("hidden");
  collapsed?.setAttribute("aria-expanded", "false");
}

export function expandInlineComposer() {
  const root = document.getElementById("feed-inline-composer");
  if (!root) return;
  root.classList.remove("is-collapsed");
  const form = document.getElementById("form-inline-topic");
  const collapsed = root.querySelector(".inline-composer-collapsed");
  form?.classList.remove("hidden");
  collapsed?.classList.add("hidden");
  collapsed?.setAttribute("aria-expanded", "true");
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
  const audioInput = document.getElementById("inline-topic-audio");
  const videoInput = document.getElementById("inline-topic-video");
  const previewWrap = document.getElementById("inline-topic-preview-wrap");
  const previewImg = document.getElementById("inline-topic-preview");
  const previewAudioWrap = document.getElementById("inline-topic-preview-audio-wrap");
  const previewAudio = document.getElementById("inline-topic-preview-audio");
  const previewVideoWrap = document.getElementById("inline-topic-preview-video-wrap");
  const previewVideo = document.getElementById("inline-topic-preview-video");
  const removeBtn = document.getElementById("btn-inline-remove-img");

  let rawSourceFile = null;
  let activeLofiFilter = "normal";

  const clearMedia = () => {
    rawSourceFile = null;
    activeLofiFilter = "normal";
    inlineComposerMedia = { type: "", dataUrl: "", byteLength: 0 };
    inlineComposerImageDataUrl = "";
    if (fileInput) fileInput.value = "";
    if (audioInput) audioInput.value = "";
    if (videoInput) videoInput.value = "";
    previewWrap?.classList.add("hidden");
    if (previewImg) {
      previewImg.removeAttribute("src");
      previewImg.classList.add("hidden");
    }
    if (previewAudio) {
      previewAudio.removeAttribute("src");
      previewAudioWrap?.classList.add("hidden");
    }
    if (previewVideo) {
      previewVideo.removeAttribute("src");
      previewVideoWrap?.classList.add("hidden");
    }
    const filterBar = document.getElementById("lofi-filter-bar");
    if (filterBar) filterBar.style.display = "flex";
    const badge = document.getElementById("lofi-weight-badge");
    if (badge) badge.textContent = "⚡ ~45 KB (100% Grátis)";
  };

  const renderLofiPreview = async () => {
    if (!rawSourceFile || inlineComposerMedia.type !== "image") return;
    const badge = document.getElementById("lofi-weight-badge");
    if (badge) badge.textContent = "⚡ Processando Lo-Fi…";
    const result = await composerMedia.processComposerLofiImage(rawSourceFile, { filter: activeLofiFilter });
    if (result.ok) {
      inlineComposerImageDataUrl = result.dataUrl;
      inlineComposerMedia.dataUrl = result.dataUrl;
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
      clearMedia();
      return;
    }
    clearMedia();
    rawSourceFile = file;
    inlineComposerMedia = { type: "image", dataUrl: "", byteLength: file.size };
    activeLofiFilter = "normal";
    previewImg?.classList.remove("hidden");
    const filterBar = document.getElementById("lofi-filter-bar");
    if (filterBar) filterBar.style.display = "flex";
    filterBar?.querySelectorAll(".lofi-filter-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.filter === "normal");
    });
    previewWrap?.classList.remove("hidden");
    await renderLofiPreview();
    syncInlineComposerUi();
  });

  audioInput?.addEventListener("change", async () => {
    const file = audioInput.files?.[0];
    if (!file) return;
    const check = composerMedia.validateComposerAudioFile(file);
    if (!check.ok) {
      share.showToast(check.message, "error");
      clearMedia();
      return;
    }
    clearMedia();
    rawSourceFile = file;
    const dataUrl = await composerMedia.readComposerMediaFile(file);
    const kb = Math.max(1, Math.round(file.size / 1024));
    inlineComposerMedia = { type: "audio", dataUrl, byteLength: file.size };
    if (previewAudio) previewAudio.src = dataUrl;
    previewAudioWrap?.classList.remove("hidden");
    const filterBar = document.getElementById("lofi-filter-bar");
    if (filterBar) filterBar.style.display = "none";
    const badge = document.getElementById("lofi-weight-badge");
    if (badge) badge.textContent = `⚡ ~${kb} KB (Áudio Lo-Fi ${kb <= 99 ? "100% Grátis" : "48k"})`;
    previewWrap?.classList.remove("hidden");
    syncInlineComposerUi();
  });

  videoInput?.addEventListener("change", async () => {
    const file = videoInput.files?.[0];
    if (!file) return;
    const check = composerMedia.validateComposerVideoFile(file);
    if (!check.ok) {
      share.showToast(check.message, "error");
      clearMedia();
      return;
    }
    clearMedia();
    rawSourceFile = file;
    const dataUrl = await composerMedia.readComposerMediaFile(file);
    const kb = Math.max(1, Math.round(file.size / 1024));
    inlineComposerMedia = { type: "video", dataUrl, byteLength: file.size };
    if (previewVideo) previewVideo.src = dataUrl;
    previewVideoWrap?.classList.remove("hidden");
    const filterBar = document.getElementById("lofi-filter-bar");
    if (filterBar) filterBar.style.display = "none";
    const badge = document.getElementById("lofi-weight-badge");
    if (badge) badge.textContent = `⚡ ~${kb} KB (Vídeo Lo-Fi 360p)`;
    previewWrap?.classList.remove("hidden");
    syncInlineComposerUi();
  });

  const filterBar = document.getElementById("lofi-filter-bar");
  filterBar?.addEventListener("click", async (e) => {
    const btn = e.target.closest(".lofi-filter-btn");
    if (!btn || !rawSourceFile || inlineComposerMedia.type !== "image") return;
    e.preventDefault();
    filterBar.querySelectorAll(".lofi-filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeLofiFilter = btn.dataset.filter || "normal";
    await renderLofiPreview();
  });

  removeBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    clearMedia();
    syncInlineComposerUi();
  });

  const textarea = document.getElementById("inline-topic-body");
  textarea?.addEventListener("input", syncInlineComposerUi);
  form?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      form.reset();
      clearMedia();
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
    if (!bodyRaw && !inlineComposerMedia.dataUrl) return;

    const { title, body } = postOwnership.deriveTopicTitleFromBody(bodyRaw || "Mídia publicada no feed");

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
      if (inlineComposerMedia.type === "image" && inlineComposerImageDataUrl) {
        payload.image = inlineComposerImageDataUrl;
        payload.imageAlt = title;
      } else if (inlineComposerMedia.type === "audio" && inlineComposerMedia.dataUrl) {
        payload.audio = inlineComposerMedia.dataUrl;
      } else if (inlineComposerMedia.type === "video" && inlineComposerMedia.dataUrl) {
        payload.video = inlineComposerMedia.dataUrl;
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

      form.reset();
      clearMedia();
      syncInlineComposerUi();
      collapseInlineComposer();
      share.showToast("Post publicado na rede!");
      if (typeof onPublished === "function") {
        onPublished(signed);
      } else {
        location.reload();
      }
    } catch (err) {
      share.showToast(`Erro ao publicar: ${err.message}`, "error");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Postar";
      }
    }
  });
}
