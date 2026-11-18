/**
 * @file Compartilhamento POSSE — Web Share, clipboard e URLs canônicas.
 */

import { currentInvite } from "./vox-link.js";

/**
 * Baixa um arquivo; o endereço temporário só sai depois (liberar no clique cancela o download em alguns navegadores).
 * @param {Blob} blob Conteúdo.
 * @param {string} name Nome do arquivo.
 */
export function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

/** Microcopy EXP-01 — POSSE não publica sozinho em redes fechadas (Meta). 
 * @type {string}*/
export const SHARE_HONEST_LIMITS_SHORT =
  "Você escolhe onde ecoar: Web Share do aparelho, links (WhatsApp, X, Bluesky) ou JSON/CLI. Sem post automático no Facebook ou Instagram.";

/** Microcopy exibida na interface. @type {string} */
export const SHARE_NATIVE_SUCCESS_TOAST = "Compartilhamento aberto no app que você escolheu.";
/** Microcopy exibida na interface. @type {string} */
export const SHARE_CLIPBOARD_SUCCESS_TOAST = "Link copiado — cole onde quiser publicar.";
/** Microcopy exibida na interface. @type {string} */
export const SHARE_CLIPBOARD_RICH_TOAST = "Texto formatado copiado — cole no Zap ou onde quiser.";

/** Operação `showToast` do módulo.
 * @param {*} [message] Mensagem a assinar ou verificar.
 * @param {*} [type] Parâmetro `type`.
 */
export function showToast(message, type = "info") {
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") return;
  const existing = document.querySelector(".vox-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = `vox-toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("visible");
  }, 10);

  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/**
 * Web Share quando o aparelho tem; senão copia para a área de transferência. Avisa por toast.
 * @param {object} [options={}] Dados para montar o compartilhamento.
 * @returns {Promise<boolean>} true se abriu o compartilhamento ou copiou; false se cancelou ou falhou.
 */
export async function shareOrCopy({ title, text, url = "", copyText, copiedToast = SHARE_CLIPBOARD_SUCCESS_TOAST, failToast = "Não foi possível copiar o link." }) {
  if (navigator.share) {
    try {
      await navigator.share(url ? { title, text, url } : { title, text });
      showToast(SHARE_NATIVE_SUCCESS_TOAST);
      return true;
    } catch (e) {
      if (e.name === "AbortError") return false;
    }
  }
  try {
    await navigator.clipboard.writeText(copyText ?? (url ? `${text} ${url}` : text));
    showToast(copiedToast);
    return true;
  } catch {
    showToast(failToast, "error");
    return false;
  }
}

/** Operação `formatShareBaseUrl` do módulo.
 * @returns {*} Resultado da operação.
 */
export function formatShareBaseUrl() {
  if (typeof window !== "undefined" && window.location) {
    return `${window.location.origin}${window.location.pathname}`;
  }
  return "https://yurikayel.github.io/vox/";
}

/** Operação `topicShareUrl` do módulo.
 * @param {*} [topicId] Parâmetro `topicId`.
 * @returns {*} Resultado da operação.
 */
export function topicShareUrl(topicId) {
  return `${formatShareBaseUrl()}#/t/${encodeURIComponent(topicId)}`;
}

/** Operação `connectShareUrl` do módulo.
 * @param {*} [routeId] Parâmetro `routeId`.
 * @returns {*} Resultado da operação.
 */
export function connectShareUrl(routeId) {
  return `${formatShareBaseUrl()}#/connect/${encodeURIComponent(routeId)}`;
}

/** PM-82: o próprio link de conexão com o token do convite em uso (vínculo assinado). 
 * @param {*} [routeId] Parâmetro `routeId`.
 * @returns {*} Resultado da operação.*/
export function inviteShareUrl(routeId) {
  return `${connectShareUrl(routeId)}?convite=${currentInvite().token}`;
}

/** Operação `communityShareUrl` do módulo.
 * @param {*} [communityId] Id da comunidade.
 * @returns {*} Resultado da operação.
 */
export function communityShareUrl(communityId) {
  return `${formatShareBaseUrl()}#/c/${encodeURIComponent(communityId)}`;
}

/** Monta TopicShareText para uso no cliente.
 * @param {object} [options={}] Dados para montar o compartilhamento.
 * @returns {*} Resultado da operação.
 */
export function buildTopicShareText({ title, topicId, communityId: _communityId = "", author = "", body = "" }) {
  const base = formatShareBaseUrl().replace(/\/+$/, "");
  const url = `${base}/#/t/${encodeURIComponent(topicId)}`;
  const cleanTitle = (title || "Publicação no Vox").trim();
  const authorTag = author ? ` (${author.trim()})` : "";
  const cleanBody = (body || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const excerpt = cleanBody.length > 120 ? `${cleanBody.slice(0, 117)}…` : cleanBody;
  const excerptBlock = excerpt && excerpt !== cleanTitle ? `\n\n"${excerpt}"` : "";
  return `📢 *${cleanTitle}*${authorTag}${excerptBlock}\n\n👉 Veja e debata no Vox:\n${url}`;
}

/** Monta WhatsAppShareUrl para uso no cliente.
 * @param {object} [options={}] Dados para montar o compartilhamento.
 * @returns {*} Resultado da operação.
 */
export function buildWhatsAppShareUrl({ title, topicId, communityId = "", author = "", body = "" }) {
  const text = buildTopicShareText({ title, topicId, communityId, author, body });
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
}

/** Operação `shareTopic` do módulo.
 * @param {object} [options={}] Dados para montar o compartilhamento.
 * @returns {*} Resultado da operação.
 */
export async function shareTopic({ title, topicId, communityId, author = "", body = "" }) {
  const url = topicShareUrl(topicId);
  const formattedFull = buildTopicShareText({ title, topicId, communityId, author, body });
  return shareOrCopy({ title: `${title} | Vox`, text: formattedFull, url, copyText: formattedFull, copiedToast: SHARE_CLIPBOARD_RICH_TOAST });
}

/** Operação `shareCommunity` do módulo.
 * @param {object} [options={}] Dados para montar o compartilhamento.
 * @returns {*} Resultado da operação.
 */
export async function shareCommunity({ title, communityId }) {
  const url = communityShareUrl(communityId);
  const text = `Participe da comunidade "${title}" no Vox:`;
  return shareOrCopy({ title: `${title} | Comunidade Vox`, text, url });
}

/**
 * Compartilha link de conexão; com `invite`, ativa fluxo de convite/padrinho.
 * @param {object} [options={}] Rota, nome e modo convite.
 * @returns {Promise<boolean>}
 */
export async function shareConnect({ routeId, displayName = "", invite = false }) {
  const url = invite ? inviteShareUrl(routeId) : connectShareUrl(routeId);
  const who = displayName || routeId.slice(0, 12);
  const text = invite ? `${who} te convida para o Vox:` : `Conecte com ${who} no Vox:`;
  return shareOrCopy({ title: `${who} | Vox`, text, url });
}

/** Operação `shareListing` do módulo.
 * @param {object} [options={}] Dados para montar o compartilhamento.
 * @returns {*} Resultado da operação.
 */
export async function shareListing({ title, communityId, priceLabel = "" }) {
  const commPart = communityId ? `#/c/${encodeURIComponent(communityId)}?tab=listings` : "#/";
  const url = `${window.location.origin}${window.location.pathname}${commPart}`;
  const priceText = priceLabel ? ` por ${priceLabel}` : "";
  const text = `Oferta "${title}"${priceText} na Feira do Vox:`;
  return shareOrCopy({ title: `${title} | Feira Vox`, text, url });
}
