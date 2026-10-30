/** Pins e barra de marcas sobre a foto. */

import { escapeHtml } from "./util.js";
import * as photoTags from "../photo-tags.js";

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

export function renderPhotoTagBarHtml(post, { isOwn: _isOwn = false } = {}) {
  const tags = photoTags.listTags(post);
  const n = tags.length;
  if (!n) return "";
  return `<div class="photo-tag-bar"><button type="button" class="btn-photo-tag-vis" data-id="${escapeHtml(post.id)}" aria-pressed="true">Marcas (${n})</button></div>`;
}

export function renderPhotoTagLayerHtml(post, { isOwn = false } = {}) {
  const tags = photoTags.listTags(post);
  return `${renderPhotoTagPinsHtml(tags)}${renderPhotoTagBarHtml(post, { isOwn })}`;
}
