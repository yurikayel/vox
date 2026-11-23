/**
 * @file Cobertura de `app/inline-composer-state.js` (lote T4): estado da mídia e prévias do compositor inline.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { FakeEl, installFakeDocument } from "./helpers/cov-t4-dom.mjs";

const st = await import("../client/js/app/inline-composer-state.js");
const cacheNode = await import("../client/js/cache-node.js");

/**
 * Cria elementos com os ids de prévia do compositor e os registra no documento falso.
 * @param {string[]} ids Ids a criar.
 * @returns {{ dom: object, el: Record<string, FakeEl> }} Documento e elementos por id.
 */
function mountIds(ids) {
  const dom = installFakeDocument();
  const el = {};
  for (const id of ids) {
    el[id] = new FakeEl(id);
    dom.add(el[id]);
  }
  return { dom, el };
}

test("inline-state — setters atualizam os bindings exportados", () => {
  st.setComposerImageDataUrl("data:image/png;base64,AA");
  st.setComposerMedia({ type: "image", dataUrl: "data:x", byteLength: 3 });
  st.setComposerAspectRatio("16:9");
  st.setComposerPhotoTags([{ id: "a" }]);
  assert.equal(st.inlineComposerImageDataUrl, "data:image/png;base64,AA");
  assert.deepEqual(st.inlineComposerMedia, { type: "image", dataUrl: "data:x", byteLength: 3 });
  assert.equal(st.inlineComposerAspectRatio, "16:9");
  assert.deepEqual(st.inlineComposerPhotoTags, [{ id: "a" }]);
});

test("inline-state — setPreviewVisible sincroniza classe hidden e atributo, e ignora nulo", () => {
  const el = new FakeEl();
  st.setPreviewVisible(el, false);
  assert.equal(el.hidden, true);
  assert.equal(el.classList.contains("hidden"), true);
  st.setPreviewVisible(el, true);
  assert.equal(el.hidden, false);
  assert.equal(el.classList.contains("hidden"), false);
  assert.equal(st.setPreviewVisible(null, true), undefined);
});

test("inline-state — formatAttachmentSize usa KB mínimo de 1 e MB acima de 1 MiB", () => {
  assert.equal(st.formatAttachmentSize(0), "1 KB");
  assert.equal(st.formatAttachmentSize("abc"), "1 KB");
  assert.equal(st.formatAttachmentSize(2048), "2 KB");
  assert.equal(st.formatAttachmentSize(1.5 * 1024 * 1024), "1.5 MB");
});

test("inline-state — setAttachmentMeta escreve ícone, nome e tamanho, e limpa sem tipo", () => {
  const { dom, el } = mountIds(["inline-topic-attach-meta"]);
  const meta = el["inline-topic-attach-meta"];
  st.setAttachmentMeta("voice", "Recado", 4096);
  assert.equal(meta.textContent, "🎙️ Recado · 4 KB");
  assert.equal(meta.hidden, false);
  st.setAttachmentMeta("zip", "", 1024);
  assert.equal(meta.textContent, "📎 Anexo · 1 KB");
  st.setAttachmentMeta("", "", 0);
  assert.equal(meta.textContent, "");
  assert.equal(meta.hidden, true);
  dom.restore();
  const empty = installFakeDocument();
  assert.equal(st.setAttachmentMeta("image", "a", 1), undefined, "sem o campo, nada acontece");
  empty.restore();
});

test("inline-state — clearMedia zera estado, limpa inputs, prévias e barras", () => {
  const ids = ["inline-topic-file", "inline-topic-audio", "inline-topic-video", "inline-topic-preview-wrap",
    "inline-topic-preview", "inline-topic-preview-audio", "inline-topic-preview-audio-wrap",
    "inline-topic-preview-video", "inline-topic-preview-video-wrap", "inline-topic-attach-meta",
    "lofi-filter-bar", "composer-aspect-bar", "composer-tag-bar", "inline-composer-tags-chips", "lofi-weight-badge"];
  const { dom, el } = mountIds(ids);
  el["inline-topic-file"].value = "foto.png";
  el["inline-topic-preview"].setAttribute("src", "x");
  el["inline-topic-preview"].classList.add("composer-aspect-1-1");
  el["inline-topic-preview-wrap"].dataset.open = "style";
  el["inline-composer-tags-chips"].innerHTML = "<b>t</b>";
  const state = { rawSourceFile: {}, activeLofiFilter: "vhs", cleaned: 0, cleanupRecordingState() { this.cleaned++; } };
  st.setComposerMedia({ type: "image", dataUrl: "d", byteLength: 1 });
  st.clearMedia(state);
  assert.equal(state.cleaned, 1);
  assert.equal(state.rawSourceFile, null);
  assert.equal(state.activeLofiFilter, "normal");
  assert.deepEqual(st.inlineComposerMedia, { type: "", dataUrl: "", byteLength: 0 });
  assert.equal(st.inlineComposerImageDataUrl, "");
  assert.equal(el["inline-topic-file"].value, "");
  assert.equal(el["inline-topic-preview"].getAttribute("src"), null);
  assert.equal(el["inline-topic-preview"].classList.contains("composer-aspect-original"), true);
  assert.equal(el["inline-topic-preview"].classList.contains("composer-aspect-1-1"), false);
  assert.equal(el["inline-topic-preview-wrap"].dataset.open, "");
  assert.equal(el["lofi-filter-bar"].style.display, "flex");
  assert.equal(el["composer-aspect-bar"].style.display, "none");
  assert.equal(el["inline-composer-tags-chips"].innerHTML, "");
  assert.match(el["lofi-weight-badge"].textContent, /~45 KB/);
  st.clearMedia();
  dom.restore();
});

test("inline-state — setupImagePreviewBars mostra imagem, marca filtro e proporção originais", () => {
  const { dom, el } = mountIds(["inline-topic-preview", "inline-topic-preview-wrap", "inline-topic-preview-audio-wrap",
    "inline-topic-preview-video-wrap", "lofi-filter-bar", "composer-aspect-bar", "composer-tag-bar", "inline-composer-tags-chips"]);
  const mkBtn = (key, val) => Object.assign(new FakeEl("", { dataset: { [key]: val } }), {});
  const filters = [mkBtn("filter", "normal"), mkBtn("filter", "vhs")];
  const aspects = [mkBtn("aspect", "original"), mkBtn("aspect", "1:1")];
  el["lofi-filter-bar"].stub(".lofi-filter-btn", filters);
  el["composer-aspect-bar"].stub(".composer-aspect-btn", aspects);
  el["inline-topic-preview-audio-wrap"].hidden = false;
  st.setupImagePreviewBars();
  assert.equal(el["inline-topic-preview"].hidden, false);
  assert.equal(el["inline-topic-preview-audio-wrap"].hidden, true);
  assert.deepEqual(filters.map((b) => b.classList.contains("active")), [true, false]);
  assert.deepEqual(aspects.map((b) => b.classList.contains("active")), [true, false]);
  assert.equal(el["composer-tag-bar"].style.display, "flex");
  assert.equal(el["inline-topic-preview-wrap"].hidden, false);
  dom.restore();
});

test("inline-state — syncInlineComposerUi conta caracteres e habilita enviar só com conteúdo", () => {
  const { dom, el } = mountIds(["feed-inline-composer", "inline-topic-body", "inline-topic-char", "btn-inline-submit", "btn-inline-echo"]);
  st.clearMedia();
  el["inline-topic-body"].value = "   ";
  st.syncInlineComposerUi();
  assert.equal(el["inline-topic-char"].textContent, "3 / 2000");
  assert.equal(el["btn-inline-submit"].disabled, true);
  el["inline-topic-body"].value = "oi";
  st.syncInlineComposerUi();
  assert.equal(el["btn-inline-submit"].disabled, false);
  assert.equal(el["btn-inline-echo"].disabled, false);
  el["inline-topic-body"].value = "";
  st.setComposerMedia({ type: "audio", dataUrl: "data:a", byteLength: 1 });
  st.syncInlineComposerUi();
  assert.equal(el["btn-inline-submit"].disabled, false, "mídia sozinha basta");
  st.clearMedia();
  dom.restore();
});

test("inline-state — updateComposerMediaPreview troca imagem pelo player de áudio ou vídeo", () => {
  const ids = ["inline-topic-preview-audio", "inline-topic-preview-audio-wrap", "inline-topic-preview-video",
    "inline-topic-preview-video-wrap", "inline-topic-preview", "lofi-weight-badge", "inline-topic-preview-wrap",
    "lofi-filter-bar", "composer-aspect-bar", "composer-tag-bar"];
  const { dom, el } = mountIds(ids);
  st.updateComposerMediaPreview("audio", "data:audio/x", "peso áudio");
  assert.equal(el["inline-topic-preview-audio"].src, "data:audio/x");
  assert.equal(el["inline-topic-preview-audio-wrap"].hidden, false);
  assert.equal(el["inline-topic-preview-video-wrap"].hidden, true);
  assert.equal(el["inline-topic-preview"].hidden, true);
  assert.equal(el["lofi-filter-bar"].style.display, "none");
  assert.equal(el["lofi-weight-badge"].textContent, "peso áudio");
  st.updateComposerMediaPreview("video", "data:video/x", "peso vídeo");
  assert.equal(el["inline-topic-preview-video"].src, "data:video/x");
  assert.equal(el["inline-topic-preview-video-wrap"].hidden, false);
  assert.equal(el["inline-topic-preview-audio-wrap"].hidden, true);
  dom.restore();
});

test("inline-state — recolher e expandir alternam classes, aria-expanded e foco", () => {
  const { dom, el } = mountIds(["feed-inline-composer", "form-inline-topic", "inline-topic-body", "inline-comm-list"]);
  const collapsed = new FakeEl("", { classes: ["inline-composer-collapsed"] });
  el["feed-inline-composer"].stub(".inline-composer-collapsed", collapsed);
  st.collapseInlineComposer();
  assert.equal(el["feed-inline-composer"].classList.contains("is-collapsed"), true);
  assert.equal(el["form-inline-topic"].classList.contains("hidden"), true);
  assert.equal(collapsed.classList.contains("hidden"), false);
  assert.equal(collapsed.getAttribute("aria-expanded"), "false");
  st.expandInlineComposer();
  assert.equal(el["feed-inline-composer"].classList.contains("is-collapsed"), false);
  assert.equal(el["form-inline-topic"].classList.contains("hidden"), false);
  assert.equal(collapsed.classList.contains("hidden"), true);
  assert.equal(collapsed.getAttribute("aria-expanded"), "true");
  assert.equal(el["inline-topic-body"].focusCalls, 1);
  dom.restore();
  const empty = installFakeDocument();
  assert.equal(st.collapseInlineComposer(), undefined, "sem raiz, nada acontece");
  assert.equal(st.expandInlineComposer(), undefined);
  empty.restore();
});

test("inline-state — populateCommunityDatalist soma comunidades locais às padrão sem duplicar", async () => {
  const { dom, el } = mountIds(["inline-comm-list"]);
  await cacheNode.clearLocalPosts();
  await cacheNode.saveLocalPost({ id: "c_vizinhos", communityId: "vizinhos", type: "community", title: "Vizinhos" });
  await st.populateCommunityDatalist();
  const html = el["inline-comm-list"].innerHTML;
  assert.ok(html.includes('<option value="geral"></option>'));
  assert.ok(html.includes('<option value="vizinhos"></option>'));
  assert.equal((html.match(/value="geral"/g) || []).length, 1);
  dom.restore();
  const empty = installFakeDocument();
  assert.equal(await st.populateCommunityDatalist(), undefined, "sem datalist, nada acontece");
  empty.restore();
});
