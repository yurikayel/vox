/**
 * @file Ações do sheet ⋯: salvar, republicar, apoiar com Pix, marcar em foto e ouvir.
 */

import * as social from "../social.js";
import * as share from "../share.js";
import * as repost from "../repost.js";
import { isSpeakingPost, togglePostSpeech } from "../shared/post-speech.js";
import { beginTagMode } from "./photo-tag-ui.js";
import { openZapModal } from "./zap-modal.js";
import { toastRepostResult } from "./repost-ui.js";

/**
 * Atualiza o rótulo da ação salvar conforme estado local.
 *
 * @param {HTMLElement} sheet Painel do menu.
 * @param {string} postId Id do post.
 * @returns {void}
 */
export function refreshSaveLabel(sheet, postId) {
  const btn = sheet?.querySelector('[data-action="save"]');
  if (btn) btn.textContent = social.isSaved(postId) ? "Remover dos salvos" : "Salvar";
}

/**
 * Atualiza o rótulo da ação de ouvir conforme o estado da síntese de voz.
 *
 * @param {HTMLElement} sheet Painel do menu.
 * @param {string} postId Id do post.
 * @returns {void}
 */
export function refreshListenLabel(sheet, postId) {
  const btn = sheet?.querySelector('[data-action="listen"]');
  if (btn) btn.textContent = isSpeakingPost(postId) ? "Parar leitura" : "Ouvir post";
}

/**
 * Sincroniza rótulos e visibilidade de ações extras do sheet (tag, zap, repost, ouvir).
 *
 * @param {HTMLElement} sheet Painel do menu.
 * @param {object} ctx Contexto do post (`postId`, `isOwn`, `hasImage`, `pix`, etc.).
 * @returns {void}
 */
export function refreshSheetExtras(sheet, ctx) {
  refreshSaveLabel(sheet, ctx.postId);
  refreshListenLabel(sheet, ctx.postId);
  const tagBtn = sheet.querySelector('[data-action="tag"]');
  if (tagBtn) tagBtn.hidden = !(ctx.isOwn && ctx.hasImage);
  const zapBtn = sheet.querySelector('[data-action="zap"]');
  if (zapBtn) zapBtn.hidden = !ctx.pix;
  const rp = sheet.querySelector('[data-action="repost"]');
  if (rp) rp.textContent = repost.hasOwnRepost(ctx.postId) ? "Desfazer republicação" : repost.REPOST_LABEL;
}

/**
 * Alterna salvar local e mostra toast.
 *
 * @param {string} postId Id do post.
 * @returns {void}
 */
export function toggleSaveFromMenu(postId) {
  const saved = social.toggleSave(postId);
  share.showToast(saved ? "Post salvo neste aparelho." : "Post removido dos salvos.");
}

/**
 * Republica ou desfaz republicação a partir do menu do post.
 *
 * @param {object} ctx Contexto passado a {@link repost.toggleFromContext}.
 * @returns {Promise<void>}
 */
export async function republicarFromMenu(ctx) {
  const res = await repost.toggleFromContext(ctx);
  toastRepostResult(res);
  if (res?.ok) window.location.hash = "#/";
}

/**
 * Abre modal Pix para apoiar o autor quando há chave no contexto.
 *
 * @param {object} ctx Deve incluir `pix` e metadados de exibição.
 * @returns {void}
 */
export function apoiarFromMenu(ctx) {
  if (!ctx.pix) {
    share.showToast("Autor sem chave Pix informada.");
    return;
  }
  openZapModal({ pixKey: ctx.pix, authorName: ctx.title || "Autor", title: ctx.title || "" });
}

/**
 * Entra no modo marcar pessoas quando o post é próprio e tem imagem.
 *
 * @param {object} ctx Contexto com `postId`, `isOwn`, `hasImage`.
 * @returns {void}
 */
export function marcarFromMenu(ctx) {
  if (!ctx.isOwn || !ctx.hasImage) return;
  beginTagMode(ctx.postId);
}

/**
 * Extrai título e corpo a partir do contexto ou busca no DOM da publicação.
 *
 * @param {object} ctx Contexto com `postId`, `title` e opcionalmente `body`.
 * @returns {{ title: string, body: string }} Textos resolvidos.
 */
function resolveContextText(ctx) {
  const title = ctx.title || "";
  let body = ctx.body || "";
  if (!body && typeof document !== "undefined") {
    const el = document.querySelector(`[data-post-id="${ctx.postId}"], [data-id="${ctx.postId}"]`);
    const card = el?.closest(".post");
    const copyBtn = card?.querySelector(".btn-copy-md");
    body = copyBtn?.dataset.body || card?.querySelector(".post-body")?.textContent?.trim() || "";
  }
  return { title, body };
}

/**
 * Alterna a leitura em voz alta do post a partir do menu e emite toast com o status.
 *
 * @param {object} ctx Contexto com `postId`, `title` e opcionalmente `body`.
 * @returns {boolean} `true` se a ação foi executada com sucesso.
 */
export function ouvirFromMenu(ctx) {
  if (!ctx?.postId) return false;
  const { title, body } = resolveContextText(ctx);
  const result = togglePostSpeech({ postId: ctx.postId, title, body });
  if (!result.ok) {
    if (result.reason === "unsupported") {
      share.showToast("Leitura em voz alta não suportada neste aparelho.", "error");
    } else if (result.reason === "empty") {
      share.showToast("Publicação sem texto para leitura.", "info");
    } else {
      share.showToast("Não foi possível iniciar a leitura.", "error");
    }
    return false;
  }
  share.showToast(result.speaking ? "Lendo publicação em voz alta…" : "Leitura interrompida.");
  return true;
}
