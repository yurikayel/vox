/**
 * @file Pins e barra de pessoas marcadas em posts com foto (PM-85).
 */

import { escapeHtml } from "./util.js";
import * as photoTags from "../photo-tags.js";

/**
 * Pins posicionados em percentual sobre a imagem.
 * @param {Array<object>} tags Lista sanitizada de marcas.
 * @param {object} [options={}]
 * @param {boolean} [options.visible=true] Falso adiciona classe `hidden`.
 * @returns {string} HTML dos pins ou `""`.
 */
export function renderPhotoTagPinsHtml(tags, { visible = true } = {}) {
  const list = photoTags.sanitizeTags(tags);
  if (!list.length) return "";
  const hide = visible ? "" : " hidden";
  const pins = list
    .map((t) => {
      const href = t.targetId.startsWith("vx_") ? `#/u/${encodeURIComponent(t.targetId)}` : "#";
      const name = t.label || t.targetId;
      return `<a class="photo-tag-pin" href="${href}" style="left:${t.x}%;top:${t.y}%" data-target="${escapeHtml(t.targetId)}"><span>${escapeHtml(name)}</span></a>`;
    })
    .join("");
  return `<div class="photo-tag-pins"${hide} aria-label="Pessoas marcadas">${pins}</div>`;
}

/**
 * Barra para alternar visibilidade das marcas; avisa quando não verificadas (sigv ≠ 2).
 * @param {object} post Post com id e assinatura.
 * @param {object} [options={}]
 * @param {boolean} [options.isOwn=false] Se o post é do usuário local.
 * @returns {string} HTML da barra ou `""` sem marcas.
 */
export function renderPhotoTagBarHtml(post, { isOwn = false } = {}) {
  const tags = photoTags.listTags(post);
  const n = tags.length;
  if (!n) return "";
  const note = isOwn || post.sigv === 2 ? "" : " · não verificadas";
  return `<div class="photo-tag-bar"><button type="button" class="btn-photo-tag-vis" data-id="${escapeHtml(post.id)}" aria-pressed="true">Marcas (${n})${note}</button></div>`;
}

/**
 * Camada completa: pins + barra de controle.
 * @param {object} post Post com marcas.
 * @param {object} [options={}]
 * @param {boolean} [options.isOwn=false]
 * @returns {string}
 */
export function renderPhotoTagLayerHtml(post, { isOwn = false } = {}) {
  const tags = photoTags.listTags(post);
  return `${renderPhotoTagPinsHtml(tags)}${renderPhotoTagBarHtml(post, { isOwn })}`;
}
