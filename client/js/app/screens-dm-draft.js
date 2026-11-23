/**
 * @file Rascunho da conversa de DM: resposta citada, cartão de contexto vindo do hash e foto anexada.
 *
 * Guarda o rascunho num objeto compartilhado ({@link dmDraft}) que o envio em `screens-dm-thread.js` lê e limpa.
 *
 * @module app/screens-dm-draft
 */
import * as share from "../share.js";
import * as dmMsg from "../dm-messenger.js";
import { compressRasterFileToJpegDataUrl } from "../shared/raster-file-to-jpeg.js";

/**
 * Rascunho da conversa aberta: resposta citada, cartão de contexto e foto (data URL) a anexar no próximo envio.
 *
 * @type {{ activeReplyDraft: object|null, pendingContextDraft: object|null, activeMediaDraft: string }}
 */
export const dmDraft = { activeReplyDraft: null, pendingContextDraft: null, activeMediaDraft: "" };

/**
 * Comprime a imagem da conversa para JPEG pequeno.
 *
 * @param {File} file Imagem escolhida.
 * @returns {Promise<string>}
 */
function compressDmImageFile(file) {
  return compressRasterFileToJpegDataUrl(file, { maxEdge: 380, quality: 0.56 });
}

/**
 * Liga o campo de anexar imagem à conversa.
 */
function bindDmMediaAttachmentEvents() {
  const fileInput = document.getElementById("dm-media-input");
  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressDmImageFile(file);
      dmDraft.activeMediaDraft = dmMsg.normalizeMediaDataUrl(dataUrl);
      if (!dmDraft.activeMediaDraft) throw new Error("Imagem excede o limite de 24 KB do envelope E2E.");
      const bar = document.getElementById("dm-media-draft-bar");
      if (bar) bar.hidden = false;
    } catch (err) {
      share.showToast(err.message || "Falha ao comprimir foto.", "error");
    }
  });
  document.getElementById("btn-cancel-dm-media")?.addEventListener("click", () => {
    dmDraft.activeMediaDraft = "";
    const bar = document.getElementById("dm-media-draft-bar");
    if (bar) bar.hidden = true;
  });
}

/**
 * Liga rascunho de resposta e cartões de contexto da conversa.
 *
 * @param {HTMLElement} main Raiz da tela.
 */
export function bindDmThreadDraftAndCardActions(main) {
  main.querySelectorAll(".btn-dm-reply-msg").forEach((btn) => {
    btn.addEventListener("click", () => {
      dmDraft.activeReplyDraft = { id: btn.dataset.msgId, author: btn.dataset.msgAuthor || "", snippet: btn.dataset.msgSnippet || "" };
      const bar = document.getElementById("dm-reply-draft-bar");
      const txt = document.getElementById("dm-reply-draft-text");
      if (txt) txt.textContent = `${dmDraft.activeReplyDraft.author}: "${dmDraft.activeReplyDraft.snippet}"`;
      if (bar) bar.hidden = false;
      document.getElementById("dm-message-input")?.focus();
    });
  });
  document.getElementById("btn-cancel-dm-reply")?.addEventListener("click", () => {
    dmDraft.activeReplyDraft = null;
    const bar = document.getElementById("dm-reply-draft-bar");
    if (bar) bar.hidden = true;
  });
  document.getElementById("btn-clear-dm-context")?.addEventListener("click", () => {
    dmDraft.pendingContextDraft = null;
    document.getElementById("dm-context-draft-bar")?.remove();
  });
  bindDmMediaAttachmentEvents();
}

/**
 * Consome do hash o cartão de contexto e limpa a URL.
 *
 * @param {string} peerAddress Endereço do par.
 */
export function consumeHashContextForThread(peerAddress) {
  const fromHash = dmMsg.parseDmContextFromHash(location.hash);
  if (!fromHash) return;
  dmDraft.pendingContextDraft = fromHash;
  if (typeof history !== "undefined" && typeof history.replaceState === "function") {
    history.replaceState(null, "", `#/dm/${encodeURIComponent(peerAddress)}`);
  }
}
