/**
 * @file Liga o arrastar da mochila ao DOM (SUB-25b): mouse, toque longo de 300 ms e teclado (Enter, setas, R, Esc) sobre
 * as células `[data-inv-cell]`. O desenho do "fantasma" (verde cabe, vermelho não cabe) e o aviso "Não cabe aí." ficam
 * aqui; a regra está em `inventory-drag.js` e quem grava é a ação `place`, revalidada no reducer.
 * @module dungeon/inventory-drag-ui
 */
import { BACKPACK_COLS, BACKPACK_ROWS } from "./vtt-inventory-grid.js";
import { mutateSheetInventory } from "./dungeon-persistence.js";
import { getDungeonSession } from "./dungeon-state.js";
import { cellFromPoint, createPointerDrag, dropVerdict, keyboardStep } from "./inventory-drag.js";
import { createCaption } from "./inventory-caption.js";

const STYLE_ID = "sv-inventario-arrastar-stylesheet";
const CELL = "[data-inv-cell]";
const ROTATE = "[data-inv-rotate]";

/**
 * Garante que a folha do arrastar está linkada (injeção sob demanda, fora do precache civil).
 * @param {Document} [doc=document] Documento alvo.
 * @returns {void}
 */
export function ensureInventoryDragStyles(doc = document) {
  if (!doc?.head || doc.getElementById(STYLE_ID)) return;
  const link = doc.createElement("link");
  link.id = STYLE_ID;
  link.rel = "stylesheet";
  link.href = "css/sv-inventario-arrastar.css";
  doc.head.appendChild(link);
}

function showNotice(container, text) {
  const out = container.querySelector("[data-inv-notice]");
  if (out) out.textContent = text;
}

function setRotateVisible(container, visible) {
  const button = container.querySelector(ROTATE);
  if (button) button.hidden = !visible;
}

function clearGhost(container) {
  container.querySelectorAll(".sv-inv-ghost").forEach((g) => g.remove());
  container.querySelectorAll(CELL).forEach((c) => c.classList.remove("is-held"));
  setRotateVisible(container, false);
}

function paintGhost(grid, spot, size, ok) {
  let ghost = grid.querySelector(".sv-inv-ghost");
  if (!ghost) {
    ghost = grid.ownerDocument.createElement("div");
    ghost.setAttribute("aria-hidden", "true");
    grid.appendChild(ghost);
  }
  const x = Math.max(0, Math.min(spot.x, BACKPACK_COLS - size.w));
  const y = Math.max(0, Math.min(spot.y, BACKPACK_ROWS - size.h));
  ghost.className = `sv-inv-ghost ${ok ? "is-ok" : "is-bad"}`;
  ghost.style.gridColumn = `${x + 1} / span ${size.w}`;
  ghost.style.gridRow = `${y + 1} / span ${size.h}`;
}

function sizeOf(cell, rot) {
  const w = Number(cell.dataset.invW);
  const h = Number(cell.dataset.invH);
  return rot ? { w: h, h: w } : { w, h };
}

function itemsOf(ctx) {
  return ctx.session().sheet?.inventoryItems || [];
}

function itemById(ctx, id) {
  return itemsOf(ctx).find((it) => it.id === id);
}

function placeJob(ctx, payload) {
  const job = mutateSheetInventory(ctx.session(), "place", payload, ctx.opts.store);
  return ctx.settle(job, { focusSelector: `[data-inv-cell="${payload.itemId}"]` });
}

function showHeld(container, cell, held, ok) {
  clearGhost(container);
  if (!held || !cell) return;
  cell.classList.add("is-held");
  paintGhost(cell.closest("[data-inv-grid]"), held, sizeOf(cell, held.rot), ok);
}

/** Legenda do item focado pelo teclado: o nome inteiro na área de aviso, que a célula estreita não mostra; sai com o foco. */
function bindCaption(container, ctx) {
  container.addEventListener("focusin", (ev) => {
    const cell = ev.target?.closest?.(CELL);
    if (cell) ctx.caption.show(itemById(ctx, cell.dataset.invCell));
  });
  container.addEventListener("focusout", () => ctx.caption.clear());
}

function bindKeyboard(container, ctx) {
  let held = null;
  container.addEventListener("focusout", () => { if (held) { held = null; clearGhost(container); } });
  container.addEventListener("keydown", (ev) => {
    const cell = ev.target?.closest?.(CELL);
    if (!held && !cell) return;
    const items = itemsOf(ctx);
    const step = keyboardStep(held, ev.key, { items, focusId: cell?.dataset.invCell || held?.id });
    if (!step.handled) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    const picked = !held && step.state;
    held = step.state;
    showHeld(container, cell, held, held ? dropVerdict(items, held.id, held).ok : false);
    showNotice(container, picked ? "Pegou o item: setas movem, R gira, Enter solta, Esc cancela." : step.notice || "");
    if (step.action === "place") placeJob(ctx, step.place);
  });
}

function grabHeld(cell, ev) {
  const box = cell.getBoundingClientRect();
  const rot = Boolean(cell.dataset.invRot);
  const size = sizeOf(cell, rot);
  const grab = { dx: Math.floor((ev.clientX - box.left) / (box.width / size.w)), dy: Math.floor((ev.clientY - box.top) / (box.height / size.h)) };
  return { cell, id: cell.dataset.invCell, grid: cell.closest("[data-inv-grid]"), rot, grab };
}

function dropHeld(container, ctx, held, spot) {
  const verdict = spot && dropVerdict(itemsOf(ctx), held.id, spot);
  ctx.swallowClick = true;
  if (verdict?.ok) placeJob(ctx, { itemId: held.id, x: spot.x, y: spot.y, ...(held.rot ? { rot: true } : {}) });
  else if (verdict) showNotice(container, verdict.message);
}

/** Começo do arrasto por ponteiro: marca a célula, mostra o botão "Girar item" e legenda o item em mãos (o dedo tapa a célula). */
function startHeld(container, ctx, held) {
  held.cell.classList.add("is-held");
  setRotateVisible(container, true);
  ctx.caption.show(itemById(ctx, held.id), { held: true });
}

/** Girar pelo botão (só no arrasto por ponteiro; no teclado vale a tecla R) o item que o dedo segura: item quadrado não muda de pegada; devolve `true` se há arrasto em curso. */
function pointerTurner(getHeld, isActive, repaint) {
  return () => {
    const held = getHeld();
    if (!isActive() || !held) return false;
    const size = sizeOf(held.cell, false);
    if (size.w === size.h) return true;
    held.rot = !held.rot;
    if (held.spot) repaint({ ...held.spot, rot: held.rot });
    return true;
  };
}

/** Ouve `type` no contêiner e só repassa o evento do ponteiro que segura o item (`getOwner()`); os demais dedos são ignorados. */
function listenAsOwner(container, getOwner, type, fn) {
  container.addEventListener(type, (ev) => { if (ev.pointerId === getOwner()) fn(ev); });
}

/**
 * Dono do arrasto por ponteiro: o `pointerId` do dedo que pegou o item. Enquanto há arrasto em curso (`isBusy()`), um
 * `pointerdown` de outro ponteiro, em qualquer célula, não toma o arrasto; sem arrasto, o próximo dedo pega o item.
 * @param {() => boolean} isBusy Há arrasto começado.
 * @returns {{claim: (ev: {pointerId: number}) => boolean, get: () => number|null}} `claim` devolve `false` quando o ponteiro deve ser ignorado.
 */
function createOwnership(isBusy) {
  let owner = null;
  return {
    claim(ev) {
      if (isBusy() && ev.pointerId !== owner) return false;
      owner = ev.pointerId;
      return true;
    },
    get: () => owner,
  };
}

/** Só o dedo que segura o item conduz o arrasto: o segundo dedo (no botão "Girar item", por exemplo) não move, solta nem cancela nada. */
function bindOwnerEvents(container, own, pointer, finish) {
  listenAsOwner(container, own.get, "pointermove", (ev) => pointer.move({ x: ev.clientX, y: ev.clientY }));
  listenAsOwner(container, own.get, "pointerup", (ev) => pointer.up({ x: ev.clientX, y: ev.clientY }));
  listenAsOwner(container, own.get, "pointercancel", () => { pointer.cancel(); finish(); });
}

function bindPointer(container, ctx) {
  let held = null;
  const own = createOwnership(() => pointer.active);
  const spotAt = (p) => { const c = cellFromPoint(held.grid.getBoundingClientRect(), p, held.grab); return c && { ...c, rot: held.rot }; };
  const finish = () => { clearGhost(container); held = null; ctx.caption.clear(); };
  const paint = (spot) => paintGhost(held.grid, spot, sizeOf(held.cell, held.rot), dropVerdict(itemsOf(ctx), held.id, spot).ok);
  const pointer = createPointerDrag({
    onStart: () => startHeld(container, ctx, held),
    onMove: (p) => {
      held.spot = spotAt(p);
      if (held.spot) paint(held.spot);
    },
    onDrop: (p) => { const done = held; const spot = spotAt(p); finish(); dropHeld(container, ctx, done, spot); },
  });
  ctx.turners.push(pointerTurner(() => held, () => pointer.active, (spot) => paint(spot)));
  container.addEventListener("pointerdown", (ev) => {
    const cell = ev.target?.closest?.(CELL);
    ctx.swallowClick = false;
    if (!cell || (ev.pointerType === "mouse" && ev.button !== 0) || !own.claim(ev)) return;
    clearGhost(container);
    held = grabHeld(cell, ev);
    cell.setPointerCapture?.(ev.pointerId);
    pointer.down({ id: held.id, pointerType: ev.pointerType === "touch" ? "touch" : "mouse", x: ev.clientX, y: ev.clientY });
  });
  bindOwnerEvents(container, own, pointer, finish);
  container.addEventListener("touchmove", (ev) => { if (pointer.active) ev.preventDefault(); }, { passive: false });
  container.addEventListener("contextmenu", (ev) => { if (pointer.active) ev.preventDefault(); });
}

/**
 * Liga o arrastar da mochila no contêiner da Mesa (delegação: vale para a mochila desenhada agora e as próximas).
 * @param {HTMLElement} container Contêiner montado pelo controlador.
 * @param {object} opts Opções da sub-tela (`state`, `store`).
 * @param {(job: Promise<unknown>, extra?: {focusSelector?: string}) => unknown} settle Espera a operação e redesenha.
 * @returns {void}
 */
export function bindInventoryDrag(container, opts, settle) {
  const doc = container.ownerDocument || (typeof document !== "undefined" ? document : null);
  if (doc) ensureInventoryDragStyles(doc);
  const ctx = { opts, settle, swallowClick: false, turners: [], caption: createCaption(container), session: () => opts.state || getDungeonSession() };
  container.addEventListener("click", (ev) => {
    if (!ev.target?.closest?.(ROTATE)) return;
    ctx.turners.some((turn) => turn());
  });
  container.addEventListener("click", (ev) => {
    if (!ctx.swallowClick) return;
    ctx.swallowClick = false;
    ev.stopImmediatePropagation();
    ev.preventDefault();
  }, true);
  bindKeyboard(container, ctx);
  bindCaption(container, ctx);
  bindPointer(container, ctx);
}
