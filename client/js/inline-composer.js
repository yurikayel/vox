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

let isInlineSubmitting = false;

function attachComposerMediaToPayload(payload) {
  const mtype = inlineComposerMedia.type;
  if (mtype === "image" && (inlineComposerImageDataUrl || inlineComposerMedia.dataUrl)) {
    payload.image = inlineComposerImageDataUrl || inlineComposerMedia.dataUrl;
    payload.imageAlt = payload.title || "Foto";
    payload.aspectRatio = inlineComposerAspectRatio || "original";
    if (inlineComposerPhotoTags.length > 0) {
      payload.photoTags = [...inlineComposerPhotoTags];
    }
  } else if (mtype === "audio" && inlineComposerMedia.dataUrl) {
    payload.audio = inlineComposerMedia.dataUrl;
  } else if (mtype === "video" && inlineComposerMedia.dataUrl) {
    payload.video = inlineComposerMedia.dataUrl;
  }
}

function buildInlineTopicPayload({ title, body, commSlug }) {
  const topicId = "top_" + Math.random().toString(36).slice(2, 10);
  const enrichment = localAccount.getProfileEnrichment();
  const myDisplayName = localAccount.getDisplayName() || enrichment?.displayName || "";
  const myAvatar = enrichment?.avatarUrl || "";
  const payload = {
    id: topicId,
    type: "topic",
    communityId: commSlug,
    title: title || "",
    body: body || "",
    authorDisplay: myDisplayName,
    authorAvatar: myAvatar,
  };
  attachComposerMediaToPayload(payload);
  return payload;
}

async function uploadTopicMediaToPermaweb(blob) {
  if (!blob?.dataUrl || !mediaBlob.isDataUrl(blob.dataUrl)) return null;
  const rawBytes = mediaBlob.dataUrlToUint8Array(blob.dataUrl);
  if (rawBytes.length > upload.FREE_TIER_MAX_BYTES) return null;

  const mediaTags = upload.buildTags("media", {
    "Content-Type": blob.mime || "image/webp",
    "Media-Type": blob.mime || "image/webp",
    "Blob-Hash": blob.hash,
    "Aspect-Ratio": inlineComposerAspectRatio || "original",
  });
  const mediaRes = await upload.postBinary(rawBytes, mediaTags);
  return mediaRes?.success ? mediaRes.id : null;
}

async function uploadTopicToPermaweb({ topicId, commSlug, title, body, blob }) {
  if (!wallet.hasWallet()) return null;
  try {
    const mediaTxId = await uploadTopicMediaToPermaweb(blob);
    const tags = upload.buildTags("topic", {
      "Community-Id": commSlug,
      "Topic-Title": title,
      Title: title,
      "Local-Origin-Id": topicId,
      ...(mediaTxId ? { "Media-Tx": mediaTxId, "Media-Type": blob?.mime || "image/webp", "Aspect-Ratio": inlineComposerAspectRatio || "original" } : {}),
    });
    return await upload.postData({
      title,
      body,
      communityId: commSlug,
      mediaTx: mediaTxId,
      aspectRatio: inlineComposerAspectRatio || "original",
    }, tags);
  } catch (err) {
    console.warn("Falha no upload Permaweb:", err);
    return null;
  }
}

function showPublishToast(permawebResult) {
  if (permawebResult?.success) {
    const badge = permawebResult.via === "turbo" ? "Turbo ⚡" : "Arweave";
    share.showToast(`Post publicado no P2P e gravado na Permaweb (${badge})!`);
  } else if (wallet.hasWallet()) {
    share.showToast("Post publicado no P2P local (Permaweb indisponível).", "warning");
  } else {
    share.showToast("Post publicado na rede P2P!");
  }
}

function formatRecordingTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s} / 01:00`;
}

function setupVoiceRecorderCallbacks(recorder, recordingChunks, onAudioReady) {
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recordingChunks.push(e.data);
  };
  recorder.onstop = () => {
    const type = recorder.mimeType || "audio/webm";
    const blob = new Blob(recordingChunks, { type });
    const reader = new FileReader();
    reader.onload = () => onAudioReady(reader.result, blob.size);
    reader.readAsDataURL(blob);
  };
}

function resetMediaDomElements() {
  const fileInput = document.getElementById("inline-topic-file");
  const audioInput = document.getElementById("inline-topic-audio");
  const videoInput = document.getElementById("inline-topic-video");
  const previewWrap = document.getElementById("inline-topic-preview-wrap");
  const previewImg = document.getElementById("inline-topic-preview");
  const previewAudio = document.getElementById("inline-topic-preview-audio");
  const previewAudioWrap = document.getElementById("inline-topic-preview-audio-wrap");
  const previewVideo = document.getElementById("inline-topic-preview-video");
  const previewVideoWrap = document.getElementById("inline-topic-preview-video-wrap");

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
}

function resetMediaControlBars() {
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
}

function clearMedia(state) {
  state.cleanupRecordingState();
  state.rawSourceFile = null;
  state.activeLofiFilter = "normal";
  inlineComposerAspectRatio = "original";
  inlineComposerPhotoTags = [];
  inlineComposerMedia = { type: "", dataUrl: "", byteLength: 0 };
  inlineComposerImageDataUrl = "";
  resetMediaDomElements();
  resetMediaControlBars();
}

function setupImagePreviewBars() {
  const previewImg = document.getElementById("inline-topic-preview");
  const previewWrap = document.getElementById("inline-topic-preview-wrap");
  const filterBar = document.getElementById("lofi-filter-bar");
  const aspectBar = document.getElementById("composer-aspect-bar");
  const tagBar = document.getElementById("composer-tag-bar");
  const tagsChips = document.getElementById("inline-composer-tags-chips");

  previewImg?.classList.remove("hidden");
  if (filterBar) filterBar.style.display = "flex";
  filterBar?.querySelectorAll(".lofi-filter-btn").forEach((b) => b.classList.toggle("active", b.dataset.filter === "normal"));
  if (aspectBar) aspectBar.style.display = "flex";
  aspectBar?.querySelectorAll(".composer-aspect-btn").forEach((b) => b.classList.toggle("active", b.dataset.aspect === "original"));
  if (tagBar) tagBar.style.display = "flex";
  if (tagsChips) tagsChips.innerHTML = "";
  previewImg?.classList.remove("composer-aspect-1-1", "composer-aspect-4-3", "composer-aspect-16-9");
  previewImg?.classList.add("composer-aspect-original");
  previewWrap?.classList.remove("hidden");
}

async function renderLofiPreview(state) {
  if (!state.rawSourceFile || inlineComposerMedia.type !== "image") return;
  const badge = document.getElementById("lofi-weight-badge");
  if (badge) badge.textContent = "⚡ Otimizando qualidade (~100 KB)…";
  const result = await composerMedia.processComposerLofiImage(state.rawSourceFile, {
    filter: state.activeLofiFilter,
    aspect: inlineComposerAspectRatio,
  });
  if (result.ok) {
    inlineComposerImageDataUrl = result.dataUrl;
    inlineComposerMedia.dataUrl = result.dataUrl;
    const previewImg = document.getElementById("inline-topic-preview");
    if (previewImg) previewImg.src = result.dataUrl;
    const kb = Math.max(1, Math.round((result.byteLength || 0) / 1024));
    const qPct = Math.round((result.qualityUsed || 0.8) * 100);
    if (badge) badge.textContent = `⚡ ~${kb} KB (${qPct}% qualidade · Permaweb Arweave)`;
  } else {
    share.showToast(result.message || "Erro no processamento da imagem", "error");
  }
}

function handleVoiceAudioReady(dataUrl, byteSize, state) {
  const kb = Math.max(1, Math.round(byteSize / 1024));
  inlineComposerMedia = { type: "audio", dataUrl, byteLength: byteSize };
  const previewAudio = document.getElementById("inline-topic-preview-audio");
  const previewAudioWrap = document.getElementById("inline-topic-preview-audio-wrap");
  const previewWrap = document.getElementById("inline-topic-preview-wrap");
  if (previewAudio) previewAudio.src = dataUrl;
  previewAudioWrap?.classList.remove("hidden");
  const filterBar = document.getElementById("lofi-filter-bar");
  if (filterBar) filterBar.style.display = "none";
  const badge = document.getElementById("lofi-weight-badge");
  if (badge) badge.textContent = `⚡ ~${kb} KB (Voz Gravada Lo-Fi ${kb <= 99 ? "100% Grátis" : "48k"})`;
  previewWrap?.classList.remove("hidden");
  state.cleanupRecordingState();
  syncInlineComposerUi();
}

function startVoiceRecording(state) {
  if (!navigator?.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    share.showToast("Gravação de voz não suportada neste ambiente.", "error");
    return;
  }
  clearMedia(state);
  navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
    state.activeStream = stream;
    state.recordingChunks = [];
    state.recordingSeconds = 0;
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
    const options = mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : {};
    const recorder = new MediaRecorder(stream, options);
    state.activeRecorder = recorder;
    setupVoiceRecorderCallbacks(recorder, state.recordingChunks, (url, sz) => handleVoiceAudioReady(url, sz, state));
    recorder.start(500);
    state.startTimer();
  }).catch((err) => {
    state.cleanupRecordingState();
    share.showToast(`Erro ao acessar microfone: ${err.message}`, "error");
  });
}

function bindVoiceButtons(state) {
  document.getElementById("btn-inline-mic")?.addEventListener("click", (e) => {
    e.preventDefault();
    startVoiceRecording(state);
  });
  document.getElementById("btn-inline-stop-rec")?.addEventListener("click", (e) => {
    e.preventDefault();
    state.stopVoiceRecording();
  });
  document.getElementById("btn-inline-cancel-rec")?.addEventListener("click", (e) => {
    e.preventDefault();
    state.cancelVoiceRecording();
  });
}

function bindImageFileInput(state) {
  const fileInput = document.getElementById("inline-topic-file");
  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const check = composerMedia.validateComposerImageFile(file);
    if (!check.ok) { share.showToast(check.message, "error"); clearMedia(state); return; }
    clearMedia(state);
    state.rawSourceFile = file;
    inlineComposerMedia = { type: "image", dataUrl: "", byteLength: file.size };
    state.activeLofiFilter = "normal";
    inlineComposerAspectRatio = "original";
    inlineComposerPhotoTags = [];
    setupImagePreviewBars();
    await renderLofiPreview(state);
    syncInlineComposerUi();
  });
}

function bindAudioFileInput(state) {
  const audioInput = document.getElementById("inline-topic-audio");
  audioInput?.addEventListener("change", async () => {
    const file = audioInput.files?.[0];
    if (!file) return;
    const check = composerMedia.validateComposerAudioFile(file);
    if (!check.ok) { share.showToast(check.message, "error"); clearMedia(state); return; }
    clearMedia(state);
    state.rawSourceFile = file;
    const dataUrl = await composerMedia.readComposerMediaFile(file);
    const kb = Math.max(1, Math.round(file.size / 1024));
    inlineComposerMedia = { type: "audio", dataUrl, byteLength: file.size };
    const previewAudio = document.getElementById("inline-topic-preview-audio");
    if (previewAudio) previewAudio.src = dataUrl;
    document.getElementById("inline-topic-preview-audio-wrap")?.classList.remove("hidden");
    const fb = document.getElementById("lofi-filter-bar");
    if (fb) fb.style.display = "none";
    const bg = document.getElementById("lofi-weight-badge");
    if (bg) bg.textContent = `⚡ ~${kb} KB (Áudio Lo-Fi ${kb <= 99 ? "100% Grátis" : "48k"})`;
    document.getElementById("inline-topic-preview-wrap")?.classList.remove("hidden");
    syncInlineComposerUi();
  });
}

function bindVideoFileInput(state) {
  const videoInput = document.getElementById("inline-topic-video");
  videoInput?.addEventListener("change", async () => {
    const file = videoInput.files?.[0];
    if (!file) return;
    const check = composerMedia.validateComposerVideoFile(file);
    if (!check.ok) { share.showToast(check.message, "error"); clearMedia(state); return; }
    clearMedia(state);
    state.rawSourceFile = file;
    const dataUrl = await composerMedia.readComposerMediaFile(file);
    const kb = Math.max(1, Math.round(file.size / 1024));
    inlineComposerMedia = { type: "video", dataUrl, byteLength: file.size };
    const previewVideo = document.getElementById("inline-topic-preview-video");
    if (previewVideo) previewVideo.src = dataUrl;
    document.getElementById("inline-topic-preview-video-wrap")?.classList.remove("hidden");
    const fb = document.getElementById("lofi-filter-bar");
    if (fb) fb.style.display = "none";
    const bg = document.getElementById("lofi-weight-badge");
    if (bg) bg.textContent = `⚡ ~${kb} KB (Vídeo Lo-Fi 360p)`;
    document.getElementById("inline-topic-preview-wrap")?.classList.remove("hidden");
    syncInlineComposerUi();
  });
}

function bindMediaFileInputs(state) {
  bindImageFileInput(state);
  bindAudioFileInput(state);
  bindVideoFileInput(state);
}

function bindFilterAndAspectBars(state) {
  const filterBar = document.getElementById("lofi-filter-bar");
  filterBar?.addEventListener("click", async (e) => {
    const btn = e.target.closest(".lofi-filter-btn");
    if (!btn || !state.rawSourceFile || inlineComposerMedia.type !== "image") return;
    e.preventDefault();
    filterBar.querySelectorAll(".lofi-filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.activeLofiFilter = btn.dataset.filter || "normal";
    await renderLofiPreview(state);
  });

  const aspectBar = document.getElementById("composer-aspect-bar");
  aspectBar?.addEventListener("click", async (e) => {
    const btn = e.target.closest(".composer-aspect-btn");
    if (!btn || inlineComposerMedia.type !== "image") return;
    e.preventDefault();
    aspectBar.querySelectorAll(".composer-aspect-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    inlineComposerAspectRatio = btn.dataset.aspect || "original";
    const previewImg = document.getElementById("inline-topic-preview");
    if (previewImg) {
      previewImg.classList.remove("composer-aspect-original", "composer-aspect-16-9", "composer-aspect-9-16", "composer-aspect-4-3", "composer-aspect-3-4", "composer-aspect-1-1");
      previewImg.classList.add(`composer-aspect-${inlineComposerAspectRatio.replace(":", "-")}`);
    }
    await renderLofiPreview(state);
  });
}

function bindPhotoTagging() {
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
}

function cleanupRecordingState(state) {
  if (state.recordingTimer) { clearInterval(state.recordingTimer); state.recordingTimer = null; }
  if (state.activeStream) { state.activeStream.getTracks().forEach((t) => t.stop()); state.activeStream = null; }
  state.activeRecorder = null;
  state.recordingChunks = [];
  state.recordingSeconds = 0;
  document.getElementById("inline-recording-indicator")?.classList.add("hidden");
}

function startRecordingTimer(state) {
  const indicator = document.getElementById("inline-recording-indicator");
  const timerEl = document.getElementById("inline-recording-timer");
  if (indicator) indicator.classList.remove("hidden");
  if (timerEl) timerEl.textContent = "00:00 / 01:00";
  state.recordingTimer = setInterval(() => {
    state.recordingSeconds++;
    if (timerEl) timerEl.textContent = formatRecordingTime(state.recordingSeconds);
    if (state.recordingSeconds >= 60) state.stopVoiceRecording();
  }, 1000);
}

function stopVoiceRecording(state) {
  if (state.activeRecorder?.state === "recording") state.activeRecorder.stop();
  if (state.recordingTimer) { clearInterval(state.recordingTimer); state.recordingTimer = null; }
}

function cancelVoiceRecording(state) {
  if (state.activeRecorder?.state === "recording") {
    state.activeRecorder.ondataavailable = null;
    state.activeRecorder.onstop = null;
    try { state.activeRecorder.stop(); } catch {}
  }
  cleanupRecordingState(state);
  share.showToast("Gravação cancelada.");
}

function createComposerControllerState() {
  const state = {
    rawSourceFile: null,
    activeLofiFilter: "normal",
    activeStream: null,
    activeRecorder: null,
    recordingChunks: [],
    recordingTimer: null,
    recordingSeconds: 0,
    cleanupRecordingState: () => cleanupRecordingState(state),
    startTimer: () => startRecordingTimer(state),
    stopVoiceRecording: () => stopVoiceRecording(state),
    cancelVoiceRecording: () => cancelVoiceRecording(state),
  };
  return state;
}

async function executeInlinePublish(form, onPublished, state) {
  const bodyRaw = document.getElementById("inline-topic-body")?.value?.trim() || "";
  const commSlug = document.getElementById("inline-topic-comm")?.value?.trim().toLowerCase() || "geral";
  const hasMedia = Boolean(inlineComposerImageDataUrl || inlineComposerMedia.dataUrl);
  if (!bodyRaw && !hasMedia) return;

  const { title, body } = postOwnership.deriveTopicTitleFromBody(bodyRaw || "");
  const payload = buildInlineTopicPayload({ title, body, commSlug });
  const signed = await localAccount.signPayload(payload);
  await cacheNode.saveLocalPost(signed);
  if (payload.photoTags?.length) photoTags.setLocalTags(signed.id, payload.photoTags);

  const { detachedPost, mediaBlob: blob } = await mediaBlob.detachMedia(signed);
  if (blob) await mediaBlob.defaultBlobStorage.put(blob);
  peers.broadcastGossip(detachedPost);

  const permawebResult = await uploadTopicToPermaweb({ topicId: payload.id, commSlug, title, body, blob });
  form.reset();
  clearMedia(state);
  syncInlineComposerUi();
  collapseInlineComposer();
  showPublishToast(permawebResult);
  if (typeof onPublished === "function") onPublished(signed);
  else location.reload();
}

function bindFormSubmit(form, onPublished, state) {
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isInlineSubmitting) return;
    const btn = document.getElementById("btn-inline-submit");
    isInlineSubmitting = true;
    if (btn) { btn.disabled = true; btn.textContent = "Publicando…"; }
    try {
      await executeInlinePublish(form, onPublished, state);
    } catch (err) {
      share.showToast(`Erro ao publicar: ${err.message}`, "error");
    } finally {
      isInlineSubmitting = false;
      if (btn) { btn.disabled = false; btn.textContent = "Postar"; }
    }
  });
}

export function attachInlineComposerHandlers(onPublished) {
  const root = document.getElementById("feed-inline-composer");
  if (!root) return;

  const collapsed = root.querySelector(".inline-composer-collapsed");
  const form = document.getElementById("form-inline-topic");
  const removeBtn = document.getElementById("btn-inline-remove-img");
  const textarea = document.getElementById("inline-topic-body");
  const state = createComposerControllerState();

  collapsed?.addEventListener("click", () => expandInlineComposer());
  collapsed?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); expandInlineComposer(); }
  });
  removeBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    clearMedia(state);
    syncInlineComposerUi();
  });
  textarea?.addEventListener("input", syncInlineComposerUi);
  form?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); form.reset(); clearMedia(state); syncInlineComposerUi(); collapseInlineComposer(); }
  });

  bindVoiceButtons(state);
  bindMediaFileInputs(state);
  bindFilterAndAspectBars(state);
  bindPhotoTagging();
  bindFormSubmit(form, onPublished, state);
}
