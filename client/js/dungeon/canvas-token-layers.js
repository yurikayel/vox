/**
 * @file Camadas 2D do token ligado à ficha: retrato, alcance e caminho do deslocamento, selo "Sua vez".
 * @module dungeon/canvas-token-layers
 */
import { activeTurnTokenId, movementPath, reachableCells, speedInCells } from "./token-ficha.js";

/**
 * Desenha o alcance (células) e o caminho do deslocamento do token selecionado.
 *
 * @param {CanvasRenderingContext2D} ctx Contexto 2D já transformado pela câmera.
 * @param {{cells?: Array<{x: number, y: number}>, path?: Array<{x: number, y: number}>}|null} preview Alcance e caminho em células.
 * @param {{cellPx?: number, offsetX?: number, offsetY?: number}} grid Grade do piso.
 * @returns {void}
 */
export function drawMovePreview(ctx, preview, grid = {}) {
  if (!preview) return;
  const cell = Math.max(1, Number(grid.cellPx) || 64);
  const at = (c) => ({ x: (Number(grid.offsetX) || 0) + c.x * cell, y: (Number(grid.offsetY) || 0) + c.y * cell });
  ctx.save();
  ctx.fillStyle = "rgba(120, 214, 207, 0.14)";
  for (const c of preview.cells || []) ctx.fillRect(at(c).x, at(c).y, cell, cell);
  ctx.fillStyle = "rgba(231, 194, 107, 0.55)";
  for (const c of preview.path || []) ctx.fillRect(at(c).x + cell * 0.25, at(c).y + cell * 0.25, cell * 0.5, cell * 0.5);
  ctx.restore();
}

/**
 * Monta o alcance de um token a partir do deslocamento em células.
 *
 * @param {{x: number, y: number}} token Token (posição em células).
 * @param {number} maxCells Alcance em células.
 * @param {{widthPx: number, heightPx: number, grid?: {cellPx?: number}}} floor Piso do token.
 * @returns {Array<{x: number, y: number}>} Células alcançáveis.
 */
export function reachForToken(token, maxCells, floor) {
  const cell = Math.max(1, Number(floor.grid?.cellPx) || 64);
  return reachableCells(token, maxCells, { cols: Math.floor(floor.widthPx / cell), rows: Math.floor(floor.heightPx / cell) });
}

/**
 * Desenha o retrato do token (imagem da ficha) recortado no círculo, quando houver bitmap carregado.
 *
 * @param {CanvasRenderingContext2D} ctx Contexto 2D.
 * @param {object|null|undefined} bitmap Imagem decodificada do avatar.
 * @param {{cx: number, cy: number, radius: number}} b Limites do token no mundo.
 * @returns {boolean} `true` se desenhou o retrato.
 */
export function drawTokenPortrait(ctx, bitmap, b) {
  if (!bitmap) return false;
  ctx.save();
  ctx.beginPath();
  ctx.arc(b.cx, b.cy, b.radius - 1, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(bitmap, b.cx - b.radius, b.cy - b.radius, b.radius * 2, b.radius * 2);
  ctx.restore();
  return true;
}

/**
 * Desenha o selo "Sua vez" sobre o token da vez.
 *
 * @param {CanvasRenderingContext2D} ctx Contexto 2D.
 * @param {{cx: number, cy: number, radius: number, top: number}} b Limites do token no mundo.
 * @returns {void}
 */
export function drawTurnBadge(ctx, b) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(b.cx, b.cy, b.radius + 4, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#e7c26b";
  ctx.stroke();
  ctx.fillStyle = "#e7c26b";
  ctx.fillRect(b.cx - 28, b.top - 22, 56, 14);
  ctx.fillStyle = "#0c0e11";
  ctx.font = "700 10px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Sua vez", b.cx, b.top - 15);
  ctx.restore();
}

/**
 * Opções do renderizador 2D para tokens ligados à ficha: PV da ficha, token da vez, retratos e,
 * para o token selecionado com ficha, o alcance do deslocamento e o caminho até `ov.moveTarget`.
 *
 * @param {object} state Estado da sessão (`campaignDoc`, `selectedTokenId`).
 * @param {object} scene Cena ativa.
 * @param {{avatars?: Map<string, object>, moveTarget?: {x: number, y: number}|null}} ov Sobreposições do canvas.
 * @returns {{sheetsById: object, turnTokenId: string, avatars: Map<string, object>, movePreview: object|null}} Opções extras.
 */
export function tokenFichaRenderOpts(state, scene, ov) {
  const sheetsById = state?.campaignDoc?.sheetsById || {};
  const base = { sheetsById, turnTokenId: activeTurnTokenId(state?.campaignDoc?.initiative), avatars: ov.avatars || new Map() };
  return { ...base, movePreview: buildMovePreview(state, scene, ov) };
}

function buildMovePreview(state, scene, ov) {
  const floor = scene?.floors?.find((f) => f.z === scene.activeFloorZ) || scene?.floors?.[0];
  const tok = (scene?.tokens || []).find((t) => t.tokenId === state?.selectedTokenId && t.floorZ === floor?.z);
  if (!tok || !floor) return null;
  const cells = speedInCells(state?.campaignDoc?.sheetsById?.[tok.sheetId], floor.grid);
  if (!cells) return null;
  const path = ov.moveTarget ? movementPath(tok, ov.moveTarget, cells) : [];
  return { cells: reachForToken(tok, cells, floor), path };
}

/**
 * Carrega no mapa `avatars` os bitmaps dos retratos dos tokens da cena (por `avatarBlobHash`).
 * @param {object} scene Cena ativa.
 * @param {{getBlob: function(string): Promise<Uint8Array|null>}} store Armazém de blobs.
 * @param {Map<string, ImageBitmap>} avatars Mapa destino, preenchido in-place.
 * @returns {Promise<number>} Quantos retratos novos foram carregados.
 */
export async function loadTokenAvatars(scene, store, avatars) {
  if (typeof globalThis.createImageBitmap !== "function") return 0;
  const hashes = (scene?.tokens || []).map((t) => t.avatarBlobHash).filter((h) => h && !avatars.has(h));
  let loaded = 0;
  for (const hash of new Set(hashes)) {
    const bytes = await store.getBlob(hash);
    if (!bytes) continue;
    avatars.set(hash, await globalThis.createImageBitmap(new Blob([bytes])));
    loaded += 1;
  }
  return loaded;
}
