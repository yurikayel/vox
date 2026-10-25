/**
 * Widget "Comente com Vox" (~3 KB) — script estático para sites externos.
 * Uso: <script src="https://yurikayel.github.io/vox/embed/vox-embed.js" data-topic="top_abc" async></script>
 */
(function () {
  const script = document.currentScript;
  if (!script) return;
  const topicId = script.getAttribute("data-topic") || "";
  const base = script.getAttribute("data-base") || "https://yurikayel.github.io/vox/";
  const label = script.getAttribute("data-label") || "Comentar no Vox";
  const ref = script.getAttribute("data-ref") || "embed";
  const path = topicId
    ? `${base.replace(/\/?$/, "/")}#/t/${encodeURIComponent(topicId)}?ref=${encodeURIComponent(ref)}`
    : `${base.replace(/\/?$/, "/")}#/compose/topic?ref=${encodeURIComponent(ref)}`;
  const a = document.createElement("a");
  a.href = path;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = label;
  a.className = "vox-embed-cta";
  a.style.cssText =
    "display:inline-flex;align-items:center;gap:0.35rem;padding:0.45rem 0.75rem;border-radius:999px;font:600 0.85rem system-ui,sans-serif;text-decoration:none;background:#18181a;color:#fff;border:1px solid rgba(255,255,255,0.12);";
  script.insertAdjacentElement("afterend", a);
})();
