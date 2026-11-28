/**
 * @file Compositor: os filtros Lo-Fi (Padrão, Xerox, VHS…) e as proporções (Original, 16:9…) são botões de alternância e
 * dizem qual está escolhido com `aria-pressed` (4.1.2), cada grupo nomeado por `role="group"` e `aria-label`. O HTML
 * inicial marca só "Padrão" e "Original"; o clique troca o escolhido; abrir outra foto volta ao padrão.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { FakeEl, installFakeDocument } from "./helpers/cov-t4-dom.mjs";
import { installFakeFileReader, installFakeImage, makeFakeCanvas } from "./helpers/cov-t4-media-env.mjs";
import { renderInlineComposer } from "../client/js/render/feed-composer.js";

const media = await import("../client/js/app/inline-composer-media.js");
const st = await import("../client/js/app/inline-composer-state.js");

/** Os `<button class="<classe>">` do HTML, com o valor do `data-<chave>` e o `aria-pressed`. */
function choices(html, classe, chave) {
  const re = new RegExp(`<button\\b[^>]*class="${classe}[^"]*"[^>]*>`, "g");
  return [...html.matchAll(re)].map((m) => ({ valor: new RegExp(`data-${chave}="([^"]+)"`).exec(m[0])?.[1], pressed: /aria-pressed="([^"]+)"/.exec(m[0])?.[1] }));
}

test("o HTML inicial marca só Padrão e Original, e cada grupo tem nome", () => {
  const html = renderInlineComposer({ userRouteId: "vx_x", displayName: "Ana" });
  assert.match(html, /id="lofi-filter-bar"[^>]*role="group"[^>]*aria-label="Estilo Lo-Fi"/);
  assert.match(html, /id="composer-aspect-bar"[^>]*role="group"[^>]*aria-label="Proporção da imagem"/);
  const filtros = choices(html, "lofi-filter-btn", "filter");
  assert.deepEqual(filtros.map((f) => f.valor), ["normal", "xerox", "vhs", "risograph"]);
  assert.deepEqual(filtros.map((f) => f.pressed), ["true", "false", "false", "false"]);
  const aspectos = choices(html, "composer-aspect-btn", "aspect");
  assert.deepEqual(aspectos.map((a) => a.valor), ["original", "16:9", "9:16", "4:3", "3:4", "1:1"]);
  assert.deepEqual(aspectos.map((a) => a.pressed), ["true", "false", "false", "false", "false", "false"]);
});

const IDS = ["inline-topic-preview-wrap", "inline-topic-preview", "inline-topic-preview-audio-wrap", "inline-topic-preview-video-wrap", "lofi-filter-bar", "composer-aspect-bar", "composer-tag-bar", "inline-composer-tags-chips", "lofi-weight-badge"];

/** DOM falso com as duas barras e quatro botões de filtro e dois de proporção. */
function mount() {
  const dom = installFakeDocument();
  dom.doc.createElement = () => makeFakeCanvas();
  const el = {};
  for (const id of IDS) dom.add((el[id] = new FakeEl(id)));
  const restoreImg = installFakeImage();
  const restoreReader = installFakeFileReader();
  st.clearMedia();
  const filtros = ["normal", "xerox", "vhs"].map((filter) => new FakeEl("", { dataset: { filter } }));
  const aspectos = ["original", "16:9"].map((aspect) => new FakeEl("", { dataset: { aspect } }));
  el["lofi-filter-bar"].stub(".lofi-filter-btn", filtros);
  el["composer-aspect-bar"].stub(".composer-aspect-btn", aspectos);
  const state = { rawSourceFile: { slice() {}, type: "image/png", __dataUrl: "data:image/png;base64,QUJD" }, activeLofiFilter: "normal", cleanupRecordingState() {} };
  st.setComposerMedia({ type: "image", dataUrl: "", byteLength: 10 });
  return { el, state, filtros, aspectos, cleanup: () => { dom.restore(); restoreImg(); restoreReader(); } };
}

const pressed = (botoes) => botoes.map((b) => b.getAttribute("aria-pressed"));

test("o clique troca o escolhido: só o VHS e só o 16:9 ficam com aria-pressed true", async () => {
  const { el, state, filtros, aspectos, cleanup } = mount();
  media.bindFilterAndAspectBars(state);
  const clique = (barra, classe, btn) => el[barra].fire("click", { target: new FakeEl().stubClosest(classe, btn), preventDefault() {} });
  await clique("lofi-filter-bar", ".lofi-filter-btn", filtros[2]);
  assert.deepEqual(pressed(filtros), ["false", "false", "true"]);
  assert.deepEqual(filtros.map((b) => b.classList.contains("active")), [false, false, true], "a classe visual acompanha");
  await clique("composer-aspect-bar", ".composer-aspect-btn", aspectos[1]);
  assert.deepEqual(pressed(aspectos), ["false", "true"]);
  cleanup();
});

test("abrir outra foto volta ao Padrão e ao Original, com aria-pressed coerente", async () => {
  const { el, state, filtros, aspectos, cleanup } = mount();
  media.bindFilterAndAspectBars(state);
  await el["lofi-filter-bar"].fire("click", { target: new FakeEl().stubClosest(".lofi-filter-btn", filtros[2]), preventDefault() {} });
  st.setupImagePreviewBars();
  assert.deepEqual(pressed(filtros), ["true", "false", "false"]);
  assert.deepEqual(pressed(aspectos), ["true", "false"]);
  cleanup();
});
