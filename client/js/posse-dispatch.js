/** @file POSSE pós-publicação — intents, Web Share, webhooks (incubação P0). */

import * as share from "./share.js";

export { SHARE_HONEST_LIMITS_SHORT } from "./share.js";

export const POSSE_SKIP_STORAGE_KEY = "vox-posse-sheet-skip";
export const POSSE_SHEET_LEAD = "Link canônico no Vox — você ecoa manualmente.";
export const POSSE_WEBHOOKS_STORAGE_KEY = "vox-posse-webhooks";

const SHEET_ID = "posse-dispatch-sheet";

export function buildCanonicalTopicUrl(topicId, { origin, pathname, communityId } = {}) {
  const id = String(topicId || "").trim();
  if (!id) return "";
  const o =
    origin ||
    (typeof window !== "undefined" && window.location?.origin) ||
    "https://yurikayel.github.io/vox";
  const p =
    pathname ||
    (typeof window !== "undefined" && window.location?.pathname) ||
    "/vox/";
  let url = `${o}${p}#/t/${encodeURIComponent(id)}`;
  const comm = String(communityId || "").trim();
  if (comm) url += `?c=${encodeURIComponent(comm)}`;
  return url;
}

export function buildPosseShareText({ title = "", body = "", url = "" } = {}) {
  const t = String(title || "").trim();
  const b = String(body || "").trim();
  const u = String(url || "").trim();
  const head = t || "Publicação no Vox";
  const excerpt = b.length > 280 ? `${b.slice(0, 277)}…` : b;
  const lines = [head];
  if (excerpt) lines.push(excerpt);
  if (u) lines.push(`🔗 ${u}`);
  return lines.join("\n\n");
}

export function buildWhatsAppShareUrl(text) {
  return `https://wa.me/?text=${encodeURIComponent(String(text || ""))}`;
}

export function buildTwitterIntentUrl(text, url) {
  const params = new URLSearchParams();
  const t = String(text || "").trim();
  const u = String(url || "").trim();
  if (t) params.set("text", t);
  if (u) params.set("url", u);
  const q = params.toString();
  return q ? `https://twitter.com/intent/tweet?${q}` : "https://twitter.com/intent/tweet";
}

export function buildBlueskyIntentUrl(text) {
  return `https://bsky.app/intent/compose?text=${encodeURIComponent(String(text || ""))}`;
}

export function buildPosseExportPayload(post) {
  const topicId = post?.id || post?.topicId || "";
  const communityId = post?.communityId || "";
  const url = buildCanonicalTopicUrl(topicId, { communityId });
  return {
    v: 1,
    type: "vox-posse-export",
    topicId,
    communityId,
    title: post?.title || "",
    body: post?.body || "",
    image: post?.image || "",
    canonicalUrl: url,
    exportedAt: new Date().toISOString(),
  };
}

export function loadPosseWebhooks() {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(POSSE_WEBHOOKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((u) => String(u || "").trim()).filter(Boolean).slice(0, 8);
  } catch {
    return [];
  }
}

export function savePosseWebhooks(urls) {
  if (typeof localStorage === "undefined") return;
  const clean = (Array.isArray(urls) ? urls : [])
    .map((u) => String(u || "").trim())
    .filter(Boolean)
    .slice(0, 8);
  localStorage.setItem(POSSE_WEBHOOKS_STORAGE_KEY, JSON.stringify(clean));
}

export function parseWebhookLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);
}

export async function firePosseWebhooks(payload, urls = loadPosseWebhooks()) {
  const list = (urls || []).filter(Boolean);
  if (!list.length) return { sent: 0, failed: 0 };
  let sent = 0;
  let failed = 0;
  const body = JSON.stringify(payload);
  await Promise.all(
    list.map(async (url) => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          mode: "cors",
        });
        if (res.ok) sent += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }),
  );
  return { sent, failed };
}

function shouldSkipPosseSheet() {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(POSSE_SKIP_STORAGE_KEY) === "1";
}

function setSkipPosseSheet(skip) {
  if (typeof localStorage === "undefined") return;
  if (skip) localStorage.setItem(POSSE_SKIP_STORAGE_KEY, "1");
  else localStorage.removeItem(POSSE_SKIP_STORAGE_KEY);
}

function ensurePosseSheet() {
  let root = document.getElementById(SHEET_ID);
  if (root) return root;
  root = document.createElement("div");
  root.id = SHEET_ID;
  root.className = "posse-dispatch-sheet modal-overlay modal-sheet";
  root.hidden = true;
  root.setAttribute("aria-hidden", "true");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "Ecoe para outras redes (manual)");
  root.innerHTML = `
    <div class="posse-dispatch-panel post-more-sheet-panel" role="document">
      <p class="posse-dispatch-lead">${POSSE_SHEET_LEAD}</p>
      <p class="posse-dispatch-limits meta">${share.SHARE_HONEST_LIMITS_SHORT}</p>
      <p class="posse-dispatch-url meta" id="posse-dispatch-url"></p>
      <button type="button" class="post-more-sheet-item" data-posse="native">Compartilhar (aparelho)…</button>
      <button type="button" class="post-more-sheet-item" data-posse="whatsapp">WhatsApp</button>
      <button type="button" class="post-more-sheet-item" data-posse="twitter">X (Twitter)</button>
      <button type="button" class="post-more-sheet-item" data-posse="bluesky">Bluesky</button>
      <button type="button" class="post-more-sheet-item" data-posse="copy">Copiar texto + link</button>
      <button type="button" class="post-more-sheet-item" data-posse="export">Exportar JSON (CLI)</button>
      <label class="posse-dispatch-skip">
        <input type="checkbox" id="posse-dispatch-skip-cb" />
        Não mostrar de novo após publicar
      </label>
      <button type="button" class="post-more-sheet-item post-more-sheet-cancel" data-posse="close">Fechar</button>
    </div>`;
  document.body.appendChild(root);
  return root;
}

function setSheetOpen(sheet, open) {
  if (open) {
    sheet.hidden = false;
    sheet.classList.add("is-open");
    sheet.setAttribute("aria-hidden", "false");
    document.body.classList.add("post-more-sheet-open");
  } else {
    sheet.hidden = true;
    sheet.classList.remove("is-open");
    sheet.setAttribute("aria-hidden", "true");
    document.body.classList.remove("post-more-sheet-open");
  }
}

let activePost = null;
let wired = false;

export function closePosseSheet() {
  const sheet = document.getElementById(SHEET_ID);
  if (!sheet?.classList.contains("is-open")) return;
  setSheetOpen(sheet, false);
  activePost = null;
}

async function onPosseAction(action) {
  if (!activePost) return;
  const url = buildCanonicalTopicUrl(activePost.id, { communityId: activePost.communityId });
  const text = buildPosseShareText({ title: activePost.title, body: activePost.body, url });
  const skipCb = document.getElementById("posse-dispatch-skip-cb");
  if (skipCb?.checked) setSkipPosseSheet(true);

  if (action === "close") {
    closePosseSheet();
    return;
  }
  if (action === "native") {
    if (navigator.share) {
      try {
        await navigator.share({ title: activePost.title || "Vox", text, url });
      } catch {
        /* user cancelled */
      }
    } else {
      share.showToast("Compartilhamento nativo indisponível neste navegador.", "error");
    }
    closePosseSheet();
    return;
  }
  if (action === "whatsapp") {
    window.open(buildWhatsAppShareUrl(text), "_blank", "noopener,noreferrer");
    closePosseSheet();
    return;
  }
  if (action === "twitter") {
    window.open(buildTwitterIntentUrl(text, url), "_blank", "noopener,noreferrer");
    closePosseSheet();
    return;
  }
  if (action === "bluesky") {
    window.open(buildBlueskyIntentUrl(text), "_blank", "noopener,noreferrer");
    closePosseSheet();
    return;
  }
  if (action === "copy") {
    try {
      await navigator.clipboard.writeText(text);
      share.showToast("Texto copiado — link canônico incluído.");
    } catch {
      share.showToast(text.slice(0, 120), "info");
    }
    closePosseSheet();
    return;
  }
  if (action === "export") {
    const payload = buildPosseExportPayload(activePost);
    const json = JSON.stringify(payload, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      share.showToast(
        "JSON copiado — webhooks só disparam neste export; nada vai ao Meta sozinho.",
      );
    } catch {
      share.showToast("Export pronto — veja console.", "info");
      console.info("[vox-posse-export]", payload);
    }
    void firePosseWebhooks(payload);
    closePosseSheet();
  }
}

export function openPosseSheetAfterPublish(post) {
  if (!post?.id || shouldSkipPosseSheet()) return;
  const sheet = ensurePosseSheet();
  activePost = { ...post };
  const urlEl = sheet.querySelector("#posse-dispatch-url");
  const url = buildCanonicalTopicUrl(post.id, { communityId: post.communityId });
  if (urlEl) urlEl.textContent = url;
  const skipCb = sheet.querySelector("#posse-dispatch-skip-cb");
  if (skipCb) skipCb.checked = false;
  setSheetOpen(sheet, true);
  sheet.querySelector("[data-posse]")?.focus();
}

export function attachPosseSheetHandlers() {
  if (wired) return;
  wired = true;
  document.addEventListener("click", (e) => {
    const sheet = document.getElementById(SHEET_ID);
    if (!sheet || sheet.hidden) return;
    if (e.target === sheet) {
      closePosseSheet();
      return;
    }
    const btn = e.target.closest?.("[data-posse]");
    if (!btn || !sheet.contains(btn)) return;
    e.preventDefault();
    void onPosseAction(btn.getAttribute("data-posse"));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePosseSheet();
  });
}
