/** Ações do sheet ⋯: salvar, republicar, apoiar, marcar. */

import * as social from "../social.js";
import * as share from "../share.js";
import * as repost from "../repost.js";
import { beginTagMode } from "../app/photo-tag-ui.js";
import { openZapModal } from "../app/zap-modal.js";

export function refreshSaveLabel(sheet, postId) {
  const btn = sheet?.querySelector('[data-action="save"]');
  if (btn) btn.textContent = social.isSaved(postId) ? "Remover dos salvos" : "Salvar";
}

export function refreshSheetExtras(sheet, ctx) {
  refreshSaveLabel(sheet, ctx.postId);
  const tagBtn = sheet.querySelector('[data-action="tag"]');
  if (tagBtn) tagBtn.hidden = !(ctx.isOwn && ctx.hasImage);
  const zapBtn = sheet.querySelector('[data-action="zap"]');
  if (zapBtn) zapBtn.hidden = !ctx.pix;
}

export function toggleSaveFromMenu(postId) {
  const saved = social.toggleSave(postId);
  share.showToast(saved ? "Post salvo neste aparelho." : "Post removido dos salvos.");
}

export async function republicarFromMenu(ctx) {
  const signed = await repost.republicarFromContext(ctx);
  share.showToast(signed ? "Republicado na praça (sem impulsionar)." : "Não foi possível republicar.");
  if (signed) window.location.hash = "#/";
}

export function apoiarFromMenu(ctx) {
  if (!ctx.pix) {
    share.showToast("Autor sem chave Pix informada.");
    return;
  }
  openZapModal({ pixKey: ctx.pix, authorName: ctx.title || "Autor", title: ctx.title || "" });
}

export function marcarFromMenu(ctx) {
  if (!ctx.isOwn || !ctx.hasImage) return;
  beginTagMode(ctx.postId);
}
