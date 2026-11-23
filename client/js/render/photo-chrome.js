/**
 * @file Corpo da foto no card compacto: texto fica no expander; republicação em citação.
 */

import * as postOwnership from "../post-ownership.js";
import { escapeHtml } from "../shared/html.js";
import { renderPostBodyMarkdown } from "./markdown-body.js";
import { renderRepostCiteHtml } from "./repost-cite.js";

const IMAGE_ONLY_ALT = "Foto da publicação";

/**
 * Diz se o post define `imageAlt` (mesmo vazio).
 *
 * @param {object} post
 * @returns {boolean}
 */
function postHasExplicitImageAlt(post) {
  return Boolean(post && Object.prototype.hasOwnProperty.call(post, "imageAlt"));
}

/**
 * Texto alternativo da imagem: explícito, decorativo se há legenda, ou rótulo só-imagem.
 *
 * @param {object|null|undefined} post Publicação com `imageAlt`, `title` e `body`.
 * @returns {string}
 */
export function resolvePostImageAltText(post) {
  const raw = post?.imageAlt;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (raw === "" && postHasExplicitImageAlt(post)) return "";
  const title = String(post?.title || "").trim();
  const body = String(post?.body || "").trim();
  if (title || body) return "";
  return IMAGE_ONLY_ALT;
}

/**
 * Botão e imagem hero com `alt` e `data-media-alt` alinhados.
 *
 * @param {string} src URL ou data URL (escapada no retorno).
 * @param {string} altText Valor de `alt` (pode ser `""`).
 * @returns {string}
 */
export function renderPostImageLightboxTriggerHtml(src, altText) {
  const srcEsc = escapeHtml(src);
  const altEsc = escapeHtml(altText ?? "");
  return `<button type="button" class="post-media-lightbox-trigger" aria-label="Ver imagem em tela cheia" data-media-src="${srcEsc}" data-media-alt="${altEsc}">
        <img class="post-media post-media-hero-img" src="${srcEsc}" alt="${altEsc}" loading="lazy" />
      </button>`;
}

/**
 * Normaliza `alt` lido do DOM ou de atributos data-*.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function coerceImageAltString(value) {
  if (value == null) return "";
  return String(value);
}

/**
 * Markdown do corpo (modo title-body) mais citação de repost, ou só a citação.
 * @param {object} post Post com título/corpo e metadados de republicação.
 * @returns {string}
 */
export function renderPhotoHiddenMessageHtml(post) {
  const disp = postOwnership.formatPostDisplay({ title: post?.title, body: post?.body });
  const body = disp.mode === "title-body" ? disp.body : "";
  if (!body) return renderRepostCiteHtml(post);
  const md = renderPostBodyMarkdown(body);
  return `<div class="post-photo-message">${md}</div>${renderRepostCiteHtml(post)}`;
}
