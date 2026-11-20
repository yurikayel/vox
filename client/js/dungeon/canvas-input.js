/**
 * @file Máquina de estados unificada de `PointerEvents` (desktop + touch/pinça mobile) para o `<canvas>` 2D (E2).
 * @module dungeon/canvas-input
 */
import {
  clampTokenToFloor,
  clampZoom,
  hitTestTokens,
  screenToWorld,
  snapWorldToCell,
  zoomCameraAt,
} from "./vtt-geometry.js";

function pointerLocalPoint(canvas, ev) {
  const rect = typeof canvas.getBoundingClientRect === "function" ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
  return { sx: (Number(ev.clientX) || 0) - rect.left, sy: (Number(ev.clientY) || 0) - rect.top };
}

function activeFloor(scene) {
  return scene?.floors?.find((f) => f.z === scene.activeFloorZ) || scene?.floors?.[0] || null;
}

function twoPointerMetrics(pointers) {
  const [a, b] = [...pointers.values()];
  return {
    midX: (a.sx + b.sx) / 2,
    midY: (a.sy + b.sy) / 2,
    dist: Math.max(1, Math.hypot(b.sx - a.sx, b.sy - a.sy)),
  };
}

function beginGesture(st, canvas, ev, opts) {
  const pt = pointerLocalPoint(canvas, ev);
  st.pointers.set(ev.pointerId ?? 1, pt);
  canvas.setPointerCapture?.(ev.pointerId);
  if (st.pointers.size === 2) {
    const m = twoPointerMetrics(st.pointers);
    st.mode = "pinch";
    st.pinchStartDist = m.dist;
    st.pinchStartZoom = opts.getCamera().zoom;
    st.dragToken = null;
    return;
  }
  const scene = opts.getScene();
  const floor = activeFloor(scene);
  if (!floor) return;
  const { wx, wy } = screenToWorld(pt.sx, pt.sy, opts.getCamera());
  const role = opts.getViewerRole?.() || "player";
  const hit = ev.button === 2 ? null : hitTestTokens(wx, wy, scene.tokens || [], floor.grid, role);
  if (hit) {
    st.mode = "drag-token";
    st.dragToken = hit;
    st.dragCell = { x: hit.x, y: hit.y };
    opts.onSelectToken?.(hit.tokenId);
    return;
  }
  st.mode = "pan";
  st.lastPt = pt;
  opts.onSelectToken?.("");
}

function updateGesture(st, canvas, ev, opts) {
  const id = ev.pointerId ?? 1;
  if (!st.pointers.has(id)) return;
  const pt = pointerLocalPoint(canvas, ev);
  st.pointers.set(id, pt);
  if (st.mode === "pinch" && st.pointers.size >= 2) {
    const m = twoPointerMetrics(st.pointers);
    const nextZoom = clampZoom(st.pinchStartZoom * (m.dist / st.pinchStartDist));
    opts.onCameraChange?.(zoomCameraAt(opts.getCamera(), m.midX, m.midY, nextZoom));
    return;
  }
  if (st.mode === "pan" && st.lastPt) {
    const cam = opts.getCamera();
    opts.onCameraChange?.({ ...cam, panX: cam.panX + (pt.sx - st.lastPt.sx), panY: cam.panY + (pt.sy - st.lastPt.sy) });
    st.lastPt = pt;
    return;
  }
  if (st.mode === "drag-token" && st.dragToken) {
    const floor = activeFloor(opts.getScene());
    if (!floor) return;
    const { wx, wy } = screenToWorld(pt.sx, pt.sy, opts.getCamera());
    const snapped = snapWorldToCell(wx, wy, floor.grid);
    const clamped = clampTokenToFloor(snapped.x, snapped.y, st.dragToken.sizeCells, floor);
    st.dragCell = clamped;
    opts.onDragPreview?.({ tokenId: st.dragToken.tokenId, x: clamped.x, y: clamped.y });
  }
}

function finishGesture(st, canvas, ev, opts) {
  const id = ev.pointerId ?? 1;
  st.pointers.delete(id);
  canvas.releasePointerCapture?.(id);
  if (st.mode === "drag-token" && st.dragToken && st.dragCell) {
    const moved = st.dragCell.x !== st.dragToken.x || st.dragCell.y !== st.dragToken.y;
    const tokId = st.dragToken.tokenId;
    const target = st.dragCell;
    opts.onDragPreview?.(null);
    if (moved) opts.onTokenMove?.(tokId, target.x, target.y);
  }
  if (st.pointers.size === 0) {
    st.mode = "idle";
    st.dragToken = null;
    st.dragCell = null;
    st.lastPt = null;
  }
}

/**
 * Conecta interações de mouse e toque (`PointerEvents` + roda de zoom) em um `<canvas>` 2D da mesa.
 * @param {HTMLCanvasElement|object} canvas Elemento `<canvas>`.
 * @param {object} opts Callbacks (`getScene`, `getCamera`, `getViewerRole`, `onCameraChange`, `onSelectToken`, `onDragPreview`, `onTokenMove`).
 * @returns {() => void} Função para remover todos os listeners ao desmontar.
 */
export function attachCanvasInput(canvas, opts) {
  if (!canvas || typeof canvas.addEventListener !== "function") return () => {};
  if (canvas.style) canvas.style.touchAction = "none";
  const st = { pointers: new Map(), mode: "idle", dragToken: null, dragCell: null, lastPt: null, pinchStartDist: 1, pinchStartZoom: 1 };
  const onDown = (ev) => beginGesture(st, canvas, ev, opts);
  const onMove = (ev) => updateGesture(st, canvas, ev, opts);
  const onUp = (ev) => finishGesture(st, canvas, ev, opts);
  const onWheel = (ev) => {
    ev.preventDefault?.();
    const pt = pointerLocalPoint(canvas, ev);
    const cam = opts.getCamera();
    const factor = (Number(ev.deltaY) || 0) < 0 ? 1.12 : 0.89;
    opts.onCameraChange?.(zoomCameraAt(cam, pt.sx, pt.sy, cam.zoom * factor));
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  return () => {
    canvas.removeEventListener?.("pointerdown", onDown);
    canvas.removeEventListener?.("pointermove", onMove);
    canvas.removeEventListener?.("pointerup", onUp);
    canvas.removeEventListener?.("pointercancel", onUp);
    canvas.removeEventListener?.("wheel", onWheel);
  };
}
