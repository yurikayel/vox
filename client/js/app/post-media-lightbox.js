/** @file Full-screen post image lightbox (clean media, no overlay text). */

let escHandler = null;

function getLightbox() {
  return document.getElementById("post-media-lightbox");
}

function closePostMediaLightbox() {
  const lb = getLightbox();
  if (!lb || lb.hidden) return;
  lb.hidden = true;
  const img = lb.querySelector(".post-lightbox-img");
  if (img) {
    img.removeAttribute("src");
    img.alt = "";
  }
  document.body.classList.remove("post-lightbox-open");
  if (escHandler) {
    document.removeEventListener("keydown", escHandler);
    escHandler = null;
  }
}

export function openPostMediaLightbox(src, alt = "") {
  const lb = getLightbox();
  if (!lb || !src) return;
  const img = lb.querySelector(".post-lightbox-img");
  if (!img) return;
  img.src = src;
  img.alt = alt;
  lb.hidden = false;
  document.body.classList.add("post-lightbox-open");
  lb.querySelector(".post-lightbox-close")?.focus();

  if (!escHandler) {
    escHandler = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closePostMediaLightbox();
      }
    };
    document.addEventListener("keydown", escHandler);
  }
}

function extractMediaFromTrigger(el) {
  const img = el.matches?.("img") ? el : el.querySelector?.("img");
  const src = el.dataset?.mediaSrc || img?.src || el.getAttribute?.("src") || "";
  const alt = el.dataset?.mediaAlt || img?.alt || el.getAttribute?.("alt") || "";
  return { src, alt };
}

export function initPostMediaLightbox() {
  document.addEventListener("click", (e) => {
    const closeBtn = e.target.closest(".post-lightbox-close");
    const backdrop = e.target.closest("#post-media-lightbox");
    if (closeBtn || (backdrop && e.target === backdrop)) {
      e.preventDefault();
      closePostMediaLightbox();
      return;
    }

    if (window.__justLongPressed) return;
    const trigger = e.target.closest(".post-media-lightbox-trigger, .post-media-hero-img");
    if (!trigger) return;
    if (document.body.classList.contains("photo-tagging")) return;
    if (e.target.closest(".photo-tag-pins, .photo-tag-bar, .btn-photo-tag, .btn-photo-tag-vis")) return;
    if (e.target.closest(".post-overlay, .post-actions-overlay, .post-media-header, .post-ig-toolbar, .post-toolbar, .btn-post-more-menu")) return;

    const { src, alt } = extractMediaFromTrigger(trigger);
    if (!src) return;
    e.preventDefault();
    openPostMediaLightbox(src, alt);
  });
}
