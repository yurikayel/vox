/** @file Formatação de textos e URLs de intenção para disparo em redes. */

import {
  buildWhatsAppShareUrl,
  buildTwitterIntentUrl,
  buildBlueskyIntentUrl,
} from "./posse-dispatch.js";

/** Constante de tags padrão para mobilização. @type {string[]} */
export const DEFAULT_EXPLODE_TAGS = ["#Democracia", "#VozDoPovo", "#Vox"];

/** Remove marcações HTML de forma iterativa sem regex multi-caractere.
 * @param {string} [text=""] Texto bruto.
 * @returns {string} Texto limpo em linha única.
 */
export function stripHtmlTags(text = "") {
  const src = String(text || "");
  let out = "";
  let inTag = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "<") inTag = true;
    else if (ch === ">") inTag = false;
    else if (!inTag) out += ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Monta texto de mobilização com título, resumo, link e hashtags.
 * @param {object} [options={}] Texto e metadados do disparo.
 * @returns {string} Texto formatado para disparo.
 */
export function buildExplodeText({ title = "", body = "", url = "", hashtags = [] } = {}) {
  const cleanTitle = (title || "Mobilização no Vox").trim();
  const cleanBody = stripHtmlTags(body);
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

/** Alias histórico para buildExplodeText. @type {Function} */
export const buildJanonesExplodeText = buildExplodeText;

/** Monta URL de compartilhamento no Telegram.
 * @param {string} [text] Texto de entrada.
 * @param {string} [url] URL de destino.
 * @returns {string} URL t.me gerada.
 */
export function buildTelegramShareUrl(text, url) {
  const t = encodeURIComponent(String(text || ""));
  const u = encodeURIComponent(String(url || ""));
  return `https://t.me/share/url?url=${u}&text=${t}`;
}

/** Monta URL de intenção para o Threads.
 * @param {string} [text] Texto de entrada.
 * @param {string} [url] URL de destino.
 * @returns {string} URL threads.net gerada.
 */
export function buildThreadsIntentUrl(text, url) {
  const full = `${String(text || "")}\n${String(url || "")}`.trim();
  return `https://www.threads.net/intent/post?text=${encodeURIComponent(full)}`;
}

/** Monta URL de compartilhamento no Facebook.
 * @param {string} [url] URL de destino.
 * @param {string} [quote=""] Citação para o post.
 * @returns {string} URL facebook.com gerada.
 */
export function buildFacebookShareUrl(url, quote = "") {
  const u = encodeURIComponent(String(url || ""));
  const q = encodeURIComponent(String(quote || ""));
  return `https://www.facebook.com/sharer/sharer.php?u=${u}&quote=${q}`;
}

/** Monta texto conciso para publicação no X (Twitter).
 * @param {object} [options={}] Opções de título e corpo.
 * @returns {string} Texto formatado sob limite de caracteres.
 */
export function buildTwitterExplodeText({ title = "", body = "" } = {}) {
  const cleanTitle = (title || "Mobilização no Vox").trim();
  const cleanBody = stripHtmlTags(body);
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

/** Monta texto para publicação no Bluesky.
 * @param {object} [options={}] Opções de título, corpo e URL.
 * @returns {string} Texto formatado sob 290 caracteres.
 */
export function buildBlueskyExplodeText({ title = "", body = "", url = "" } = {}) {
  const cleanTitle = (title || "Mobilização no Vox").trim();
  const cleanBody = stripHtmlTags(body);
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

/** Resolve URL de intenção web conforme rede selecionada.
 * @param {string} action Identificador da ação/rede.
 * @param {string} text Texto de entrada.
 * @param {string} url URL canônica.
 * @param {object} [post] Post de origem.
 * @returns {string} URL de destino ou vazia.
 */
export function resolveIntentTargetUrl(action, text, url, post) {
  if (action === "whatsapp") return buildWhatsAppShareUrl(text);
  if (action === "twitter") {
    const twText = buildTwitterExplodeText({ title: post?.title, body: post?.body });
    return buildTwitterIntentUrl(twText, url);
  }
  if (action === "bluesky" || action === "bsky") {
    const bskyText = buildBlueskyExplodeText({ title: post?.title, body: post?.body, url });
    return buildBlueskyIntentUrl(bskyText);
  }
  if (action === "telegram") return buildTelegramShareUrl(text, url);
  if (action === "threads") return buildThreadsIntentUrl(text, url);
  if (action === "facebook") return buildFacebookShareUrl(url, text);
  return "";
}

/** Resolve URL de disparo em rajada com hash de auto-submit se suportado.
 * @param {string} action Identificador da ação.
 * @param {string} text Texto de entrada.
 * @param {string} url URL canônica.
 * @param {object} [post] Post de origem.
 * @returns {string} URL de destino com hash ou vazia.
 */
export function resolveBurstTargetUrl(action, text, url, post) {
  if (action === "instagram") return "https://www.instagram.com/#vox-explode=1";
  if (action === "tiktok") return "https://www.tiktok.com/upload#vox-explode=1";
  const base = resolveIntentTargetUrl(action, text, url, post);
  if (!base) return "";
  return base.includes("#") ? base : `${base}#vox-explode=1`;
}

const AUTO_SUBMIT_SELECTORS = [
  '[data-testid="tweetButton"]:not([aria-disabled="true"])',
  '[data-testid="composerPublishBtn"]:not([disabled])',
  'button[aria-label="Publish"]:not([disabled])',
  'button[aria-label="Publicar"]:not([disabled])',
  'div[role="dialog"] div[role="button"]:not([aria-disabled="true"])',
];

/** Tenta acionar clique automático do botão de envio de intenção quando disparado via Vox.
 * @param {object} [doc=globalThis.document] Documento da página.
 * @param {object} [loc=globalThis.location] Objeto de localização.
 * @returns {boolean} Se o clique automático foi disparado.
 */
export function tryAutoSubmitExplodeIntent(doc = globalThis.document, loc = globalThis.location) {
  if (!doc || !loc || !String(loc.hash || "").includes("vox-explode=1")) return false;
  for (const sel of AUTO_SUBMIT_SELECTORS) {
    const btn = doc.querySelector?.(sel);
    if (btn && typeof btn.click === "function") {
      btn.click();
      return true;
    }
  }
  return false;
}
