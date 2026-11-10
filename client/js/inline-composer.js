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
import * as permanence from "./permanence-notice.js";
import { attachPowIfWanted } from "./new-key-guard.js";
import { assertCanPostTopic } from "./app/community-channel-flow.js";

let inlineComposerImageDataUrl = "";
let inlineComposerMedia = { type: "", dataUrl: "", byteLength: 0 };
let inlineComposerAspectRatio = "original";
let inlineComposerPhotoTags = [];

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
  const echoBtn = document.getElementById("btn-inline-echo");
  if (echoBtn) echoBtn.disabled = !hasContent;
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
  if (!(await permanence.confirmPermanentPublish())) return permanence.MESH_ONLY_RESULT;
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
  } else if (permawebResult?.skipped === permanence.CHOICE_MESH) {
    share.showToast("Post publicado só na malha P2P (não permanente).");
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

/**
 * A prévia usa o atributo `hidden` **e** a classe `.hidden` na marcação; alternar só a classe
 * deixava a miniatura do anexo invisível. Este helper mantém os dois em sincronia.
 */
function setPreviewVisible(el, visible) {
  if (!el) return;
  el.classList.toggle("hidden", !visible);
  el.hidden = !visible;
}

function formatAttachmentSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

const ATTACHMENT_ICONS = { image: "🖼️", audio: "🎵", voice: "🎙️", video: "🎬" };

/** Linha "ícone · nome · tamanho" do anexo atual, abaixo da miniatura. */
function setAttachmentMeta(kind, name, bytes) {
  const el = document.getElementById("inline-topic-attach-meta");
  if (!el) return;
  if (!kind) {
    el.textContent = "";
    setPreviewVisible(el, false);
    return;
  }
  el.textContent = `${ATTACHMENT_ICONS[kind] || "📎"} ${name || "Anexo"} · ${formatAttachmentSize(bytes)}`;
  setPreviewVisible(el, true);
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
  setPreviewVisible(previewWrap, false);
  if (previewImg) {
    previewImg.removeAttribute("src");
    setPreviewVisible(previewImg, false);
    previewImg.classList.remove("composer-aspect-1-1", "composer-aspect-4-3", "composer-aspect-16-9");
    previewImg.classList.add("composer-aspect-original");
  }
  if (previewAudio) previewAudio.removeAttribute("src");
  setPreviewVisible(previewAudioWrap, false);
  if (previewVideo) previewVideo.removeAttribute("src");
  setPreviewVisible(previewVideoWrap, false);
  setAttachmentMeta("", "", 0);
  if (previewWrap) previewWrap.dataset.open = "";
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
  const previewAudioWrap = document.getElementById("inline-topic-preview-audio-wrap");
  const previewVideoWrap = document.getElementById("inline-topic-preview-video-wrap");
  const filterBar = document.getElementById("lofi-filter-bar");
  const aspectBar = document.getElementById("composer-aspect-bar");
  const tagBar = document.getElementById("composer-tag-bar");
  const tagsChips = document.getElementById("inline-composer-tags-chips");

  setPreviewVisible(previewImg, true);
  setPreviewVisible(previewAudioWrap, false);
  setPreviewVisible(previewVideoWrap, false);
  if (filterBar) filterBar.style.display = "flex";
  filterBar?.querySelectorAll(".lofi-filter-btn").forEach((b) => b.classList.toggle("active", b.dataset.filter === "normal"));
  if (aspectBar) aspectBar.style.display = "flex";
  aspectBar?.querySelectorAll(".composer-aspect-btn").forEach((b) => b.classList.toggle("active", b.dataset.aspect === "original"));
  if (tagBar) tagBar.style.display = "flex";
  if (tagsChips) tagsChips.innerHTML = "";
  previewImg?.classList.remove("composer-aspect-1-1", "composer-aspect-4-3", "composer-aspect-16-9");
  previewImg?.classList.add("composer-aspect-original");
  setPreviewVisible(previewWrap, true);
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
  setAttachmentMeta("voice", "Recado de voz", byteSize);
  const previewAudio = document.getElementById("inline-topic-preview-audio");
  const previewAudioWrap = document.getElementById("inline-topic-preview-audio-wrap");
  const previewVideoWrap = document.getElementById("inline-topic-preview-video-wrap");
  const previewImg = document.getElementById("inline-topic-preview");
  const previewWrap = document.getElementById("inline-topic-preview-wrap");
  if (previewAudio) previewAudio.src = dataUrl;
  setPreviewVisible(previewAudioWrap, true);
  setPreviewVisible(previewImg, false);
  setPreviewVisible(previewVideoWrap, false);
  const filterBar = document.getElementById("lofi-filter-bar");
  if (filterBar) filterBar.style.display = "none";
  const aspectBar = document.getElementById("composer-aspect-bar");
  if (aspectBar) aspectBar.style.display = "none";
  const tagBar = document.getElementById("composer-tag-bar");
  if (tagBar) tagBar.style.display = "none";
  const badge = document.getElementById("lofi-weight-badge");
  if (badge) badge.textContent = `⚡ ~${kb} KB (Voz Gravada Lo-Fi ${kb <= 99 ? "100% Grátis" : "48k"})`;
  setPreviewVisible(previewWrap, true);
  state.cleanupRecordingState();
  syncInlineComposerUi();
}

function startVoiceRecording(state) {
  if (state.isRecording) {
    state.stopVoiceRecording();
    return;
  }
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
    if (state.isRecording) {
      state.stopVoiceRecording();
    } else {
      startVoiceRecording(state);
    }
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
    setAttachmentMeta("image", file.name, file.size);
    await renderLofiPreview(state);
    syncInlineComposerUi();
  });
}

function hideComposerImageOptionBars() {
  const fb = document.getElementById("lofi-filter-bar");
  if (fb) fb.style.display = "none";
  const ab = document.getElementById("composer-aspect-bar");
  if (ab) ab.style.display = "none";
  const tb = document.getElementById("composer-tag-bar");
  if (tb) tb.style.display = "none";
}

function updateComposerMediaPreview(type, dataUrl, weightLabel) {
  const isAudio = type === "audio";
  const mediaEl = document.getElementById(isAudio ? "inline-topic-preview-audio" : "inline-topic-preview-video");
  const wrap = document.getElementById(isAudio ? "inline-topic-preview-audio-wrap" : "inline-topic-preview-video-wrap");
  const otherWrap = document.getElementById(isAudio ? "inline-topic-preview-video-wrap" : "inline-topic-preview-audio-wrap");
  const previewImg = document.getElementById("inline-topic-preview");
  if (mediaEl) mediaEl.src = dataUrl;
  setPreviewVisible(wrap, true);
  setPreviewVisible(previewImg, false);
  setPreviewVisible(otherWrap, false);
  hideComposerImageOptionBars();
  const bg = document.getElementById("lofi-weight-badge");
  if (bg) bg.textContent = weightLabel;
  setPreviewVisible(document.getElementById("inline-topic-preview-wrap"), true);
  syncInlineComposerUi();
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
    setAttachmentMeta("audio", file.name, file.size);
    updateComposerMediaPreview("audio", dataUrl, `⚡ ~${kb} KB (Áudio Lo-Fi ${kb <= 99 ? "100% Grátis" : "48k"})`);
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
    setAttachmentMeta("video", file.name, file.size);
    updateComposerMediaPreview("video", dataUrl, `⚡ ~${kb} KB (Vídeo Lo-Fi 360p)`);
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

function resetMicToggleUi() {
  const toolsBar = document.querySelector(".inline-composer-tools");
  toolsBar?.classList.remove("is-recording-mode");
  const micBtn = document.getElementById("btn-inline-mic");
  if (micBtn) {
    micBtn.classList.remove("is-recording");
    micBtn.setAttribute("aria-pressed", "false");
    micBtn.setAttribute("title", "Gravar voz pelo microfone (até 60s)");
    micBtn.setAttribute("aria-label", "Gravar voz pelo microfone (até 60s)");
  }
  document.getElementById("btn-inline-cancel-rec")?.classList.add("hidden");
  const timerEl = document.getElementById("inline-recording-timer");
  if (timerEl) timerEl.textContent = "00:00 / 01:00";
}

function setMicRecordingUi() {
  const toolsBar = document.querySelector(".inline-composer-tools");
  toolsBar?.classList.add("is-recording-mode");
  const micBtn = document.getElementById("btn-inline-mic");
  if (micBtn) {
    micBtn.classList.add("is-recording");
    micBtn.setAttribute("aria-pressed", "true");
    micBtn.setAttribute("title", "Gravando... Toque para concluir gravação");
    micBtn.setAttribute("aria-label", "Gravando voz. Toque para concluir a gravação.");
  }
  document.getElementById("btn-inline-cancel-rec")?.classList.remove("hidden");
  const timerEl = document.getElementById("inline-recording-timer");
  if (timerEl) timerEl.textContent = "00:00 / 01:00";
}

function cleanupRecordingState(state) {
  if (state.recordingTimer) { clearInterval(state.recordingTimer); state.recordingTimer = null; }
  if (state.activeStream) { state.activeStream.getTracks().forEach((t) => t.stop()); state.activeStream = null; }
  state.activeRecorder = null;
  state.recordingChunks = [];
  state.recordingSeconds = 0;
  state.isRecording = false;
  resetMicToggleUi();
}

function startRecordingTimer(state) {
  state.isRecording = true;
  setMicRecordingUi();
  const timerEl = document.getElementById("inline-recording-timer");
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
    isRecording: false,
    cleanupRecordingState: () => cleanupRecordingState(state),
    startTimer: () => startRecordingTimer(state),
    stopVoiceRecording: () => stopVoiceRecording(state),
    cancelVoiceRecording: () => cancelVoiceRecording(state),
  };
  return state;
}

export async function broadcastAndPersistInlineTopic(payload, title, body, commSlug) {
  // LAN-14: comunidade com quarentena de chave nova recebe o post com PoW leve.
  const community = (await cacheNode.getLocalCommunities()).find((c) => c.id === commSlug);
  await attachPowIfWanted(payload, community, await localAccount.getRouteId());
  // PM-87: a mídia sai antes da assinatura; o post assinado leva `mediaHash` e o blob viaja ao lado.
  const { detachedPost, mediaBlob: blob } = await mediaBlob.detachMedia(payload);
  const signed = await localAccount.signPayload(detachedPost);
  if (blob) await mediaBlob.defaultBlobStorage.put(blob);
  await cacheNode.saveLocalPost(mediaBlob.withLocalMedia(signed, blob));
  if (payload.photoTags?.length) photoTags.setLocalTags(signed.id, payload.photoTags);
  peers.broadcastGossip(signed, blob);
  const permaResult = await uploadTopicToPermaweb({ topicId: payload.id, commSlug, title, body, blob });
  return { signed, permaResult };
}

async function executeInlinePublish(form, onPublished, state, shouldEcho = false) {
  const bodyRaw = document.getElementById("inline-topic-body")?.value?.trim() || "";
  const commSlug = document.getElementById("inline-topic-comm")?.value?.trim().toLowerCase() || "geral";
  const hasMedia = Boolean(inlineComposerImageDataUrl || inlineComposerMedia.dataUrl);
  if (!bodyRaw && !hasMedia) return;
  if (!(await assertCanPostTopic(commSlug))) return;

  const { title, body } = postOwnership.deriveTopicTitleFromBody(bodyRaw || "");
  const payload = buildInlineTopicPayload({ title, body, commSlug });
  const { signed, permaResult } = await broadcastAndPersistInlineTopic(payload, title, body, commSlug);

  form.reset();
  clearMedia(state);
  syncInlineComposerUi();
  collapseInlineComposer();
  showPublishToast(permaResult);
  if (typeof onPublished === "function") await onPublished(signed);
  else location.reload();

  if (shouldEcho) {
    const { openExplodeSheet } = await import("./explode-dispatch.js");
    openExplodeSheet(signed);
  }
}

const SUBMIT_BUTTON_LABELS = { "btn-inline-submit": "Postar", "btn-inline-echo": "🚀 Postar & Ecoar" };

function updateSubmitButtonsState(isSubmitting) {
  for (const [id, idleLabel] of Object.entries(SUBMIT_BUTTON_LABELS)) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    btn.disabled = isSubmitting;
    btn.textContent = isSubmitting ? "Publicando…" : idleLabel;
  }
}

function bindFormSubmit(form, onPublished, state) {
  let shouldEchoNext = false;
  document.getElementById("btn-inline-echo")?.addEventListener("click", () => {
    shouldEchoNext = true;
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isInlineSubmitting) return;
    const isEcho = shouldEchoNext;
    shouldEchoNext = false;
    isInlineSubmitting = true;
    updateSubmitButtonsState(true);
    try {
      await executeInlinePublish(form, onPublished, state, isEcho);
    } catch (err) {
      share.showToast(`Erro ao publicar: ${err.message}`, "error");
    } finally {
      isInlineSubmitting = false;
      updateSubmitButtonsState(false);
    }
  });
}

/**
 * Painel do anexo organizado: Estilo e Proporção ficam recolhidos e abrem (um por vez) pelos
 * botões da linha de edição — antes as duas barras ficavam sempre abertas.
 */
function bindEditPanels(root) {
  const wrap = root.querySelector("#inline-topic-preview-wrap");
  root.querySelectorAll(".composer-edit-btn[data-edit-panel]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const panel = btn.dataset.editPanel;
      const open = wrap?.dataset.open === panel ? "" : panel;
      if (wrap) wrap.dataset.open = open;
      root.querySelectorAll(".composer-edit-btn[data-edit-panel]").forEach((b) => b.setAttribute("aria-expanded", String(b.dataset.editPanel === open)));
    });
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

  bindEditPanels(root);
  bindVoiceButtons(state);
  bindMediaFileInputs(state);
  bindFilterAndAspectBars(state);
  bindPhotoTagging();
  bindFormSubmit(form, onPublished, state);
}
