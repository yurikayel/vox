/**
 * @file Marcação de pessoas e tags de fotos no compositor inline.
 */
import { openPhotoTagPicker } from "./photo-tag-picker.js";
import { escapeHtml } from "../shared/html.js";
import { inlineComposerPhotoTags } from "./inline-composer-state.js";

/**
 * Renderiza os chips de tags de fotos adicionadas.
 * @param {HTMLElement|null} tagsChips Container dos chips de tags.
 * @returns {void}
 */
function renderTagChips(tagsChips) {
  if (!tagsChips) return;
  tagsChips.innerHTML = inlineComposerPhotoTags
    .map((t, idx) => `<span class="inline-composer-tag-chip"><span>${escapeHtml(t.label || t.targetId)}</span><button type="button" class="btn-remove-tag" data-idx="${idx}" aria-label="Remover marca">✕</button></span>`)
    .join("");
}

/**
 * Conecta o botão de marcar pessoas e a remoção de tags de foto.
 * @returns {void}
 */
export function bindPhotoTagging() {
  const tagPeopleBtn = document.getElementById("btn-inline-tag-people");
  const tagsChips = document.getElementById("inline-composer-tags-chips");

  tagPeopleBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    openPhotoTagPicker("composer", 50, 50, (picked) => {
      inlineComposerPhotoTags.push({ x: 50, y: 50, targetId: picked.targetId, label: picked.label });
      renderTagChips(tagsChips);
    });
  });

  tagsChips?.addEventListener("click", (e) => {
    const removeBtn = e.target.closest(".btn-remove-tag");
    if (!removeBtn) return;
    e.preventDefault();
    const idx = Number(removeBtn.dataset.idx);
    if (!Number.isNaN(idx)) {
      inlineComposerPhotoTags.splice(idx, 1);
      renderTagChips(tagsChips);
    }
  });
}
