/** @file Full-screen post image lightbox (clean media, no overlay text). */

import { coerceImageAltString } from "../render/photo-chrome.js";

export { coerceImageAltString };

let keyHandler = null;

/**
 * Acha o elemento do lightbox de mídia do post.
 *
 * @returns {HTMLElement|null}
 */
function getLightbox() {
  return document.getElementById("post-media-lightbox");
}

/**
 * Fecha o lightbox e limpa a imagem exibida.
 */
function closePostMediaLightbox() {
  const lb = getLightbox();
  if (!lb || lb.hidden) return;
  lb.hidden = true;
  const img = lb.querySelector(".post-lightbox-img");
  if (img) {
    img.removeAttribute("src");
    img.alt = coerceImageAltString("");
  }
  document.body.classList.remove("post-lightbox-open");
  if (keyHandler) {
    document.removeEventListener("keydown", keyHandler);
    keyHandler = null;
  }
}

/**
 * Escolhe o primeiro valor preenchido entre os candidatos.
 *
 * @param {string} primary Valor preferido.
 * @param {string} secondary Segundo valor.
 * @param {string} [fallback=""] Valor se os dois estiverem vazios.
 * @returns {string}
 */
function resolveMediaValue(primary, secondary, fallback = "") {
  if (primary) return primary;
  if (secondary) return secondary;
  return fallback;
}

/**
 * Extrai origem e texto alternativo da mídia de um gatilho do lightbox.
 *
 * @param {HTMLElement|null} el Elemento gatilho (imagem ou contêiner).
 * @returns {{src: string, alt: string}}
 */
function extractMediaFromTrigger(el) {
  if (!el) return { src: "", alt: "" };
  const img = el.matches("img") ? el : el.querySelector("img");
  const dataset = el.dataset || {};
  const src = resolveMediaValue(dataset.mediaSrc, img ? img.src : el.getAttribute("src"));
  const alt = coerceImageAltString(resolveMediaValue(dataset.mediaAlt, img ? img.alt : el.getAttribute("alt")));
  return { src, alt };
}

/**
 * Lista os gatilhos do lightbox que têm imagem.
 *
 * @returns {HTMLElement[]}
 */
function getVisibleLightboxTriggers() {
  const elements = document.querySelectorAll(".post-media-lightbox-trigger, .post-media-hero-img");
  return Array.from(elements).filter((el) => Boolean(extractMediaFromTrigger(el).src));
}

/**
 * Troca a imagem do lightbox para a anterior ou a seguinte.
 *
 * @param {number} direction -1 para anterior, 1 para seguinte.
 */
function navigateLightbox(direction) {
  const lb = getLightbox();
  if (!lb || lb.hidden) return;
  const currentImg = lb.querySelector(".post-lightbox-img");
  const currentSrc = currentImg?.src || "";
  const triggers = getVisibleLightboxTriggers();
  if (triggers.length <= 1) return;

  const idx = triggers.findIndex((el) => extractMediaFromTrigger(el).src === currentSrc);
  if (idx === -1) return;
  const nextIdx = (idx + direction + triggers.length) % triggers.length;
  const { src, alt } = extractMediaFromTrigger(triggers[nextIdx]);
  if (src && currentImg) {
    currentImg.src = src;
    currentImg.alt = coerceImageAltString(alt);
  }
}

/**
 * Abre a imagem do post em lightbox tela cheia com navegação por setas.
 *
 * @param {string} src URL da mídia.
 * @param {string} [alt=""] Texto alternativo.
 * @returns {void}
 */
export function openPostMediaLightbox(src, alt = "") {
  const lb = getLightbox();
  if (!lb || !src) return;
  const img = lb.querySelector(".post-lightbox-img");
  if (!img) return;
  img.src = src;
  img.alt = coerceImageAltString(alt);
  lb.hidden = false;
  document.body.classList.add("post-lightbox-open");
  lb.querySelector(".post-lightbox-close")?.focus();

  if (!keyHandler) {
    keyHandler = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closePostMediaLightbox();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigateLightbox(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        navigateLightbox(1);
      } else if (e.key === "Tab") {
        e.preventDefault();
        lb.querySelector(".post-lightbox-close")?.focus();
      }
    };
    document.addEventListener("keydown", keyHandler);
  }
}

const IGNORED_LIGHTBOX_SELECTORS = [
  ".photo-tag-pins",
  ".photo-tag-bar",
  ".btn-photo-tag",
  ".btn-photo-tag-vis",
  ".post-overlay",
  ".post-actions-overlay",
  ".post-media-header",
  ".post-ig-toolbar",
  ".post-toolbar",
  ".btn-post-more-menu",
].join(", ");

/**
 * Diz se o clique deve ser ignorado (toque longo, modo de marcar ou controle interno).
 *
 * @param {HTMLElement} target Alvo do clique.
 * @returns {boolean}
 */
function shouldIgnoreLightboxClick(target) {
  if (window.__justLongPressed) return true;
  if (document.body.classList.contains("photo-tagging")) return true;
  return Boolean(target.closest(IGNORED_LIGHTBOX_SELECTORS));
}

/**
 * Liga cliques na mídia e teclas ao lightbox (chamar uma vez na inicialização).
 *
 * @returns {void}
 */
export function initPostMediaLightbox() {
  document.addEventListener("click", (e) => {
    const closeBtn = e.target.closest(".post-lightbox-close");
    const backdrop = e.target.closest("#post-media-lightbox");
    if (closeBtn || (backdrop && e.target === backdrop)) {
      e.preventDefault();
      closePostMediaLightbox();
      return;
    }

    if (shouldIgnoreLightboxClick(e.target)) return;
    const trigger = e.target.closest(".post-media-lightbox-trigger, .post-media-hero-img");
    if (!trigger) return;

    const { src, alt } = extractMediaFromTrigger(trigger);
    if (!src) return;
    e.preventDefault();
    openPostMediaLightbox(src, alt);
  });
}
