/** Bolha de nota ao lado do avatar em #/perfil. */

import { escapeHtml } from "./util.js";
import * as profileNote from "../profile-note.js";

export function renderProfileNoteBubbleHtml(routeId, { isOwn = false } = {}) {
  const rec = profileNote.getNote(routeId);
  const emptyOwn = isOwn && !rec;
  if (!rec && !emptyOwn) return "";
  const text = rec?.text || "Nota";
  const cls = emptyOwn ? " profile-note-bubble--empty" : "";
  const own = isOwn ? "1" : "";
  const label = emptyOwn ? "Adicionar nota neste aparelho" : `Nota: ${text}`;
  return `<button type="button" class="profile-note-bubble${cls}" data-note-own="${own}" data-note-route="${escapeHtml(routeId)}" aria-label="${escapeHtml(label)}" title="${escapeHtml(profileNote.NOTE_HINT)}"><span class="profile-note-bubble-text">${escapeHtml(text)}</span></button>`;
}

export function noteEditorSheetMarkup() {
  return `
    <div class="profile-note-sheet-panel" role="document">
      <p class="profile-note-sheet-hint">${escapeHtml(profileNote.NOTE_HINT)}</p>
      <label class="profile-note-sheet-label" for="profile-note-input">Sua nota (até ${profileNote.NOTE_MAX} caracteres)</label>
      <textarea id="profile-note-input" class="form-control" maxlength="${profileNote.NOTE_MAX}" rows="2"></textarea>
      <div class="profile-note-sheet-actions">
        <button type="button" class="btn btn-sm btn-primary" data-note-action="save">Guardar</button>
        <button type="button" class="btn btn-sm btn-outline" data-note-action="clear">Limpar</button>
        <button type="button" class="btn btn-sm btn-outline" data-note-action="cancel">Cancelar</button>
      </div>
    </div>`;
}
