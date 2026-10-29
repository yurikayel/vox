/** Modo marcar + long-press + tap-to-show pins. */

import * as share from "../share.js";
import * as photoTags from "../photo-tags.js";
import { persistPhotoTags } from "./photo-tag-persist.js";
import { attachPhotoTagPicker, openPhotoTagPicker } from "./photo-tag-picker.js";

let taggingId = "";
let wired = false;
let longPressTimer = null;
let startCoords = { x: 0, y: 0 };

function frameOf(postId) {
  return document.querySelector(`.post[data-id="${CSS.escape(postId)}"] .post-media-hero`);
}

export function beginTagMode(postId) {
  taggingId = String(postId || "");
  document.body.classList.toggle("photo-tagging", Boolean(taggingId));
  document.querySelectorAll(".post-media-hero.photo-tag-mode").forEach((el) => {
    el.classList.remove("photo-tag-mode");
  });
  if (taggingId) {
    frameOf(taggingId)?.classList.add("photo-tag-mode");
    share.showToast(photoTags.TAGS_HINT);
  }
}

function pctFromClick(e, frame) {
  const img = frame.querySelector("img") || frame;
  const r = img.getBoundingClientRect();
  if (!r.width || !r.height) return { x: 50, y: 50 };
  return {
    x: ((e.clientX - r.left) / r.width) * 100,
    y: ((e.clientY - r.top) / r.height) * 100,
  };
}

export function togglePins(postId) {
  const pins = frameOf(postId)?.querySelector(".photo-tag-pins");
  if (!pins) return false;
  pins.hidden = !pins.hidden;
  return true;
}

async function onPicked({ postId, x, y, targetId, label }) {
  const next = photoTags.addTag(photoTags.getLocalTags(postId), { x, y, targetId, label });
  await persistPhotoTags(postId, next);
  beginTagMode("");
  share.showToast("Marca guardada neste aparelho.");
}

function cancelLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function triggerLongPress(postId, post) {
  window.__justLongPressed = true;
  setTimeout(() => {
    window.__justLongPressed = false;
  }, 400);

  const isOwn = post?.dataset.isOwn === "true" || post?.classList.contains("post-is-own");
  if (!isOwn) {
    share.showToast("Apenas o autor pode marcar pessoas nesta foto.");
    return;
  }
  beginTagMode(postId);
}

function onPointerDown(e) {
  if (e.button && e.button !== 0) return;
  const hero = e.target.closest(".post-media-hero");
  if (!hero) return;
  if (e.target.closest(".btn-photo-tag-vis, .post-ig-header, .post-ig-toolbar, .btn-post-more-menu")) return;
  const post = hero.closest(".post");
  const postId = post?.dataset.id || "";
  if (!postId) return;

  startCoords = { x: e.clientX, y: e.clientY };
  cancelLongPress();
  longPressTimer = setTimeout(() => {
    longPressTimer = null;
    triggerLongPress(postId, post);
  }, 500);
}

function onPointerMove(e) {
  if (!longPressTimer) return;
  const dx = Math.abs(e.clientX - startCoords.x);
  const dy = Math.abs(e.clientY - startCoords.y);
  if (dx > 10 || dy > 10) cancelLongPress();
}

function onHeroClick(e) {
  if (window.__justLongPressed) {
    e.preventDefault();
    e.stopPropagation();
    return true;
  }
  const frame = e.target.closest(".post-media-hero");
  const post = e.target.closest(".post");
  const postId = post?.dataset.id || "";
  if (!frame || !postId) return false;
  if (e.target.closest(".btn-photo-tag, .btn-photo-tag-vis, .photo-tag-bar, .post-ig-header, .post-ig-toolbar, .btn-post-more-menu")) {
    return false;
  }
  if (taggingId === postId) {
    e.preventDefault();
    e.stopPropagation();
    const xy = pctFromClick(e, frame);
    openPhotoTagPicker(postId, xy.x, xy.y, onPicked);
    return true;
  }
  // When not in tagging mode, allow click to reach lightbox
  return false;
}

export function attachPhotoTagUi() {
  if (wired) return;
  wired = true;
  attachPhotoTagPicker();

  document.addEventListener("pointerdown", onPointerDown, { passive: true });
  document.addEventListener("pointermove", onPointerMove, { passive: true });
  document.addEventListener("pointerup", cancelLongPress, { passive: true });
  document.addEventListener("pointercancel", cancelLongPress, { passive: true });

  document.addEventListener("contextmenu", (e) => {
    if (window.__justLongPressed && e.target.closest(".post-media-hero")) {
      e.preventDefault();
    }
  });

  document.addEventListener("click", (e) => {
    const vis = e.target.closest(".btn-photo-tag-vis");
    if (vis) {
      e.preventDefault();
      togglePins(vis.dataset.id);
      return;
    }
    const mark = e.target.closest(".btn-photo-tag");
    if (mark) {
      e.preventDefault();
      beginTagMode(mark.dataset.id);
      return;
    }
    onHeroClick(e);
  }, true);
}
