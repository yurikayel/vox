/**
 * @file Lógica pura do arrastar na mochila (SUB-25b): veredito "não cabe aí" igual ao do reducer, ponto→célula,
 * máquina do teclado (Enter, setas, R, Esc) e máquina do ponteiro (mouse; toque longo de 300 ms). Não toca o DOM
 * nem a ficha: quem grava é a ação `place` do `INVENTORY_MUTATE`, que revalida tudo.
 * @module dungeon/inventory-drag
 */
import { BACKPACK_COLS, BACKPACK_ROWS, footprint, inBounds, itemSize, layoutBackpack, overlaps } from "./vtt-inventory-grid.js";

/** Tempo parado, em ms, para o toque virar arrasto. @type {number} */
export const LONG_PRESS_MS = 300;

/** Aviso mostrado quando o item não cabe onde foi solto. @type {string} */
export const NO_FIT_MESSAGE = "Não cabe aí.";

const MOUSE_SLOP_PX = 4;
const TOUCH_SLOP_PX = 8;
const ARROWS = Object.freeze({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] });

function refuse(reason) {
  return { ok: false, reason, message: NO_FIT_MESSAGE };
}

function canTurn(item) {
  const { w, h } = itemSize(item);
  return w !== h;
}

/**
 * Diz se o item pode ficar em `spot`, com a mesma regra do reducer (dentro da grade e sem tocar nos outros).
 * @param {Array<{id: string, label: string, equipped?: boolean, w?: number, h?: number, x?: number, y?: number, rot?: boolean}>} items Itens da ficha.
 * @param {string} itemId Item arrastado.
 * @param {{x: number, y: number, rot?: boolean}} spot Célula de cima à esquerda e giro pedido.
 * @returns {{ok: boolean, reason: string, message: string, rect?: {x: number, y: number, w: number, h: number}}} Veredito; `reason` é `fora`, `ocupado` ou `sem-item`.
 */
export function dropVerdict(items, itemId, spot) {
  const item = (items || []).find((it) => it.id === itemId);
  if (!item || item.equipped) return refuse("sem-item");
  const size = footprint({ ...item, rot: spot.rot === true && canTurn(item) });
  if (!Number.isInteger(spot.x) || !Number.isInteger(spot.y) || !inBounds(spot.x, spot.y, size)) return refuse("fora");
  const rect = { x: spot.x, y: spot.y, ...size };
  const others = layoutBackpack(items.filter((it) => it.id !== itemId)).placements;
  return overlaps(others, rect) ? refuse("ocupado") : { ok: true, reason: "", message: "", rect };
}

/**
 * Converte um ponto da tela na célula da grade, descontando onde o item foi pego.
 * @param {{left: number, top: number, width: number, height: number}} box Retângulo da grade na tela.
 * @param {{x: number, y: number}} point Ponto do ponteiro.
 * @param {{dx?: number, dy?: number}} [grab={}] Células entre o canto do item e o ponto pego.
 * @param {{cols?: number, rows?: number}} [grid={}] Tamanho da grade (padrão 10×4).
 * @returns {{x: number, y: number}|null} Célula, ou `null` fora da grade.
 */
export function cellFromPoint(box, point, grab = {}, grid = {}) {
  const cols = grid.cols || BACKPACK_COLS;
  const rows = grid.rows || BACKPACK_ROWS;
  if (!(box.width > 0 && box.height > 0)) return null;
  const px = point.x - box.left;
  const py = point.y - box.top;
  if (px < 0 || py < 0 || px >= box.width || py >= box.height) return null;
  return { x: Math.floor(px / (box.width / cols)) - (grab.dx || 0), y: Math.floor(py / (box.height / rows)) - (grab.dy || 0) };
}

function clampSpot(item, spot) {
  const size = footprint({ ...item, rot: spot.rot });
  return { ...spot, x: Math.max(0, Math.min(spot.x, BACKPACK_COLS - size.w)), y: Math.max(0, Math.min(spot.y, BACKPACK_ROWS - size.h)) };
}

function pickUp(ctx) {
  const item = ctx.items.find((it) => it.id === ctx.focusId);
  const at = item && !item.equipped && layoutBackpack(ctx.items).placements.find((p) => p.id === item.id);
  if (!at) return { state: null, action: null, handled: true };
  const spot = { id: item.id, x: at.x, y: at.y, rot: at.rot };
  return { state: { ...spot, from: { x: at.x, y: at.y, rot: at.rot } }, action: null, handled: true, notice: "" };
}

function drop(state, ctx) {
  const verdict = dropVerdict(ctx.items, state.id, state);
  if (!verdict.ok) return { state, action: null, handled: true, notice: verdict.message };
  const place = { itemId: state.id, x: state.x, y: state.y, ...(state.rot ? { rot: true } : {}) };
  return { state: null, action: "place", place, handled: true, notice: "" };
}

function moveHeld(state, key, ctx) {
  const item = ctx.items.find((it) => it.id === state.id);
  const delta = ARROWS[key];
  let next = state;
  if (delta) next = { ...state, x: state.x + delta[0], y: state.y + delta[1] };
  else if (canTurn(item)) next = { ...state, rot: !state.rot };
  return { state: { ...next, ...clampSpot(item, next) }, action: null, handled: true, notice: "" };
}

/**
 * Passo da máquina do teclado. Sem item na mão, Enter pega o item focado; com ele, setas movem (presas à grade),
 * R gira (se não for quadrado), Enter solta (pede `place` se couber, senão avisa) e Esc devolve.
 * @param {null|{id: string, x: number, y: number, rot: boolean, from: object}} state Item na mão, ou `null`.
 * @param {string} key `KeyboardEvent.key`.
 * @param {{items: object[], focusId: string}} ctx Itens da ficha e o item com foco.
 * @returns {{state: object|null, action: null|"place"|"cancel", place?: {itemId: string, x: number, y: number, rot?: boolean}, notice?: string, handled: boolean}} Novo estado e o que fazer.
 */
export function keyboardStep(state, key, ctx) {
  if (!state) return key === "Enter" ? pickUp(ctx) : { state: null, action: null, handled: false };
  if (key === "Enter") return drop(state, ctx);
  if (key === "Escape") return { state: null, action: "cancel", handled: true, notice: "" };
  if (ARROWS[key] || key === "r" || key === "R") return moveHeld(state, key, ctx);
  return { state, action: null, handled: false };
}

/**
 * Máquina do ponteiro: mouse começa depois de 4 px de movimento; toque só depois de 300 ms parado (mexer antes é
 * rolagem e cancela). `onStart`, `onMove` e `onDrop` só disparam com o arrasto de fato começado.
 * @param {{onStart?: Function, onMove?: Function, onDrop?: Function, setTimer?: Function, clearTimer?: Function, ms?: number}} [hooks={}] Ganchos e temporizador injetável.
 * @returns {{down: Function, move: Function, up: Function, cancel: Function, readonly active: boolean}} Controle do ponteiro.
 */
export function createPointerDrag(hooks = {}) {
  const { onStart, onMove, onDrop, setTimer = setTimeout, clearTimer = clearTimeout, ms = LONG_PRESS_MS } = hooks;
  let press = null;
  let timer = null;
  const stopTimer = () => { if (timer !== null) clearTimer(timer); timer = null; };
  const far = (p, slop) => Math.hypot(p.x - press.x, p.y - press.y) >= slop;
  const start = (p) => { press.dragging = true; onStart?.({ id: press.id, x: p.x, y: p.y, pointerType: press.pointerType }); };
  const cancel = () => { stopTimer(); press = null; };
  return {
    down(ev) {
      cancel();
      press = { ...ev, dragging: false };
      if (ev.pointerType === "touch") timer = setTimer(() => { timer = null; if (press) start(press); }, ms);
    },
    move(p) {
      if (!press) return;
      if (press.dragging) return onMove?.({ x: p.x, y: p.y });
      if (press.pointerType !== "touch" && far(p, MOUSE_SLOP_PX)) { start(p); onMove?.({ x: p.x, y: p.y }); }
      else if (press.pointerType === "touch" && far(p, TOUCH_SLOP_PX)) cancel();
    },
    up(p) {
      const dragged = press?.dragging;
      cancel();
      if (dragged) onDrop?.({ x: p.x, y: p.y });
    },
    cancel,
    get active() { return Boolean(press?.dragging); },
  };
}
