/**
 * @file Cobertura de `app/inline-composer-media.js` (lote T4): inputs de foto/áudio/vídeo, filtros e painéis.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { FakeEl, installFakeDocument } from "./helpers/cov-t4-dom.mjs";
import { installFakeFileReader, installFakeImage, makeFakeCanvas } from "./helpers/cov-t4-media-env.mjs";

const media = await import("../client/js/app/inline-composer-media.js");
const st = await import("../client/js/app/inline-composer-state.js");

const IDS = ["inline-topic-file", "inline-topic-audio", "inline-topic-video", "inline-topic-preview-wrap",
  "inline-topic-preview", "inline-topic-preview-audio", "inline-topic-preview-audio-wrap",
  "inline-topic-preview-video", "inline-topic-preview-video-wrap", "inline-topic-attach-meta",
  "lofi-filter-bar", "composer-aspect-bar", "composer-tag-bar", "inline-composer-tags-chips", "lofi-weight-badge"];

/**
 * Monta DOM, FileReader, Image e canvas falsos e um estado de controlador.
 * @param {object} [imageCfg] Config do `Image` falso.
 * @returns {{ el: Record<string, FakeEl>, state: object, cleanup: () => void }} Cenário.
 */
function mount(imageCfg) {
  const dom = installFakeDocument();
  dom.doc.createElement = () => makeFakeCanvas();
  const el = {};
  for (const id of IDS) {
    el[id] = new FakeEl(id);
    dom.add(el[id]);
  }
  const restoreImg = installFakeImage(imageCfg);
  const restoreReader = installFakeFileReader();
  st.clearMedia();
  el["lofi-weight-badge"].textContent = "";
  const state = { rawSourceFile: null, activeLofiFilter: "normal", cleanupRecordingState() {} };
  return { el, state, cleanup: () => { dom.restore(); restoreImg(); restoreReader(); } };
}

test("inline-media — renderLofiPreview não faz nada sem arquivo ou sem foto ativa", async () => {
  const { el, state, cleanup } = mount();
  await media.renderLofiPreview(state);
  assert.equal(el["lofi-weight-badge"].textContent, "");
  state.rawSourceFile = { slice() {}, type: "image/png" };
  await media.renderLofiPreview(state);
  assert.equal(el["lofi-weight-badge"].textContent, "", "mídia ativa não é imagem");
  cleanup();
});

test("inline-media — renderLofiPreview grava o resultado e o rótulo de peso quando comprime", async () => {
  const { el, state, cleanup } = mount();
  state.rawSourceFile = { slice() {}, type: "image/png", __dataUrl: "data:image/png;base64,QUJD" };
  st.setComposerMedia({ type: "image", dataUrl: "", byteLength: 10 });
  await media.renderLofiPreview(state);
  assert.ok(st.inlineComposerImageDataUrl.startsWith("data:image/webp;base64,"));
  assert.equal(st.inlineComposerMedia.dataUrl, st.inlineComposerImageDataUrl);
  assert.equal(st.inlineComposerMedia.type, "image");
  assert.equal(el["inline-topic-preview"].src, st.inlineComposerImageDataUrl);
  assert.equal(el["lofi-weight-badge"].textContent, "⚡ ~1 KB (95% qualidade · mídia leve para a malha)");
  cleanup();
});

test("inline-media — renderLofiPreview deixa o rótulo de espera e a prévia intacta se a compressão falha", async () => {
  const { el, state, cleanup } = mount({ failDecode: true });
  state.rawSourceFile = { slice() {}, type: "image/png", __dataUrl: "data:image/png;base64,QUJD" };
  st.setComposerMedia({ type: "image", dataUrl: "", byteLength: 10 });
  await media.renderLofiPreview(state);
  assert.equal(st.inlineComposerImageDataUrl, "");
  assert.equal(el["lofi-weight-badge"].textContent, "⚡ Otimizando qualidade (~100 KB)…");
  cleanup();
});

test("inline-media — foto válida vira mídia de imagem com metadados e prévia comprimida", async () => {
  const { el, state, cleanup } = mount();
  media.bindMediaFileInputs(state);
  const file = { name: "praca.png", type: "image/png", size: 2048, slice() {}, __dataUrl: "data:image/png;base64,QUJD" };
  el["inline-topic-file"].files = [file];
  await el["inline-topic-file"].fire("change");
  assert.equal(state.rawSourceFile, file);
  assert.equal(st.inlineComposerMedia.type, "image");
  assert.equal(st.inlineComposerMedia.byteLength, 2048);
  assert.equal(el["inline-topic-attach-meta"].textContent, "🖼️ praca.png · 2 KB");
  assert.equal(el["inline-topic-preview-wrap"].hidden, false);
  assert.ok(st.inlineComposerImageDataUrl.length > 0);
  cleanup();
});

test("inline-media — arquivos inválidos ou ausentes limpam a mídia e não anexam nada", async () => {
  const { el, state, cleanup } = mount();
  media.bindMediaFileInputs(state);
  st.setComposerMedia({ type: "audio", dataUrl: "data:old", byteLength: 1 });
  el["inline-topic-file"].files = [];
  await el["inline-topic-file"].fire("change");
  assert.equal(st.inlineComposerMedia.dataUrl, "data:old", "sem arquivo: nada muda");
  el["inline-topic-file"].files = [{ name: "x.bmp", type: "image/bmp", size: 10 }];
  await el["inline-topic-file"].fire("change");
  assert.equal(st.inlineComposerMedia.type, "", "imagem inválida limpa a mídia anterior");
  st.setComposerMedia({ type: "video", dataUrl: "data:old", byteLength: 1 });
  el["inline-topic-audio"].files = [{ name: "x.mp4", type: "video/mp4", size: 10 }];
  await el["inline-topic-audio"].fire("change");
  assert.equal(st.inlineComposerMedia.type, "");
  st.setComposerMedia({ type: "audio", dataUrl: "data:old", byteLength: 1 });
  el["inline-topic-video"].files = [{ name: "x.mp3", type: "audio/mp3", size: 10 }];
  await el["inline-topic-video"].fire("change");
  assert.equal(st.inlineComposerMedia.type, "");
  cleanup();
});

test("inline-media — áudio e vídeo válidos viram mídia com prévia, peso e metadados", async () => {
  const { el, state, cleanup } = mount();
  media.bindMediaFileInputs(state);
  el["inline-topic-audio"].files = [{ name: "voz.mp3", type: "audio/mp3", size: 3072, __dataUrl: "data:audio/mp3;base64,AA" }];
  await el["inline-topic-audio"].fire("change");
  assert.deepEqual(st.inlineComposerMedia, { type: "audio", dataUrl: "data:audio/mp3;base64,AA", byteLength: 3072 });
  assert.equal(el["inline-topic-attach-meta"].textContent, "🎵 voz.mp3 · 3 KB");
  assert.equal(el["lofi-weight-badge"].textContent, "⚡ ~3 KB (Áudio Lo-Fi 48k · malha)");
  el["inline-topic-video"].files = [{ name: "clip.mp4", type: "video/mp4", size: 5120, __dataUrl: "data:video/mp4;base64,BB" }];
  await el["inline-topic-video"].fire("change");
  assert.equal(st.inlineComposerMedia.type, "video");
  assert.equal(el["inline-topic-preview-video"].src, "data:video/mp4;base64,BB");
  assert.equal(el["lofi-weight-badge"].textContent, "⚡ ~5 KB (Vídeo Lo-Fi 360p)");
  cleanup();
});

test("inline-media — barras de filtro e proporção trocam o botão ativo e reprocessam a foto", async () => {
  const { el, state, cleanup } = mount();
  media.bindFilterAndAspectBars(state);
  state.rawSourceFile = { slice() {}, type: "image/png", __dataUrl: "data:image/png;base64,QUJD" };
  st.setComposerMedia({ type: "image", dataUrl: "", byteLength: 10 });
  const vhs = new FakeEl("", { dataset: { filter: "vhs" } });
  const other = new FakeEl("", { dataset: { filter: "normal" } });
  el["lofi-filter-bar"].stub(".lofi-filter-btn", [other, vhs]);
  let prevented = 0;
  const ev = (btn) => ({ target: new FakeEl().stubClosest(".lofi-filter-btn", btn), preventDefault: () => prevented++ });
  await el["lofi-filter-bar"].fire("click", { target: new FakeEl(), preventDefault: () => prevented++ });
  assert.equal(prevented, 0, "clique fora de botão é ignorado");
  await el["lofi-filter-bar"].fire("click", ev(vhs));
  assert.equal(state.activeLofiFilter, "vhs");
  assert.equal(vhs.classList.contains("active"), true);
  assert.equal(other.classList.contains("active"), false);
  assert.ok(st.inlineComposerImageDataUrl.length > 0, "foto reprocessada");
  const wide = new FakeEl("", { dataset: { aspect: "16:9" } });
  el["composer-aspect-bar"].stub(".composer-aspect-btn", [wide]);
  await el["composer-aspect-bar"].fire("click", { target: new FakeEl().stubClosest(".composer-aspect-btn", wide), preventDefault: () => prevented++ });
  assert.equal(st.inlineComposerAspectRatio, "16:9");
  assert.equal(el["inline-topic-preview"].classList.contains("composer-aspect-16-9"), true);
  assert.equal(wide.classList.contains("active"), true);
  cleanup();
});

test("inline-media — bindEditPanels abre, troca e fecha o painel do anexo e atualiza aria-expanded", () => {
  const wrap = new FakeEl("inline-topic-preview-wrap");
  const style = new FakeEl("", { dataset: { editPanel: "style" } });
  const aspect = new FakeEl("", { dataset: { editPanel: "aspect" } });
  const root = new FakeEl("root").stub("#inline-topic-preview-wrap", wrap).stub(".composer-edit-btn[data-edit-panel]", [style, aspect]);
  media.bindEditPanels(root);
  const ev = { preventDefault() {} };
  style.fire("click", ev);
  assert.equal(wrap.dataset.open, "style");
  assert.equal(style.getAttribute("aria-expanded"), "true");
  assert.equal(aspect.getAttribute("aria-expanded"), "false");
  aspect.fire("click", ev);
  assert.equal(wrap.dataset.open, "aspect");
  aspect.fire("click", ev);
  assert.equal(wrap.dataset.open, "", "clicar de novo fecha");
  assert.equal(aspect.getAttribute("aria-expanded"), "false");
});
