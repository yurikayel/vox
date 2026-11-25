/**
 * @file Pipeline WebGL2 ultraleve da lente Diorama do Subversus VTT:
 * Vertex AO + Ambient Tint, standees com `discard` (alphaTest), cache de Fog `R8`
 * por `fogVersion` e descarte explícito de VRAM (teto 2048×2048).
 * @module dungeon/diorama/diorama-gl
 */
import { FOG_MASK_SIZE } from "./diorama-layers.js";
import { AMBIENT_PRESETS, buildFloorDioramaGeometry } from "./diorama-geom.js";

/** Dimensão defensiva máxima de textura para proteger VRAM no Android/iOS Safari. */
export const MAX_DIORAMA_TEX_DIM = 2048;

const MESH_VS = `#version 300 es
precision mediump float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aCol;
layout(location=2) in float aAo;
uniform mat4 uViewProj;
out vec3 vCol;
out float vAo;
out vec2 vXz;
void main() {
  vXz = aPos.xz;
  vCol = aCol;
  vAo = aAo;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

const MESH_FS = `#version 300 es
precision mediump float;
in vec3 vCol;
in float vAo;
in vec2 vXz;
uniform vec3 uAmbient;
uniform sampler2D uFog;
uniform vec4 uFogRect;
uniform float uFogDim;
out vec4 fragColor;
void main() {
  float seen = texture(uFog, (vXz + uFogRect.xy) * uFogRect.zw).r;
  if (uFogDim <= 0.0 && seen < 0.5) discard;
  fragColor = vec4(vCol * uAmbient * vAo * mix(uFogDim, 1.0, seen), 1.0);
}`;

/** Fragment shader de standees 2.5D com recorte `discard` para dispensar alpha-sorting por frame. */
export const STANDEE_FS_SOURCE = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D uTex;
out vec4 fragColor;
void main() {
  vec4 c = texture(uTex, vUv);
  if (c.a < 0.5) discard;
  fragColor = c;
}`;

const TEX_VS = `#version 300 es
precision mediump float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
uniform mat4 uViewProj;
out vec2 vUv;
out vec2 vXz;
void main() {
  vUv = aUv;
  vXz = aPos.xz;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

/** Fragment shader do passe texturizado (chão e avatares): recorte `discard` e a mesma névoa da malha. */
export const TEX_FS_SOURCE = `#version 300 es
precision mediump float;
in vec2 vUv;
in vec2 vXz;
uniform sampler2D uTex;
uniform sampler2D uFog;
uniform vec3 uAmbient;
uniform vec4 uFogRect;
uniform float uFogDim;
out vec4 fragColor;
void main() {
  vec4 c = texture(uTex, vUv);
  if (c.a < 0.5) discard;
  float seen = texture(uFog, (vXz + uFogRect.xy) * uFogRect.zw).r;
  if (uFogDim <= 0.0 && seen < 0.5) discard;
  fragColor = vec4(c.rgb * uAmbient * mix(uFogDim, 1.0, seen), 1.0);
}`;

function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function linkProgram(gl, vsSrc, fsSrc) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

function uploadMeshBuffer(gl, buf, vertices) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
  const stride = 7 * 4;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 24);
}

function syncFogTexture(gl, state, fogMask, fogVersion) {
  if (!fogMask || state.fogVersion === fogVersion) return false;
  if (!state.fogTex) state.fogTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, state.fogTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, FOG_MASK_SIZE, FOG_MASK_SIZE, 0, gl.RED, gl.UNSIGNED_BYTE, fogMask);
  state.fogVersion = fogVersion;
  return true;
}

function bindFogUniforms(ctx, fogOpts) {
  const { gl, state, uFog, uFogRect, uFogDim } = ctx;
  const on = Boolean(fogOpts.mask && state.fogTex);
  if (on) gl.bindTexture(gl.TEXTURE_2D, state.fogTex);
  gl.uniform1i(uFog, 0);
  gl.uniform4fv(uFogRect, fogOpts.rect || [0, 0, 1, 1]);
  gl.uniform1f(uFogDim, on ? fogOpts.dim : 1);
}

function uploadCanvasTexture(gl, slot, source, version) {
  if (slot.version === version && slot.tex) return slot.tex;
  if (!slot.tex) slot.tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, slot.tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  slot.version = version;
  return slot.tex;
}

function drawTexturedPart(ctx, key, part) {
  const { gl, tp } = ctx;
  gl.activeTexture(gl.TEXTURE1);
  const tex = uploadCanvasTexture(gl, ctx.state.slots[key], part.canvas, part.version);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindBuffer(gl.ARRAY_BUFFER, tp.buf);
  gl.bufferData(gl.ARRAY_BUFFER, part.vertices, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
  gl.drawArrays(gl.TRIANGLES, 0, part.vertices.length / 5);
  return 1;
}

function drawTexturedPass(ctx, textured, fogOpts, ambient) {
  const { gl, tp } = ctx;
  if (!textured?.floor && !textured?.avatars) return 0;
  gl.useProgram(tp.prog);
  gl.uniformMatrix4fv(tp.uViewProj, false, ctx.viewProj);
  gl.uniform3fv(tp.uAmbient, ambient);
  gl.uniform1i(tp.uTex, 1);
  gl.uniform1i(tp.uFog, 0);
  gl.uniform4fv(tp.uFogRect, fogOpts.rect || [0, 0, 1, 1]);
  gl.uniform1f(tp.uFogDim, fogOpts.mask && ctx.state.fogTex ? fogOpts.dim : 1);
  let calls = 0;
  if (textured.floor) calls += drawTexturedPart(ctx, "floor", textured.floor);
  if (textured.avatars) calls += drawTexturedPart(ctx, "avatars", textured.avatars);
  return calls;
}

function drawDioramaFrame(ctx, floor, camMats, fogOpts) {
  const { gl, canvas, prog, meshBuf, uViewProj, uAmbient, state } = ctx;
  const geom = buildFloorDioramaGeometry(floor, { ...camMats, tokens: fogOpts.textured ? fogOpts.textured.plainTokens : fogOpts.tokens, selectedId: fogOpts.selectedId, b2: true });
  if (syncFogTexture(gl, state, fogOpts.mask, fogOpts.version)) state.fogUploads++;
  gl.viewport(0, 0, canvas.width || 768, canvas.height || 576);
  gl.clearColor(0.067, 0.075, 0.086, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  ctx.viewProj = camMats.viewProj;
  const ambient = AMBIENT_PRESETS[floor?.diorama?.ambient] || AMBIENT_PRESETS.dungeon;
  const texturedCalls = drawTexturedPass(ctx, fogOpts.textured, fogOpts, ambient);
  gl.useProgram(prog);
  gl.uniformMatrix4fv(uViewProj, false, camMats.viewProj);
  bindFogUniforms(ctx, fogOpts);
  gl.uniform3fv(uAmbient, ambient);
  uploadMeshBuffer(gl, meshBuf, geom.vertices);
  if (geom.triangleCount > 0) gl.drawArrays(gl.TRIANGLES, 0, geom.triangleCount * 3);
  state.drawCalls = (geom.triangleCount > 0 ? 1 : 0) + texturedCalls;
  return { triangleCount: geom.triangleCount, drawCalls: state.drawCalls, fogUploads: state.fogUploads };
}

function createTexturedProgram(gl) {
  const prog = linkProgram(gl, TEX_VS, TEX_FS_SOURCE);
  if (!prog) return null;
  const at = (name) => gl.getUniformLocation(prog, name);
  return { prog, buf: gl.createBuffer(), uViewProj: at("uViewProj"), uAmbient: at("uAmbient"), uTex: at("uTex"), uFog: at("uFog"), uFogRect: at("uFogRect"), uFogDim: at("uFogDim") };
}

function buildGlContext(gl, canvas) {
  const prog = linkProgram(gl, MESH_VS, MESH_FS);
  const tp = prog ? createTexturedProgram(gl) : null;
  if (!tp) return null;
  const at = (name) => gl.getUniformLocation(prog, name);
  return {
    gl, canvas, prog, tp,
    meshBuf: gl.createBuffer(),
    uViewProj: at("uViewProj"), uAmbient: at("uAmbient"), uFog: at("uFog"), uFogRect: at("uFogRect"), uFogDim: at("uFogDim"),
    state: { fogTex: null, fogVersion: -1, drawCalls: 0, fogUploads: 0, slots: { floor: {}, avatars: {} } },
  };
}

function destroyGlContext(ctx) {
  const { gl, state, tp } = ctx;
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  for (const tex of [state.fogTex, ...Object.values(state.slots).map((s) => s.tex)]) if (tex) gl.deleteTexture(tex);
  gl.deleteBuffer(ctx.meshBuf);
  gl.deleteBuffer(tp.buf);
  gl.deleteProgram(tp.prog);
  gl.deleteProgram(ctx.prog);
  state.fogTex = null;
}

/**
 * Inicializa o renderizador WebGL2 da lente Diorama com degradação segura.
 *
 * @param {HTMLCanvasElement|object} canvas Elemento canvas alvo.
 * @returns {object|null} Instância do renderizador (`render`, `destroy`, `stats`) ou `null` sem WebGL2.
 */
export function createDioramaGlRenderer(canvas) {
  const gl = canvas?.getContext?.("webgl2", { antialias: true, powerPreference: "low-power" });
  const ctx = gl ? buildGlContext(gl, canvas) : null;
  if (!ctx) return null;
  gl.enable(gl.DEPTH_TEST);
  return {
    render: (floor, camMats, fogOpts = {}) => drawDioramaFrame(ctx, floor, camMats, fogOpts),
    stats: () => ({ drawCalls: ctx.state.drawCalls, fogUploads: ctx.state.fogUploads, fogVersion: ctx.state.fogVersion }),
    destroy: () => destroyGlContext(ctx),
  };
}
