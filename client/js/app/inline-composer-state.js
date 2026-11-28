/**
 * @file Estado e controles de visualização/DOM do compositor inline.
 */
import * as cacheNode from "../cache-node.js";

/**
 * DataURL da imagem selecionada no compositor inline.
 * @type {string}
 */
export let inlineComposerImageDataUrl = "";

/**
 * Mídia ativa (tipo, dataUrl e tamanho) no compositor inline.
 * @type {{ type: string, dataUrl: string, byteLength: number }}
 */
export let inlineComposerMedia = { type: "", dataUrl: "", byteLength: 0 };

/**
 * Proporção de aspecto selecionada para a foto no compositor inline.
 * @type {string}
 */
export let inlineComposerAspectRatio = "original";

/**
 * Lista de tags de pessoas associadas à foto no compositor inline.
 * @type {Array<object>}
 */
export let inlineComposerPhotoTags = [];

/**
 * Define o dataUrl da imagem do compositor inline.
 * @param {string} val DataURL da imagem.
 * @returns {void}
 */
export function setComposerImageDataUrl(val) {
  inlineComposerImageDataUrl = val;
}

/**
 * Define o objeto de mídia ativa do compositor inline.
 * @param {{ type: string, dataUrl: string, byteLength: number }} val Dados da mídia.
 * @returns {void}
 */
export function setComposerMedia(val) {
  inlineComposerMedia = val;
}

/**
 * Define a proporção (aspect ratio) da foto no compositor inline.
 * @param {string} val Proporção (ex.: "original", "1:1", "16:9").
 * @returns {void}
 */
export function setComposerAspectRatio(val) {
  inlineComposerAspectRatio = val;
}

/**
 * Define a lista de tags de foto do compositor inline.
 * @param {Array<object>} val Lista de tags.
 * @returns {void}
 */
export function setComposerPhotoTags(val) {
  inlineComposerPhotoTags = val;
}

/**
 * Mantém a visibilidade e o atributo hidden de elementos de prévia em sincronia.
 * @param {HTMLElement|null} el Elemento alvo.
 * @param {boolean} visible Se deve ficar visível.
 * @returns {void}
 */
export function setPreviewVisible(el, visible) {
  if (!el) return;
  el.classList.toggle("hidden", !visible);
  el.hidden = !visible;
}

/**
 * Marca qual botão de uma barra de escolha está ligado: a classe `active` (visual) e `aria-pressed` (leitor de tela).
 * @param {Iterable<HTMLElement>} buttons Botões da barra.
 * @param {(btn: HTMLElement) => boolean} isOn Diz se o botão é o escolhido.
 * @returns {void}
 */
export function markChoice(buttons, isOn) {
  for (const b of buttons) {
    const on = isOn(b);
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on));
  }
}

/**
 * Formata tamanho em bytes para KB ou MB.
 * @param {number} bytes Quantidade de bytes.
 * @returns {string} Texto formatado com unidade.
 */
export function formatAttachmentSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

const ATTACHMENT_ICONS = { image: "🖼️", audio: "🎵", voice: "🎙️", video: "🎬" };

/**
 * Atualiza linha de metadados do anexo atual abaixo da miniatura.
 * @param {string} kind Tipo do anexo ("image", "audio", "voice", "video" ou vazio).
 * @param {string} name Nome do anexo.
 * @param {number} bytes Tamanho em bytes.
 * @returns {void}
 */
export function setAttachmentMeta(kind, name, bytes) {
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

/**
 * Reseta elementos de input e elementos de prévia de mídia no DOM.
 * @returns {void}
 */
export function resetMediaDomElements() {
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

/**
 * Restaura o estado padrão das barras de controle de mídia e filtros.
 * @returns {void}
 */
export function resetMediaControlBars() {
  const filterBar = document.getElementById("lofi-filter-bar");
  if (filterBar) filterBar.style.display = "flex";
  const aspectBar = document.getElementById("composer-aspect-bar");
  if (aspectBar) aspectBar.style.display = "none";
  const tagBar = document.getElementById("composer-tag-bar");
  if (tagBar) tagBar.style.display = "none";
  const tagsChips = document.getElementById("inline-composer-tags-chips");
  if (tagsChips) tagsChips.innerHTML = "";
  const badge = document.getElementById("lofi-weight-badge");
  if (badge) badge.textContent = "⚡ ~45 KB (mídia leve para a malha)";
}

/**
 * Limpa toda a mídia anexada e reseta controles visuais e de gravação.
 * @param {object} [state] Estado do controlador de gravação/mídia.
 * @returns {void}
 */
export function clearMedia(state) {
  state?.cleanupRecordingState?.();
  if (state) {
    state.rawSourceFile = null;
    state.activeLofiFilter = "normal";
  }
  inlineComposerAspectRatio = "original";
  inlineComposerPhotoTags = [];
  inlineComposerMedia = { type: "", dataUrl: "", byteLength: 0 };
  inlineComposerImageDataUrl = "";
  resetMediaDomElements();
  resetMediaControlBars();
}

/**
 * Configura as barras de filtro, aspecto e tags para a prévia de imagem.
 * @returns {void}
 */
export function setupImagePreviewBars() {
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
  if (filterBar) markChoice(filterBar.querySelectorAll(".lofi-filter-btn"), (b) => b.dataset.filter === "normal");
  if (aspectBar) aspectBar.style.display = "flex";
  if (aspectBar) markChoice(aspectBar.querySelectorAll(".composer-aspect-btn"), (b) => b.dataset.aspect === "original");
  if (tagBar) tagBar.style.display = "flex";
  if (tagsChips) tagsChips.innerHTML = "";
  previewImg?.classList.remove("composer-aspect-1-1", "composer-aspect-4-3", "composer-aspect-16-9");
  previewImg?.classList.add("composer-aspect-original");
  setPreviewVisible(previewWrap, true);
}

/**
 * Oculta barras de opções exclusivas de imagem.
 * @returns {void}
 */
export function hideComposerImageOptionBars() {
  const fb = document.getElementById("lofi-filter-bar");
  if (fb) fb.style.display = "none";
  const ab = document.getElementById("composer-aspect-bar");
  if (ab) ab.style.display = "none";
  const tb = document.getElementById("composer-tag-bar");
  if (tb) tb.style.display = "none";
}

/**
 * Atualiza contadores e estado do botão publicar do compositor inline.
 * @returns {void}
 */
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

/**
 * Atualiza elementos de prévia para áudio ou vídeo.
 * @param {"audio"|"video"} type Tipo da mídia.
 * @param {string} dataUrl Conteúdo em formato dataURL.
 * @param {string} weightLabel Texto do badge de peso estimado.
 * @returns {void}
 */
export function updateComposerMediaPreview(type, dataUrl, weightLabel) {
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

/**
 * Recolhe o compositor inline e limpa mídia temporária.
 * @returns {void}
 */
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

/**
 * Preenche o datalist de comunidades do compositor inline com ids locais conhecidos.
 * @returns {Promise<void>}
 */
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

/**
 * Expande o compositor inline e foca o campo de texto.
 * @returns {void}
 */
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
