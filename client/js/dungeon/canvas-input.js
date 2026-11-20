/**
 * @file Máquina de estados unificada de `PointerEvents` (desktop + touch/pinça mobile) para o `<canvas>` 2D (E2 + E3):
 * seleção/arraste de tokens, clique em portas, pan/pinça, régua, desenho livre, corte de névoa e gabaritos AoE.
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
import { hitTestDoors, simplifyPolyline } from "./vtt-tactics-geometry.js";

function pointerLocalPoint(canvas, ev) {
  const rect = typeof canvas.getBoundingClientRect === "function" ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
  return { sx: (Number(ev.clientX) || 0) - rect.left, sy: (Number(ev.clientY) || 0) - rect.top };
}

function activeFloor(scene) {
  return scene?.floors?.find((f) => f.z === scene.activeFloorZ) || scene?.floors?.[0] || null;
}

function twoPointerMetrics(pointers) {
  const [a, b] = [...pointers.values()];
  return { midX: (a.sx + b.sx) / 2, midY: (a.sy + b.sy) / 2, dist: Math.max(1, Math.hypot(b.sx - a.sx, b.sy - a.sy)) };
}

function normalizedRect(a, b) {
  return {
    x: Math.min(a.wx, b.wx),
    y: Math.min(a.wy, b.wy),
    w: Math.max(8, Math.abs(b.wx - a.wx)),
    h: Math.max(8, Math.abs(b.wy - a.wy)),
  };
}

function beginToolGesture(st, tool, worldPt, opts) {
  st.originWorld = worldPt;
  if (tool === "ruler") {
    st.mode = "ruler";
    opts.onRulerChange?.({ fromWx: worldPt.wx, fromWy: worldPt.wy, toWx: worldPt.wx, toWy: worldPt.wy });
  } else if (tool === "draw") {
    st.mode = "draw";
    st.stroke = [worldPt];
    opts.onDraftStroke?.({ points: st.stroke, color: "#78d6cf", width: 3 });
  } else if (tool === "fog-reveal") {
    st.mode = "fog-reveal";
    opts.onFogPreview?.({ x: worldPt.wx, y: worldPt.wy, w: 8, h: 8 });
  } else if (tool.startsWith("aoe-")) {
    st.mode = "aoe";
    st.aoeKind = tool.slice(4);
  }
}

function beginSelectGesture(st, pt, worldPt, ev, opts) {
  const scene = opts.getScene();
  const floor = activeFloor(scene);
  if (!floor) return;
  const role = opts.getViewerRole?.() || "player";
  const floorTokens = (scene.tokens || []).filter((t) => t.floorZ === floor.z);
  const hitTok = ev.button === 2 ? null : hitTestTokens(worldPt.wx, worldPt.wy, floorTokens, floor.grid, role);
  if (hitTok) {
    st.mode = "drag-token";
    st.dragToken = hitTok;
    st.dragCell = { x: hitTok.x, y: hitTok.y };
    opts.onSelectToken?.(hitTok.tokenId);
    return;
  }
  const hitDoor = ev.button === 2 ? null : hitTestDoors(worldPt.wx, worldPt.wy, floor.doors || [], floor.grid, { viewerRole: role });
  if (hitDoor) {
    st.mode = "idle";
    opts.onDoorToggle?.(hitDoor.doorId);
    return;
  }
  st.mode = "pan";
  st.lastPt = pt;
  opts.onSelectToken?.("");
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
  const worldPt = screenToWorld(pt.sx, pt.sy, opts.getCamera());
  const tool = opts.getTool?.() || "select";
  if (tool !== "select" && ev.button !== 2) return beginToolGesture(st, tool, worldPt, opts);
  return beginSelectGesture(st, pt, worldPt, ev, opts);
}

function updateToolGesture(st, worldPt, opts) {
  st.lastWorld = worldPt;
  if (st.mode === "ruler" && st.originWorld) {
    opts.onRulerChange?.({ fromWx: st.originWorld.wx, fromWy: st.originWorld.wy, toWx: worldPt.wx, toWy: worldPt.wy });
  } else if (st.mode === "draw" && st.stroke) {
    st.stroke.push(worldPt);
    opts.onDraftStroke?.({ points: st.stroke, color: "#78d6cf", width: 3 });
  } else if (st.mode === "fog-reveal" && st.originWorld) {
    opts.onFogPreview?.(normalizedRect(st.originWorld, worldPt));
  }
}

function updateGesture(st, canvas, ev, opts) {
  const id = ev.pointerId ?? 1;
  if (!st.pointers.has(id)) return;
  const pt = pointerLocalPoint(canvas, ev);
  st.pointers.set(id, pt);
  if (st.mode === "pinch" && st.pointers.size >= 2) {
    const m = twoPointerMetrics(st.pointers);
    opts.onCameraChange?.(zoomCameraAt(opts.getCamera(), m.midX, m.midY, clampZoom(st.pinchStartZoom * (m.dist / st.pinchStartDist))));
    return;
  }
  if (st.mode === "pan" && st.lastPt) {
    const cam = opts.getCamera();
    opts.onCameraChange?.({ ...cam, panX: cam.panX + (pt.sx - st.lastPt.sx), panY: cam.panY + (pt.sy - st.lastPt.sy) });
    st.lastPt = pt;
    return;
  }
  const worldPt = screenToWorld(pt.sx, pt.sy, opts.getCamera());
  if (st.mode === "drag-token" && st.dragToken) {
    const floor = activeFloor(opts.getScene());
    if (!floor) return;
    const snapped = snapWorldToCell(worldPt.wx, worldPt.wy, floor.grid);
    st.dragCell = clampTokenToFloor(snapped.x, snapped.y, st.dragToken.sizeCells, floor);
    opts.onDragPreview?.({ tokenId: st.dragToken.tokenId, x: st.dragCell.x, y: st.dragCell.y });
    return;
  }
  updateToolGesture(st, worldPt, opts);
}

function commitAoeFinish(st, opts) {
  const end = st.lastWorld || st.originWorld;
  const floor = activeFloor(opts.getScene());
  const cellPx = floor?.grid?.cellPx || 64;
  const distCells = Math.max(1, Number((Math.hypot(end.wx - st.originWorld.wx, end.wy - st.originWorld.wy) / cellPx).toFixed(1)));
  const angleRad = Math.atan2(end.wy - st.originWorld.wy, end.wx - st.originWorld.wx);
  opts.onAoeCommit?.({ kind: st.aoeKind, wx: st.originWorld.wx, wy: st.originWorld.wy, radiusCells: distCells, lengthCells: distCells, angleRad });
}

function commitToolFinish(st, opts) {
  if (st.mode === "ruler") opts.onRulerChange?.(null);
  if (st.mode === "draw" && st.stroke?.length >= 2) {
    opts.onDraftStroke?.(null);
    opts.onDrawingCommit?.(simplifyPolyline(st.stroke, 4));
  }
  if (st.mode === "fog-reveal" && st.originWorld && st.lastWorld) {
    opts.onFogPreview?.(null);
    opts.onFogReveal?.(normalizedRect(st.originWorld, st.lastWorld));
  }
  if (st.mode === "aoe" && st.originWorld) commitAoeFinish(st, opts);
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
  } else {
    commitToolFinish(st, opts);
  }
  if (st.pointers.size === 0) {
    st.mode = "idle";
    st.dragToken = null;
    st.dragCell = null;
    st.lastPt = null;
    st.originWorld = null;
    st.lastWorld = null;
    st.stroke = null;
  }
}

/**
 * Conecta interações de mouse e toque (`PointerEvents` + roda de zoom) em um `<canvas>` 2D da mesa.
 * @param {HTMLCanvasElement|object} canvas Elemento `<canvas>`.
 * @param {object} opts Callbacks de cena, câmera, papel, ferramenta ativa e commits táticos.
 * @returns {() => void} Função para remover todos os listeners ao desmontar.
 */
export function attachCanvasInput(canvas, opts) {
  if (!canvas || typeof canvas.addEventListener !== "function") return () => {};
  if (canvas.style) canvas.style.touchAction = "none";
  const st = { pointers: new Map(), mode: "idle", dragToken: null, dragCell: null, lastPt: null, originWorld: null, lastWorld: null, stroke: null, aoeKind: "circle", pinchStartDist: 1, pinchStartZoom: 1 };
  const onDown = (ev) => beginGesture(st, canvas, ev, opts);
  const onMove = (ev) => updateGesture(st, canvas, ev, opts);
  const onUp = (ev) => finishGesture(st, canvas, ev, opts);
  const onWheel = (ev) => {
    ev.preventDefault?.();
    const pt = pointerLocalPoint(canvas, ev);
    const cam = opts.getCamera();
    opts.onCameraChange?.(zoomCameraAt(cam, pt.sx, pt.sy, cam.zoom * ((Number(ev.deltaY) || 0) < 0 ? 1.12 : 0.89)));
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
