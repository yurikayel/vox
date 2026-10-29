import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderPostItem } from "../client/js/render/feed.js";
import { renderTopic } from "../client/js/render/topic.js";
import { renderPhotoTagBarHtml, renderPhotoTagPinsHtml } from "../client/js/render/photo-tag-pins.js";

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
  assert.ok(css.includes(".composer-aspect-bar"));
  assert.ok(css.includes(".composer-aspect-btn"));
  assert.ok(css.includes(".inline-composer-tag-chip"));
  assert.ok(lightboxJs.includes("openPostMediaLightbox"));
  assert.ok(lightboxJs.includes("window.__justLongPressed"));
});
