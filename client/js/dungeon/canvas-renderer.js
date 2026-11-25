/**
 * @file Renderizador `<canvas>` 2D sob demanda da Mesa Soberana (E2): mapa de fundo, grade quadrada/hex,
 * tokens de jogadores, barras/status de vida e Camada do Mestre translúcida (fail-closed).
 * @module dungeon/canvas-renderer
 */
import { cellToWorldCenter, createCamera, tokenBoundsWorld } from "./vtt-geometry.js";
import { hpStatusLabel } from "./vtt-scene-schema.js";
import { drawMovePreview, drawTokenPortrait, drawTurnBadge } from "./canvas-token-layers.js";
import { tokenHp } from "./token-ficha.js";
import {
  drawAoeLayer,
  drawDoorsLayer,
  drawDrawingsLayer,
  drawFogLayer,
  drawRulerLayer,
  drawTokenConditionBadges,
} from "./canvas-tactics-layers.js";

const SQRT3 = Math.sqrt(3);

function drawFloorBackground(ctx, floor, mapImage) {
  ctx.fillStyle = "#13171d";
  ctx.fillRect(0, 0, floor.widthPx, floor.heightPx);
  if (mapImage) {
    ctx.drawImage(mapImage, 0, 0, floor.widthPx, floor.heightPx);
  }
  ctx.strokeStyle = "rgba(231, 194, 107, 0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, floor.widthPx, floor.heightPx);
}

function drawSquareGrid(ctx, floor) {
  const { cellPx, offsetX, offsetY } = floor.grid;
  ctx.beginPath();
  for (let x = offsetX; x <= floor.widthPx; x += cellPx) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, floor.heightPx);
  }
  for (let y = offsetY; y <= floor.heightPx; y += cellPx) {
    ctx.moveTo(0, y);
    ctx.lineTo(floor.widthPx, y);
  }
  ctx.stroke();
}

function traceHexPath(ctx, cx, cy, radius) {
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    const px = cx + radius * Math.cos(angle);
    const py = cy + radius * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawHexGrid(ctx, floor) {
  const radius = floor.grid.cellPx / SQRT3;
  const cols = Math.ceil(floor.widthPx / floor.grid.cellPx) + 1;
  const rows = Math.ceil(floor.heightPx / (1.5 * radius)) + 1;
  ctx.beginPath();
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const { wx, wy } = cellToWorldCenter(c, r, floor.grid);
      traceHexPath(ctx, wx, wy, radius);
    }
  }
  ctx.stroke();
}

function drawGridLayer(ctx, floor) {
  if (!floor.grid?.visible) return;
  ctx.save();
  ctx.strokeStyle = "rgba(187, 201, 199, 0.22)";
  ctx.lineWidth = 1;
  if (floor.grid.type === "hex") drawHexGrid(ctx, floor);
  else drawSquareGrid(ctx, floor);
  ctx.restore();
}

function drawTokenHpBar(ctx, token, bounds) {
  if (token.hpVisible === "status" && token.hpCurrent === null) {
    ctx.fillStyle = "#e7c26b";
    ctx.font = "600 10px sans-serif";
    ctx.fillText(token.hpStatus || "Ileso", bounds.cx, bounds.top + bounds.height + 24);
    return;
  }
  const max = Math.max(1, Number(token.hpMax) || 1);
  const cur = Math.max(0, Math.min(max, Number(token.hpCurrent) || 0));
  const ratio = cur / max;
  const barW = Math.max(28, bounds.width * 0.78);
  const barX = bounds.cx - barW / 2;
  const barY = bounds.top + 2;
  ctx.fillStyle = "rgba(12, 14, 17, 0.82)";
  ctx.fillRect(barX, barY, barW, 5);
  ctx.fillStyle = ratio > 0.5 ? "#69dba9" : ratio > 0.25 ? "#e7c26b" : "#ffb4ab";
  ctx.fillRect(barX, barY, barW * ratio, 5);
  if (token.hpVisible === "exact") {
    ctx.fillStyle = "#e2e2e6";
    ctx.font = "600 10px monospace";
    ctx.fillText(`${cur}/${max}`, bounds.cx, barY - 3);
  }
}

function drawSingleToken(ctx, token, floor, opts) {
  const b = tokenBoundsWorld(token, floor.grid);
  const isGmTok = token.layer === "gm";
  const isSelected = opts.selectedTokenId === token.tokenId;
  ctx.save();
  if (isGmTok) ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(b.cx, b.cy, b.radius, 0, Math.PI * 2);
  ctx.fillStyle = token.color || "#78d6cf";
  ctx.fill();
  const portrait = drawTokenPortrait(ctx, opts.avatars?.get?.(token.avatarBlobHash), b);
  ctx.lineWidth = isSelected ? 3.5 : 2;
  ctx.strokeStyle = isSelected ? "#ffffff" : isGmTok ? "#e7c26b" : "#0c0e11";
  if (isGmTok && typeof ctx.setLineDash === "function") ctx.setLineDash([5, 4]);
  ctx.stroke();
  ctx.fillStyle = "#0c0e11";
  ctx.font = "700 14px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (!portrait) ctx.fillText(token.initials || "TK", b.cx, b.cy);
  ctx.fillStyle = "#e2e2e6";
  ctx.font = "600 11px sans-serif";
  ctx.fillText(isGmTok ? `[GM] ${token.name}` : token.name, b.cx, b.top + b.height + 10);
  drawTokenHpBar(ctx, token, b);
  drawTokenConditionBadges(ctx, token, b);
  if (opts.turnTokenId && opts.turnTokenId === token.tokenId) drawTurnBadge(ctx, b);
  ctx.restore();
}

function resolveRenderedTokens(scene, floor, opts) {
  const viewerRole = opts.viewerRole === "gm" ? "gm" : "player";
  const preview = opts.dragPreview;
  return (scene.tokens || [])
    .filter((t) => t.floorZ === floor.z && (viewerRole === "gm" || t.layer === "player"))
    .map((t) => {
      const linked = opts.sheetsById?.[t.sheetId] ? { ...t, ...tokenHp(t, opts.sheetsById[t.sheetId]) } : t;
      const moved = preview && preview.tokenId === t.tokenId ? { ...linked, x: preview.x, y: preview.y } : linked;
      if (viewerRole !== "gm" && moved.hpVisible === "status" && moved.hpCurrent !== null) {
        return { ...moved, hpCurrent: null, hpMax: null, hpStatus: hpStatusLabel(moved.hpCurrent, moved.hpMax) };
      }
      return moved;
    });
}

function prepareCanvasViewport(canvas, floor, opts) {
  const dpr = Math.max(1, Math.min(2, Number(opts.dpr) || Number(globalThis.devicePixelRatio) || 1));
  const cssW = Math.max(240, Number(canvas.clientWidth || canvas.width) || floor.widthPx);
  const cssH = Math.max(180, Number(canvas.clientHeight || canvas.height) || floor.heightPx);
  const targetW = Math.round(cssW * dpr);
  const targetH = Math.round(cssH * dpr);
  if (canvas.width !== targetW) canvas.width = targetW;
  if (canvas.height !== targetH) canvas.height = targetH;
  return { dpr, cssW, cssH };
}

function drawPinnedNotesLayer(ctx, scene, floor, notes, role) {
  const pins = (notes || []).filter((n) => n?.pin && n.pin.sceneId === scene.sceneId && n.pin.floorZ === floor.z && (role === "gm" || n.visibility !== "gm_only"));
  const cellPx = floor.grid?.cellPx || 64;
  for (const n of pins) {
    const px = (Number(n.pin.x) || 0) * cellPx + cellPx * 0.5;
    const py = (Number(n.pin.y) || 0) * cellPx + cellPx * 0.5;
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, 9, 0, Math.PI * 2);
    ctx.fillStyle = "#e7c26b";
    ctx.fill();
    ctx.strokeStyle = "#0c0e11";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#0c0e11";
    ctx.font = "700 10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("P", px, py);
    ctx.restore();
  }
}

function drawAllSceneLayers(ctx, scene, floor, opts) {
  const role = opts.viewerRole === "gm" ? "gm" : "player";
  drawFloorBackground(ctx, floor, opts.mapImage || null);
  drawGridLayer(ctx, floor);
  const tokens = resolveRenderedTokens(scene, floor, opts);
  const drawnDrawings = drawDrawingsLayer(ctx, floor, role, opts.draftStroke || null);
  const aoeHits = drawAoeLayer(ctx, floor, tokens, role, opts.draftAoe || null);
  const drawnDoors = drawDoorsLayer(ctx, floor, role);
  drawPinnedNotesLayer(ctx, scene, floor, opts.notes, role);
  drawMovePreview(ctx, opts.movePreview || null, floor.grid);
  for (const tok of tokens) drawSingleToken(ctx, tok, floor, opts);
  const fogDrawn = drawFogLayer(ctx, floor, role, opts.draftFogRect || null);
  drawRulerLayer(ctx, opts.ruler || null, floor.grid);
  return { drawnTokens: tokens.length, drawnDoors, drawnDrawings, aoeHits, fogDrawn, viewerRole: role, floorZ: floor.z };
}

/**
 * Renderiza a cena tática 2D num elemento `<canvas>` sob demanda (0% CPU em repouso).
 * @param {HTMLCanvasElement|object} canvas Elemento `<canvas>` (ou mock compatível em testes).
 * @param {object} scene Documento `SceneDoc`.
 * @param {object} [opts={}] Opções (`camera`, `viewerRole`, `selectedTokenId`, `sheetsById`, `turnTokenId`, `avatars`, `movePreview`, `mapImage`, `dragPreview`, `draftStroke`, `draftFogRect`, `ruler`, `dpr`).
 * @returns {object} Resumo da renderização.
 */
export function renderSceneToCanvas(canvas, scene, opts = {}) {
  const ctx = canvas?.getContext?.("2d");
  if (!ctx || !scene?.floors?.length) return { drawnTokens: 0, viewerRole: "player", floorZ: 0 };
  const floor = scene.floors.find((f) => f.z === scene.activeFloorZ) || scene.floors[0];
  const camera = createCamera(opts.camera);
  const { dpr, cssW, cssH } = prepareCanvasViewport(canvas, floor, opts);
  ctx.save();
  ctx.setTransform?.(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#0c0e11";
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.translate(camera.panX, camera.panY);
  ctx.scale(camera.zoom, camera.zoom);
  const summary = drawAllSceneLayers(ctx, scene, floor, opts);
  ctx.restore();
  return summary;
}
