/**
 * @file Painel de Notas/Pistas (E4) — pastas virtuais sem sprawl vazio, gestão GM de visibilidade/pin e canvas Obsidian.
 * @module dungeon/screen-notes
 */
import { escapeHtml } from "../shared/html.js";
import { renderStateCard } from "../shared/state-card.js";
import { canvasToInvestigationBoard } from "./obsidian-bridge.js";

const FOLDERS = ["NPCs", "Locais", "Pistas", "Notas"];

function folderOf(note) {
  return FOLDERS.includes(note.folder) ? note.folder : "Notas";
}

/** @param {string} raw URL candidata. @returns {string} Href seguro ou vazio. */
function safeExternalHref(raw) {
  const u = String(raw || "").trim();
  return /^https?:\/\//i.test(u) ? u : "";
}

function renderCanvasPins(note, limit = 4) {
  const board = note.canvasJson ? canvasToInvestigationBoard(note.canvasJson).slice(0, limit) : [];
  if (!board.length) return "";
  return `<ul class="dungeon-clean-list">${board.map((b) => `<li>${escapeHtml(b.label)}</li>`).join("")}</ul>`;
}

/**
 * Visão leve de handouts compartilhados (jogador): cartões + links externos (PDF/imagem).
 * @param {object} state Sessão.
 * @returns {string} HTML.
 */
export function renderHandoutViewer(state) {
  const shared = (state.notes || []).filter(
    (n) => n.visibility === "shared" || n.visibility === "public",
  );
  if (!shared.length) {
    return renderStateCard({ kind: "empty", text: "Nenhum handout compartilhado com a mesa ainda." });
  }
  const cards = shared.map((n) => {
    const body = escapeHtml((n.publicMarkdown || "").slice(0, 220));
    const linkBtns = (n.links || [])
      .map((raw) => {
        const href = safeExternalHref(raw);
        if (!href) return "";
        return `<a class="dungeon-btn dungeon-btn-ghost" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">Abrir anexo</a>`;
      })
      .filter(Boolean)
      .join(" ");
    return `<article class="dungeon-lore-card"><h3>${escapeHtml(n.title)}</h3><p class="dungeon-muted">${body}</p>${renderCanvasPins(n, 3)}<div class="dungeon-card-actions">${linkBtns}</div></article>`;
  }).join("");
  return `<div class="dungeon-handout-stack" aria-label="Handouts compartilhados">${cards}</div>`;
}

function renderNoteCard(n, isGm) {
  const isShared = n.visibility === "shared" || n.visibility === "public";
  const badge = isShared ? `<span class="dungeon-badge-ok">Compartilhado</span>` : `<span class="dungeon-code-tag">Só Mestre</span>`;
  const pinTag = n.pin ? `<span class="dungeon-code-tag">Alfinete (${n.pin.x},${n.pin.y})</span>` : "";
  const gmActions = isGm
    ? `<div class="dungeon-card-actions">
        <button type="button" class="dungeon-chip-btn" data-dungeon="note-toggle-vis" data-note-id="${escapeHtml(n.id)}" data-next-vis="${isShared ? "gm_only" : "shared"}">${isShared ? "Ocultar GM" : "Compartilhar na Mesa"}</button>
        <button type="button" class="dungeon-chip-btn" data-dungeon="note-pin" data-note-id="${escapeHtml(n.id)}">Pinar no Mapa</button>
      </div>`
    : "";
  return `
    <article class="dungeon-lore-card">
      <div class="dungeon-lore-top"><h3>${escapeHtml(n.title)}</h3><div>${badge} ${pinTag}</div></div>
      <p class="dungeon-muted">${escapeHtml((n.publicMarkdown || "").slice(0, 180))}</p>
      ${renderCanvasPins(n, 4)}
      ${gmActions}
    </article>`;
}

/**
 * Renderiza o painel de notas da campanha agrupado por pasta (omitindo pastas vazias para reduzir ruído visual).
 * @param {object} state Sessão.
 * @returns {string} HTML.
 */
export function renderNotesPanel(state) {
  const isGm = state.viewerRole === "gm";
  const notes = (state.notes || []).filter((n) => n.visibility !== "gm_only" || isGm);
  if (!notes.length) {
    return `<section class="dungeon-panel"><span class="dungeon-eyebrow">Obsidian · Notas</span><h2>Pistas e Lore</h2><p class="dungeon-muted">Importe <code>.md</code> ou quadros <code>.canvas</code> pelo backup.</p></section>`;
  }
  const byFolder = Object.fromEntries(FOLDERS.map((f) => [f, []]));
  for (const n of notes) byFolder[folderOf(n)].push(n);
  const nonEmpty = FOLDERS.filter((f) => byFolder[f].length > 0);
  const cols = nonEmpty.map((folder) => {
    const cards = byFolder[folder].map((n) => renderNoteCard(n, isGm)).join("");
    return `<section class="dungeon-panel"><span class="dungeon-eyebrow">${escapeHtml(folder)} (${byFolder[folder].length})</span><div class="dungeon-lore-grid">${cards}</div></section>`;
  }).join("");
  return `<section class="dungeon-panel" aria-label="Notas por pasta">${cols}</section>`;
}
