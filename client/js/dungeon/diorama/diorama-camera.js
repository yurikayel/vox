/**
 * @file Estado orbital e presets de câmera (`2D`, `Iso`, `3D`) da lente Diorama
 * do Subversus VTT, com limites seguros de inclinação e suporte a `prefers-reduced-motion`.
 * @module dungeon/diorama/diorama-camera
 */
import { mat4LookAt, mat4Multiply, mat4Ortho, mat4Perspective } from "./diorama-math.js";

/** Modos de câmera suportados pela lente Diorama (preferência local por aparelho). */
export const CAMERA_MODES = Object.freeze(["2d", "iso", "3d"]);



const MIN_ZOOM = 3;
const MAX_ZOOM = 40;
const MIN_PITCH_DEG = 15;
const MAX_PITCH_DEG = 85;
const DEG2RAD = Math.PI / 180;

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Cria o estado inicial da câmera Diorama com defaults seguros.
 *
 * @param {object} [opts={}] Opções (`mode`, `targetX`, `targetZ`, `zoom`, `reducedMotion`).
 * @returns {object} Estado de câmera imutável por convenção.
 */
export function createDioramaCamera(opts = {}) {
  const mode = CAMERA_MODES.includes(opts.mode) ? opts.mode : "2d";
  return applyCameraPreset(
    {
      mode,
      yawDeg: 45,
      pitchDeg: 45,
      zoom: clamp(Number(opts.zoom) || 12, MIN_ZOOM, MAX_ZOOM),
      target: [Number(opts.targetX) || 6, 0, Number(opts.targetZ) || 4.5],
      eyeOffsetY: 1.5,
      reducedMotion: Boolean(opts.reducedMotion),
    },
    mode,
  );
}

/**
 * Aplica um preset de câmera (`2d`, `iso`, `3d`) preservando o alvo atual.
 *
 * @param {object} cam Estado atual da câmera.
 * @param {"2d"|"iso"|"3d"} mode Modo desejado.
 * @returns {object} Novo estado de câmera.
 */
export function applyCameraPreset(cam, mode) {
  const safeMode = CAMERA_MODES.includes(mode) ? mode : "2d";
  if (safeMode === "iso") return { ...cam, mode: "iso", yawDeg: 45, pitchDeg: 45 };
  if (safeMode === "3d") return { ...cam, mode: "3d", pitchDeg: clamp(cam.pitchDeg || 52, MIN_PITCH_DEG, MAX_PITCH_DEG) };
  return { ...cam, mode: "2d", pitchDeg: 89 };
}

/**
 * Aplica rotação orbital (arraste/pinça) respeitando o limite seguro `15°–85°` em 3D.
 *
 * @param {object} cam Estado atual da câmera.
 * @param {number} deltaYawDeg Variação horizontal em graus.
 * @param {number} deltaPitchDeg Variação vertical em graus.
 * @returns {object} Novo estado de câmera.
 */
export function orbitCamera(cam, deltaYawDeg, deltaPitchDeg) {
  const yawDeg = ((cam.yawDeg + Number(deltaYawDeg || 0)) % 360 + 360) % 360;
  const tilt = cam.mode === "iso" ? 0 : Number(deltaPitchDeg || 0);
  const pitchDeg = clamp(cam.pitchDeg + tilt, MIN_PITCH_DEG, MAX_PITCH_DEG);
  return { ...cam, yawDeg, pitchDeg };
}

/**
 * Aproxima ou afasta a câmera multiplicando a distância, dentro de `3..40`.
 *
 * @param {object} cam Estado atual da câmera.
 * @param {number} factor Fator multiplicativo (`< 1` aproxima, `> 1` afasta).
 * @returns {object} Novo estado de câmera.
 */
export function zoomCamera(cam, factor) {
  return { ...cam, zoom: clamp(cam.zoom * (Number(factor) || 1), MIN_ZOOM, MAX_ZOOM) };
}

/**
 * Desloca o alvo no chão em células, no referencial da câmera (`right`/`forward` pelo `yaw`),
 * mantendo-o dentro de `bounds` quando informado.
 *
 * @param {object} cam Estado atual da câmera.
 * @param {number} right Células para a direita da tela.
 * @param {number} forward Células para longe da câmera.
 * @param {{maxX?: number, maxZ?: number}} [bounds={}] Limites do piso em células.
 * @returns {object} Novo estado de câmera.
 */
export function panCamera(cam, right, forward, bounds = {}) {
  const yaw = cam.yawDeg * DEG2RAD;
  const x = cam.target[0] + right * Math.cos(yaw) - forward * Math.sin(yaw);
  const z = cam.target[2] - right * Math.sin(yaw) - forward * Math.cos(yaw);
  const cap = (v, max) => (Number.isFinite(max) ? clamp(v, 0, max) : v);
  return { ...cam, target: [cap(x, bounds.maxX), cam.target[1], cap(z, bounds.maxZ)] };
}

/**
 * Calcula posição `eye`, vetor `forward` e matriz `viewProj` para o viewport atual.
 *
 * @param {object} cam Estado da câmera.
 * @param {number} [aspect=1.5] Razão largura/altura do canvas.
 * @returns {{eye: [number, number, number], target: [number, number, number], viewProj: Float32Array, cutawayEnabled: boolean}} Matrizes e estado derivado.
 */
export function computeCameraMatrices(cam, aspect = 1.5) {
  const yaw = cam.yawDeg * DEG2RAD;
  const pitch = cam.pitchDeg * DEG2RAD;
  const dist = cam.zoom;
  const eye = [
    cam.target[0] + dist * Math.cos(pitch) * Math.sin(yaw),
    cam.target[1] + dist * Math.sin(pitch),
    cam.target[2] + dist * Math.cos(pitch) * Math.cos(yaw),
  ];
  const proj = cam.mode === "iso"
    ? mat4Ortho(dist * 0.6 * aspect, dist * 0.6, -120, 120)
    : mat4Perspective(45 * DEG2RAD, aspect, 0.1, 200);
  return {
    eye,
    target: cam.target,
    viewProj: mat4Multiply(proj, mat4LookAt(eye, cam.target)),
    cutawayEnabled: cam.mode === "3d" || cam.mode === "iso",
  };
}
