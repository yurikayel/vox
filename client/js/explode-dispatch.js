/** @file Disparo tático EXPLODE! (Método Janones) — Fricção zero, ondas de rede e webhooks em lote. */

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
import { escapeHtml } from "./render/util.js";

export const EXPLODE_SHEET_ID = "explode-dispatch-sheet";
export const JANONES_DEFAULT_TAGS = ["#Democracia", "#VozDoPovo", "#Vox"];

export function buildJanonesExplodeText({ title = "", body = "", url = "", hashtags = [] } = {}) {
  const cleanTitle = (title || "Mobilização no Vox").trim();
  const cleanBody = (body || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const excerpt = cleanBody.length > 140 ? `${cleanBody.slice(0, 137)}…` : cleanBody;

  const foundTags = cleanBody.match(/#[a-zA-Z0-9_À-ÿ]+/g) || [];
  const merged = Array.from(new Set([...foundTags, ...hashtags]));
  const tagList = merged.length ? merged : JANONES_DEFAULT_TAGS;
  const tagLine = `\n\n🔥 ${tagList.join(" ")}`;

  const quote = excerpt && excerpt !== cleanTitle ? `\n\n"${excerpt}"` : "";
  const lead = "🚨🚨 *COMANDO DE MOBILIZAÇÃO: EXPLODE NAS REDES!* 🚨🚨";
  const action = `👉 *VEJA E PARTICIPE DA CONVERSA:*\n${url}`;
  const foot = "\n\n*(Espalhe nos grupos e redes antes que o algoritmo esconda!)*";

  return `${lead}\n\n📢 *${cleanTitle}*${quote}\n\n${action}${tagLine}${foot}`;
}

export function buildTelegramShareUrl(text, url) {
  const t = encodeURIComponent(String(text || ""));
  const u = encodeURIComponent(String(url || ""));
  return `https://t.me/share/url?url=${u}&text=${t}`;
}

export function buildThreadsIntentUrl(text, url) {
  const full = `${String(text || "")}\n${String(url || "")}`.trim();
  return `https://www.threads.net/intent/post?text=${encodeURIComponent(full)}`;
}

export async function executeExplodeBurst(post) {
  const canonicalUrl = buildCanonicalTopicUrl(post?.id, { communityId: post?.communityId });
  const text = buildJanonesExplodeText({
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

  return { copied, webhooksSent: res.sent, text, canonicalUrl };
}

let activeExplodePost = null;
let explodeWired = false;

function buildExplodeHeaderHtml() {
  return `<div class="explode-header">
    <span class="explode-badge">💥 MÉTODO JANONES</span>
    <h3 class="explode-title">EXPLODE NAS REDES!</h3>
    <p class="explode-subtitle">Disparo tático sincronizado de fricção zero. 1 clique e a democracia acontece.</p>
  </div>`;
}

function buildExplodeGridHtml() {
  return `<div class="explode-grid" role="group" aria-label="Redes para disparo">
    <button type="button" class="explode-grid-btn btn-zap" data-explode-action="whatsapp">
      <span class="explode-grid-icon">📲</span>
      <span>WhatsApp</span>
    </button>
    <button type="button" class="explode-grid-btn btn-x" data-explode-action="twitter">
      <span class="explode-grid-icon">🐦</span>
      <span>X (Twitter)</span>
    </button>
    <button type="button" class="explode-grid-btn btn-bluesky" data-explode-action="bluesky">
      <span class="explode-grid-icon">🦋</span>
      <span>Bluesky</span>
    </button>
    <button type="button" class="explode-grid-btn btn-telegram" data-explode-action="telegram">
      <span class="explode-grid-icon">✈️</span>
      <span>Telegram</span>
    </button>
    <button type="button" class="explode-grid-btn btn-threads" data-explode-action="threads">
      <span class="explode-grid-icon">🧵</span>
      <span>Threads</span>
    </button>
    <button type="button" class="explode-grid-btn btn-webhooks" data-explode-action="webhooks">
      <span class="explode-grid-icon">💬</span>
      <span>Discord/Slack</span>
    </button>
  </div>`;
}

export function buildExplodeSheetHtml(post) {
  const url = buildCanonicalTopicUrl(post?.id, { communityId: post?.communityId });
  const text = buildJanonesExplodeText({ title: post?.title, body: post?.body, url });
  return `
    <div class="explode-panel post-more-sheet-panel" role="document">
      ${buildExplodeHeaderHtml()}
      <button type="button" class="btn-explode-burst" data-explode-action="burst">
        <span>⚡</span>
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

async function handleExplodeGridActions(action, text, url, payload) {
  if (action === "whatsapp") {
    window.open(buildWhatsAppShareUrl(text), "_blank", "noopener,noreferrer");
    return true;
  }
  if (action === "twitter") {
    window.open(buildTwitterIntentUrl(text, url), "_blank", "noopener,noreferrer");
    return true;
  }
  if (action === "bluesky") {
    window.open(buildBlueskyIntentUrl(text), "_blank", "noopener,noreferrer");
    return true;
  }
  if (action === "telegram") {
    window.open(buildTelegramShareUrl(text, url), "_blank", "noopener,noreferrer");
    return true;
  }
  if (action === "threads") {
    window.open(buildThreadsIntentUrl(text, url), "_blank", "noopener,noreferrer");
    return true;
  }
  if (action === "webhooks") {
    const hooks = loadPosseWebhooks();
    const res = hooks.length ? await firePosseWebhooks(payload, hooks) : { sent: 0, failed: 0 };
    share.showToast(
      res.sent > 0 ? `Enviado para ${res.sent} webhook(s) (Discord/Slack)!` : "Configure webhooks em Configurações → Rede.",
      res.sent > 0 ? "info" : "error",
    );
    return true;
  }
  return false;
}

async function onExplodeAction(action) {
  if (!activeExplodePost) return;
  const canonicalUrl = buildCanonicalTopicUrl(activeExplodePost.id, { communityId: activeExplodePost.communityId });
  const text = buildJanonesExplodeText({
    title: activeExplodePost.title,
    body: activeExplodePost.body,
    url: canonicalUrl,
  });
  const payload = buildPosseExportPayload({ ...activeExplodePost, canonicalUrl });

  if (action === "close") return closeExplodeSheet();

  if (action === "burst") {
    const res = await executeExplodeBurst(activeExplodePost);
    const msg = res.webhooksSent > 0
      ? `💥 Rajada disparada! (${res.webhooksSent} webhooks + texto copiado p/ colar no Zap)`
      : "💥 Munição copiada! Abra os grupos do Zap e cole!";
    share.showToast(msg);
    closeExplodeSheet();
    return;
  }

  if (await handleExplodeGridActions(action, text, canonicalUrl, payload)) {
    closeExplodeSheet();
    return;
  }

  if (action === "copy") {
    try { await navigator.clipboard.writeText(text); share.showToast("Pacote de munição copiado com sucesso! 💥"); } catch {}
    closeExplodeSheet();
    return;
  }

  if (action === "native" && navigator.share) {
    try { await navigator.share({ title: activeExplodePost.title || "Vox", text, url: canonicalUrl }); } catch {}
    closeExplodeSheet();
  }
}

export function attachExplodeHandlers() {
  if (explodeWired) return;
  explodeWired = true;

  document.addEventListener("click", (e) => {
    const explodePostBtn = e.target.closest?.(".btn-explode-post");
    if (explodePostBtn) {
      e.preventDefault();
      openExplodeSheet({
        id: explodePostBtn.dataset.id,
        title: explodePostBtn.dataset.title,
        body: explodePostBtn.dataset.body,
        author: explodePostBtn.dataset.author,
        communityId: explodePostBtn.dataset.comm || "",
      });
      return;
    }

    const sheet = document.getElementById(EXPLODE_SHEET_ID);
    if (!sheet || sheet.hidden) return;
    if (e.target === sheet) {
      closeExplodeSheet();
      return;
    }

    const btn = e.target.closest?.("[data-explode-action]");
    if (btn && sheet.contains(btn)) {
      e.preventDefault();
      void onExplodeAction(btn.getAttribute("data-explode-action"));
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeExplodeSheet();
  });
}
