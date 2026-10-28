/** Modo marcar + tap-to-show pins (ritmo IG, sem reconhecimento). */

import * as share from "../share.js";
import * as photoTags from "../photo-tags.js";
import { persistPhotoTags } from "./photo-tag-persist.js";
import { attachPhotoTagPicker, openPhotoTagPicker } from "./photo-tag-picker.js";

let taggingId = "";
let wired = false;

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

function togglePins(postId) {
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

function onHeroClick(e) {
  const frame = e.target.closest(".post-media-hero");
  const post = e.target.closest(".post");
  const postId = post?.dataset.id || "";
  if (!frame || !postId) return false;
  if (e.target.closest(".btn-photo-tag, .btn-photo-tag-vis, .photo-tag-bar, .post-ig-header, .post-ig-toolbar")) {
    return false;
  }
  if (taggingId === postId) {
    e.preventDefault();
    e.stopPropagation();
    const xy = pctFromClick(e, frame);
    openPhotoTagPicker(postId, xy.x, xy.y, onPicked);
    return true;
  }
  if (photoTags.getLocalTags(postId).length) {
    e.preventDefault();
    e.stopPropagation();
    togglePins(postId);
    return true;
  }
  return false;
}

export function attachPhotoTagUi() {
  if (wired) return;
  wired = true;
  attachPhotoTagPicker();
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
