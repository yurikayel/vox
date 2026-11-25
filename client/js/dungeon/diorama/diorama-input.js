/**
 * @file Entrada da lente Diorama (mouse, toque e teclado) sobre o canvas GL: orbitar, mover
 * (pan) e dar zoom. Só calcula a nova câmera (`orbitCamera`/`panCamera`/`zoomCamera`) e pede
 * um redesenho; não mexe em estado do jogo.
 * @module dungeon/diorama/diorama-input
 */
import { applyCameraPreset, orbitCamera, panCamera, zoomCamera } from "./diorama-camera.js";

const DRAG_THRESHOLD_PX = 4;
const ORBIT_DEG_PER_PX = 0.4;
const PAN_CELLS_PER_PX = 1.1;
const WHEEL_ZOOM_RATE = 0.0015;
const KEY_YAW_DEG = 15;
const KEY_PITCH_DEG = 8;
const KEY_ZOOM_IN = 0.85;
const KEY_ZOOM_OUT = 1 / KEY_ZOOM_IN;

/** Texto do rótulo acessível do canvas 3D (teclas suportadas). */
export const DIORAMA_KEYS_HELP = "Mapa em 3D. Setas giram a câmera, Shift com setas move, mais e menos aproximam, Home reinicia.";

/**
 * Traduz uma tecla em nova câmera (teclado acessível) ou `null` se a tecla não é da lente.
 *
 * @param {object} cam Estado atual da câmera.
 * @param {{key: string, shiftKey?: boolean}} ev Evento de teclado.
 * @param {{maxX?: number, maxZ?: number}} [bounds={}] Limites do piso para o pan.
 * @returns {object|null} Nova câmera ou `null`.
 */
export function keyboardCameraStep(cam, ev, bounds = {}) {
  const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[ev.key];
  if (dir && ev.shiftKey) return panCamera(cam, dir[0], dir[1], bounds);
  if (dir) return orbitCamera(cam, dir[0] * KEY_YAW_DEG, -dir[1] * KEY_PITCH_DEG);
  if (ev.key === "+" || ev.key === "=") return zoomCamera(cam, KEY_ZOOM_IN);
  if (ev.key === "-" || ev.key === "_") return zoomCamera(cam, KEY_ZOOM_OUT);
  return ev.key === "Home" ? applyCameraPreset({ ...cam, yawDeg: 45 }, cam.mode) : null;
}

function pinchMetrics(pointers) {
  const [a, b] = [...pointers.values()];
  return { dist: Math.hypot(b.x - a.x, b.y - a.y) || 1, angle: Math.atan2(b.y - a.y, b.x - a.x), midY: (a.y + b.y) / 2 };
}

function applyDrag(st, ev, h) {
  const dx = ev.clientX - st.last.x;
  const dy = ev.clientY - st.last.y;
  st.last = { x: ev.clientX, y: ev.clientY };
  const cam = h.getCam();
  if (st.orbit) return h.setCam(orbitCamera(cam, dx * ORBIT_DEG_PER_PX, dy * ORBIT_DEG_PER_PX));
  const k = (cam.zoom * PAN_CELLS_PER_PX) / Math.max(1, h.viewHeight());
  return h.setCam(panCamera(cam, -dx * k, dy * k, h.bounds()));
}

function applyPinch(st, h) {
  const now = pinchMetrics(st.pointers);
  const prev = st.pinch;
  st.pinch = now;
  const zoomed = zoomCamera(h.getCam(), prev.dist / now.dist);
  const turn = ((prev.angle - now.angle) * 180) / Math.PI;
  h.setCam(orbitCamera(zoomed, turn, (now.midY - prev.midY) * ORBIT_DEG_PER_PX));
}

function onPointerMove(st, ev, h) {
  if (!st.pointers.has(ev.pointerId)) return;
  st.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (st.pointers.size === 2) { st.moved = true; applyPinch(st, h); return; }
  if (st.pointers.size !== 1) return;
  if (!st.moved && Math.hypot(ev.clientX - st.start.x, ev.clientY - st.start.y) < DRAG_THRESHOLD_PX) return;
  st.moved = true;
  applyDrag(st, ev, h);
}

function onPointerDown(st, ev, h) {
  st.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (st.pointers.size === 1) {
    const at = { x: ev.clientX, y: ev.clientY };
    Object.assign(st, { start: at, last: at, moved: false, orbit: ev.button === 2 || Boolean(ev.altKey) });
  }
  if (st.pointers.size === 2) st.pinch = pinchMetrics(st.pointers);
  h.el.setPointerCapture?.(ev.pointerId);
  h.el.focus?.();
}

function buildHandlers(st, h) {
  const up = (ev) => { st.pointers.delete(ev.pointerId); h.el.releasePointerCapture?.(ev.pointerId); };
  return {
    pointerdown: (ev) => onPointerDown(st, ev, h),
    pointermove: (ev) => onPointerMove(st, ev, h),
    pointerup: up,
    pointercancel: up,
    contextmenu: (ev) => ev.preventDefault(),
    wheel: (ev) => { ev.preventDefault(); h.setCam(zoomCamera(h.getCam(), Math.exp(ev.deltaY * WHEEL_ZOOM_RATE))); },
    keydown: (ev) => {
      const next = keyboardCameraStep(h.getCam(), ev, h.bounds());
      if (next) { ev.preventDefault(); h.setCam(next); }
    },
  };
}

/**
 * Liga mouse, toque e teclado ao canvas GL da lente. O botão direito ou `Alt` orbita; o botão
 * esquerdo ou um dedo move o mapa; dois dedos dão zoom e giro; a roda dá zoom.
 *
 * @param {{el: object, getCam: Function, setCam: Function, bounds: Function, viewHeight: Function}} h
 *   Canvas alvo e acesso à câmera (`setCam` redesenha).
 * @returns {{wasDrag: () => boolean, destroy: () => void}} `wasDrag` diz se o último gesto foi arrasto (suprime o clique).
 */
export function attachDioramaGestures(h) {
  const st = { pointers: new Map(), moved: false };
  const handlers = buildHandlers(st, h);
  for (const [name, fn] of Object.entries(handlers)) h.el.addEventListener(name, fn, { passive: false });
  return {
    wasDrag: () => st.moved,
    destroy: () => { for (const [name, fn] of Object.entries(handlers)) h.el.removeEventListener(name, fn); },
  };
}
