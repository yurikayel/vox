/**
 * @file Prévia de mídia Lo-Fi, seleção de aspecto e inputs de arquivos do compositor inline.
 */
import * as composerMedia from "../composer-media.js";
import * as share from "../share.js";
import {
  inlineComposerMedia,
  inlineComposerAspectRatio,
  setComposerMedia,
  setComposerImageDataUrl,
  setComposerAspectRatio,
  setComposerPhotoTags,
  clearMedia,
  setupImagePreviewBars,
  setAttachmentMeta,
  updateComposerMediaPreview,
  syncInlineComposerUi,
} from "./inline-composer-state.js";

/**
 * Renderiza a prévia de imagem Lo-Fi aplicando filtro e proporção ativos.
 * @param {object} state Estado do controlador.
 * @returns {Promise<void>}
 */
export async function renderLofiPreview(state) {
  if (!state.rawSourceFile || inlineComposerMedia.type !== "image") return;
  const badge = document.getElementById("lofi-weight-badge");
  if (badge) badge.textContent = "⚡ Otimizando qualidade (~100 KB)…";
  const result = await composerMedia.processComposerLofiImage(state.rawSourceFile, {
    filter: state.activeLofiFilter,
    aspect: inlineComposerAspectRatio,
  });
  if (result.ok) {
    setComposerImageDataUrl(result.dataUrl);
    setComposerMedia({ ...inlineComposerMedia, dataUrl: result.dataUrl });
    const previewImg = document.getElementById("inline-topic-preview");
    if (previewImg) previewImg.src = result.dataUrl;
    const kb = Math.max(1, Math.round((result.byteLength || 0) / 1024));
    const qPct = Math.round((result.qualityUsed || 0.8) * 100);
    if (badge) badge.textContent = `⚡ ~${kb} KB (${qPct}% qualidade · mídia leve para a malha)`;
  } else {
    share.showToast(result.message || "Erro no processamento da imagem", "error");
  }
}

/**
 * Conecta o input de seleção de foto e processa com validação Lo-Fi.
 * @param {object} state Estado do controlador.
 * @returns {void}
 */
export function bindImageFileInput(state) {
  const fileInput = document.getElementById("inline-topic-file");
  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const check = composerMedia.validateComposerImageFile(file);
    if (!check.ok) { share.showToast(check.message, "error"); clearMedia(state); return; }
    clearMedia(state);
    state.rawSourceFile = file;
    setComposerMedia({ type: "image", dataUrl: "", byteLength: file.size });
    state.activeLofiFilter = "normal";
    setComposerAspectRatio("original");
    setComposerPhotoTags([]);
    setupImagePreviewBars();
    setAttachmentMeta("image", file.name, file.size);
    await renderLofiPreview(state);
    syncInlineComposerUi();
  });
}

/**
 * Conecta o input de seleção de áudio e atualiza a prévia.
 * @param {object} state Estado do controlador.
 * @returns {void}
 */
export function bindAudioFileInput(state) {
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
    setComposerMedia({ type: "audio", dataUrl, byteLength: file.size });
    setAttachmentMeta("audio", file.name, file.size);
    updateComposerMediaPreview("audio", dataUrl, `⚡ ~${kb} KB (Áudio Lo-Fi 48k · malha)`);
  });
}

/**
 * Conecta o input de seleção de vídeo e atualiza a prévia.
 * @param {object} state Estado do controlador.
 * @returns {void}
 */
export function bindVideoFileInput(state) {
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
    setComposerMedia({ type: "video", dataUrl, byteLength: file.size });
    setAttachmentMeta("video", file.name, file.size);
    updateComposerMediaPreview("video", dataUrl, `⚡ ~${kb} KB (Vídeo Lo-Fi 360p)`);
  });
}

/**
 * Conecta todos os inputs de mídia (imagem, áudio e vídeo).
 * @param {object} state Estado do controlador.
 * @returns {void}
 */
export function bindMediaFileInputs(state) {
  bindImageFileInput(state);
  bindAudioFileInput(state);
  bindVideoFileInput(state);
}

/**
 * Conecta as barras de clique para troca de filtros Lo-Fi e proporções de foto.
 * @param {object} state Estado do controlador.
 * @returns {void}
 */
export function bindFilterAndAspectBars(state) {
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
    setComposerAspectRatio(btn.dataset.aspect || "original");
    const previewImg = document.getElementById("inline-topic-preview");
    if (previewImg) {
      previewImg.classList.remove("composer-aspect-original", "composer-aspect-16-9", "composer-aspect-9-16", "composer-aspect-4-3", "composer-aspect-3-4", "composer-aspect-1-1");
      previewImg.classList.add(`composer-aspect-${inlineComposerAspectRatio.replace(":", "-")}`);
    }
    await renderLofiPreview(state);
  });
}

/**
 * Painel do anexo organizado: Estilo e Proporção recolhidos que abrem pelos botões.
 * @param {HTMLElement} root Elemento raiz do compositor inline.
 * @returns {void}
 */
export function bindEditPanels(root) {
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
