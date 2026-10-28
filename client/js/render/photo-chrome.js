/** Chrome compacto do card de foto: título visível; mensagem só no expander. */

import * as postOwnership from "../post-ownership.js";
import { escapeHtml } from "./util.js";
import { renderPostBodyMarkdown } from "./markdown-body.js";
import { renderRepostCiteHtml } from "./repost-cite.js";

export function photoCardTitle(post) {
  const disp = postOwnership.formatPostDisplay({ title: post?.title, body: post?.body });
  if (disp.mode === "empty") return "";
  if (disp.mode === "caption") return disp.text || "";
  return disp.title || post?.title || "";
}

export function renderPhotoTitleHtml(post) {
  const title = photoCardTitle(post);
  if (!title) return "";
  const id = post?.id || "";
  const href = id ? `#/t/${encodeURIComponent(id)}` : "#";
  return `<p class="post-photo-title"><a href="${href}">${escapeHtml(title)}</a></p>`;
}

export function renderPhotoHiddenMessageHtml(post) {
  const disp = postOwnership.formatPostDisplay({ title: post?.title, body: post?.body });
  const body = disp.mode === "title-body" ? disp.body : "";
  if (!body) return renderRepostCiteHtml(post);
  const md = renderPostBodyMarkdown(body);
  return `<div class="post-photo-message">${md}</div>${renderRepostCiteHtml(post)}`;
}
