/**
 * @file Orquestrador lazy da lente Diorama (`vox.lab.diorama`) do Subversus VTT:
 * preferência de câmera em `localStorage`, picking `ray-cylinder` → `ray-plane`
 * e fallback automático para 2D em `webglcontextlost` ou ausência de WebGL2.
 * @module dungeon/diorama/diorama-view
 */
import { escapeHtml } from "../../shared/html.js";
import { applyCameraPreset, CAMERA_MODES, computeCameraMatrices, createDioramaCamera } from "./diorama-camera.js";
import { createDioramaGlRenderer } from "./diorama-gl.js";
import { rayCylinderIntersect, rayPlaneIntersect } from "./diorama-math.js";

/** Chave de feature flag local que habilita a lente Diorama 2.5D/3D sob demanda. */
export const DIORAMA_FLAG_KEY = "vox.lab.diorama";
const MODE_STORAGE_KEY = "subversus.diorama.mode";

const MODE_LABELS = Object.freeze({ "2d": "2D", iso: "Iso", "3d": "3D", fp: "1ª" });

/**
 * Verifica se a flag local `vox.lab.diorama` está ligada.
 *
 * @param {Storage|null} [storage] Armazenamento local opcional (default `globalThis.localStorage`).
 * @returns {boolean} `true` quando a lente Diorama está habilitada.
 */
export function isDioramaFlagEnabled(storage = globalThis.localStorage) {
  try {
    return storage?.getItem?.(DIORAMA_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Lê o modo de câmera salvo localmente (`2d`|`iso`|`3d`|`fp`).
 *
 * @param {Storage|null} [storage] Armazenamento local opcional.
 * @returns {"2d"|"iso"|"3d"|"fp"} Modo de câmera válido.
 */
export function loadDioramaMode(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(MODE_STORAGE_KEY);
    return CAMERA_MODES.includes(raw) ? raw : "2d";
  } catch {
    return "2d";
  }
}

/**
 * Salva o modo de câmera escolhido localmente sem afetar outros pares na mesa.
 *
 * @param {"2d"|"iso"|"3d"|"fp"} mode Modo escolhido.
 * @param {Storage|null} [storage] Armazenamento local opcional.
 * @returns {"2d"|"iso"|"3d"|"fp"} Modo normalizado.
 */
export function saveDioramaMode(mode, storage = globalThis.localStorage) {
  const safe = CAMERA_MODES.includes(mode) ? mode : "2d";
  try {
    storage?.setItem?.(MODE_STORAGE_KEY, safe);
  } catch {
    // Modo privado sem escrita em localStorage.
  }
  return safe;
}

/**
 * Renderiza a pílula compacta `2D | Iso | 3D | 1ª` para o canto do canvas do Subversus.
 *
 * @param {"2d"|"iso"|"3d"|"fp"} [activeMode="2d"] Modo de câmera atual.
 * @returns {string} HTML da pílula de modos de câmera.
 */
export function renderDioramaModePill(activeMode = "2d") {
  const safe = CAMERA_MODES.includes(activeMode) ? activeMode : "2d";
  const btns = CAMERA_MODES.map((m) => {
    const active = m === safe ? " is-selected" : "";
    return `<button type="button" class="dungeon-chip-btn${active}" data-dungeon="diorama-mode" data-mode="${escapeHtml(m)}" aria-pressed="${m === safe}">${escapeHtml(MODE_LABELS[m])}</button>`;
  }).join("");
  return `<div class="subversus-diorama-pill" role="group" aria-label="Modo de câmera do Subversus">${btns}</div>`;
}

/**
 * Executa picking volumétrico de standees (`ray-cylinder`) com fallback para o chão (`ray-plane`).
 *
 * @param {[number, number, number]} origin Origem do raio 3D.
 * @param {[number, number, number]} dir Direção normalizada do raio 3D.
 * @param {Array<object>} [tokens=[]] Tokens visíveis no andar.
 * @returns {{kind: "token", tokenId: string, t: number}|{kind: "floor", point: [number, number, number]}|null} Alvo atingido.
 */
export function pickDioramaTarget(origin, dir, tokens = []) {
  let best = null;
  for (const tok of tokens) {
    const cyl = {
      x: Number(tok.x) || 0,
      y: Number(tok.elevation) || 0,
      z: Number(tok.y) || 0,
      radius: Math.max(0.35, (Number(tok.sizeCells) || 1) * 0.45),
      height: tok.display === "flat" ? 0.15 : 1.4,
    };
    const t = rayCylinderIntersect(origin, dir, cyl);
    if (t !== null && (!best || t < best.t)) best = { kind: "token", tokenId: tok.tokenId, t };
  }
  if (best) return best;
  const hit = rayPlaneIntersect(origin, dir, 0);
  return hit ? { kind: "floor", point: hit.point } : null;
}

function renderOverlayState(st, canvas, floor) {
  if (!st.glRenderer || st.cam.mode === "2d") return null;
  const aspect = (canvas.width || 768) / Math.max(1, canvas.height || 576);
  return st.glRenderer.render(floor, computeCameraMatrices(st.cam, aspect));
}

function triggerOverlayFallback(st, opts, reason) {
  st.glRenderer?.destroy?.();
  st.glRenderer = null;
  st.cam = applyCameraPreset(st.cam, "2d");
  saveDioramaMode("2d", opts.storage);
  opts.onFallback2d?.(reason);
}

/**
 * Conecta o renderizador WebGL2 sob demanda em um canvas, com fallback automático em `webglcontextlost`.
 *
 * @param {HTMLCanvasElement|object} canvas Canvas alvo.
 * @param {object} floor Documento `FloorDoc`.
 * @param {object} [opts={}] Opções (`mode`, `onFallback2d`, `storage`).
 * @returns {{active: boolean, setMode: Function, draw: Function, destroy: Function}} Controlador da lente.
 */
export function attachDioramaOverlay(canvas, floor, opts = {}) {
  const mode = opts.mode || loadDioramaMode(opts.storage);
  const st = { cam: createDioramaCamera({ mode }), glRenderer: mode === "2d" ? null : createDioramaGlRenderer(canvas) };
  if (st.cam.mode !== "2d" && !st.glRenderer) triggerOverlayFallback(st, opts, "WebGL2 indisponível — usando mapa 2D.");
  const onLost = (ev) => { ev?.preventDefault?.(); triggerOverlayFallback(st, opts, "Contexto WebGL perdido — alternado para mapa 2D."); };
  canvas?.addEventListener?.("webglcontextlost", onLost);
  return {
    get active() { return Boolean(st.glRenderer && st.cam.mode !== "2d"); },
    setMode(nextMode, focusToken = null) {
      st.cam = applyCameraPreset(st.cam, saveDioramaMode(nextMode, opts.storage), focusToken);
      if (st.cam.mode === "2d") { st.glRenderer?.destroy?.(); st.glRenderer = null; return null; }
      if (!st.glRenderer) st.glRenderer = createDioramaGlRenderer(canvas);
      if (!st.glRenderer) { triggerOverlayFallback(st, opts, "WebGL2 indisponível — usando mapa 2D."); return null; }
      return renderOverlayState(st, canvas, floor);
    },
    draw: () => renderOverlayState(st, canvas, floor),
    destroy() {
      canvas?.removeEventListener?.("webglcontextlost", onLost);
      st.glRenderer?.destroy?.();
      st.glRenderer = null;
    },
  };
}
