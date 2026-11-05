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
import { copyStoryCardToClipboard } from "./story-card.js";
import { recordExplosion } from "./social.js";
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

export function updateExplodeButtonsUi(postId, count) {
  if (typeof document === "undefined" || !postId) return;
  const buttons = document.querySelectorAll(`.btn-share-post[data-id="${postId}"], .btn-explode-post[data-id="${postId}"]`);
  buttons.forEach((btn) => {
    btn.classList.add("exploded");
    const countEl = btn.querySelector(".count-explodes");
    if (countEl) {
      countEl.textContent = btn.id === "btn-share-topic" || btn.id === "btn-explode-topic"
        ? (count > 0 ? `${count} disparos` : "")
        : (count > 0 ? String(count) : "");
    }
  });
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

  if (post?.id) {
    const exp = recordExplosion(post.id, post.explodesCount || 0);
    updateExplodeButtonsUi(post.id, exp.count);
  }

  return { copied, webhooksSent: res.sent + (autoRep.count || 0), text, canonicalUrl };
}

let activeExplodePost = null;
let explodeWired = false;

export const APP_ICONS = {
  whatsapp: `<svg class="app-logo-svg" width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path fill="#25D366" d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2z"/>
    <path fill="#fff" d="M17.54 14.39c-.3-.15-1.78-.88-2.06-.98-.28-.1-.48-.15-.69.15-.2.3-.79.98-.97 1.18-.18.2-.36.23-.66.08-.3-.15-1.27-.47-2.42-1.5-.89-.8-1.5-1.78-1.67-2.08-.18-.3-.02-.46.13-.61.14-.13.3-.35.45-.53.15-.18.2-.3.3-.5.1-.2.05-.38-.03-.53-.08-.15-.69-1.65-.94-2.26-.25-.6-.5-.52-.69-.53h-.59c-.2 0-.53.08-.8.38-.28.3-1.06 1.04-1.06 2.53s1.09 2.94 1.24 3.14c.15.2 2.14 3.27 5.19 4.59.73.31 1.29.5 1.74.64.73.23 1.4.2 1.93.12.59-.09 1.78-.73 2.03-1.43.25-.7.25-1.31.18-1.43-.08-.13-.28-.2-.58-.35z"/>
  </svg>`,

  twitter: `<svg class="app-logo-svg" width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>`,

  bluesky: `<svg class="app-logo-svg" width="26" height="26" viewBox="0 0 568 501" fill="#1185fe" aria-hidden="true">
    <path d="M123.121 33.664C188.241 82.552 258.281 181.68 284 234.873c25.719-53.192 95.759-152.32 160.879-201.21C491.866-1.611 568-28.906 568 57.947c0 17.346-9.945 145.713-15.778 166.555-20.275 72.453-94.155 90.933-159.875 79.748C507.222 323.8 536.444 388.56 473.333 453.32c-119.25 122.36-166.666-30.827-189.333-88.667-22.667 57.84-70.083 211.027-189.333 88.667-63.111-64.76-33.889-129.52 80.986-149.07-65.72 11.185-139.6-7.295-159.875-79.748C9.945 203.66 0 75.293 0 57.947 0-28.906 76.135-1.612 123.121 33.664Z"/>
  </svg>`,

  threads: `<svg class="app-logo-svg" width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12.03 2c-5.5 0-9.97 4.47-9.97 9.97 0 4.4 2.87 8.13 6.87 9.43.14-.11.26-.26.36-.43.43-.72.63-1.57.57-2.41-.67-.32-1.28-.75-1.8-1.28-1.55-1.56-2.41-3.64-2.41-5.84 0-4.5 3.66-8.16 8.16-8.16s8.16 3.66 8.16 8.16c0 3.32-1.9 6.29-4.82 7.56-1.5.65-3.23.6-4.63-.13-1.63-.86-2.55-2.53-2.43-4.42.15-2.3 2.1-4.08 4.44-4.08 1.28 0 2.44.52 3.26 1.45.18-.7.16-1.47-.07-2.18-.38-1.18-1.35-2.06-2.59-2.35-1.98-.46-3.95.42-4.7 2.1-.3.67-.44 1.4-.42 2.14.03 1.08.38 2.11 1.02 2.97.22.3.48.56.77.78-.17.37-.3.76-.38 1.16-.36-.26-.68-.58-.95-.94-.85-1.14-1.31-2.5-1.35-3.93-.03-.98.15-1.95.55-2.84 1-2.24 3.63-3.41 6.27-2.8 1.65.39 2.95 1.56 3.46 3.13.3 1 .28 2.06-.06 3.03l.63.29c.17.08.28.25.27.44-.12 2.45-1.33 4.63-3.32 5.83-1.68.99-3.76 1.21-5.61.6-4.48-1.46-7.7-5.65-7.7-10.59 0-6.17 5.02-11.19 11.19-11.19s11.19 5.02 11.19 11.19c0 3.99-2.14 7.62-5.59 9.47-.4.22-.84.28-1.28.18s-.8-.38-.99-.78c-.28-.58-.1-1.27.42-1.63 2.87-1.54 4.65-4.57 4.65-7.91 0-5.17-4.2-9.37-9.37-9.37z"/>
  </svg>`,

  facebook: `<svg class="app-logo-svg" width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="#1877F2"/>
    <path fill="#fff" d="M14.5 12.3h-2v7.2h-3v-7.2h-1.4v-2.5h1.4V8.2c0-1.2.6-3 3-3l2.2.01v2.4h-1.6c-.3 0-.6.1-.6.6v1.6h2.2l-.2 2.5z"/>
  </svg>`,

  instagram: `<svg class="app-logo-svg" width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="ig-btn-grad" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#FFD600"/>
        <stop offset="25%" stop-color="#FF7A00"/>
        <stop offset="50%" stop-color="#FF0069"/>
        <stop offset="75%" stop-color="#D300C5"/>
        <stop offset="100%" stop-color="#7638FA"/>
      </linearGradient>
    </defs>
    <rect x="2.5" y="2.5" width="19" height="19" rx="5" stroke="url(#ig-btn-grad)" stroke-width="2.2"/>
    <circle cx="12" cy="12" r="4.2" stroke="url(#ig-btn-grad)" stroke-width="2.2"/>
    <circle cx="17.5" cy="6.5" r="1.3" fill="url(#ig-btn-grad)"/>
  </svg>`,

  tiktok: `<svg class="app-logo-svg" width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path fill="#25F4EE" d="M19.32 6.63a4.78 4.78 0 0 1-3.6-3.98H13v12.75a2.75 2.75 0 0 1-2.75 2.75 2.75 2.75 0 0 1-2.75-2.75 2.75 2.75 0 0 1 2.75-2.75c.34 0 .66.07.96.18V9.3a6.37 6.37 0 0 0-.96-.07 6.37 6.37 0 1 0 6.37 6.37V8.52a8.03 8.03 0 0 0 4.69 1.5V6.82a4.78 4.78 0 0 1-1.99-.19z" transform="translate(-0.8, -0.6)"/>
    <path fill="#FE2C55" d="M19.32 6.63a4.78 4.78 0 0 1-3.6-3.98H13v12.75a2.75 2.75 0 0 1-2.75 2.75 2.75 2.75 0 0 1-2.75-2.75 2.75 2.75 0 0 1 2.75-2.75c.34 0 .66.07.96.18V9.3a6.37 6.37 0 0 0-.96-.07 6.37 6.37 0 1 0 6.37 6.37V8.52a8.03 8.03 0 0 0 4.69 1.5V6.82a4.78 4.78 0 0 1-1.99-.19z" transform="translate(0.8, 0.6)"/>
    <path fill="#fff" d="M19.32 6.63a4.78 4.78 0 0 1-3.6-3.98H13v12.75a2.75 2.75 0 0 1-2.75 2.75 2.75 2.75 0 0 1 2.75-2.75c.34 0 .66.07.96.18V9.3a6.37 6.37 0 0 0-.96-.07 6.37 6.37 0 1 0 6.37 6.37V8.52a8.03 8.03 0 0 0 4.69 1.5V6.82a4.78 4.78 0 0 1-1.99-.19z"/>
  </svg>`,

  telegram: `<svg class="app-logo-svg" width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="#2AABEE"/>
    <path fill="#fff" d="m16.9 7.8-1.9 9c-.1.6-.5.7-1 .4l-2.7-2-1.3 1.3c-.2.2-.3.3-.6.3l.2-2.8 5.1-4.6c.2-.2 0-.3-.3-.1l-6.3 4-2.7-.9c-.6-.2-.6-.6.1-.9l10.6-4.1c.5-.2.9.1.8.7z"/>
  </svg>`,

  webhooks: `<svg class="app-logo-svg" width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect width="24" height="24" rx="6" fill="#5865F2"/>
    <path fill="#fff" d="M17.4 6.9a13.3 13.3 0 0 0-3.3-1 .05.05 0 0 0-.05.02c-.15.26-.3.6-.42.87a12.3 12.3 0 0 0-3.7 0 8 8 0 0 0-.42-.87.05.05 0 0 0-.05-.02c-1.16.2-2.3.55-3.3 1a.05.05 0 0 0-.02.02C4.1 10.3 3.5 13.6 3.8 16.8a.06.06 0 0 0 .02.04 13.4 13.4 0 0 0 4 2 .05.05 0 0 0 .06-.02c.3-.43.6-.88.83-1.35a.05.05 0 0 0-.03-.07c-.42-.16-.82-.36-1.2-.58a.05.05 0 0 1 0-.09c.08-.06.16-.12.24-.18a.05.05 0 0 1 .05 0 9.5 9.5 0 0 0 8.7 0 .05.05 0 0 1 .05 0c.08.06.16.12.24.18a.05.05 0 0 1 0 .09c-.38.22-.78.42-1.2.58a.05.05 0 0 0-.03.07c.24.47.53.92.83 1.35a.05.05 0 0 0 .06.02 13.3 13.3 0 0 0 4-2 .06.06 0 0 0 .02-.04c.4-3.8-.7-7-2.3-9.9a.05.05 0 0 0-.02-.02zM8.9 14.8c-.8 0-1.4-.7-1.4-1.6s.6-1.6 1.4-1.6c.8 0 1.4.7 1.4 1.6s-.6 1.6-1.4 1.6zm6.2 0c-.8 0-1.4-.7-1.4-1.6s.6-1.6 1.4-1.6c.8 0 1.4.7 1.4 1.6s-.6 1.6-1.4 1.6z"/>
  </svg>`,

  whatsappMono: `<svg class="app-logo-svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
  </svg>`,

  megaphone: `<svg class="explode-megaphone" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>
  </svg>`,

  copy: `<svg class="app-logo-svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>`,

  share: `<svg class="app-logo-svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>
  </svg>`,
};

function buildExplodeHeaderHtml() {
  return `<div class="explode-header">
    <h3 class="explode-title">📢 Espalhe esta pauta</h3>
    <button type="button" class="explode-close-btn" data-explode-action="close" aria-label="Fechar">✕</button>
  </div>`;
}

function excerptForTarget(post) {
  const title = String(post?.title || "").trim();
  const body = String(post?.body || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  if (!body || body === title) return "";
  return body.length > 110 ? `${body.slice(0, 107)}…` : body;
}

/** Ponte visual: o mesmo megafone do feed "fala" o conteúdo que será espalhado. */
function buildExplodeTargetHtml(post) {
  const title = String(post?.title || "").trim() || "Esta pauta";
  const excerpt = excerptForTarget(post);
  return `<figure class="explode-target">
    <span class="explode-megaphone-wrap" aria-hidden="true">${APP_ICONS.megaphone}</span>
    <figcaption class="explode-target-text">
      <strong>${escapeHtml(title)}</strong>${excerpt ? `<span>${escapeHtml(excerpt)}</span>` : ""}
    </figcaption>
  </figure>`;
}

/** Hierarquia: 1 ação proposta → 4 rápidas → resto recolhido (Lei de Hick). */
const EXPLODE_QUICK_BUTTONS = [
  { action: "instagram", css: "btn-instagram", name: "Instagram", iconKey: "instagram", linkId: "instagram" },
  { action: "twitter", css: "btn-x", name: "X", iconKey: "twitter", linkId: "twitter" },
  { action: "telegram", css: "btn-telegram", name: "Telegram", iconKey: "telegram" },
  { action: "copy", css: "btn-copy", name: "Copiar texto", iconKey: "copy" },
];

const EXPLODE_MORE_BUTTONS = [
  { action: "tiktok", css: "btn-tiktok", name: "TikTok", iconKey: "tiktok", linkId: "tiktok" },
  { action: "bluesky", css: "btn-bluesky", name: "Bluesky", iconKey: "bluesky", linkId: "bsky" },
  { action: "threads", css: "btn-threads", name: "Threads", iconKey: "threads", linkId: "threads" },
  { action: "facebook", css: "btn-facebook", name: "Facebook", iconKey: "facebook", linkId: "facebook" },
  { action: "webhooks", css: "btn-webhooks", name: "Discord/Slack", iconKey: "webhooks" },
  { action: "native", css: "btn-native", name: "Outros apps", iconKey: "share" },
];

const EXPLODE_EXTRA_CHIPS = [
  { action: "story-card", icon: "🖼️", label: "Card para Stories", title: "Baixa imagem vertical 9:16 com a pauta" },
  { action: "cascade", icon: "🌊", label: "Uma rede por vez", title: "Abre WhatsApp, X, Threads e Bluesky em sequência" },
];

export const VOX_LOGO_SRC = "./icons/icon-mark-black-128.png";

function renderExplodeGridButton(btn, linked) {
  const badge = btn.linkId && linked[btn.linkId]?.enabled && linked[btn.linkId]?.handle
    ? `<span class="explode-grid-connected" title="Conectado: @${escapeHtml(linked[btn.linkId].handle)}">✓</span>`
    : "";
  return `<button type="button" class="explode-grid-btn ${btn.css}" data-explode-action="${btn.action}">
      <span class="explode-grid-icon">${APP_ICONS[btn.iconKey]}</span>
      <span class="explode-grid-name">${btn.name}</span>${badge}
    </button>`;
}

function buildExplodeGridHtml(buttons, label) {
  const linked = loadLinkedAccounts();
  const buttonsHtml = buttons.map((btn) => renderExplodeGridButton(btn, linked)).join("\n    ");
  return `<div class="explode-grid" role="group" aria-label="${label}">
    ${buttonsHtml}
  </div>`;
}

function buildExplodePrimaryHtml() {
  return `<div class="explode-primary-row">
      <button type="button" class="explode-primary btn-zap" data-explode-action="whatsapp">
        <span class="explode-primary-icon">${APP_ICONS.whatsappMono}</span>
        <span>WhatsApp</span>
      </button>
      <button type="button" class="explode-primary btn-explode-burst" data-explode-action="burst" aria-label="EXPLODE! Disparo automático" title="Disparo automático: copia a mensagem e envia às contas e webhooks conectados">
        <span class="explode-primary-icon"><img src="${VOX_LOGO_SRC}" alt="" width="24" height="24" /></span>
        <span>EXPLODE!</span>
      </button>
    </div>
    <p class="explode-hint">Mensagem pronta, com link e hashtags.</p>`;
}

function renderExplodeChip(chip) {
  return `<button type="button" class="explode-chip ${chip.css || ""}" data-explode-action="${chip.action}" title="${chip.title}">
      <span aria-hidden="true">${chip.icon}</span> ${chip.label}
    </button>`;
}

function buildExplodeMoreHtml() {
  return `<details class="explode-more">
    <summary>Mais redes e opções</summary>
    ${buildExplodeGridHtml(EXPLODE_MORE_BUTTONS, "Mais redes")}
    <div class="explode-actions-list">${EXPLODE_EXTRA_CHIPS.map(renderExplodeChip).join("")}</div>
  </details>`;
}

export function buildExplodeSheetHtml(post) {
  return `
    <div class="explode-panel post-more-sheet-panel" role="document">
      ${buildExplodeHeaderHtml()}
      ${buildExplodeTargetHtml(post)}
      ${buildExplodePrimaryHtml()}
      ${buildExplodeGridHtml(EXPLODE_QUICK_BUTTONS, "Outras redes")}
      ${buildExplodeMoreHtml()}
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
    root.setAttribute("aria-label", "Espalhe esta pauta");
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
  sheet.querySelector(".explode-primary")?.focus();
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
  if (action === "instagram" || action === "tiktok" || action === "story-card") {
    try { await navigator.clipboard.writeText(text); } catch {}
    const cardRes = await copyStoryCardToClipboard(post);
    const target = action === "tiktok" ? "TikTok 🎵" : "Instagram 📸";
    const msg = cardRes?.imageCopied ? `📸 Card copiado + legenda! Cole no ${target}` : `📸 Card baixado + legenda copiada! Abra o ${target}`;
    share.showToast(msg);
    if (action === "story-card") return true;
    window.open(action === "tiktok" ? "https://www.tiktok.com/upload" : "https://www.instagram.com/", "_blank", "noopener,noreferrer");
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

export const CASCADE_BAR_ID = "explode-cascade-bar";
export const CASCADE_STEPS = [
  { id: "whatsapp", label: "WhatsApp", icon: "📲" },
  { id: "twitter", label: "X (Twitter)", icon: "🐦" },
  { id: "threads", label: "Threads", icon: "🧵" },
  { id: "bluesky", label: "Bluesky", icon: "🦋" },
];

let activeCascade = null;

export function removeCascadeBar() {
  document.getElementById(CASCADE_BAR_ID)?.remove();
  activeCascade = null;
}

function openCascadeStep(step, post) {
  const canonicalUrl = buildCanonicalTopicUrl(post?.id, { communityId: post?.communityId });
  const text = buildExplodeText({ title: post?.title, body: post?.body, url: canonicalUrl });
  const targetUrl = resolveIntentTargetUrl(step.id, text, canonicalUrl, post);
  if (targetUrl) window.open(targetUrl, "_blank", "noopener,noreferrer");
}

function updateCascadeBarUi() {
  const root = document.getElementById(CASCADE_BAR_ID);
  if (!root || !activeCascade) return;
  const { stepIndex } = activeCascade;
  const current = CASCADE_STEPS[stepIndex];
  const next = CASCADE_STEPS[stepIndex + 1];

  const infoEl = root.querySelector(".explode-cascade-info");
  const nextBtn = root.querySelector(".btn-cascade-next");
  if (infoEl) {
    infoEl.innerHTML = `<span class="explode-cascade-badge">Etapa ${stepIndex + 1}/${CASCADE_STEPS.length}</span> <strong>${current.icon} ${current.label} aberto ✓</strong>`;
  }
  if (nextBtn) {
    nextBtn.textContent = next ? `👉 Próximo: ${next.icon} ${next.label}` : "🏁 Concluir Disparo";
    nextBtn.focus();
  }
}

export function advanceCascadeExplode() {
  if (!activeCascade) return;
  activeCascade.stepIndex += 1;
  if (activeCascade.stepIndex >= CASCADE_STEPS.length) {
    share.showToast("🎉 Disparo em onda concluído em todas as redes!");
    return removeCascadeBar();
  }
  openCascadeStep(CASCADE_STEPS[activeCascade.stepIndex], activeCascade.post);
  updateCascadeBarUi();
}

function buildCascadeBarHtml(stepIndex) {
  const current = CASCADE_STEPS[stepIndex];
  const next = CASCADE_STEPS[stepIndex + 1];
  return `
    <div class="explode-cascade-info">
      <span class="explode-cascade-badge">Etapa ${stepIndex + 1}/${CASCADE_STEPS.length}</span>
      <strong>${current.icon} ${current.label} aberto ✓</strong>
    </div>
    <div class="explode-cascade-actions">
      <button type="button" class="btn btn-sm btn-primary btn-cascade-next">👉 Próximo: ${next.icon} ${next.label}</button>
      <button type="button" class="btn btn-sm btn-outline btn-cascade-skip">Pular</button>
      <button type="button" class="btn btn-sm btn-text btn-cascade-close" aria-label="Fechar esteira">✕</button>
    </div>`;
}

export function startCascadeExplode(post) {
  if (!post?.id || typeof document === "undefined") return;
  closeExplodeSheet();
  void executeExplodeBurst(post);

  activeCascade = { post: { ...post }, stepIndex: 0 };
  openCascadeStep(CASCADE_STEPS[0], activeCascade.post);

  let bar = document.getElementById(CASCADE_BAR_ID);
  if (!bar) {
    bar = document.createElement("div");
    bar.id = CASCADE_BAR_ID;
    bar.className = "explode-cascade-bar";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Esteira de Disparo");
    document.body.appendChild(bar);
  }
  bar.innerHTML = buildCascadeBarHtml(0);
  bar.querySelector(".btn-cascade-next")?.focus();
}

async function handleExplodeBurst(post) {
  const res = await executeExplodeBurst(post);
  share.showToast(res.webhooksSent > 0 ? `📢 Rajada disparada! (${res.webhooksSent} destinos)` : "📢 Mensagem copiada! Cole nos grupos!");
  closeExplodeSheet();
}

async function handleExplodeCopy(text) {
  try {
    await navigator.clipboard.writeText(text);
    share.showToast("📋 Mensagem copiada! Cole onde quiser.");
  } catch {}
  closeExplodeSheet();
}

async function handleExplodeNativeShare(post, text, canonicalUrl) {
  if (!navigator.share) return handleExplodeCopy(text);
  try {
    await navigator.share({ title: post.title || "Vox", text, url: canonicalUrl });
  } catch {}
  closeExplodeSheet();
}

async function onExplodeAction(action) {
  if (!activeExplodePost) return;
  if (action === "close") return closeExplodeSheet();
  if (action === "cascade") return startCascadeExplode(activeExplodePost);

  const canonicalUrl = buildCanonicalTopicUrl(activeExplodePost.id, { communityId: activeExplodePost.communityId });
  const text = buildExplodeText({ title: activeExplodePost.title, body: activeExplodePost.body, url: canonicalUrl });
  const payload = buildPosseExportPayload({ ...activeExplodePost, canonicalUrl });

  if (action === "burst") return handleExplodeBurst(activeExplodePost);
  if (activeExplodePost?.id) {
    const exp = recordExplosion(activeExplodePost.id, activeExplodePost.explodesCount || 0);
    updateExplodeButtonsUi(activeExplodePost.id, exp.count);
  }
  if (await handleExplodeGridActions(action, text, canonicalUrl, payload, activeExplodePost)) return closeExplodeSheet();
  if (action === "copy") return handleExplodeCopy(text);
  if (action === "native") return handleExplodeNativeShare(activeExplodePost, text, canonicalUrl);
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

function handleCascadeClick(e) {
  if (e.target.closest?.(".btn-cascade-next") || e.target.closest?.(".btn-cascade-skip")) {
    e.preventDefault();
    advanceCascadeExplode();
    return true;
  }
  if (e.target.closest?.(".btn-cascade-close")) {
    e.preventDefault();
    removeCascadeBar();
    return true;
  }
  return false;
}

function handleExplodePostTriggerClick(e) {
  const shareBtn = e.target.closest?.(".btn-share-post, #btn-share-topic, .btn-explode-post");
  if (!shareBtn) return false;
  e.preventDefault();
  const postData = extractExplodeBtnPost(shareBtn);
  if (e.shiftKey || e.altKey) {
    quickExplodePost(postData);
  } else {
    openExplodeSheet(postData);
  }
  return true;
}

function handleDocumentExplodeClick(e) {
  if (handleCascadeClick(e) || handleExplodePostTriggerClick(e)) return;
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
