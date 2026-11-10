/** Chrome compacto do card de foto: título visível; mensagem só no expander. */

import * as postOwnership from "../post-ownership.js";
import { renderPostBodyMarkdown } from "./markdown-body.js";
import { renderRepostCiteHtml } from "./repost-cite.js";

export function renderPhotoHiddenMessageHtml(post) {
  const disp = postOwnership.formatPostDisplay({ title: post?.title, body: post?.body });
  const body = disp.mode === "title-body" ? disp.body : "";
  if (!body) return renderRepostCiteHtml(post);
  const md = renderPostBodyMarkdown(body);
  return `<div class="post-photo-message">${md}</div>${renderRepostCiteHtml(post)}`;
}
