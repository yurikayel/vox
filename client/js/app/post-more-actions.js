/**
 * @file Ações do sheet ⋯: salvar, republicar, apoiar com Pix e marcar em foto.
 */

import * as social from "../social.js";
import * as share from "../share.js";
import * as repost from "../repost.js";
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
 * Sincroniza rótulos e visibilidade de ações extras do sheet (tag, zap, repost).
 *
 * @param {HTMLElement} sheet Painel do menu.
 * @param {object} ctx Contexto do post (`postId`, `isOwn`, `hasImage`, `pix`, etc.).
 * @returns {void}
 */
export function refreshSheetExtras(sheet, ctx) {
  refreshSaveLabel(sheet, ctx.postId);
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
