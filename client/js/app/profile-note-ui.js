/**
 * @file Editor da nota curta no próprio perfil (sheet modal).
 */

import * as profileNote from "../profile-note.js";
import * as localAccount from "../identity/index.js";
import * as meshProfile from "../mesh-profile.js";
import * as share from "../share.js";
import { noteEditorSheetMarkup } from "../render/profile-note-bubble.js";

const SHEET_ID = "profile-note-sheet";
let wired = false;

/**
 * Cria a folha da nota de perfil se ainda não existe e devolve a raiz.
 *
 * @returns {HTMLElement}
 */
function ensureSheet() {
  let root = document.getElementById(SHEET_ID);
  if (root) return root;
  root = document.createElement("div");
  root.id = SHEET_ID;
  root.className = "profile-note-sheet modal-overlay modal-sheet";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "Editar nota do perfil");
  root.innerHTML = noteEditorSheetMarkup();
  document.body.appendChild(root);
  return root;
}

/**
 * Abre ou fecha a folha da nota.
 *
 * @param {HTMLElement} sheet Raiz da folha.
 * @param {boolean} open Aberta.
 */
function setOpen(sheet, open) {
  sheet.hidden = !open;
  sheet.classList.toggle("is-open", open);
}

/**
 * Preenche o campo com a nota guardada para a pessoa.
 *
 * @param {string} routeId Rota da pessoa.
 */
function fillInput(routeId) {
  const rec = profileNote.getNote(routeId);
  const input = document.getElementById("profile-note-input");
  if (input) input.value = rec?.text || "";
}

/**
 * Grava a nota, atualiza o cartão da malha se a pessoa é descobrível e fecha a folha.
 *
 * @param {string} routeId Rota da pessoa.
 * @param {string} text Texto da nota.
 */
async function persistAndClose(routeId, text) {
  profileNote.setNote(routeId, text);
  if (localAccount.getMeshDiscoverable()) {
    try {
      await meshProfile.syncMeshProfileCard();
    } catch {
      /* offline */
    }
  }
  setOpen(document.getElementById(SHEET_ID), false);
  share.showToast(text ? "Nota guardada neste aparelho." : "Nota limpa.");
  const bubble = document.querySelector(`.profile-note-bubble[data-note-route="${CSS.escape(routeId)}"]`);
  const span = bubble?.querySelector(".profile-note-bubble-text");
  if (span) span.textContent = text || "Nota";
  bubble?.classList.toggle("profile-note-bubble--empty", !text);
}

/**
 * Trata o botão da folha: cancelar ou salvar a nota.
 *
 * @param {string} action Ação escolhida.
 * @param {string} routeId Rota da pessoa.
 */
async function onAction(action, routeId) {
  if (action === "cancel") {
    setOpen(document.getElementById(SHEET_ID), false);
    return;
  }
  const input = document.getElementById("profile-note-input");
  if (action === "clear") {
    await persistAndClose(routeId, "");
    return;
  }
  if (action === "save") await persistAndClose(routeId, input?.value || "");
}

/**
 * Liga clique na bolha da nota própria e ações do sheet de edição.
 *
 * @returns {void}
 */
export function attachProfileNoteHandlers() {
  if (wired) return;
  wired = true;
  document.addEventListener("click", (e) => {
    const bubble = e.target.closest(".profile-note-bubble");
    if (bubble?.dataset.noteOwn === "1") {
      e.preventDefault();
      const sheet = ensureSheet();
      fillInput(bubble.dataset.noteRoute || "");
      setOpen(sheet, true);
      document.getElementById("profile-note-input")?.focus();
      return;
    }
    const sheet = e.target.closest(`#${SHEET_ID}`);
    if (!sheet?.classList.contains("is-open")) return;
    if (e.target === sheet) {
      setOpen(sheet, false);
      return;
    }
    const btn = e.target.closest("[data-note-action]");
    if (!btn) return;
    const routeId = localAccount.getCachedRouteIdSync();
    void onAction(btn.dataset.noteAction, routeId);
  });
}
