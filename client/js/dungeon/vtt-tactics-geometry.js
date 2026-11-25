/**
 * @file Geometria tática pura da Entrega 3: simplificação de polilinhas (Ramer-Douglas-Peucker),
 * áreas de efeito (esfera, cone, cubo, linha), hit-test de portas e checagem de névoa de guerra.
 * @module dungeon/vtt-tactics-geometry
 */
import { tokenBoundsWorld } from "./vtt-geometry.js";

/**
 * Calcula a menor distância euclidiana de um ponto `{ wx, wy }` até o segmento `{ x1, y1, x2, y2 }`.
 * @param {{ wx: number, wy: number }} pt Ponto alvo.
 * @param {{ x1: number, y1: number, x2: number, y2: number }} seg Segmento no mundo.
 * @returns {number} Distância em pixels.
 */
export function distancePointToSegment(pt, seg) {
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-9) return Math.hypot(pt.wx - seg.x1, pt.wy - seg.y1);
  const t = Math.max(0, Math.min(1, ((pt.wx - seg.x1) * dx + (pt.wy - seg.y1) * dy) / lenSq));
  return Math.hypot(pt.wx - (seg.x1 + t * dx), pt.wy - (seg.y1 + t * dy));
}

function rdpStep(points, start, end, eps, keep) {
  if (end - start <= 1) return;
  let maxDist = -1;
  let maxIdx = -1;
  const seg = { x1: points[start].wx, y1: points[start].wy, x2: points[end].wx, y2: points[end].wy };
  for (let i = start + 1; i < end; i += 1) {
    const d = distancePointToSegment(points[i], seg);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }
  if (maxDist > eps && maxIdx > start) {
    keep[maxIdx] = true;
    rdpStep(points, start, maxIdx, eps, keep);
    rdpStep(points, maxIdx, end, eps, keep);
  }
}

/**
 * Simplifica uma polilinha com Ramer-Douglas-Peucker para payloads compactos na rede P2P.
 * @param {Array<{ wx: number, wy: number }>} points Pontos originais.
 * @param {number} [epsilon=4] Tolerância em pixels do mundo.
 * @returns {Array<{ wx: number, wy: number }>} Polilinha simplificada.
 */
export function simplifyPolyline(points = [], epsilon = 4) {
  if (!Array.isArray(points) || points.length <= 2) return Array.isArray(points) ? [...points] : [];
  const eps = Math.max(0.5, Number(epsilon) || 4);
  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  rdpStep(points, 0, points.length - 1, eps, keep);
  return points.filter((_, idx) => keep[idx]);
}

function angleDiffRad(a, b) {
  let diff = (a - b) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff);
}

function pointInCone(wx, wy, aoe, cellPx) {
  const dx = wx - aoe.wx;
  const dy = wy - aoe.wy;
  const dist = Math.hypot(dx, dy);
  const maxLen = (Number(aoe.lengthCells) || 4) * cellPx;
  if (dist > maxLen) return false;
  if (dist <= 1e-6) return true;
  const halfSpread = ((Number(aoe.spreadDeg) || 53) * Math.PI) / 360;
  return angleDiffRad(Math.atan2(dy, dx), Number(aoe.angleRad) || 0) <= halfSpread;
}

function pointInLine(wx, wy, aoe, cellPx) {
  const len = (Number(aoe.lengthCells) || 4) * cellPx;
  const halfW = ((Number(aoe.widthCells) || 1) * cellPx) / 2;
  const cos = Math.cos(Number(aoe.angleRad) || 0);
  const sin = Math.sin(Number(aoe.angleRad) || 0);
  const dx = wx - aoe.wx;
  const dy = wy - aoe.wy;
  const along = dx * cos + dy * sin;
  const perp = Math.abs(-dx * sin + dy * cos);
  return along >= 0 && along <= len && perp <= halfW;
}

/**
 * Testa se um ponto no mundo `(wx, wy)` está contido em um gabarito de Área de Efeito (`circle`, `cone`, `cube`, `line`).
 * @param {number} wx Coordenada X no mundo.
 * @param {number} wy Coordenada Y no mundo.
 * @param {object} aoe Documento `AoeDoc`.
 * @param {object} [grid={}] Configuração da grade (`cellPx`).
 * @returns {boolean} `true` quando o ponto cai dentro do gabarito.
 */
export function pointInAoe(wx, wy, aoe, grid = {}) {
  if (!aoe) return false;
  const cellPx = Math.max(16, Number(grid?.cellPx) || 64);
  if (aoe.kind === "circle") return Math.hypot(wx - aoe.wx, wy - aoe.wy) <= (Number(aoe.radiusCells) || 2) * cellPx;
  if (aoe.kind === "cube") {
    const side = (Number(aoe.lengthCells || aoe.radiusCells) || 2) * cellPx;
    return wx >= aoe.wx && wx <= aoe.wx + side && wy >= aoe.wy && wy <= aoe.wy + side;
  }
  if (aoe.kind === "cone") return pointInCone(wx, wy, aoe, cellPx);
  if (aoe.kind === "line") return pointInLine(wx, wy, aoe, cellPx);
  return false;
}

/**
 * Retorna os tokens visíveis para o papel cujo centro cai dentro da Área de Efeito `aoe`.
 * @param {object} aoe Documento `AoeDoc`.
 * @param {Array<object>} [tokens=[]] Tokens do piso ativo.
 * @param {object} [grid={}] Configuração da grade.
 * @param {"gm"|"player"} [viewerRole="player"] Papel do observador (fail-closed).
 * @returns {Array<object>} Tokens atingidos pelo gabarito.
 */
export function tokensInsideAoe(aoe, tokens = [], grid = {}, viewerRole = "player") {
  if (!aoe || (viewerRole !== "gm" && aoe.layer === "gm")) return [];
  return (tokens || []).filter((tok) => {
    if (!tok) return false;
    if (viewerRole !== "gm" && tok.layer !== "player") return false;
    const b = tokenBoundsWorld(tok, grid);
    return pointInAoe(b.cx, b.cy, aoe, grid);
  });
}

function num(val) {
  return Number(val) || 0;
}

/**
 * Converte as extremidades em células de uma porta para coordenadas de mundo `(x1,y1,x2,y2)`.
 * @param {object} door Documento `DoorDoc`.
 * @param {object} [grid={}] Configuração da grade.
 * @returns {{ x1: number, y1: number, x2: number, y2: number }} Segmento no mundo.
 */
export function doorSegmentWorld(door = {}, grid = {}) {
  const cellPx = Math.max(16, num(grid.cellPx) || 64);
  const ox = num(grid.offsetX);
  const oy = num(grid.offsetY);
  return {
    x1: ox + num(door.x1) * cellPx,
    y1: oy + num(door.y1) * cellPx,
    x2: ox + num(door.x2) * cellPx,
    y2: oy + num(door.y2) * cellPx,
  };
}

/**
 * Encontra a porta mais próxima do ponto `(wx, wy)` dentro da tolerância, ignorando portas secretas para jogadores.
 * @param {number} wx Coordenada X no mundo.
 * @param {number} wy Coordenada Y no mundo.
 * @param {Array<object>} [doors=[]] Lista de portas do piso.
 * @param {object} [grid={}] Configuração da grade.
 * @param {{ viewerRole?: "gm"|"player", tolerancePx?: number }} [opts={}] Papel do observador (fail-closed) e raio.
 * @returns {object|null} Porta clicada ou `null`.
 */
export function hitTestDoors(wx, wy, doors = [], grid = {}, opts = {}) {
  const viewerRole = opts.viewerRole === "gm" ? "gm" : "player";
  let best = null;
  let bestDist = Math.max(4, Number(opts.tolerancePx) || 12);
  const pt = { wx, wy };
  for (const door of doors || []) {
    if (!door) continue;
    if (viewerRole !== "gm" && door.state === "secret") continue;
    const dist = distancePointToSegment(pt, doorSegmentWorld(door, grid));
    if (dist <= bestDist) {
      bestDist = dist;
      best = door;
    }
  }
  return best;
}

/**
 * Verifica se o ponto `(wx, wy)` está visível sob o estado atual da Névoa de Guerra.
 * @param {number} wx Coordenada X no mundo.
 * @param {number} wy Coordenada Y no mundo.
 * @param {{ enabled?: boolean, revealedRects?: Array<object> }} [fog] Estado de névoa do piso.
 * @returns {boolean} `true` se a névoa estiver desativada ou o ponto cair em uma área revelada.
 */
export function isPointRevealedByFog(wx, wy, fog) {
  if (!fog?.enabled) return true;
  return (fog.revealedRects || []).some(
    (r) => wx >= r.x && wx <= r.x + r.w && wy >= r.y && wy <= r.y + r.h,
  );
}

/**
 * Indica se o centro de um token está numa área revelada da névoa do piso (sem névoa, sempre `true`).
 * @param {{x?: number, y?: number, sizeCells?: number}} tok Token (coordenadas em células).
 * @param {{grid?: object, fog?: object}} floor Piso do token.
 * @returns {boolean} `true` se o token pode ser visto pelo jogador.
 */
export function isTokenRevealedByFog(tok, floor) {
  const grid = floor?.grid || {};
  const cellPx = Math.max(1, num(grid.cellPx) || 64);
  const half = (num(tok?.sizeCells) || 1) * 0.5;
  return isPointRevealedByFog(num(grid.offsetX) + (num(tok?.x) + half) * cellPx, num(grid.offsetY) + (num(tok?.y) + half) * cellPx, floor?.fog);
}

/**
 * Indica se algum ponto da porta (extremidades ou meio) está numa área revelada (sem névoa, sempre `true`).
 * @param {object} door Porta (coordenadas em células).
 * @param {{grid?: object, fog?: object}} floor Piso da porta.
 * @returns {boolean} `true` se a porta pode ser vista pelo jogador.
 */
export function isDoorRevealedByFog(door, floor) {
  const seg = doorSegmentWorld(door, floor?.grid);
  const points = [[seg.x1, seg.y1], [seg.x2, seg.y2], [(seg.x1 + seg.x2) / 2, (seg.y1 + seg.y2) / 2]];
  return points.some(([x, y]) => isPointRevealedByFog(x, y, floor?.fog));
}
