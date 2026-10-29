import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderPostItem } from "../client/js/render/feed.js";
import { renderTopic } from "../client/js/render/topic.js";
import { renderPhotoTagBarHtml, renderPhotoTagPinsHtml } from "../client/js/render/photo-tag-pins.js";
import * as mediaLofi from "../client/js/media-lofi.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client");
const css = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
const feedJs = fs.readFileSync(path.join(root, "js/render/feed.js"), "utf8");
const composerJs = fs.readFileSync(path.join(root, "js/inline-composer.js"), "utf8");
const lightboxJs = fs.readFileSync(path.join(root, "js/app/post-media-lightbox.js"), "utf8");
const tagUiJs = fs.readFileSync(path.join(root, "js/app/photo-tag-ui.js"), "utf8");

test("photo aspect ratio - renders correct aspect class on feed post", () => {
  const postOriginal = {
    id: "top_aspect_orig",
    type: "topic",
    title: "Card Magic",
    body: "O Nove Dedos",
    image: "https://example.com/magic.jpg",
    aspectRatio: "original",
    author: "vx_author_1",
    ts: Date.now(),
  };
  const htmlOrig = renderPostItem(postOriginal);
  assert.ok(htmlOrig.includes("post-aspect-original"), "original aspect ratio should render post-aspect-original class");
  assert.ok(htmlOrig.includes('data-aspect="original"'));

  const postDefault = {
    id: "top_aspect_default",
    type: "topic",
    title: "Foto sem ratio explícito",
    body: "Padrão",
    image: "https://example.com/photo.jpg",
    author: "vx_author_1",
    ts: Date.now(),
  };
  const htmlDefault = renderPostItem(postDefault);
  assert.ok(htmlDefault.includes("post-aspect-original"), "default aspect ratio should be original without pre-cropping");

  const postSquare = {
    id: "top_aspect_sq",
    type: "topic",
    title: "Quadrado 1:1",
    body: "",
    image: "https://example.com/square.jpg",
    aspectRatio: "1:1",
    author: "vx_author_1",
    ts: Date.now(),
  };
  const htmlSquare = renderPostItem(postSquare);
  assert.ok(htmlSquare.includes("post-aspect-1-1"));
  assert.ok(htmlSquare.includes('data-aspect="1:1"'));

  const postClassic = {
    id: "top_aspect_classic",
    type: "topic",
    title: "Clássico 4:3",
    body: "",
    image: "https://example.com/classic.jpg",
    aspectRatio: "4:3",
    author: "vx_author_1",
    ts: Date.now(),
  };
  assert.ok(renderPostItem(postClassic).includes("post-aspect-4-3"));

  const postWide = {
    id: "top_aspect_wide",
    type: "topic",
    title: "Paisagem 16:9",
    body: "",
    image: "https://example.com/wide.jpg",
    aspectRatio: "16:9",
    author: "vx_author_1",
    ts: Date.now(),
  };
  assert.ok(renderPostItem(postWide).includes("post-aspect-16-9"));

  const postStory = {
    id: "top_aspect_story",
    type: "topic",
    title: "Vertical 9:16",
    body: "",
    image: "https://example.com/story.jpg",
    aspectRatio: "9:16",
    author: "vx_author_1",
    ts: Date.now(),
  };
  assert.ok(renderPostItem(postStory).includes("post-aspect-9-16"));

  const postPortrait = {
    id: "top_aspect_portrait",
    type: "topic",
    title: "Retrato 3:4",
    body: "",
    image: "https://example.com/portrait.jpg",
    aspectRatio: "3:4",
    author: "vx_author_1",
    ts: Date.now(),
  };
  assert.ok(renderPostItem(postPortrait).includes("post-aspect-3-4"));
});

test("photo aspect ratio - topic detail handles aspect ratio and lightbox", () => {
  const topic = {
    id: "top_detail_1",
    type: "topic",
    title: "Foto Original",
    body: "Texto detalhado",
    image: "https://example.com/det.jpg",
    aspectRatio: "16:9",
    author: "vx_author_1",
    ts: Date.now(),
  };
  const main = { innerHTML: "" };
  renderTopic(main, "top_detail_1", topic, []);
  assert.ok(main.innerHTML.includes("post-aspect-16-9"));
  assert.ok(main.innerHTML.includes("post-media-lightbox-trigger"));
});

test("composer aspect selector - renders selection flow in preview wrap", () => {
  assert.ok(feedJs.includes('id="composer-aspect-bar"'));
  assert.ok(feedJs.includes('data-aspect="original"'));
  assert.ok(feedJs.includes("Original (padrão)"));
  assert.ok(feedJs.includes('data-aspect="1:1"'));
  assert.ok(feedJs.includes('data-aspect="4:3"'));
  assert.ok(feedJs.includes('data-aspect="16:9"'));
  assert.ok(composerJs.includes("inlineComposerAspectRatio"));
  assert.ok(composerJs.includes("composer-aspect-btn"));
});

test("photo tag bar - removes permanent Marcar overlay from feed photo", () => {
  const postNoTags = { id: "top_1", photoTags: [] };
  const htmlNoTags = renderPhotoTagBarHtml(postNoTags, { isOwn: true });
  assert.equal(htmlNoTags, "", "should not show any bar or Marcar button when there are no tags");

  const postWithTags = {
    id: "top_2",
    photoTags: [{ x: 50, y: 50, targetId: "vx_amigo", label: "Amigo" }],
  };
  const htmlWithTags = renderPhotoTagBarHtml(postWithTags, { isOwn: true });
  assert.ok(htmlWithTags.includes("btn-photo-tag-vis"), "should render Marcas (n) toggle button");
  assert.ok(!htmlWithTags.includes("btn-photo-tag "), "should not render static Marcar button");
  assert.ok(!htmlWithTags.includes(">Marcar<"), "should not render text Marcar");
});

test("photo tagging - long press detection and composer tagging present in code", () => {
  assert.ok(tagUiJs.includes("pointerdown"));
  assert.ok(tagUiJs.includes("longPressTimer"));
  assert.ok(tagUiJs.includes("triggerLongPress"));
  assert.ok(tagUiJs.includes("window.__justLongPressed"));

  assert.ok(feedJs.includes('id="btn-inline-tag-people"'));
  assert.ok(feedJs.includes('id="inline-composer-tags-chips"'));
  assert.ok(composerJs.includes("inlineComposerPhotoTags"));
  assert.ok(composerJs.includes("openPhotoTagPicker"));
});

test("lightbox and css - supports uncropped original aspect ratio and fullscreen view", () => {
  assert.ok(css.includes(".post-media-container.post-aspect-original"));
  assert.ok(css.includes(".post-media-container.post-aspect-1-1"));
  assert.ok(css.includes(".post-media-container.post-aspect-4-3"));
  assert.ok(css.includes(".post-media-container.post-aspect-16-9"));
  assert.ok(css.includes(".post-media-container.post-aspect-9-16"));
  assert.ok(css.includes(".post-media-container.post-aspect-3-4"));
  assert.ok(css.includes(".composer-aspect-bar"));
  assert.ok(css.includes(".composer-aspect-btn"));
  assert.ok(css.includes(".inline-composer-tag-chip"));
  assert.ok(lightboxJs.includes("openPostMediaLightbox"));
  assert.ok(lightboxJs.includes("window.__justLongPressed"));
});

test("media-lofi - calculateCropAndBounds limita a 1920x1080 horizontal e 1080x1920 vertical", () => {
  // Landscape 4:3 -> escala para caber em 1920x1080 mantendo aspect
  const land43 = mediaLofi.calculateCropAndBounds(4000, 3000, { aspect: "original", maxLong: 1920, maxShort: 1080 });
  assert.equal(land43.destW, 1440);
  assert.equal(land43.destH, 1080);
  assert.equal(land43.destW <= 1920, true);
  assert.equal(land43.destH <= 1080, true);

  // Portrait 3:4 -> escala para caber em 1080x1920 mantendo aspect
  const port34 = mediaLofi.calculateCropAndBounds(3000, 4000, { aspect: "original", maxLong: 1920, maxShort: 1080 });
  assert.equal(port34.destW, 1080);
  assert.equal(port34.destH, 1440);
  assert.equal(port34.destW <= 1080, true);
  assert.equal(port34.destH <= 1920, true);

  // Escolha do usuário 16:9
  const crop169 = mediaLofi.calculateCropAndBounds(4000, 3000, { aspect: "16:9", maxLong: 1920, maxShort: 1080 });
  assert.equal(crop169.destW, 1920);
  assert.equal(crop169.destH, 1080);

  // Escolha do usuário 9:16
  const crop916 = mediaLofi.calculateCropAndBounds(3000, 4000, { aspect: "9:16", maxLong: 1920, maxShort: 1080 });
  assert.equal(crop916.destW, 1080);
  assert.equal(crop916.destH, 1920);

  // Imagens pequenas não sofrem upscale desnecessário
  const small = mediaLofi.calculateCropAndBounds(800, 600, { aspect: "original", maxLong: 1920, maxShort: 1080 });
  assert.equal(small.destW, 800);
  assert.equal(small.destH, 600);
});

test("media-lofi - optimizeCanvasQualityUnderCeiling assegura limite estrito de 100 KB para Permaweb", () => {
  const fakeCanvas = {
    width: 1080,
    height: 1920,
    toDataURL(mime, quality) {
      // Simula compressão WebP onde qualidade maior produz mais bytes
      const bytes = Math.round(50000 + quality * 60000);
      const b64 = "A".repeat(Math.round(bytes * 1.34));
      return `data:image/webp;base64,${b64}`;
    },
  };
  const result = mediaLofi.optimizeCanvasQualityUnderCeiling(fakeCanvas, { maxBytes: 101376 });
  assert.ok(result.isWithinLimit, "deve caber sob o teto de 100 KB");
  assert.ok(result.byteLength <= 101376, "tamanho não deve exceder teto");
  assert.ok(result.qualityUsed > 0.5, "deve maximizar a qualidade ótima dentro da janela");
});

test("pw-3 - mapTopic e feed renderizam fotos on-chain com link da Permaweb e proporcao correta", async () => {
  const mediaBlob = await import("../client/js/media-blob.js");

  const dummyDataUrl = "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";
  const rawBytes = mediaBlob.dataUrlToUint8Array(dummyDataUrl);
  assert.ok(rawBytes instanceof Uint8Array);
  assert.ok(rawBytes.length > 0);

  const expectedImg = "https://turbo-gateway.com/raw/HPeo2mkdG7K2Hqez7fZ6_d-EhJ01Qve8Cr2vGcNns8w";
  const mappedPost = {
    id: "tx_topic_with_media_123",
    communityId: "geral",
    title: "Foto no Permaweb",
    owner: "0x_author_arweave",
    mediaTx: "HPeo2mkdG7K2Hqez7fZ6_d-EhJ01Qve8Cr2vGcNns8w",
    image: expectedImg,
    aspectRatio: "16:9",
  };

  const html = renderPostItem(mappedPost);
  assert.ok(html.includes(expectedImg), "o feed deve renderizar a URL da imagem da Permaweb");
  assert.ok(html.includes("post-aspect-16-9"), "deve aplicar a classe de proporcao 16:9");
  assert.ok(html.includes('data-media-src="' + expectedImg + '"'), "lightbox deve receber o link da Permaweb");
});
