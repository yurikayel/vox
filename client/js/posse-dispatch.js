/** @file POSSE pós-publicação — intents, Web Share, webhooks nativos Discord/Slack (incubação P0). */

import * as share from "./share.js";
import { openQrUrlSheet } from "./qr-url.js";
import { adaptWebhookPayloadForUrl, buildChatSummaryCopy } from "./chat-bridge.js";

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

export function buildCanonicalProposalUrl(communityId, proposalId, { origin, pathname } = {}) {
  const cid = String(communityId || "").trim();
  const pid = String(proposalId || "").trim();
  if (!cid || !pid) return "";
  const o =
    origin ||
    (typeof window !== "undefined" && window.location?.origin) ||
    "https://yurikayel.github.io/vox";
  const p =
    pathname ||
    (typeof window !== "undefined" && window.location?.pathname) ||
    "/vox/";
  return `${o}${p}#/c/${encodeURIComponent(cid)}/proposal/${encodeURIComponent(pid)}`;
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
  const url = post?.canonicalUrl || buildCanonicalTopicUrl(topicId, { communityId });
  const out = {
    v: 1,
    type: "vox-posse-export",
    kind: post?.kind || post?.type || "topic",
    topicId,
    communityId,
    title: post?.title || "",
    body: post?.body || "",
    image: post?.image || "",
    canonicalUrl: url,
    exportedAt: new Date().toISOString(),
  };
  if (post?.diffText != null) out.diffText = post.diffText;
  if (post?.tally != null) out.tally = post.tally;
  if (post?.state != null) out.state = post.state;
  if (post?.priceLabel) out.priceLabel = post.priceLabel;
  if (post?.locationLabel) out.locationLabel = post.locationLabel;
  if (post?.contactPix) out.contactPix = post.contactPix;
  return out;
}

export function buildProposalPossePayload(proposal, tally = null, opts = {}) {
  const communityId = proposal?.communityId || opts.communityId || "";
  const proposalId = proposal?.id || "";
  const canonicalUrl = buildCanonicalProposalUrl(communityId, proposalId, opts);
  return buildPosseExportPayload({
    ...proposal,
    kind: "governance-proposal",
    communityId,
    canonicalUrl,
    tally,
  });
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
  await Promise.all(
    list.map(async (url) => {
      try {
        const adapted = adaptWebhookPayloadForUrl(url, payload);
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(adapted),
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

function buildPosseSheetHtml() {
  return `
    <div class="posse-dispatch-panel post-more-sheet-panel" role="document">
      <p class="posse-dispatch-lead">${POSSE_SHEET_LEAD}</p>
      <p class="posse-dispatch-limits meta">${share.SHARE_HONEST_LIMITS_SHORT}</p>
      <p class="posse-dispatch-url meta" id="posse-dispatch-url"></p>
      <button type="button" class="post-more-sheet-item btn-posse-explode" data-posse="explode" style="font-weight:700; color:#d97706; background:rgba(245,158,11,0.12);">💥 EXPLODE! (Disparo Tático Janones)</button>
      <button type="button" class="post-more-sheet-item" data-posse="native">Compartilhar (aparelho)…</button>
      <button type="button" class="post-more-sheet-item" data-posse="whatsapp">WhatsApp</button>
      <button type="button" class="post-more-sheet-item" data-posse="twitter">X (Twitter)</button>
      <button type="button" class="post-more-sheet-item" data-posse="bluesky">Bluesky</button>
      <button type="button" class="post-more-sheet-item" data-posse="chat-summary">Copiar resumo (Discord / Slack)</button>
      <button type="button" class="post-more-sheet-item" data-posse="webhooks">Enviar p/ Discord / Slack (Webhook)</button>
      <button type="button" class="post-more-sheet-item" data-posse="copy">Copiar texto + link</button>
      <button type="button" class="post-more-sheet-item" data-posse="qr">QR deste link</button>
      <button type="button" class="post-more-sheet-item" data-posse="export">Exportar JSON (CLI)</button>
      <label class="posse-dispatch-skip"><input type="checkbox" id="posse-dispatch-skip-cb" /> Não mostrar de novo após publicar</label>
      <button type="button" class="post-more-sheet-item post-more-sheet-cancel" data-posse="close">Fechar</button>
    </div>`;
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
  root.innerHTML = buildPosseSheetHtml();
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

async function handlePosseBridgeActions(action, payload) {
  if (action === "chat-summary") {
    const summary = buildChatSummaryCopy(payload, { format: "discord" });
    try {
      await navigator.clipboard.writeText(summary);
      share.showToast("Resumo formatado para Discord/Slack copiado!");
    } catch {
      share.showToast(summary.slice(0, 120), "info");
    }
    closePosseSheet();
    return true;
  }
  if (action === "webhooks") {
    const urls = loadPosseWebhooks();
    if (!urls.length) {
      share.showToast("Configure webhooks do Discord/Slack em Configurações → Rede.", "info");
      closePosseSheet();
      return true;
    }
    const res = await firePosseWebhooks(payload, urls);
    share.showToast(
      res.sent > 0 ? `Enviado para ${res.sent} webhook(s) (Discord/Slack)!` : "Falha ao disparar webhook.",
      res.sent > 0 ? "info" : "error",
    );
    closePosseSheet();
    return true;
  }
  return false;
}

async function handlePosseExportAndCopy(action, payload, text, url) {
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
  if (action === "qr") {
    closePosseSheet();
    openQrUrlSheet(url);
    return;
  }
  if (action === "export") {
    const json = JSON.stringify(payload, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      share.showToast("JSON copiado — webhooks só disparam neste export; nada vai ao Meta sozinho.");
    } catch {
      share.showToast("Export pronto — veja console.", "info");
      console.info("[vox-posse-export]", payload);
    }
    void firePosseWebhooks(payload);
    closePosseSheet();
  }
}

async function handlePosseIntentActions(action, text, url) {
  if (action === "native") {
    if (navigator.share) {
      try { await navigator.share({ title: activePost?.title || "Vox", text, url }); } catch {}
    } else {
      share.showToast("Compartilhamento nativo indisponível neste navegador.", "error");
    }
    closePosseSheet();
    return true;
  }
  if (action === "whatsapp") {
    window.open(buildWhatsAppShareUrl(text), "_blank", "noopener,noreferrer");
    closePosseSheet();
    return true;
  }
  if (action === "twitter") {
    window.open(buildTwitterIntentUrl(text, url), "_blank", "noopener,noreferrer");
    closePosseSheet();
    return true;
  }
  if (action === "bluesky") {
    window.open(buildBlueskyIntentUrl(text), "_blank", "noopener,noreferrer");
    closePosseSheet();
    return true;
  }
  return false;
}

async function onPosseAction(action) {
  if (!activePost) return;
  const payload = buildPosseExportPayload(activePost);
  const url = payload.canonicalUrl;
  const text = buildPosseShareText({ title: activePost.title, body: activePost.body, url });
  const skipCb = document.getElementById("posse-dispatch-skip-cb");
  if (skipCb?.checked) setSkipPosseSheet(true);

  if (action === "close") return closePosseSheet();
  if (action === "explode") {
    const postToExplode = activePost;
    closePosseSheet();
    import("./explode-dispatch.js").then((m) => m.openExplodeSheet(postToExplode));
    return;
  }
  if (await handlePosseIntentActions(action, text, url)) return;
  if (await handlePosseBridgeActions(action, payload)) return;
  await handlePosseExportAndCopy(action, payload, text, url);
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
