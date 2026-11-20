/**
 * @file Painel de Notas/Pistas (E4) — pastas virtuais e canvas Obsidian.
 * @module dungeon/screen-notes
 */
import { escapeHtml } from "../shared/html.js";
import { canvasToInvestigationBoard } from "./obsidian-bridge.js";

const FOLDERS = ["NPCs", "Locais", "Pistas", "Notas"];

function folderOf(note) {
  return FOLDERS.includes(note.folder) ? note.folder : "Notas";
}

/**
 * Visão leve de handouts públicos (sem pastas GM).
 * @param {object} state Sessão.
 * @returns {string} HTML.
 */
export function renderHandoutViewer(state) {
  const publicNotes = (state.notes || []).filter((n) => n.visibility === "public");
  return renderNotesPanel({ ...state, notes: publicNotes, viewerRole: "player" });
}

/**
 * Renderiza o painel de notas da campanha agrupado por pasta.
 * @param {object} state Sessão.
 * @returns {string} HTML.
 */
export function renderNotesPanel(state) {
  const notes = (state.notes || []).filter((n) => n.visibility !== "gm_only" || state.viewerRole === "gm");
  if (!notes.length) {
    return `<section class="dungeon-panel"><span class="dungeon-eyebrow">Obsidian · Notas</span><h2>Pistas e Lore</h2><p class="dungeon-muted">Importe <code>.md</code> ou quadros <code>.canvas</code> pelo backup.</p></section>`;
  }
  const byFolder = Object.fromEntries(FOLDERS.map((f) => [f, []]));
  for (const n of notes) byFolder[folderOf(n)].push(n);
  const cols = FOLDERS.map((folder) => {
    const cards = byFolder[folder].map((n) => {
      const board = n.canvasJson ? canvasToInvestigationBoard(n.canvasJson).slice(0, 4) : [];
      const pins = board.map((b) => `<li>${escapeHtml(b.label)}</li>`).join("");
      const canvasHtml = pins ? `<ul class="dungeon-clean-list">${pins}</ul>` : "";
      return `<article class="dungeon-lore-card"><h3>${escapeHtml(n.title)}</h3><p class="dungeon-muted">${escapeHtml((n.publicMarkdown || "").slice(0, 180))}</p>${canvasHtml}</article>`;
    }).join("");
    return `<section class="dungeon-panel"><span class="dungeon-eyebrow">${escapeHtml(folder)}</span><div class="dungeon-lore-grid">${cards || "<p class=\"dungeon-muted\">Vazio.</p>"}</div></section>`;
  }).join("");
  return `<section class="dungeon-panel" aria-label="Notas por pasta">${cols}</section>`;
}