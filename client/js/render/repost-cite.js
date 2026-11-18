/**
 * @file Citação de republicação (sem impulsionar o original).
 *
 * Só aparece quando o post referencia um `originalId` via repost-draft.
 */

import { escapeHtml } from "./util.js";
import { getOriginalId } from "../repost-draft.js";

/**
 * Bloco `<blockquote>` ligando à publicação original com trecho ou ID.
 * @param {object} post Post republicado (excerpt, originalAuthor, id).
 * @returns {string} HTML da citação ou `""` se não for republicação.
 */
export function renderRepostCiteHtml(post) {
  const originalId = getOriginalId(post);
  if (!originalId) return "";
  const excerpt = post.excerpt || "";
  const author = post.originalAuthor || "";
  const who = author ? escapeHtml(author) : "publicação original";
  return `<blockquote class="repost-cite">
    <p class="repost-cite-kicker">Republicação</p>
    <a class="repost-cite-link" href="#/t/${encodeURIComponent(originalId)}">${escapeHtml(excerpt || originalId)}</a>
    <span class="meta">De ${who} · sem impulsionar</span>
  </blockquote>`;
}
