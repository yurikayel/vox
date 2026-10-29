import * as composerMedia from "./composer-media.js";
import * as share from "./share.js";
import * as upload from "./upload.js";
import * as localAccount from "./local-account.js";
import * as peers from "./peers.js";
import * as cacheNode from "./cache-node.js";
import * as wallet from "./wallet.js";
import * as postOwnership from "./post-ownership.js";
import * as mediaBlob from "./media-blob.js";
import * as photoTags from "./photo-tags.js";
import { openPhotoTagPicker } from "./app/photo-tag-picker.js";
import { escapeHtml } from "./render/util.js";

let inlineComposerImageDataUrl = "";
let inlineComposerMedia = { type: "", dataUrl: "", byteLength: 0 };
let inlineComposerAspectRatio = "original";
let inlineComposerPhotoTags = [];

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

export async function populateCommunityDatalist() {
  const datalist = document.getElementById("inline-comm-list");
  if (!datalist) return;
  const set = new Set(["geral", "politica", "musica", "tecnologia", "arte", "ciencia", "livre"]);
  try {
    const locals = await cacheNode.getLocalCommunities();
    for (const c of locals || []) {
      if (c?.id) set.add(c.id);
    }
  } catch {}
  datalist.innerHTML = Array.from(set)
    .map((slug) => `<option value="${slug}"></option>`)
    .join("");
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
  populateCommunityDatalist();
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
  let activeStream = null;
  let activeRecorder = null;
  let recordingChunks = [];
  let recordingTimer = null;
  let recordingSeconds = 0;

  const formatRecordingTime = (sec) => {
    const m = String(Math.floor(sec / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${m}:${s} / 01:00`;
  };

  const cleanupRecordingState = () => {
    if (recordingTimer) {
      clearInterval(recordingTimer);
      recordingTimer = null;
    }
    if (activeStream) {
      activeStream.getTracks().forEach((t) => t.stop());
      activeStream = null;
    }
    activeRecorder = null;
    recordingChunks = [];
    recordingSeconds = 0;
    const indicator = document.getElementById("inline-recording-indicator");
    if (indicator) indicator.classList.add("hidden");
  };

  const startVoiceRecording = async () => {
    if (!navigator?.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      share.showToast("Gravação de voz não suportada neste ambiente.", "error");
      return;
    }
    clearMedia();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      activeStream = stream;
      recordingChunks = [];
      recordingSeconds = 0;
      let mimeType = "audio/webm;codecs=opus";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      }
      const options = mimeType ? { mimeType, audioBitsPerSecond: 48000 } : {};
      const recorder = new MediaRecorder(stream, options);
      activeRecorder = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordingChunks.push(e.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(recordingChunks, { type });
        const kb = Math.max(1, Math.round(blob.size / 1024));
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          inlineComposerMedia = { type: "audio", dataUrl, byteLength: blob.size };
          if (previewAudio) previewAudio.src = dataUrl;
          previewAudioWrap?.classList.remove("hidden");
          const filterBar = document.getElementById("lofi-filter-bar");
          if (filterBar) filterBar.style.display = "none";
          const badge = document.getElementById("lofi-weight-badge");
          if (badge) badge.textContent = `⚡ ~${kb} KB (Voz Gravada Lo-Fi ${kb <= 99 ? "100% Grátis" : "48k"})`;
          previewWrap?.classList.remove("hidden");
          cleanupRecordingState();
          syncInlineComposerUi();
        };
        reader.readAsDataURL(blob);
      };
      recorder.start(500);
      const indicator = document.getElementById("inline-recording-indicator");
      const timerEl = document.getElementById("inline-recording-timer");
      if (indicator) indicator.classList.remove("hidden");
      if (timerEl) timerEl.textContent = "00:00 / 01:00";
      recordingTimer = setInterval(() => {
        recordingSeconds++;
        if (timerEl) timerEl.textContent = formatRecordingTime(recordingSeconds);
        if (recordingSeconds >= 60) stopVoiceRecording();
      }, 1000);
    } catch (err) {
      cleanupRecordingState();
      share.showToast(`Erro ao acessar microfone: ${err.message}`, "error");
    }
  };

  const stopVoiceRecording = () => {
    if (activeRecorder && activeRecorder.state === "recording") {
      activeRecorder.stop();
    }
    if (recordingTimer) {
      clearInterval(recordingTimer);
      recordingTimer = null;
    }
  };

  const cancelVoiceRecording = () => {
    if (activeRecorder && activeRecorder.state === "recording") {
      activeRecorder.ondataavailable = null;
      activeRecorder.onstop = null;
      try { activeRecorder.stop(); } catch {}
    }
    cleanupRecordingState();
    share.showToast("Gravação cancelada.");
  };

  const clearMedia = () => {
    cleanupRecordingState();
    rawSourceFile = null;
    activeLofiFilter = "normal";
    inlineComposerAspectRatio = "original";
    inlineComposerPhotoTags = [];
    inlineComposerMedia = { type: "", dataUrl: "", byteLength: 0 };
    inlineComposerImageDataUrl = "";
    if (fileInput) fileInput.value = "";
    if (audioInput) audioInput.value = "";
    if (videoInput) videoInput.value = "";
    previewWrap?.classList.add("hidden");
    if (previewImg) {
      previewImg.removeAttribute("src");
      previewImg.classList.add("hidden");
      previewImg.classList.remove("composer-aspect-1-1", "composer-aspect-4-3", "composer-aspect-16-9");
      previewImg.classList.add("composer-aspect-original");
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
    const aspectBar = document.getElementById("composer-aspect-bar");
    if (aspectBar) aspectBar.style.display = "none";
    const tagBar = document.getElementById("composer-tag-bar");
    if (tagBar) tagBar.style.display = "none";
    const tagsChips = document.getElementById("inline-composer-tags-chips");
    if (tagsChips) tagsChips.innerHTML = "";
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
    inlineComposerAspectRatio = "original";
    inlineComposerPhotoTags = [];
    previewImg?.classList.remove("hidden");
    const filterBar = document.getElementById("lofi-filter-bar");
    if (filterBar) filterBar.style.display = "flex";
    filterBar?.querySelectorAll(".lofi-filter-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.filter === "normal");
    });
    const aspectBar = document.getElementById("composer-aspect-bar");
    if (aspectBar) aspectBar.style.display = "flex";
    aspectBar?.querySelectorAll(".composer-aspect-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.aspect === "original");
    });
    const tagBar = document.getElementById("composer-tag-bar");
    if (tagBar) tagBar.style.display = "flex";
    const tagsChips = document.getElementById("inline-composer-tags-chips");
    if (tagsChips) tagsChips.innerHTML = "";
    previewImg?.classList.remove("composer-aspect-1-1", "composer-aspect-4-3", "composer-aspect-16-9");
    previewImg?.classList.add("composer-aspect-original");
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

  const aspectBar = document.getElementById("composer-aspect-bar");
  aspectBar?.addEventListener("click", (e) => {
    const btn = e.target.closest(".composer-aspect-btn");
    if (!btn || inlineComposerMedia.type !== "image") return;
    e.preventDefault();
    aspectBar.querySelectorAll(".composer-aspect-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    inlineComposerAspectRatio = btn.dataset.aspect || "original";
    if (previewImg) {
      previewImg.classList.remove("composer-aspect-original", "composer-aspect-1-1", "composer-aspect-4-3", "composer-aspect-16-9");
      previewImg.classList.add(`composer-aspect-${inlineComposerAspectRatio.replace(":", "-")}`);
    }
  });

  const tagPeopleBtn = document.getElementById("btn-inline-tag-people");
  const tagsChips = document.getElementById("inline-composer-tags-chips");

  const renderTagChips = () => {
    if (!tagsChips) return;
    tagsChips.innerHTML = inlineComposerPhotoTags
      .map((t, idx) => `<span class="inline-composer-tag-chip"><span>${escapeHtml(t.label || t.targetId)}</span><button type="button" class="btn-remove-tag" data-idx="${idx}" aria-label="Remover marca">✕</button></span>`)
      .join("");
  };

  tagPeopleBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    openPhotoTagPicker("composer", 50, 50, (picked) => {
      inlineComposerPhotoTags.push({ x: 50, y: 50, targetId: picked.targetId, label: picked.label });
      renderTagChips();
    });
  });

  tagsChips?.addEventListener("click", (e) => {
    const removeBtn = e.target.closest(".btn-remove-tag");
    if (!removeBtn) return;
    e.preventDefault();
    const idx = Number(removeBtn.dataset.idx);
    if (!Number.isNaN(idx)) {
      inlineComposerPhotoTags.splice(idx, 1);
      renderTagChips();
    }
  });

  removeBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    clearMedia();
    syncInlineComposerUi();
  });

  const micBtn = document.getElementById("btn-inline-mic");
  const stopRecBtn = document.getElementById("btn-inline-stop-rec");
  const cancelRecBtn = document.getElementById("btn-inline-cancel-rec");

  micBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    startVoiceRecording();
  });
  stopRecBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    stopVoiceRecording();
  });
  cancelRecBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    cancelVoiceRecording();
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
    const hasMedia = Boolean(inlineComposerImageDataUrl || inlineComposerMedia.dataUrl);
    if (!bodyRaw && !hasMedia) return;

    const { title, body } = postOwnership.deriveTopicTitleFromBody(bodyRaw || "");

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
        title: title || "",
        body: body || "",
      };
      if (inlineComposerMedia.type === "image" && (inlineComposerImageDataUrl || inlineComposerMedia.dataUrl)) {
        payload.image = inlineComposerImageDataUrl || inlineComposerMedia.dataUrl;
        payload.imageAlt = title || "Foto";
        payload.aspectRatio = inlineComposerAspectRatio || "original";
        if (inlineComposerPhotoTags.length > 0) {
          payload.photoTags = [...inlineComposerPhotoTags];
        }
      } else if (inlineComposerMedia.type === "audio" && inlineComposerMedia.dataUrl) {
        payload.audio = inlineComposerMedia.dataUrl;
      } else if (inlineComposerMedia.type === "video" && inlineComposerMedia.dataUrl) {
        payload.video = inlineComposerMedia.dataUrl;
      }

      const signed = await localAccount.signPayload(payload);
      await cacheNode.saveLocalPost(signed);
      if (payload.photoTags?.length) {
        photoTags.setLocalTags(signed.id, payload.photoTags);
      }

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
