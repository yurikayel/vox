/** Citação honesta de republicação (sem boost). */

import { escapeHtml } from "./util.js";
import { getOriginalId } from "../repost-draft.js";

export function renderRepostCiteHtml(post) {
  const originalId = getOriginalId(post);
  if (!originalId) return "";
  const excerpt = post.excerpt || "";
  const author = post.originalAuthor || "";
  const who = author ? escapeHtml(author) : "publicação original";
  return `<blockquote class="repost-cite">
    <p class="repost-cite-kicker">Republicação na praça</p>
    <a class="repost-cite-link" href="#/t/${encodeURIComponent(originalId)}">${escapeHtml(excerpt || originalId)}</a>
    <span class="meta">De ${who} · sem impulsionar</span>
  </blockquote>`;
}
