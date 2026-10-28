/** Botão de republicar — ciclo de 2 setas; check = já republicado. */

import { escapeHtml } from "./util.js";
import { REPOST_LABEL } from "../repost-draft.js";
import { hasOwnRepost, getVisibleCount } from "../repost-index.js";

const ARROWS =
  '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M8 16H3v5"/>';
const CHECK = '<path class="icon-repost-check" d="M8 12.2 10.4 14.6 16 9"/>';

export function iconCycle(checked, size = 24) {
  const mark = checked ? CHECK : "";
  return `<svg class="action-icon icon-repost" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ARROWS}${mark}</svg>`;
}

function countSpan(n) {
  if (n <= 0) return `<span class="action-count count-reposts"></span>`;
  return `<span class="overlay-action-count action-count count-reposts">${n}</span>`;
}

export function renderRepostBtn(t, { size = 24 } = {}) {
  const id = t?.id || "";
  const on = hasOwnRepost(id);
  const n = getVisibleCount(id);
  const label = on ? "Desfazer republicação" : REPOST_LABEL;
  const aria = n > 0 ? `${label}, ${n}` : label;
  const who = t?.author || t?.owner || "";
  return `<button type="button" class="action-btn btn-repost${on ? " active" : ""}" data-id="${escapeHtml(id)}" data-title="${escapeHtml(t?.title || "")}" data-author="${escapeHtml(who)}" aria-pressed="${on ? "true" : "false"}" aria-label="${escapeHtml(aria)}" title="${escapeHtml(REPOST_LABEL)}">${iconCycle(on, size)}${countSpan(n)}</button>`;
}
