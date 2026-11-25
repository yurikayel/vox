/**
 * @file Matemática 3D pura da lente Diorama do Subversus VTT: matrizes 4×4,
 * conversão única `floorPxToWorld`, mapeamento `(wx, wy, elevation) → (X, Y, Z)`
 * e interseções `ray-plane` (chão) + `ray-cylinder` (standees em ângulos baixos).
 * @module dungeon/diorama/diorama-math
 */

/**
 * Converte coordenadas em pixels de um `FloorDoc` para unidades de grade 2D.
 *
 * @param {number} px Coordenada horizontal em pixels no mapa 2D.
 * @param {number} py Coordenada vertical em pixels no mapa 2D.
 * @param {object} [floor={}] Documento `FloorDoc` com `grid.cellPx`, `offsetX`, `offsetY`.
 * @returns {{wx: number, wy: number}} Coordenadas em células da grade.
 */
export function floorPxToWorld(px, py, floor = {}) {
  const cellPx = Math.max(1, Number(floor?.grid?.cellPx) || 64);
  const ox = Number(floor?.grid?.offsetX) || 0;
  const oy = Number(floor?.grid?.offsetY) || 0;
  return { wx: (Number(px) - ox) / cellPx, wy: (Number(py) - oy) / cellPx };
}

/**
 * Mapeia um ponto 2D em células `(wx, wy)` com altura `elevation` para coordenadas 3D `(X, Y, Z)`.
 * Convenção canônica: `X = wx` (leste), `Y = elevation` (altura), `Z = wy` (sul).
 *
 * @param {number} wx Coordenada X na grade 2D.
 * @param {number} wy Coordenada Y na grade 2D.
 * @param {number} [elevation=0] Elevação vertical dentro do andar.
 * @returns {[number, number, number]} Vetor `[X, Y, Z]`.
 */
export function worldTo3d(wx, wy, elevation = 0) {
  return [Number(wx) || 0, Number(elevation) || 0, Number(wy) || 0];
}

/**
 * Subtrai dois vetores 3D (`a - b`).
 *
 * @param {[number, number, number]} a Vetor A.
 * @param {[number, number, number]} b Vetor B.
 * @returns {[number, number, number]} Diferença.
 */
export function vec3Sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/**
 * Produto vetorial de dois vetores 3D.
 *
 * @param {[number, number, number]} a Vetor A.
 * @param {[number, number, number]} b Vetor B.
 * @returns {[number, number, number]} Vetor perpendicular.
 */
export function vec3Cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/**
 * Normaliza um vetor 3D.
 *
 * @param {[number, number, number]} v Vetor de entrada.
 * @returns {[number, number, number]} Vetor unitário.
 */
export function vec3Normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * Produto escalar de dois vetores 3D.
 *
 * @param {[number, number, number]} a Vetor A.
 * @param {[number, number, number]} b Vetor B.
 * @returns {number} Escalar.
 */
export function vec3Dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Constrói uma matriz de projeção perspectiva 4×4 (column-major WebGL).
 *
 * @param {number} fovRad Campo de visão vertical em radianos.
 * @param {number} aspect Razão largura/altura do viewport.
 * @param {number} [near=0.1] Plano próximo.
 * @param {number} [far=200] Plano distante.
 * @returns {Float32Array} Matriz 4×4.
 */
export function mat4Perspective(fovRad, aspect, near = 0.1, far = 200) {
  const f = 1 / Math.tan(Math.max(0.05, fovRad) * 0.5);
  const nf = 1 / (near - far);
  const out = new Float32Array(16);
  out[0] = f / Math.max(0.01, aspect);
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

/**
 * Constrói uma matriz de projeção ortográfica 4×4 (column-major WebGL) para modo Isométrico/2D.
 *
 * @param {number} halfW Meia largura em unidades de mundo.
 * @param {number} halfH Meia altura em unidades de mundo.
 * @param {number} [near=-100] Plano próximo.
 * @param {number} [far=100] Plano distante.
 * @returns {Float32Array} Matriz 4×4.
 */
export function mat4Ortho(halfW, halfH, near = -100, far = 100) {
  const out = new Float32Array(16);
  out[0] = 1 / Math.max(0.01, halfW);
  out[5] = 1 / Math.max(0.01, halfH);
  out[10] = -2 / (far - near);
  out[14] = -(far + near) / (far - near);
  out[15] = 1;
  return out;
}

/**
 * Constrói uma matriz de câmera `lookAt` 4×4 (column-major WebGL).
 *
 * @param {[number, number, number]} eye Posição da câmera.
 * @param {[number, number, number]} target Ponto alvo.
 * @param {[number, number, number]} [up=[0, 1, 0]] Vetor vertical.
 * @returns {Float32Array} Matriz 4×4.
 */
export function mat4LookAt(eye, target, up = [0, 1, 0]) {
  const z = vec3Normalize(vec3Sub(eye, target));
  const x = vec3Normalize(vec3Cross(up, z));
  const y = vec3Cross(z, x);
  const out = new Float32Array(16);
  out[0] = x[0]; out[1] = y[0]; out[2] = z[0];
  out[4] = x[1]; out[5] = y[1]; out[6] = z[1];
  out[8] = x[2]; out[9] = y[2]; out[10] = z[2];
  out[12] = -vec3Dot(x, eye);
  out[13] = -vec3Dot(y, eye);
  out[14] = -vec3Dot(z, eye);
  out[15] = 1;
  return out;
}

/**
 * Multiplica duas matrizes 4×4 (`a * b`, column-major WebGL).
 *
 * @param {Float32Array} a Matriz esquerda.
 * @param {Float32Array} b Matriz direita.
 * @returns {Float32Array} Produto 4×4.
 */
export function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    const c = col * 4;
    for (let row = 0; row < 4; row++) {
      out[c + row] =
        a[row] * b[c] +
        a[4 + row] * b[c + 1] +
        a[8 + row] * b[c + 2] +
        a[12 + row] * b[c + 3];
    }
  }
  return out;
}

/**
 * Calcula interseção de um raio 3D com um plano horizontal `Y = planeY`.
 *
 * @param {[number, number, number]} origin Origem do raio.
 * @param {[number, number, number]} dir Direção normalizada do raio.
 * @param {number} [planeY=0] Altura do plano horizontal.
 * @returns {{t: number, point: [number, number, number]}|null} Interseção ou `null`.
 */
export function rayPlaneIntersect(origin, dir, planeY = 0) {
  if (Math.abs(dir[1]) < 1e-6) return null;
  const t = (planeY - origin[1]) / dir[1];
  if (t < 0) return null;
  return { t, point: [origin[0] + dir[0] * t, planeY, origin[2] + dir[2] * t] };
}

/**
 * Calcula interseção de um raio 3D com um cilindro vertical (standee de token)
 * para picking confiável em ângulos baixos (15°–30°) e modo 1ª Pessoa.
 *
 * @param {[number, number, number]} origin Origem do raio.
 * @param {[number, number, number]} dir Direção normalizada do raio.
 * @param {{x: number, y: number, z: number, radius: number, height: number}} cyl Cilindro vertical.
 * @returns {number|null} Distância `t >= 0` ao longo do raio ou `null`.
 */
export function rayCylinderIntersect(origin, dir, cyl) {
  const ox = origin[0] - cyl.x;
  const oz = origin[2] - cyl.z;
  const a = dir[0] * dir[0] + dir[2] * dir[2];
  if (a < 1e-8) return null;
  const b = 2 * (ox * dir[0] + oz * dir[2]);
  const c = ox * ox + oz * oz - cyl.radius * cyl.radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
    if (t < 0) continue;
    const hitY = origin[1] + dir[1] * t;
    if (hitY >= cyl.y && hitY <= cyl.y + cyl.height) return t;
  }
  return null;
}
