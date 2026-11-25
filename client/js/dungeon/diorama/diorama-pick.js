/**
 * @file Picking da lente Diorama (puro): raio a partir de um ponto de tela e interseção com
 * standees (ray-cylinder) e portas (quad vertical). O resultado traz o mesmo identificador que o
 * mapa 2D usa (`tokenId`/`doorId`), para disparar a mesma ação.
 * @module dungeon/diorama/diorama-pick
 */
import { tokenCenter3d } from "./diorama-layers.js";
import { rayCylinderIntersect, rayPlaneIntersect, vec3Normalize } from "./diorama-math.js";

const DOOR_PICK_HEIGHT = { open: 0.6 };
const DOOR_PICK_HEIGHT_DEFAULT = 2.2;
const DOOR_PICK_MARGIN = 0.15;

/**
 * Inverte uma matriz 4×4 (Gauss-Jordan; independe de row/column-major).
 *
 * @param {ArrayLike<number>} m Matriz 4×4 (16 números).
 * @returns {Float64Array|null} Inversa ou `null` se singular.
 */
export function mat4Invert(m) {
  const a = Float64Array.from(m);
  const inv = Float64Array.from({ length: 16 }, (_, i) => (i % 5 === 0 ? 1 : 0));
  for (let c = 0; c < 4; c++) {
    let p = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(a[r * 4 + c]) > Math.abs(a[p * 4 + c])) p = r;
    if (Math.abs(a[p * 4 + c]) < 1e-12) return null;
    for (let k = 0; k < 4; k++) {
      [a[c * 4 + k], a[p * 4 + k]] = [a[p * 4 + k], a[c * 4 + k]];
      [inv[c * 4 + k], inv[p * 4 + k]] = [inv[p * 4 + k], inv[c * 4 + k]];
    }
    const d = a[c * 4 + c];
    for (let k = 0; k < 4; k++) { a[c * 4 + k] /= d; inv[c * 4 + k] /= d; }
    for (let r = 0; r < 4; r++) {
      const f = r === c ? 0 : a[r * 4 + c];
      for (let k = 0; k < 4 && f; k++) { a[r * 4 + k] -= f * a[c * 4 + k]; inv[r * 4 + k] -= f * inv[c * 4 + k]; }
    }
  }
  return inv;
}

function unproject(inv, x, y, z) {
  const v = [x, y, z, 1];
  const out = [0, 1, 2, 3].map((r) => v.reduce((acc, val, c) => acc + inv[c * 4 + r] * val, 0));
  return [out[0] / out[3], out[1] / out[3], out[2] / out[3]];
}

/**
 * Converte um ponto NDC (`-1..1`) em raio de mundo usando a inversa de `viewProj` (column-major).
 *
 * @param {ArrayLike<number>} viewProj Matriz `projeção × view`.
 * @param {number} ndcX Coordenada X normalizada.
 * @param {number} ndcY Coordenada Y normalizada (para cima).
 * @returns {{origin: number[], dir: number[]}|null} Raio ou `null` se a matriz for singular.
 */
export function unprojectRay(viewProj, ndcX, ndcY) {
  const inv = mat4Invert(viewProj);
  if (!inv) return null;
  const near = unproject(inv, ndcX, ndcY, -1);
  const far = unproject(inv, ndcX, ndcY, 1);
  return { origin: near, dir: vec3Normalize([far[0] - near[0], far[1] - near[1], far[2] - near[2]]) };
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

function rayDoorDistance(origin, dir, door) {
  const sx = door.x2 - door.x1;
  const sz = door.y2 - door.y1;
  const denom = -sz * dir[0] + sx * dir[2];
  if (Math.abs(denom) < 1e-9) return null;
  const t = (-sz * (door.x1 - origin[0]) + sx * (door.y1 - origin[2])) / denom;
  if (t < 0) return null;
  const px = origin[0] + dir[0] * t - door.x1;
  const pz = origin[2] + dir[2] * t - door.y1;
  const s = (px * sx + pz * sz) / (sx * sx + sz * sz || 1);
  const y = origin[1] + dir[1] * t;
  const maxY = DOOR_PICK_HEIGHT[door.state] ?? DOOR_PICK_HEIGHT_DEFAULT;
  const ok = s >= -DOOR_PICK_MARGIN && s <= 1 + DOOR_PICK_MARGIN && y >= 0 && y <= maxY;
  return ok ? t : null;
}

function nearestDoor(origin, dir, doors) {
  let best = null;
  for (const door of doors) {
    const t = rayDoorDistance(origin, dir, door);
    if (t !== null && (!best || t < best.t)) best = { kind: "door", doorId: door.doorId, t };
  }
  return best;
}

/**
 * Resolve o alvo de um raio: token (standee) ou porta, o que estiver mais perto; senão o chão.
 * Só considera o que a visão do papel já deixou passar (tokens/portas projetados).
 *
 * @param {number[]} origin Origem do raio.
 * @param {number[]} dir Direção normalizada.
 * @param {{floor: object, tokens: Array<object>}} view Resultado de `projectDioramaView`.
 * @returns {{kind: "token", tokenId: string, t: number}|{kind: "door", doorId: string, t: number}|{kind: "floor", point: number[]}|null} Alvo.
 */
export function pickDioramaScene(origin, dir, view) {
  const centered = view.tokens.map((t) => {
    const [x, , z] = tokenCenter3d(t);
    return { ...t, x, y: z };
  });
  const tok = pickDioramaTarget(origin, dir, centered);
  const door = nearestDoor(origin, dir, view.floor?.doors || []);
  if (tok?.kind === "token" && (!door || tok.t <= door.t)) return tok;
  return door || tok;
}
