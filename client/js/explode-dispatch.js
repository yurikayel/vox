/** @file Disparo tático EXPLODE! — Fricção zero, ondas de rede e webhooks em lote. */

import * as share from "./share.js";
import {
  buildCanonicalTopicUrl,
  buildPosseExportPayload,
  firePosseWebhooks,
  loadPosseWebhooks,
  buildWhatsAppShareUrl,
  buildTwitterIntentUrl,
  buildBlueskyIntentUrl,
} from "./posse-dispatch.js";
import { dispatchAutoReplication, loadLinkedAccounts } from "./linked-accounts.js";
import { escapeHtml } from "./render/util.js";

export const EXPLODE_SHEET_ID = "explode-dispatch-sheet";
export const DEFAULT_EXPLODE_TAGS = ["#Democracia", "#VozDoPovo", "#Vox"];
export const JANONES_DEFAULT_TAGS = DEFAULT_EXPLODE_TAGS;

export function buildExplodeText({ title = "", body = "", url = "", hashtags = [] } = {}) {
  const cleanTitle = (title || "Mobilização no Vox").trim();
  const cleanBody = (body || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const excerpt = cleanBody.length > 140 ? `${cleanBody.slice(0, 137)}…` : cleanBody;

  const foundTags = cleanBody.match(/#[a-zA-Z0-9_À-ÿ]+/g) || [];
  const merged = Array.from(new Set([...foundTags, ...hashtags]));
  const tagList = merged.length ? merged : DEFAULT_EXPLODE_TAGS;
  const tagLine = `\n\n🔥 ${tagList.join(" ")}`;

  const quote = excerpt && excerpt !== cleanTitle ? `\n\n"${excerpt}"` : "";
  const lead = "🚨🚨 *COMANDO DE MOBILIZAÇÃO: EXPLODE NAS REDES!* 🚨🚨";
  const action = `👉 *VEJA E PARTICIPE DA CONVERSA:*\n${url}`;
  const foot = "\n\n*(Espalhe nos grupos e redes antes que o algoritmo esconda!)*";

  return `${lead}\n\n📢 *${cleanTitle}*${quote}\n\n${action}${tagLine}${foot}`;
}
export const buildJanonesExplodeText = buildExplodeText;

export function buildTelegramShareUrl(text, url) {
  const t = encodeURIComponent(String(text || ""));
  const u = encodeURIComponent(String(url || ""));
  return `https://t.me/share/url?url=${u}&text=${t}`;
}

export function buildThreadsIntentUrl(text, url) {
  const full = `${String(text || "")}\n${String(url || "")}`.trim();
  return `https://www.threads.net/intent/post?text=${encodeURIComponent(full)}`;
}

export function buildFacebookShareUrl(url, quote = "") {
  const u = encodeURIComponent(String(url || ""));
  const q = encodeURIComponent(String(quote || ""));
  return `https://www.facebook.com/sharer/sharer.php?u=${u}&quote=${q}`;
}

export function buildTwitterExplodeText({ title = "", body = "" } = {}) {
  const cleanTitle = (title || "Mobilização no Vox").trim();
  const cleanBody = (body || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const excerpt = cleanBody && cleanBody !== cleanTitle ? cleanBody : "";
  const maxExcerpt = 80;
  const shortExcerpt = excerpt.length > maxExcerpt ? `${excerpt.slice(0, 77)}…` : excerpt;
  const quote = shortExcerpt ? ` — "${shortExcerpt}"` : "";

  const foundTags = (cleanBody.match(/#[a-zA-Z0-9_À-ÿ]+/g) || []).slice(0, 2);
  const tagList = foundTags.length ? foundTags : ["#Democracia", "#Vox"];
  const tagStr = tagList.join(" ");

  const lead = `📢 ${cleanTitle}${quote}`;
  const trimmed = lead.length > 180 ? `${lead.slice(0, 177)}…` : lead;
  return `${trimmed}\n\n${tagStr}`;
}

export function buildBlueskyExplodeText({ title = "", body = "", url = "" } = {}) {
  const cleanTitle = (title || "Mobilização no Vox").trim();
  const cleanBody = (body || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const excerpt = cleanBody && cleanBody !== cleanTitle ? cleanBody : "";
  const maxExcerpt = 100;
  const shortExcerpt = excerpt.length > maxExcerpt ? `${excerpt.slice(0, 97)}…` : excerpt;
  const quote = shortExcerpt ? ` — "${shortExcerpt}"` : "";

  const foundTags = (cleanBody.match(/#[a-zA-Z0-9_À-ÿ]+/g) || []).slice(0, 2);
  const tagList = foundTags.length ? foundTags : ["#Democracia", "#Vox"];
  const tagStr = tagList.join(" ");

  const full = `📢 ${cleanTitle}${quote}\n\n${url}\n\n${tagStr}`.trim();
  if (full.length <= 280) return full;
  return `📢 ${cleanTitle}\n\n${url}\n\n${tagStr}`.trim();
}

export async function quickExplodePost(post) {
  const res = await executeExplodeBurst(post);
  share.showToast(
    res.webhooksSent > 0
      ? `📢 Disparo rápido! ${res.webhooksSent} destino(s) + mensagem copiada!`
      : "📢 Mensagem copiada! Cole nos grupos ou redes.",
  );
  return res;
}

export async function executeExplodeBurst(post) {
  const canonicalUrl = buildCanonicalTopicUrl(post?.id, { communityId: post?.communityId });
  const text = buildExplodeText({
    title: post?.title,
    body: post?.body,
    url: canonicalUrl,
  });

  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {}

  const payload = buildPosseExportPayload({ ...post, canonicalUrl });
  const webhooks = loadPosseWebhooks();
  const res = webhooks.length ? await firePosseWebhooks(payload, webhooks) : { sent: 0, failed: 0 };
  const autoRep = await dispatchAutoReplication({ ...post, canonicalUrl }).catch(() => ({ count: 0 }));

  return { copied, webhooksSent: res.sent + (autoRep.count || 0), text, canonicalUrl };
}

let activeExplodePost = null;
let explodeWired = false;

function buildExplodeHeaderHtml() {
  return `<div class="explode-header">
    <span class="explode-badge">📢 REPLICAÇÃO MULTI-REDES</span>
    <h3 class="explode-title">EXPLODE NAS REDES!</h3>
    <p class="explode-subtitle">Disparo sincronizado em lote: replicação soberana com fricção zero.</p>
  </div>`;
}

function buildExplodeGridHtml() {
  const linked = loadLinkedAccounts();
  const isLinked = (id) => Boolean(linked[id]?.enabled && linked[id]?.handle);
  const badge = (id) => isLinked(id) ? `<span class="explode-grid-connected" title="Conectado: @${escapeHtml(linked[id].handle)}">✓</span>` : "";

  return `<div class="explode-grid" role="group" aria-label="Redes para disparo">
    <button type="button" class="explode-grid-btn btn-zap" data-explode-action="whatsapp"><span class="explode-grid-icon">📲</span><span>WhatsApp</span></button>
    <button type="button" class="explode-grid-btn btn-x" data-explode-action="twitter"><span class="explode-grid-icon">🐦</span><span>X (Twitter)</span>${badge("twitter")}</button>
    <button type="button" class="explode-grid-btn btn-bluesky" data-explode-action="bluesky"><span class="explode-grid-icon">🦋</span><span>Bluesky</span>${badge("bsky")}</button>
    <button type="button" class="explode-grid-btn btn-threads" data-explode-action="threads"><span class="explode-grid-icon">🧵</span><span>Threads</span>${badge("threads")}</button>
    <button type="button" class="explode-grid-btn btn-facebook" data-explode-action="facebook"><span class="explode-grid-icon">👥</span><span>Facebook</span>${badge("facebook")}</button>
    <button type="button" class="explode-grid-btn btn-instagram" data-explode-action="instagram"><span class="explode-grid-icon">📸</span><span>Instagram</span>${badge("instagram")}</button>
    <button type="button" class="explode-grid-btn btn-tiktok" data-explode-action="tiktok"><span class="explode-grid-icon">🎵</span><span>TikTok</span>${badge("tiktok")}</button>
    <button type="button" class="explode-grid-btn btn-telegram" data-explode-action="telegram"><span class="explode-grid-icon">✈️</span><span>Telegram</span></button>
    <button type="button" class="explode-grid-btn btn-webhooks" data-explode-action="webhooks"><span class="explode-grid-icon">💬</span><span>Discord/Slack</span></button>
  </div>`;
}

export function buildExplodeSheetHtml(post) {
  const url = buildCanonicalTopicUrl(post?.id, { communityId: post?.communityId });
  const text = buildExplodeText({ title: post?.title, body: post?.body, url });
  return `
    <div class="explode-panel post-more-sheet-panel" role="document">
      ${buildExplodeHeaderHtml()}
      <button type="button" class="btn-explode-burst" data-explode-action="burst">
        <span>📢</span>
        <span>DISPARAR RAJADA (Webhooks + Copiar Texto)</span>
      </button>
      ${buildExplodeGridHtml()}
      <div class="explode-preview" id="explode-preview-text">${escapeHtml(text)}</div>
      <button type="button" class="post-more-sheet-item" data-explode-action="copy">📋 Copiar Pacote de Munição</button>
      <button type="button" class="post-more-sheet-item" data-explode-action="native">📱 Compartilhar no Aparelho…</button>
      <button type="button" class="post-more-sheet-item post-more-sheet-cancel" data-explode-action="close">Fechar</button>
    </div>`;
}

function ensureExplodeSheet(post) {
  let root = document.getElementById(EXPLODE_SHEET_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = EXPLODE_SHEET_ID;
    root.className = "explode-sheet modal-overlay modal-sheet";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Painel Tático EXPLODE!");
    root.addEventListener("click", (e) => {
      if (e.target === root) {
        e.preventDefault();
        closeExplodeSheet();
      }
    });
    document.body.appendChild(root);
  }
  root.innerHTML = buildExplodeSheetHtml(post);
  return root;
}

export function openExplodeSheet(post) {
  if (!post?.id) return;
  activeExplodePost = { ...post };
  const sheet = ensureExplodeSheet(post);
  sheet.hidden = false;
  sheet.classList.add("is-open");
  sheet.setAttribute("aria-hidden", "false");
  document.body.classList.add("post-more-sheet-open");
  sheet.querySelector(".btn-explode-burst")?.focus();
}

export function closeExplodeSheet() {
  const sheet = document.getElementById(EXPLODE_SHEET_ID);
  if (!sheet?.classList.contains("is-open")) return;
  sheet.hidden = true;
  sheet.classList.remove("is-open");
  sheet.setAttribute("aria-hidden", "true");
  document.body.classList.remove("post-more-sheet-open");
  activeExplodePost = null;
}

function resolveIntentTargetUrl(action, text, url, post) {
  if (action === "whatsapp") return buildWhatsAppShareUrl(text);
  if (action === "twitter") {
    const twText = buildTwitterExplodeText({ title: post?.title, body: post?.body });
    return buildTwitterIntentUrl(twText, url);
  }
  if (action === "bluesky") {
    const bskyText = buildBlueskyExplodeText({ title: post?.title, body: post?.body, url });
    return buildBlueskyIntentUrl(bskyText);
  }
  if (action === "telegram") return buildTelegramShareUrl(text, url);
  if (action === "threads") return buildThreadsIntentUrl(text, url);
  if (action === "facebook") return buildFacebookShareUrl(url, text);
  return "";
}

async function handleExplodeGridActions(action, text, url, payload, post) {
  const targetUrl = resolveIntentTargetUrl(action, text, url, post);
  if (targetUrl) {
    window.open(targetUrl, "_blank", "noopener,noreferrer");
    return true;
  }
  if (action === "instagram" || action === "tiktok") {
    try { await navigator.clipboard.writeText(text); } catch {}
    share.showToast(`Legenda copiada! Cole no ${action === "instagram" ? "Instagram 📸" : "TikTok 🎵"}`);
    window.open(action === "instagram" ? "https://www.instagram.com/" : "https://www.tiktok.com/upload", "_blank", "noopener,noreferrer");
    return true;
  }
  if (action === "webhooks") {
    const hooks = loadPosseWebhooks();
    const res = hooks.length ? await firePosseWebhooks(payload, hooks) : { sent: 0, failed: 0 };
    share.showToast(
      res.sent > 0 ? `Enviado para ${res.sent} webhook(s)!` : "Configure webhooks em Configurações → Rede.",
      res.sent > 0 ? "info" : "error",
    );
    return true;
  }
  return false;
}

async function onExplodeAction(action) {
  if (!activeExplodePost) return;
  if (action === "close") return closeExplodeSheet();

  const canonicalUrl = buildCanonicalTopicUrl(activeExplodePost.id, { communityId: activeExplodePost.communityId });
  const text = buildExplodeText({ title: activeExplodePost.title, body: activeExplodePost.body, url: canonicalUrl });
  const payload = buildPosseExportPayload({ ...activeExplodePost, canonicalUrl });

  if (action === "burst") {
    const res = await executeExplodeBurst(activeExplodePost);
    share.showToast(res.webhooksSent > 0 ? `📢 Rajada disparada! (${res.webhooksSent} destinos)` : "📢 Mensagem copiada! Cole nos grupos!");
    return closeExplodeSheet();
  }
  if (await handleExplodeGridActions(action, text, canonicalUrl, payload, activeExplodePost)) return closeExplodeSheet();
  if (action === "copy") {
    try { await navigator.clipboard.writeText(text); share.showToast("Pacote de mensagem copiado com sucesso! 📢"); } catch {}
    return closeExplodeSheet();
  }
  if (action === "native" && navigator.share) {
    try { await navigator.share({ title: activeExplodePost.title || "Vox", text, url: canonicalUrl }); } catch {}
    closeExplodeSheet();
  }
}

function extractExplodeBtnPost(btn) {
  return {
    id: btn.dataset.id,
    title: btn.dataset.title,
    body: btn.dataset.body,
    author: btn.dataset.author,
    communityId: btn.dataset.comm || "",
  };
}

function handleDocumentExplodeClick(e) {
  const explodePostBtn = e.target.closest?.(".btn-explode-post");
  if (explodePostBtn) {
    e.preventDefault();
    const postData = extractExplodeBtnPost(explodePostBtn);
    if (e.shiftKey || e.altKey) return void quickExplodePost(postData);
    return openExplodeSheet(postData);
  }
  const sheet = document.getElementById(EXPLODE_SHEET_ID);
  if (!sheet || sheet.hidden || !sheet.classList.contains("is-open")) return;
  if (!e.target.closest(".explode-panel")) {
    e.preventDefault();
    return closeExplodeSheet();
  }
  const btn = e.target.closest?.("[data-explode-action]");
  if (btn && sheet.contains(btn)) {
    e.preventDefault();
    void onExplodeAction(btn.getAttribute("data-explode-action"));
  }
}

export function attachExplodeHandlers() {
  if (explodeWired) return;
  explodeWired = true;

  document.addEventListener("click", handleDocumentExplodeClick);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeExplodeSheet();
  });
}
