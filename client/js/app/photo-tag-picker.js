/**
 * @file Sheet para escolher contato ou colar vx_/handle ao marcar pessoa em foto.
 */

import * as contacts from "../contacts.js";
import * as peopleIndex from "../people-index.js";
import { escapeHtml } from "../render/util.js";
import * as photoTags from "../photo-tags.js";

const SHEET_ID = "photo-tag-picker";
let pending = null;
let wired = false;

/**
 * Monta a lista de contatos do seletor, ou o aviso de agenda vazia.
 *
 * @returns {string}
 */
function contactRows() {
  const list = contacts.listContacts();
  if (!list.length) {
    return `<p class="desc">Nenhum contato na agenda. Cole um vx_ ou @handle.</p>`;
  }
  return list
    .slice(0, 12)
    .map((c) => {
      const label = c.label || c.routeId;
      return `<button type="button" class="photo-tag-pick-item" data-target="${escapeHtml(c.routeId)}" data-label="${escapeHtml(label)}">${escapeHtml(label)}</button>`;
    })
    .join("");
}

/**
 * Cria o seletor de pessoas se ainda não existe e devolve a raiz.
 *
 * @returns {HTMLElement}
 */
function ensureSheet() {
  let root = document.getElementById(SHEET_ID);
  if (root) return root;
  root = document.createElement("div");
  root.id = SHEET_ID;
  root.className = "photo-tag-picker modal-overlay modal-sheet";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "Marcar pessoa");
  root.innerHTML = `<div class="photo-tag-picker-panel" role="document">
    <p class="desc">${escapeHtml(photoTags.TAGS_HINT)}</p>
    <div class="photo-tag-pick-list">${contactRows()}</div>
    <form id="photo-tag-paste-form" class="photo-tag-paste">
      <input id="photo-tag-paste" class="form-control" placeholder="vx_… ou @handle" />
      <button type="submit" class="btn btn-sm btn-primary">Marcar</button>
    </form>
    <button type="button" class="btn btn-sm btn-outline" data-tag-pick-cancel>Cancelar</button>
  </div>`;
  document.body.appendChild(root);
  return root;
}

/**
 * Abre ou fecha o seletor.
 *
 * @param {HTMLElement} sheet Raiz do seletor.
 * @param {boolean} open Aberto.
 */
function setOpen(sheet, open) {
  sheet.hidden = !open;
  sheet.classList.toggle("is-open", open);
}

/**
 * Abre o sheet de escolha de pessoa para uma marca em coordenadas percentuais da foto.
 *
 * @param {string} postId Id do post.
 * @param {number} x Posição horizontal em % (0–100).
 * @param {number} y Posição vertical em % (0–100).
 * @param {(ctx: object) => void} onPick Callback quando o usuário confirma a marca.
 * @returns {void}
 */
export function openPhotoTagPicker(postId, x, y, onPick) {
  pending = { postId, x, y, onPick };
  const sheet = ensureSheet();
  const list = sheet.querySelector(".photo-tag-pick-list");
  if (list) list.innerHTML = contactRows();
  setOpen(sheet, true);
}

/**
 * Fecha o seletor e descarta a marcação pendente.
 */
function closePicker() {
  const sheet = document.getElementById(SHEET_ID);
  if (sheet) setOpen(sheet, false);
  pending = null;
}

/**
 * Resolve o texto colado (vx_, @handle ou nome) em uma pessoa a marcar.
 *
 * @param {string} raw Texto colado.
 * @returns {Promise<{targetId: string, label: string}|null>}
 */
async function resolvePaste(raw) {
  const parsed = peopleIndex.parseConnectTarget(raw);
  if (parsed) return { targetId: parsed, label: parsed };
  const q = String(raw || "").trim();
  if (!q) return null;
  if (q.startsWith("vx_")) return { targetId: q, label: q };
  const hits = await peopleIndex.searchPeople(q);
  if (hits[0]) return { targetId: hits[0].routeId, label: hits[0].name || hits[0].handle || hits[0].routeId };
  return { targetId: q, label: q };
}

/**
 * Fecha o seletor e entrega a pessoa escolhida a quem pediu.
 *
 * @param {string} targetId Rota da pessoa.
 * @param {string} label Nome exibido.
 */
function emitPick(targetId, label) {
  if (!pending) return;
  const ctx = pending;
  closePicker();
  ctx.onPick?.({ ...ctx, targetId, label });
}

/**
 * Liga eventos do sheet de marcação em foto (uma vez por sessão).
 *
 * @returns {void}
 */
export function attachPhotoTagPicker() {
  if (wired) return;
  wired = true;
  document.addEventListener("click", (e) => {
    const sheet = document.getElementById(SHEET_ID);
    if (!sheet?.classList.contains("is-open")) return;
    if (e.target === sheet || e.target.closest("[data-tag-pick-cancel]")) {
      closePicker();
      return;
    }
    const item = e.target.closest(".photo-tag-pick-item");
    if (item) emitPick(item.dataset.target, item.dataset.label);
  });
  document.addEventListener("submit", async (e) => {
    if (e.target?.id !== "photo-tag-paste-form") return;
    e.preventDefault();
    const raw = document.getElementById("photo-tag-paste")?.value || "";
    const hit = await resolvePaste(raw);
    if (hit) emitPick(hit.targetId, hit.label);
  });
}
