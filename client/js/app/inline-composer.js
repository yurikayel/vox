/**
 * @file Fachada do compositor inline do feed: expansão, mídia leve para a malha, comunidade e publicação.
 */
import {
  syncInlineComposerUi,
  collapseInlineComposer,
  populateCommunityDatalist,
  expandInlineComposer,
  clearMedia,
} from "./inline-composer-state.js";
import {
  createVoiceRecordMachine,
  createComposerControllerState,
  bindVoiceButtons,
} from "./inline-composer-voice.js";
import {
  bindMediaFileInputs,
  bindFilterAndAspectBars,
  bindEditPanels,
} from "./inline-composer-media.js";
import { bindPhotoTagging } from "./inline-composer-tags.js";
import {
  broadcastAndPersistInlineTopic,
  bindFormSubmit,
} from "./inline-composer-publish.js";

export {
  syncInlineComposerUi,
  collapseInlineComposer,
  populateCommunityDatalist,
  expandInlineComposer,
  createVoiceRecordMachine,
  broadcastAndPersistInlineTopic,
};

/**
 * A prévia usa o atributo `hidden` **e** a classe `.hidden` na marcação; alternar só a classe
 * deixava a miniatura do anexo invisível. Este helper mantém os dois em sincronia.
 *
 * @param {HTMLElement|null} el Elemento alvo.
 * @param {boolean} visible Se deve ficar visível.
 * @returns {void}
 */
export function setPreviewVisible(el, visible) {
  if (!el) return;
  el.classList.toggle("hidden", !visible);
  el.hidden = !visible;
}

/**
 * Liga formulário, mídia e publicação do compositor inline no feed.
 *
 * @param {() => void} [onPublished] Callback após publicar com sucesso.
 * @returns {void}
 */
export function attachInlineComposerHandlers(onPublished) {
  const root = document.getElementById("feed-inline-composer");
  if (!root) return;

  const collapsed = root.querySelector(".inline-composer-collapsed");
  const form = document.getElementById("form-inline-topic");
  const removeBtn = document.getElementById("btn-inline-remove-img");
  const textarea = document.getElementById("inline-topic-body");
  const state = createComposerControllerState();

  collapsed?.addEventListener("click", () => expandInlineComposer());
  collapsed?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); expandInlineComposer(); }
  });
  removeBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    clearMedia(state);
    syncInlineComposerUi();
  });
  textarea?.addEventListener("input", syncInlineComposerUi);
  form?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); form.reset(); clearMedia(state); syncInlineComposerUi(); collapseInlineComposer(); }
  });

  bindEditPanels(root);
  bindVoiceButtons(state);
  bindMediaFileInputs(state);
  bindFilterAndAspectBars(state);
  bindPhotoTagging();
  bindFormSubmit(form, onPublished, state);
}
