/** @file Markdown leve para corpo de posts (fenced code + parágrafos). */
import { escapeHtml } from "./util.js";
import * as hashtags from "../hashtags.js";

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
  const label = lang ? escapeHtml(lang) : "código";
  const body = escapeHtml(String(code || "").replace(/\n$/, ""));
  return `<div class="post-md-code" role="region" aria-label="${label}">
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
