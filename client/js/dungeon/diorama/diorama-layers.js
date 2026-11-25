/**
 * @file Camadas interativas da lente Diorama (puras): visibilidade por papel, máscara de névoa
 * e standees de tokens. Reaproveita as regras do mapa 2D (`projectTacticsFloorForPlayer`,
 * camada `player` dos tokens e `floor.fog.revealedRects`) sem duplicá-las.
 * @module dungeon/diorama/diorama-layers
 */
import { projectTacticsFloorForPlayer } from "../vtt-tactics-reducer.js";
import { isDoorRevealedByFog, isTokenRevealedByFog } from "../vtt-tactics-geometry.js";

/** Lado (em texels) da máscara de névoa `R8`; a textura cobre todo o piso. */
export const FOG_MASK_SIZE = 256;

const STANDEE_HEIGHT = 1.4;
const FLAT_LIFT = 0.02;

/**
 * Aplica ao piso e aos tokens a mesma visibilidade do mapa 2D: o Mestre vê tudo; o jogador
 * recebe o piso projetado (sem portas secretas/camada GM), só tokens da camada `player` e,
 * com a névoa ligada, só tokens e portas dentro de alguma área revelada (nada some no
 * shader: o que está na névoa nem vira geometria nem alvo de picking).
 *
 * @param {object} floor Documento `FloorDoc`.
 * @param {Array<object>} tokens Tokens da cena.
 * @param {"gm"|"player"} role Papel do observador (qualquer valor diferente de `gm` vale como jogador).
 * @returns {{floor: object, tokens: Array<object>}} Piso e tokens visíveis no andar.
 */
export function projectDioramaView(floor, tokens, role) {
  const onFloor = (tokens || []).filter((t) => t.floorZ === floor?.z);
  if (role === "gm") return { floor, tokens: onFloor };
  const projected = projectTacticsFloorForPlayer(floor || {});
  const fogged = Boolean(projected.fog?.enabled);
  return {
    floor: fogged ? { ...projected, doors: projected.doors.filter((d) => isDoorRevealedByFog(d, projected)) } : projected,
    tokens: onFloor.filter((t) => t.layer === "player" && isTokenRevealedByFog(t, projected)),
  };
}

/** FNV-1a de 32 bits sobre inteiros de 4 bytes (little-endian). */
function fnv1a(hash, value) {
  let h = hash;
  const v = Math.round(Number(value) || 0) | 0;
  for (let i = 0; i < 4; i++) h = Math.imul(h ^ ((v >>> (i * 8)) & 255), 16777619);
  return h;
}

function fogSignature(floor, rects) {
  let h = [floor.z, floor.widthPx, floor.heightPx, rects.length].reduce(fnv1a, 2166136261);
  for (const r of rects) h = [r.x, r.y, r.w, r.h].reduce(fnv1a, h);
  return h >>> 0;
}

function paintRect(mask, r, view) {
  const x0 = Math.max(0, Math.ceil(r.x / view.spanX * FOG_MASK_SIZE));
  const x1 = Math.min(FOG_MASK_SIZE, Math.floor((r.x + r.w) / view.spanX * FOG_MASK_SIZE));
  const y0 = Math.max(0, Math.ceil(r.y / view.spanY * FOG_MASK_SIZE));
  const y1 = Math.min(FOG_MASK_SIZE, Math.floor((r.y + r.h) / view.spanY * FOG_MASK_SIZE));
  for (let y = y0; y < y1; y++) mask.fill(255, y * FOG_MASK_SIZE + x0, y * FOG_MASK_SIZE + Math.max(x0, x1));
}

/**
 * Converte `floor.fog` na máscara `R8` (255 = revelado) e nos parâmetros do shader.
 * Sem névoa ligada devolve `null`. O Mestre enxerga a névoa a 50%; para o jogador (`dim` 0) o shader descarta o fragmento (fundo, não preto). A máscara arredonda para dentro.
 *
 * @param {object} floor Documento `FloorDoc` (já projetado para o papel).
 * @param {"gm"|"player"} role Papel do observador.
 * @returns {{mask: Uint8Array, version: number, rect: number[], dim: number}|null} Camada de névoa.
 */
export function buildFogLayer(floor, role) {
  if (!floor?.fog?.enabled) return null;
  const cellPx = Math.max(1, Number(floor.grid?.cellPx) || 64);
  const ox = Number(floor.grid?.offsetX) || 0;
  const oy = Number(floor.grid?.offsetY) || 0;
  const view = { spanX: Math.max(1, floor.widthPx), spanY: Math.max(1, floor.heightPx) };
  const mask = new Uint8Array(FOG_MASK_SIZE * FOG_MASK_SIZE);
  const rects = floor.fog.revealedRects || [];
  for (const r of rects) paintRect(mask, r, view);
  const rect = [ox / cellPx, oy / cellPx, cellPx / view.spanX, cellPx / view.spanY];
  return { mask, version: fogSignature(floor, rects), rect, dim: role === "gm" ? 0.5 : 0 };
}

/**
 * Centro 3D `[X, Y, Z]` de um token (células; `Y` = elevação), usado no desenho e no picking.
 *
 * @param {object} tok Token com `x`, `y`, `sizeCells` e `elevation`.
 * @returns {[number, number, number]} Centro do token na base.
 */
export function tokenCenter3d(tok) {
  const half = (Number(tok.sizeCells) || 1) * 0.5;
  return [(Number(tok.x) || 0) + half, Number(tok.elevation) || 0, (Number(tok.y) || 0) + half];
}

function standeeColor(tok, selectedId) {
  const hex = String(tok.color || "#78d6cf").replace("#", "");
  const rgb = [0, 2, 4].map((i) => (Number.parseInt(hex.slice(i, i + 2), 16) || 128) / 255);
  return tok.tokenId === selectedId ? rgb.map((c) => c * 0.5 + 0.5) : rgb;
}

/**
 * Cantos 3D do standee de um token (quad voltado à câmera, ou plano para `display: "flat"`).
 *
 * @param {object} tok Token.
 * @param {number[]} [eye] Posição da câmera.
 * @returns {number[][]} Quatro cantos `[x, y, z]`.
 */
export function standeeCorners(tok, eye) {
  const [cx, cy, cz] = tokenCenter3d(tok);
  const half = (Number(tok.sizeCells) || 1) * 0.4;
  if (tok.display === "flat") {
    return [[cx - half, cy + FLAT_LIFT, cz - half], [cx + half, cy + FLAT_LIFT, cz - half], [cx + half, cy + FLAT_LIFT, cz + half], [cx - half, cy + FLAT_LIFT, cz + half]];
  }
  const dx = (eye?.[0] ?? cx) - cx;
  const dz = (eye?.[2] ?? cz + 1) - cz;
  const len = Math.hypot(dx, dz) || 1;
  const rx = (dz / len) * half;
  const rz = (-dx / len) * half;
  return [[cx - rx, cy, cz - rz], [cx + rx, cy, cz + rz], [cx + rx, cy + STANDEE_HEIGHT, cz + rz], [cx - rx, cy + STANDEE_HEIGHT, cz - rz]];
}

/**
 * Acrescenta ao buffer de vértices (`x, y, z, r, g, b, ao`) um standee (quad voltado à câmera,
 * ou disco plano para `display: "flat"`) por token.
 *
 * @param {number[]} out Buffer de saída.
 * @param {Array<object>} tokens Tokens já filtrados pela visibilidade do papel.
 * @param {{eye?: number[], selectedId?: string}} [ctx={}] Posição da câmera e token selecionado.
 * @returns {number} Quantidade de standees acrescentados.
 */
export function appendStandees(out, tokens, ctx = {}) {
  for (const tok of tokens) {
    const [p0, p1, p2, p3] = standeeCorners(tok, ctx.eye);
    const rgb = standeeColor(tok, ctx.selectedId);
    for (const [p, ao] of [[p0, 0.8], [p1, 0.8], [p2, 1], [p0, 0.8], [p2, 1], [p3, 1]]) out.push(...p, ...rgb, ao);
  }
  return tokens.length;
}
