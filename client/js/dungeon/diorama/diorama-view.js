/**
 * @file Orquestrador lazy da lente Diorama (`vox.lab.diorama`) do Subversus VTT:
 * preferência de câmera em `localStorage`, picking `ray-cylinder` → `ray-plane`
 * e fallback automático para 2D em `webglcontextlost` ou ausência de WebGL2.
 * @module dungeon/diorama/diorama-view
 */
import { applyCameraPreset, CAMERA_MODES, computeCameraMatrices, createDioramaCamera } from "./diorama-camera.js";
import { createDioramaGlRenderer } from "./diorama-gl.js";
import { projectTacticsFloorForPlayer } from "../vtt-tactics-reducer.js";
import { rayCylinderIntersect, rayPlaneIntersect } from "./diorama-math.js";

export { DIORAMA_FLAG_KEY, isDioramaFlagEnabled, renderDioramaModePill } from "../diorama-lens.js";

const MODE_STORAGE_KEY = "subversus.diorama.mode";

/**
 * Lê o modo de câmera salvo localmente (`2d`|`iso`|`3d`).
 *
 * @param {Storage|null} [storage] Armazenamento local opcional.
 * @returns {"2d"|"iso"|"3d"} Modo de câmera válido.
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
 * @param {"2d"|"iso"|"3d"} mode Modo escolhido.
 * @param {Storage|null} [storage] Armazenamento local opcional.
 * @returns {"2d"|"iso"|"3d"} Modo normalizado.
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

/**
 * Posiciona o canvas GL sobre o canvas 2D e copia sua resolução (sem copiar classes do 2D).
 *
 * @param {HTMLCanvasElement|object} gl Canvas WebGL2 dedicado.
 * @param {HTMLCanvasElement|object} base Canvas 2D do mapa.
 * @returns {void}
 */
function layoutGlCanvas(gl, base) {
  gl.style.cssText = `position:absolute;pointer-events:none;border-radius:6px;left:${base.offsetLeft || 0}px;top:${base.offsetTop || 0}px;width:${base.offsetWidth || 0}px;height:${base.offsetHeight || 0}px`;
  gl.width = base.width;
  gl.height = base.height;
}

/**
 * Obtém (criando uma única vez) o canvas WebGL2 próprio, irmão do canvas 2D do mapa.
 * Um canvas que já devolveu contexto 2D nunca entrega `webgl2`, por isso não se reaproveita o 2D.
 *
 * @param {HTMLCanvasElement|object} base Canvas 2D do mapa.
 * @param {HTMLCanvasElement|object|null} [existing=null] Canvas GL já criado (rebind após redesenho).
 * @returns {HTMLCanvasElement|object|null} Canvas WebGL2 dedicado ou `null` sem DOM.
 */
function ensureGlCanvas(base, existing = null) {
  const host = base?.parentNode;
  if (!host || !base.ownerDocument) return null;
  let gl = existing || host.querySelector?.("canvas[data-diorama-gl]");
  if (!gl) {
    gl = base.ownerDocument.createElement("canvas");
    gl.dataset.dioramaGl = "1";
    gl.setAttribute?.("aria-hidden", "true");
  }
  host.style.position = "relative";
  if (gl.parentNode !== host) host.appendChild(gl);
  layoutGlCanvas(gl, base);
  return gl;
}

function renderOverlayState(st) {
  if (!st.glRenderer || st.cam.mode === "2d") return null;
  const aspect = (st.gl.width || 768) / Math.max(1, st.gl.height || 576);
  return st.glRenderer.render(st.floor, computeCameraMatrices(st.cam, aspect));
}

function triggerOverlayFallback(st, opts, reason) {
  st.glRenderer?.destroy?.();
  st.glRenderer = null;
  st.cam = applyCameraPreset(st.cam, "2d");
  saveDioramaMode("2d", opts.storage);
  opts.onFallback2d?.(reason);
}

/** Piso exibido: o Mestre vê tudo; qualquer outro papel recebe a projeção Zero-Spoiler. */
function projectFloorForRole(floor, role) {
  return role === "gm" ? floor : projectTacticsFloorForPlayer(floor || {});
}

function ensureRenderer(st, opts) {
  if (!st.glRenderer && st.gl) st.glRenderer = createDioramaGlRenderer(st.gl);
  if (st.glRenderer) return true;
  triggerOverlayFallback(st, opts, "WebGL2 indisponível — usando mapa 2D.");
  return false;
}

/** Liga o fallback 2D a `webglcontextlost`; devolve a função que remove o listener. */
function bindContextLoss(st, opts) {
  const gl = st.gl;
  const onLost = (ev) => { ev?.preventDefault?.(); triggerOverlayFallback(st, opts, "Contexto WebGL perdido — alternado para mapa 2D."); };
  gl?.addEventListener?.("webglcontextlost", onLost);
  return () => gl?.removeEventListener?.("webglcontextlost", onLost);
}

/**
 * Conecta o renderizador WebGL2 sob demanda em um canvas próprio, com fallback automático em `webglcontextlost`.
 * O papel `gm` vê o piso completo; os demais recebem `projectTacticsFloorForPlayer` (portas secretas fora).
 *
 * @param {HTMLCanvasElement|object} canvas Canvas 2D do mapa (nunca recebe contexto WebGL).
 * @param {object} floor Documento `FloorDoc`.
 * @param {object} [opts={}] Opções (`mode`, `viewerRole`, `onFallback2d`, `storage`).
 * @returns {{active: boolean, setMode: Function, setFloor: Function, draw: Function, detach: Function, rebind: Function, destroy: Function}} Controlador da lente.
 */
export function attachDioramaOverlay(canvas, floor, opts = {}) {
  const mode = opts.mode || loadDioramaMode(opts.storage);
  const st = { cam: createDioramaCamera({ mode }), gl: ensureGlCanvas(canvas), glRenderer: null, floor: null };
  const setFloor = (next, role = opts.viewerRole) => { st.floor = projectFloorForRole(next, role); };
  setFloor(floor);
  if (mode !== "2d") ensureRenderer(st, opts);
  const unbindLost = bindContextLoss(st, opts);
  return {
    get active() { return Boolean(st.glRenderer && st.cam.mode !== "2d"); },
    setMode(nextMode) {
      st.cam = applyCameraPreset(st.cam, saveDioramaMode(nextMode, opts.storage));
      if (st.cam.mode === "2d") { st.glRenderer?.destroy?.(); st.glRenderer = null; return null; }
      return ensureRenderer(st, opts) ? renderOverlayState(st) : null;
    },
    setFloor,
    draw: () => renderOverlayState(st),
    detach: () => st.gl?.remove?.(),
    rebind(nextCanvas, nextFloor, role = opts.viewerRole) {
      st.gl = ensureGlCanvas(nextCanvas, st.gl);
      setFloor(nextFloor, role);
      return renderOverlayState(st);
    },
    destroy() {
      unbindLost();
      st.glRenderer?.destroy?.();
      st.glRenderer = null;
      st.gl?.remove?.();
    },
  };
}
