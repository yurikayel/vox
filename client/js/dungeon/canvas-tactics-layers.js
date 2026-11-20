/**
 * @file Camadas táticas `<canvas>` 2D da Entrega 3: desenhos livres, áreas de efeito (AoE),
 * portas, ícones de condições nos tokens, névoa de guerra (evenodd) e régua de medição.
 * @module dungeon/canvas-tactics-layers
 */
import { computeGridDistance, snapWorldToCell, tokenBoundsWorld } from "./vtt-geometry.js";
import { doorSegmentWorld, tokensInsideAoe } from "./vtt-tactics-geometry.js";
import { normalizeTokenConditions } from "./vtt-tactics-schema.js";

const DOOR_STYLES = Object.freeze({
  closed: { color: "#e7c26b", dash: [], width: 6 },
  open: { color: "#69dba9", dash: [6, 5], width: 4 },
  locked: { color: "#ffb4ab", dash: [], width: 7 },
  secret: { color: "#ce93d8", dash: [4, 4], width: 5 },
});

function strokePolyline(ctx, points, color, width, alpha = 1) {
  if (!Array.isArray(points) || points.length < 2) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color || "#78d6cf";
  ctx.lineWidth = Number(width) || 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(points[0].wx, points[0].wy);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].wx, points[i].wy);
  ctx.stroke();
  ctx.restore();
}

/**
 * Desenha os traços livres do piso respeitando a Camada do Mestre (fail-closed) e o rascunho ativo.
 * @param {CanvasRenderingContext2D} ctx Contexto 2D.
 * @param {object} floor Documento `FloorDoc`.
 * @param {"gm"|"player"} viewerRole Papel do observador.
 * @param {object|null} [draftStroke=null] Traço em andamento.
 * @returns {number} Quantidade de traços desenhados.
 */
export function drawDrawingsLayer(ctx, floor, viewerRole, draftStroke = null) {
  const isGm = viewerRole === "gm";
  const list = (floor.drawings || []).filter((d) => isGm || d.layer !== "gm");
  for (const d of list) strokePolyline(ctx, d.points, d.color, d.width, d.layer === "gm" ? 0.55 : 0.9);
  if (draftStroke?.points?.length >= 2) strokePolyline(ctx, draftStroke.points, draftStroke.color, draftStroke.width, 0.85);
  return list.length;
}

function drawAoeShape(ctx, aoe, cellPx) {
  ctx.beginPath();
  if (aoe.kind === "circle") {
    ctx.arc(aoe.wx, aoe.wy, (Number(aoe.radiusCells) || 2) * cellPx, 0, Math.PI * 2);
  } else if (aoe.kind === "cube") {
    const side = (Number(aoe.lengthCells || aoe.radiusCells) || 2) * cellPx;
    ctx.rect(aoe.wx, aoe.wy, side, side);
  } else if (aoe.kind === "cone") {
    const len = (Number(aoe.lengthCells) || 4) * cellPx;
    const half = ((Number(aoe.spreadDeg) || 53) * Math.PI) / 360;
    ctx.moveTo(aoe.wx, aoe.wy);
    ctx.arc(aoe.wx, aoe.wy, len, (aoe.angleRad || 0) - half, (aoe.angleRad || 0) + half);
    ctx.closePath();
  } else if (aoe.kind === "line") {
    const len = (Number(aoe.lengthCells) || 4) * cellPx;
    const w = (Number(aoe.widthCells) || 1) * cellPx;
    ctx.translate(aoe.wx, aoe.wy);
    ctx.rotate(aoe.angleRad || 0);
    ctx.rect(0, -w / 2, len, w);
  }
  ctx.fill();
  ctx.stroke();
}

function drawSingleAoeOverlay(ctx, aoe, cellPx) {
  ctx.save();
  ctx.fillStyle = aoe.color || "#ff8a65";
  ctx.globalAlpha = aoe._draft ? 0.2 : aoe.layer === "gm" ? 0.16 : 0.24;
  ctx.strokeStyle = aoe._draft ? "#e7c26b" : aoe.color || "#ff8a65";
  ctx.lineWidth = 2;
  if (aoe._draft && typeof ctx.setLineDash === "function") ctx.setLineDash([6, 4]);
  drawAoeShape(ctx, aoe, cellPx);
  ctx.restore();
}

function highlightAoeHitTokens(ctx, tokens, hitIds, grid) {
  for (const tok of tokens || []) {
    if (!hitIds.has(tok.tokenId)) continue;
    const b = tokenBoundsWorld(tok, grid);
    ctx.save();
    ctx.strokeStyle = "#ff8a65";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(b.cx, b.cy, b.radius + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Desenha os gabaritos de Área de Efeito do piso (mais rascunho ao vivo) e destaca os tokens visíveis atingidos.
 * @param {CanvasRenderingContext2D} ctx Contexto 2D.
 * @param {object} floor Documento `FloorDoc`.
 * @param {Array<object>} tokens Tokens visíveis no piso.
 * @param {"gm"|"player"} viewerRole Papel do observador.
 * @param {object|null} [draftAoe=null] Gabarito AoE em arrasto ao vivo.
 * @returns {number} Quantidade de tokens destacados em AoE.
 */
export function drawAoeLayer(ctx, floor, tokens, viewerRole, draftAoe = null) {
  const isGm = viewerRole === "gm";
  const cellPx = floor.grid?.cellPx || 64;
  const visibleAoes = (floor.aoes || []).filter((a) => isGm || a.layer !== "gm");
  const allAoes = draftAoe ? [...visibleAoes, { ...draftAoe, _draft: true }] : visibleAoes;
  const hitIds = new Set();
  for (const aoe of allAoes) {
    drawSingleAoeOverlay(ctx, aoe, cellPx);
    for (const tok of tokensInsideAoe(aoe, tokens, floor.grid, viewerRole)) hitIds.add(tok.tokenId);
  }
  highlightAoeHitTokens(ctx, tokens, hitIds, floor.grid);
  return hitIds.size;
}

/**
 * Desenha as portas do piso (portas `secret` só aparecem para `viewerRole === "gm"`).
 * @param {CanvasRenderingContext2D} ctx Contexto 2D.
 * @param {object} floor Documento `FloorDoc`.
 * @param {"gm"|"player"} viewerRole Papel do observador.
 * @returns {number} Quantidade de portas desenhadas.
 */
export function drawDoorsLayer(ctx, floor, viewerRole) {
  const isGm = viewerRole === "gm";
  const visible = (floor.doors || []).filter((d) => isGm || d.state !== "secret");
  for (const door of visible) {
    const seg = doorSegmentWorld(door, floor.grid);
    const style = DOOR_STYLES[door.state] || DOOR_STYLES.closed;
    ctx.save();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.width;
    ctx.lineCap = "round";
    if (typeof ctx.setLineDash === "function") ctx.setLineDash(style.dash);
    ctx.beginPath();
    ctx.moveTo(seg.x1, seg.y1);
    ctx.lineTo(seg.x2, seg.y2);
    ctx.stroke();
    ctx.restore();
  }
  return visible.length;
}

/**
 * Desenha os ícones de condições ativas (e rodadas restantes) na borda inferior do token.
 * @param {CanvasRenderingContext2D} ctx Contexto 2D.
 * @param {object} token Documento `TokenDoc`.
 * @param {{ left: number, top: number, width: number, height: number, cx: number, cy: number }} bounds Limites no mundo.
 * @returns {number} Quantidade de badges desenhadas.
 */
export function drawTokenConditionBadges(ctx, token, bounds) {
  const conds = normalizeTokenConditions(token.conditions).slice(0, 4);
  for (let i = 0; i < conds.length; i += 1) {
    const c = conds[i];
    const bx = bounds.left + 10 + i * 16;
    const by = bounds.top + bounds.height - 8;
    ctx.save();
    ctx.beginPath();
    ctx.arc(bx, by, 7, 0, Math.PI * 2);
    ctx.fillStyle = c.color;
    ctx.fill();
    ctx.fillStyle = "#0c0e11";
    ctx.font = "700 9px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(c.durationRounds ? `${c.glyph}${c.durationRounds}` : c.glyph, bx, by);
    ctx.restore();
  }
  return conds.length;
}

/**
 * Desenha a máscara de Névoa de Guerra usando regra `evenodd` (opaca p/ jogadores, 48% translúcida p/ GM).
 * @param {CanvasRenderingContext2D} ctx Contexto 2D.
 * @param {object} floor Documento `FloorDoc`.
 * @param {"gm"|"player"} viewerRole Papel do observador.
 * @param {{ x: number, y: number, w: number, h: number }|null} [draftRect=null] Retângulo sendo cortado.
 * @returns {boolean} `true` quando a névoa estava ativa e foi desenhada.
 */
export function drawFogLayer(ctx, floor, viewerRole, draftRect = null) {
  if (!floor.fog?.enabled) return false;
  ctx.save();
  ctx.fillStyle = viewerRole === "gm" ? "rgba(7, 9, 13, 0.48)" : "rgba(7, 9, 13, 0.97)";
  ctx.beginPath();
  ctx.rect(0, 0, floor.widthPx, floor.heightPx);
  for (const r of floor.fog.revealedRects || []) ctx.rect(r.x, r.y, r.w, r.h);
  ctx.fill("evenodd");
  if (draftRect && viewerRole === "gm") {
    ctx.strokeStyle = "#e7c26b";
    ctx.lineWidth = 2;
    if (typeof ctx.setLineDash === "function") ctx.setLineDash([6, 4]);
    ctx.strokeRect(draftRect.x, draftRect.y, draftRect.w, draftRect.h);
  }
  ctx.restore();
  return true;
}

/**
 * Desenha a régua de medição interativa com distância em células e metros.
 * @param {CanvasRenderingContext2D} ctx Contexto 2D.
 * @param {{ fromWx: number, fromWy: number, toWx: number, toWy: number }|null} ruler Estado da régua.
 * @param {object} grid Configuração da grade.
 * @returns {void}
 */
export function drawRulerLayer(ctx, ruler, grid) {
  if (!ruler) return;
  const fromCell = snapWorldToCell(ruler.fromWx, ruler.fromWy, grid);
  const toCell = snapWorldToCell(ruler.toWx, ruler.toWy, grid);
  const dist = computeGridDistance(fromCell, toCell, grid, "5e");
  const midX = (ruler.fromWx + ruler.toWx) / 2;
  const midY = (ruler.fromWy + ruler.toWy) / 2;
  ctx.save();
  ctx.strokeStyle = "#78d6cf";
  ctx.lineWidth = 2.5;
  if (typeof ctx.setLineDash === "function") ctx.setLineDash([8, 4]);
  ctx.beginPath();
  ctx.moveTo(ruler.fromWx, ruler.fromWy);
  ctx.lineTo(ruler.toWx, ruler.toWy);
  ctx.stroke();
  ctx.fillStyle = "#0c0e11";
  ctx.fillRect(midX - 42, midY - 12, 84, 20);
  ctx.fillStyle = "#78d6cf";
  ctx.font = "700 11px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${dist.meters}m (${dist.cells}c)`, midX, midY - 2);
  ctx.restore();
}
