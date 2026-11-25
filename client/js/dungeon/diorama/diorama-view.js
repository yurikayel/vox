/**
 * @file Orquestrador lazy da lente Diorama (`vox.lab.diorama`) do Subversus VTT:
 * preferência de câmera em `localStorage`, picking `ray-cylinder` → `ray-plane`
 * e fallback automático para 2D em `webglcontextlost` ou ausência de WebGL2.
 * @module dungeon/diorama/diorama-view
 */
import { applyCameraPreset, CAMERA_MODES, computeCameraMatrices, createDioramaCamera } from "./diorama-camera.js";
import { createDioramaGlRenderer } from "./diorama-gl.js";
import { buildRasters, buildTexturedPass } from "./diorama-textures.js";
import { describeDioramaView } from "./diorama-geom.js";
import { buildFogLayer, projectDioramaView, tokenCenter3d } from "./diorama-layers.js";

export { loadDioramaImages } from "./diorama-textures.js";
export { DIORAMA_FLAG_KEY, isDioramaFlagEnabled, renderDioramaModePill } from "../diorama-lens.js";

const MODE_STORAGE_KEY = "subversus.diorama.mode";

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
 * Posiciona o canvas GL sobre o canvas 2D e copia sua resolução (sem copiar classes do 2D).
 *
 * @param {HTMLCanvasElement|object} gl Canvas WebGL2 dedicado.
 * @param {HTMLCanvasElement|object} base Canvas 2D do mapa.
 * @returns {void}
 */
function layoutGlCanvas(gl, base) {
  gl.style.cssText = `position:absolute;pointer-events:none;touch-action:none;border-radius:6px;left:${base.offsetLeft || 0}px;top:${base.offsetTop || 0}px;width:${base.offsetWidth || 0}px;height:${base.offsetHeight || 0}px`;
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
    gl.setAttribute?.("tabindex", "0");
    gl.setAttribute?.("role", "application");
    gl.setAttribute?.("aria-label", "Mapa em 3D");
  }
  host.style.position = "relative";
  if (gl.parentNode !== host) host.appendChild(gl);
  layoutGlCanvas(gl, base);
  return gl;
}

/** Região `aria-live` (visualmente oculta) que narra a cena visível; criada uma vez, ao lado do canvas GL. */
function ensureLiveRegion(base, existing = null) {
  const host = base?.parentNode;
  if (!host || !base.ownerDocument) return null;
  let el = existing || host.querySelector?.("[data-diorama-live]");
  if (!el) {
    el = base.ownerDocument.createElement("div");
    el.dataset.dioramaLive = "1";
    el.setAttribute?.("role", "status");
    el.setAttribute?.("aria-live", "polite");
    el.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap";
  }
  if (el.parentNode !== host) host.appendChild(el);
  return el;
}

/** O canvas GL só captura toques (picking) enquanto a lente 3D está ativa; no 2D o mapa recebe tudo. */
function syncPointer(st) {
  const active = Boolean(st.glRenderer && st.cam.mode !== "2d");
  if (st.gl) st.gl.style.pointerEvents = active ? "auto" : "none";
  const text = active ? st.description : "";
  if (st.live && st.live.textContent !== text) st.live.textContent = text;
}

/** Em 1ª Pessoa o standee do próprio token fica de fora (a câmera está dentro dele). */
function drawnView(st) {
  if (st.cam.mode !== "fp") return st.view;
  return { ...st.view, tokens: st.view.tokens.filter((t) => t.tokenId !== st.selectedId) };
}

function renderOverlayState(st) {
  syncPointer(st);
  if (!st.glRenderer || st.cam.mode === "2d") return null;
  const aspect = (st.gl.width || 768) / Math.max(1, st.gl.height || 576);
  st.mats = computeCameraMatrices(st.cam, aspect);
  const view = drawnView(st);
  const fog = buildFogLayer(view.floor, st.role) || {};
  const textured = st.rasters ? buildTexturedPass(st.rasters, view, st.mats.eye) : null;
  return st.glRenderer.render(view.floor, st.mats, { ...fog, tokens: view.tokens, textured, selectedId: st.selectedId });
}

function triggerOverlayFallback(st, opts, reason) {
  st.glRenderer?.destroy?.();
  st.glRenderer = null;
  st.cam = applyCameraPreset(st.cam, "2d");
  saveDioramaMode("2d", opts.storage);
  syncPointer(st);
  opts.onFallback2d?.(reason);
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

/** Resolve o alvo sob um clique (coordenadas de cliente) usando as matrizes do último quadro. */
function pickAtClient(st, ev) {
  if (!st.extras || !st.mats || !st.gl?.getBoundingClientRect) return null;
  const r = st.gl.getBoundingClientRect();
  const ray = st.extras.unprojectRay(st.mats.viewProj, ((ev.clientX - r.left) / r.width) * 2 - 1, 1 - ((ev.clientY - r.top) / r.height) * 2);
  return ray ? st.extras.pickDioramaScene(ray.origin, ray.dir, st.view) : null;
}

/** Redesenha no próximo quadro (vários eventos de gesto viram um único desenho). */
function scheduleDraw(st) {
  if (st.drawQueued) return;
  st.drawQueued = true;
  const run = () => { st.drawQueued = false; renderOverlayState(st); };
  if (typeof globalThis.requestAnimationFrame === "function") globalThis.requestAnimationFrame(run);
  else run();
}

function floorBounds(floor) {
  const cellPx = Math.max(1, Number(floor?.grid?.cellPx) || 64);
  return { maxX: (floor?.widthPx || 0) / cellPx, maxZ: (floor?.heightPx || 0) / cellPx };
}

/** Liga mouse, toque e teclado do canvas GL à câmera do overlay. */
function bindGestures(st) {
  if (!st.extras || !st.gl) return { wasDrag: () => false, destroy() {} };
  st.gl.setAttribute?.("aria-label", st.extras.DIORAMA_KEYS_HELP);
  return st.extras.attachDioramaGestures({
    el: st.gl,
    getCam: () => st.cam,
    setCam: (cam) => { st.cam = cam; scheduleDraw(st); },
    bounds: () => floorBounds(st.view?.floor),
    viewHeight: () => st.gl.height || 480,
  });
}

/** Liga o clique no canvas GL ao `onPick`; devolve a função que remove o listener. */
function bindPicking(st, opts, gestures) {
  const gl = st.gl;
  const onClick = (ev) => {
    if (gestures.wasDrag()) return;
    const hit = pickAtClient(st, ev);
    if (hit && hit.kind !== "floor") opts.onPick?.(hit);
  };
  gl?.addEventListener?.("click", onClick);
  return () => gl?.removeEventListener?.("click", onClick);
}

/**
 * Conecta o renderizador WebGL2 sob demanda em um canvas próprio, com fallback automático em `webglcontextlost`.
 * A visibilidade segue o mapa 2D (`projectDioramaView`): o jogador não recebe portas secretas nem tokens da camada GM.
 * Clique em standee/porta chama `opts.onPick({kind, tokenId|doorId})`, a mesma ação do 2D.
 *
 * @param {HTMLCanvasElement|object} canvas Canvas 2D do mapa (nunca recebe contexto WebGL).
 * @param {object} floor Documento `FloorDoc`.
 * @param {object} [opts={}] Opções (`mode`, `viewerRole`, `tokens`, `selectedId`, `onPick`, `createCanvas`, `onFallback2d`, `storage`, `extras` de `loadDioramaExtras()`; sem eles não há gestos nem picking).
 * @returns {{active: boolean, setMode: Function, setScene: Function, setImages: Function, draw: Function, detach: Function, rebind: Function, destroy: Function}} Controlador da lente.
 */
export function attachDioramaOverlay(canvas, floor, opts = {}) {
  const mode = opts.mode || loadDioramaMode(opts.storage);
  const st = { cam: createDioramaCamera({ mode }), gl: ensureGlCanvas(canvas), glRenderer: null, live: null, extras: opts.extras || null, description: "", view: null, role: "player", mats: null, selectedId: "" };
  const setScene = (nextFloor, scene = {}) => {
    st.role = scene.role === "gm" ? "gm" : "player";
    st.selectedId = scene.selectedId || "";
    st.view = projectDioramaView(nextFloor, scene.tokens, st.role);
    st.description = describeDioramaView(st.view, st.selectedId);
  };
  st.live = ensureLiveRegion(canvas);
  setScene(floor, { role: opts.viewerRole, tokens: opts.tokens, selectedId: opts.selectedId });
  st.cam = focusOnSelected(st, st.cam);
  if (mode !== "2d") ensureRenderer(st, opts);
  const gestures = bindGestures(st);
  const unbinds = [bindContextLoss(st, opts), bindPicking(st, opts, gestures), () => gestures.destroy()];
  return overlayApi(st, opts, setScene, unbinds);
}

/** Fábrica padrão de canvas para o atlas e o chão (OffscreenCanvas quando existir). */
function defaultCreateCanvas(w, h) {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(w, h);
  const el = globalThis.document.createElement("canvas");
  el.width = w;
  el.height = h;
  return el;
}

/** Tira o canvas GL e a região `aria-live` do DOM (o contexto e o texto ficam no estado). */
function detachDom(st) {
  st.gl?.remove?.();
  st.live?.remove?.();
}

/** Em 1ª Pessoa, leva a câmera para os olhos do token selecionado (`worldX, elevation, worldY`). */
function focusOnSelected(st, cam) {
  const tok = cam.mode === "fp" ? st.view?.tokens?.find((t) => t.tokenId === st.selectedId) : null;
  return tok ? { ...cam, target: tokenCenter3d(tok) } : cam;
}

/** Monta a API pública do overlay sobre o estado interno `st`. */
function overlayApi(st, opts, setScene, unbinds) {
  return {
    get active() { return Boolean(st.glRenderer && st.cam.mode !== "2d"); },
    setMode(nextMode) {
      st.cam = focusOnSelected(st, applyCameraPreset(st.cam, saveDioramaMode(nextMode, opts.storage)));
      if (st.cam.mode === "2d") { st.glRenderer?.destroy?.(); st.glRenderer = null; syncPointer(st); return null; }
      return ensureRenderer(st, opts) ? renderOverlayState(st) : null;
    },
    setScene,
    setImages(images) {
      const rasters = buildRasters(images, opts.createCanvas || defaultCreateCanvas);
      st.rasters = { ...rasters, version: (st.rasters?.version || 0) + 1 };
      return renderOverlayState(st);
    },
    draw: () => renderOverlayState(st),
    detach: () => detachDom(st),
    rebind(nextCanvas, nextFloor, scene) {
      st.gl = ensureGlCanvas(nextCanvas, st.gl);
      st.live = ensureLiveRegion(nextCanvas, st.live);
      setScene(nextFloor, scene);
      return renderOverlayState(st);
    },
    destroy() {
      for (const unbind of unbinds) unbind();
      st.glRenderer?.destroy?.();
      st.glRenderer = null;
      detachDom(st);
    },
  };
}
