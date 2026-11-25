/**
 * @file Pipeline WebGL2 ultraleve da lente Diorama do Subversus VTT:
 * Vertex AO + Ambient Tint, standees com `discard` (alphaTest), cache de Fog `R8`
 * por `fogVersion` e descarte explícito de VRAM (teto 2048×2048).
 * @module dungeon/diorama/diorama-gl
 */
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
void main() {
  vCol = aCol;
  vAo = aAo;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

const MESH_FS = `#version 300 es
precision mediump float;
in vec3 vCol;
in float vAo;
uniform vec3 uAmbient;
out vec4 fragColor;
void main() {
  fragColor = vec4(vCol * uAmbient * vAo, 1.0);
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
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 512, 512, 0, gl.RED, gl.UNSIGNED_BYTE, fogMask);
  state.fogVersion = fogVersion;
  return true;
}

function drawDioramaFrame(ctx, floor, camMats, fogOpts) {
  const { gl, canvas, prog, meshBuf, uViewProj, uAmbient, state } = ctx;
  const geom = buildFloorDioramaGeometry(floor, camMats);
  if (syncFogTexture(gl, state, fogOpts.mask, fogOpts.version)) state.fogUploads++;
  gl.viewport(0, 0, canvas.width || 768, canvas.height || 576);
  gl.clearColor(0.067, 0.075, 0.086, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(prog);
  gl.uniformMatrix4fv(uViewProj, false, camMats.viewProj);
  gl.uniform3fv(uAmbient, AMBIENT_PRESETS[floor?.diorama?.ambient] || AMBIENT_PRESETS.dungeon);
  uploadMeshBuffer(gl, meshBuf, geom.vertices);
  if (geom.triangleCount > 0) gl.drawArrays(gl.TRIANGLES, 0, geom.triangleCount * 3);
  state.drawCalls = geom.triangleCount > 0 ? 1 : 0;
  return { triangleCount: geom.triangleCount, drawCalls: state.drawCalls, fogUploads: state.fogUploads };
}

/**
 * Inicializa o renderizador WebGL2 da lente Diorama com degradação segura.
 *
 * @param {HTMLCanvasElement|object} canvas Elemento canvas alvo.
 * @returns {object|null} Instância do renderizador (`render`, `destroy`, `stats`) ou `null` sem WebGL2.
 */
export function createDioramaGlRenderer(canvas) {
  const gl = canvas?.getContext?.("webgl2", { antialias: true, powerPreference: "low-power" });
  if (!gl) return null;
  const prog = linkProgram(gl, MESH_VS, MESH_FS);
  if (!prog) return null;
  const ctx = {
    gl,
    canvas,
    prog,
    meshBuf: gl.createBuffer(),
    uViewProj: gl.getUniformLocation(prog, "uViewProj"),
    uAmbient: gl.getUniformLocation(prog, "uAmbient"),
    state: { fogTex: null, fogVersion: -1, drawCalls: 0, fogUploads: 0 },
  };
  gl.enable(gl.DEPTH_TEST);
  return {
    render: (floor, camMats, fogOpts = {}) => drawDioramaFrame(ctx, floor, camMats, fogOpts),
    stats: () => ({ drawCalls: ctx.state.drawCalls, fogUploads: ctx.state.fogUploads, fogVersion: ctx.state.fogVersion }),
    destroy() {
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (ctx.state.fogTex) gl.deleteTexture(ctx.state.fogTex);
      gl.deleteBuffer(ctx.meshBuf);
      gl.deleteProgram(ctx.prog);
      ctx.state.fogTex = null;
    },
  };
}
