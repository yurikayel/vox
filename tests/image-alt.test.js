import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";

import { renderPostItem, renderInlineComposer } from "../client/js/render/feed.js";

const BASE_POST = {
  id: "top_alt_demo",
  type: "topic",
  author: "vx_author_1",
  ts: Date.now(),
  image: "https://example.com/photo.jpg",
};

test("feed — post com legenda não repete título no alt da hero", () => {
  const html = renderPostItem({ ...BASE_POST, title: "Feira", body: "Sábado" });
  assert.match(html, /post-media-hero-img[^>]*alt=""/);
  assert.doesNotMatch(html, /post-media-hero-img[^>]*alt="Feira"/);
});

test("composer — prévia inline usa alt decorativo", () => {
  const composerHtml = renderInlineComposer();
  assert.match(composerHtml, /id="inline-topic-preview"[^>]*alt=""/);
  assert.doesNotMatch(composerHtml, /Prévia da imagem/);
});

test("resolvePostImageAltText — regras de legenda e explícito", async () => {
  const mod = await import("../client/js/render/photo-chrome.js");
  assert.equal(typeof mod.resolvePostImageAltText, "function", "resolvePostImageAltText exportado");
  assert.equal(mod.resolvePostImageAltText({ ...BASE_POST, title: "Feira", imageAlt: "Mercado" }), "Mercado");
  assert.equal(mod.resolvePostImageAltText({ ...BASE_POST, title: "Feira", body: "Sábado" }), "");
  assert.equal(mod.resolvePostImageAltText({ ...BASE_POST, title: "Feira", imageAlt: "" }), "");
  assert.equal(mod.resolvePostImageAltText({ image: BASE_POST.image }), "Foto da publicação");
});

test("renderPostImageLightboxTriggerHtml — espelha alt em img e data-media-alt", async () => {
  const mod = await import("../client/js/render/photo-chrome.js");
  assert.equal(typeof mod.renderPostImageLightboxTriggerHtml, "function");
  const html = mod.renderPostImageLightboxTriggerHtml("https://example.com/x.jpg", "Legenda");
  assert.match(html, /alt="Legenda"/);
  assert.match(html, /data-media-alt="Legenda"/);
  const decorative = mod.renderPostImageLightboxTriggerHtml("https://example.com/x.jpg", "");
  assert.match(decorative, /alt=""/);
  assert.match(decorative, /data-media-alt=""/);
});

test("feed — post só com imageAlt mantém texto significativo", () => {
  const html = renderPostItem({ ...BASE_POST, imageAlt: "Barraca de frutas" });
  assert.match(html, /post-media-hero-img[^>]*alt="Barraca de frutas"/);
});

test("composer-media — alt de prévia e publicação", async () => {
  const mod = await import("../client/js/composer-media.js");
  assert.equal(mod.COMPOSER_PREVIEW_IMAGE_ALT, "");
  assert.equal(mod.composerPreviewImageAltAttr(), 'alt=""');
  assert.equal(typeof mod.resolveComposerPublishImageAlt, "function");
  assert.equal(mod.resolveComposerPublishImageAlt({ title: "Feira", body: "Corpo longo" }), "Feira");
  assert.equal(mod.resolveComposerPublishImageAlt({}), "Foto");
});

test("lightbox — coerceImageAltString preserva string vazia", async () => {
  const mod = await import("../client/js/render/photo-chrome.js");
  assert.equal(typeof mod.coerceImageAltString, "function");
  assert.equal(mod.coerceImageAltString(""), "");
  assert.equal(mod.coerceImageAltString("Legenda"), "Legenda");
});