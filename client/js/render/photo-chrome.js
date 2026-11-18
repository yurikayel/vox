/**
 * @file Corpo da foto no card compacto: texto fica no expander; republicação em citação.
 */

import * as postOwnership from "../post-ownership.js";
import { renderPostBodyMarkdown } from "./markdown-body.js";
import { renderRepostCiteHtml } from "./repost-cite.js";

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
