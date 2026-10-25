/** @file Markdown leve para corpo de posts (fenced code + parágrafos). */
import { escapeHtml } from "./util.js";
import * as hashtags from "../hashtags.js";
import { renderUnifiedDiffHtml } from "./diff-html.js";

const FENCE_RE = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;

export function splitMarkdownFences(text) {
  const src = String(text ?? "");
  const parts = [];
  let last = 0;
  FENCE_RE.lastIndex = 0;
  let m;
  while ((m = FENCE_RE.exec(src)) !== null) {
    if (m.index > last) {
      parts.push({ type: "text", value: src.slice(last, m.index) });
    }
    parts.push({ type: "code", lang: m[1] || "", value: m[2] || "" });
    last = m.index + m[0].length;
  }
  if (last < src.length) parts.push({ type: "text", value: src.slice(last) });
  if (!parts.length) parts.push({ type: "text", value: src });
  return parts;
}

function renderTextSegment(raw) {
  const trimmed = String(raw || "");
  if (!trimmed.trim()) return "";
  const paras = trimmed.split(/\n{2,}/);
  return paras
    .map((p) => {
      const line = p.replace(/\n/g, " ").trim();
      if (!line) return "";
      return `<p class="post-md-para">${hashtags.linkifyHashtags(escapeHtml(line))}</p>`;
    })
    .filter(Boolean)
    .join("");
}

function renderCodeBlock(code, lang) {
  const normLang = String(lang || "").trim().toLowerCase();
  if (normLang === "diff") {
    return `<div class="post-md-code post-md-code--diff" role="region" aria-label="diff">${renderUnifiedDiffHtml(code)}</div>`;
  }
  const label = lang ? escapeHtml(lang) : "código";
  const body = escapeHtml(String(code || "").replace(/\n$/, ""));
  const langClass = normLang ? ` post-md-code--lang-${escapeHtml(normLang.replace(/[^a-z0-9_-]/g, ""))}` : "";
  return `<div class="post-md-code${langClass}" role="region" aria-label="${label}">
    ${lang ? `<div class="post-md-code-lang">${label}</div>` : ""}
    <pre class="post-md-code-pre"><code>${body}</code></pre>
  </div>`;
}

/** HTML seguro para corpo de post (sem título). */
export function renderPostBodyMarkdown(text) {
  const parts = splitMarkdownFences(text);
  return parts
    .map((part) => {
      if (part.type === "code") return renderCodeBlock(part.value, part.lang);
      return renderTextSegment(part.value);
    })
    .join("");
}
