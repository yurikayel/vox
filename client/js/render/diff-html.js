/** @file Unified diff → HTML seguro (posts, propostas, markdown). */
import * as gov from "../governance.js";
import { escapeHtml } from "./util.js";

export function renderUnifiedDiffHtml(diffText) {
  const lines = gov.parseUnifiedDiff(diffText);
  if (!lines.length) return "";
  const lineHtmls = lines.map((l) => {
    let cls = "diff-line-ctx";
    let prefix = " ";
    if (l.type === "add") {
      cls = "diff-line-add";
      prefix = "+";
    } else if (l.type === "del") {
      cls = "diff-line-del";
      prefix = "-";
    } else if (l.type === "hunk") {
      cls = "diff-line-hunk";
      prefix = "";
    }
    const cleanText = l.text.startsWith(" ") ? l.text.slice(1) : l.text;
    const content = prefix ? `${prefix} ${cleanText}` : cleanText;
    return `<div class="diff-line ${cls}">${escapeHtml(content)}</div>`;
  }).join("");
  return `<div class="diff-viewer post-md-diff">${lineHtmls}</div>`;
}
