/**
 * @file Geometria pura da Mesa Soberana (E2): câmera (pan/zoom), grade quadrada e hexagonal,
 * cálculo de distâncias (5e/alternada/euclidiana/hex), bounds e hit-test de tokens.
 * @module dungeon/vtt-geometry
 */

/** Zoom mínimo permitido no `<canvas>` da mesa. */
export const MIN_ZOOM = 0.25;
/** Zoom máximo permitido no `<canvas>` da mesa. */
export const MAX_ZOOM = 4.0;

const SQRT3 = Math.sqrt(3);

/**
 * Restringe um fator de zoom aos limites seguros `[MIN_ZOOM, MAX_ZOOM]`.
 * @param {number} zoom Fator desejado.
 * @returns {number} Zoom limitado.
 */
export function clampZoom(zoom) {
  const n = Number(zoom);
  if (!Number.isFinite(n)) return 1;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, n));
}

/**
 * Cria o estado inicial da câmera 2D (`panX`, `panY`, `zoom`).
 * @param {object} [opts={}] Valores iniciais opcionais.
 * @returns {{ panX: number, panY: number, zoom: number }} Estado de câmera.
 */
export function createCamera(opts = {}) {
  return {
    panX: Number.isFinite(Number(opts.panX)) ? Number(opts.panX) : 0,
    panY: Number.isFinite(Number(opts.panY)) ? Number(opts.panY) : 0,
    zoom: clampZoom(opts.zoom ?? 1),
  };
}

/**
 * Converte coordenadas do mundo (pixels do mapa) para coordenadas da tela (pixels CSS do canvas).
 * @param {number} wx Coordenada X no mundo.
 * @param {number} wy Coordenada Y no mundo.
 * @param {{ panX: number, panY: number, zoom: number }} camera Câmera atual.
 * @returns {{ sx: number, sy: number }} Ponto na tela.
 */
export function worldToScreen(wx, wy, camera) {
  const z = clampZoom(camera?.zoom ?? 1);
  return {
    sx: wx * z + (Number(camera?.panX) || 0),
    sy: wy * z + (Number(camera?.panY) || 0),
  };
}

/**
 * Converte coordenadas da tela (pixels CSS do canvas) para coordenadas do mundo.
 * @param {number} sx Coordenada X na tela.
 * @param {number} sy Coordenada Y na tela.
 * @param {{ panX: number, panY: number, zoom: number }} camera Câmera atual.
 * @returns {{ wx: number, wy: number }} Ponto no mundo.
 */
export function screenToWorld(sx, sy, camera) {
  const z = clampZoom(camera?.zoom ?? 1);
  return {
    wx: (sx - (Number(camera?.panX) || 0)) / z,
    wy: (sy - (Number(camera?.panY) || 0)) / z,
  };
}

/**
 * Aplica novo nível de zoom mantendo fixo o ponto do mundo sob `(anchorSx, anchorSy)`.
 * @param {{ panX: number, panY: number, zoom: number }} camera Câmera atual.
 * @param {number} anchorSx Coordenada X da âncora na tela (mouse ou centro da pinça).
 * @param {number} anchorSy Coordenada Y da âncora na tela.
 * @param {number} targetZoom Novo zoom desejado.
 * @returns {{ panX: number, panY: number, zoom: number }} Nova câmera ajustada.
 */
export function zoomCameraAt(camera, anchorSx, anchorSy, targetZoom) {
  const nextZoom = clampZoom(targetZoom);
  const anchorWorld = screenToWorld(anchorSx, anchorSy, camera);
  return {
    panX: anchorSx - anchorWorld.wx * nextZoom,
    panY: anchorSy - anchorWorld.wy * nextZoom,
    zoom: nextZoom,
  };
}

function normalizeGrid(grid) {
  const cellPx = Math.max(16, Number(grid?.cellPx) || 64);
  return {
    type: grid?.type === "hex" ? "hex" : "square",
    cellPx,
    offsetX: Number(grid?.offsetX) || 0,
    offsetY: Number(grid?.offsetY) || 0,
    unitMeters: Number(grid?.unitMeters) > 0 ? Number(grid.unitMeters) : 1.5,
  };
}

function cubeRound(fracQ, fracR) {
  const fracS = -fracQ - fracR;
  let rq = Math.round(fracQ);
  let rr = Math.round(fracR);
  const rs = Math.round(fracS);
  const dq = Math.abs(rq - fracQ);
  const dr = Math.abs(rr - fracR);
  const ds = Math.abs(rs - fracS);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq, r: rr };
}

/**
 * Converte um ponto no mundo `(wx, wy)` para a célula discreta `{ x, y }` da grade (quadrada ou hex odd-r).
 * @param {number} wx Coordenada X no mundo.
 * @param {number} wy Coordenada Y no mundo.
 * @param {object} [grid={}] Configuração da grade (`type`, `cellPx`, `offsetX`, `offsetY`).
 * @returns {{ x: number, y: number }} Coordenada inteira da célula.
 */
export function snapWorldToCell(wx, wy, grid = {}) {
  const g = normalizeGrid(grid);
  const rx = wx - g.offsetX;
  const ry = wy - g.offsetY;
  if (g.type === "square") {
    return { x: Math.floor(rx / g.cellPx), y: Math.floor(ry / g.cellPx) };
  }
  const radius = g.cellPx / SQRT3;
  const fracQ = ((SQRT3 / 3) * rx - (1 / 3) * ry) / radius;
  const fracR = ((2 / 3) * ry) / radius;
  const { q, r } = cubeRound(fracQ, fracR);
  return { x: q + ((r - (r & 1)) >> 1), y: r };
}

/**
 * Retorna o centro no mundo `(wx, wy)` de uma célula `{ x, y }` na grade (quadrada ou hex odd-r).
 * @param {number} cellX Coluna da célula.
 * @param {number} cellY Linha da célula.
 * @param {object} [grid={}] Configuração da grade.
 * @returns {{ wx: number, wy: number }} Centro da célula em pixels do mundo.
 */
export function cellToWorldCenter(cellX, cellY, grid = {}) {
  const g = normalizeGrid(grid);
  const x = Math.trunc(Number(cellX) || 0);
  const y = Math.trunc(Number(cellY) || 0);
  if (g.type === "square") {
    return {
      wx: g.offsetX + (x + 0.5) * g.cellPx,
      wy: g.offsetY + (y + 0.5) * g.cellPx,
    };
  }
  const radius = g.cellPx / SQRT3;
  const colShift = (y & 1) !== 0 ? 0.5 * g.cellPx : 0;
  return {
    wx: g.offsetX + x * g.cellPx + colShift,
    wy: g.offsetY + y * (1.5 * radius),
  };
}

function oddRToCube(cell) {
  const x = Math.trunc(Number(cell?.x) || 0);
  const y = Math.trunc(Number(cell?.y) || 0);
  const q = x - ((y - (y & 1)) >> 1);
  const r = y;
  return { q, r, s: -q - r };
}

/**
 * Calcula a distância em células e metros entre duas células da grade.
 * @param {{ x: number, y: number }} from Célula de origem.
 * @param {{ x: number, y: number }} to Célula de destino.
 * @param {object} [grid={}] Configuração da grade (`type`, `unitMeters`).
 * @param {"5e"|"5e-alt"|"euclidean"} [rule="5e"] Regra de distância para grade quadrada.
 * @returns {{ cells: number, meters: number }} Distância calculada.
 */
export function computeGridDistance(from, to, grid = {}, rule = "5e") {
  const g = normalizeGrid(grid);
  let cells;
  if (g.type === "hex") {
    const a = oddRToCube(from);
    const b = oddRToCube(to);
    cells = Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.s - b.s));
  } else {
    const dx = Math.abs((Number(to?.x) || 0) - (Number(from?.x) || 0));
    const dy = Math.abs((Number(to?.y) || 0) - (Number(from?.y) || 0));
    if (rule === "euclidean") cells = Number(Math.hypot(dx, dy).toFixed(2));
    else if (rule === "5e-alt") cells = Math.max(dx, dy) + Math.floor(Math.min(dx, dy) / 2);
    else cells = Math.max(dx, dy);
  }
  return { cells, meters: Number((cells * g.unitMeters).toFixed(2)) };
}

/**
 * Calcula o retângulo e o círculo de colisão de um token no espaço do mundo.
 * @param {object} token Documento `TokenDoc`.
 * @param {object} [grid={}] Configuração da grade.
 * @returns {{ left: number, top: number, width: number, height: number, cx: number, cy: number, radius: number }} Limites no mundo.
 */
export function tokenBoundsWorld(token, grid = {}) {
  const g = normalizeGrid(grid);
  const size = Math.max(1, Math.trunc(Number(token?.sizeCells) || 1));
  const width = size * g.cellPx;
  const height = size * g.cellPx;
  if (g.type === "square") {
    const left = g.offsetX + (Number(token?.x) || 0) * g.cellPx;
    const top = g.offsetY + (Number(token?.y) || 0) * g.cellPx;
    return { left, top, width, height, cx: left + width / 2, cy: top + height / 2, radius: Math.min(width, height) * 0.44 };
  }
  const center = cellToWorldCenter(token?.x || 0, token?.y || 0, g);
  const radius = (g.cellPx * size) * 0.42;
  return { left: center.wx - radius, top: center.wy - radius, width: radius * 2, height: radius * 2, cx: center.wx, cy: center.wy, radius };
}

/**
 * Encontra o token mais acima sob o ponto do mundo `(wx, wy)`, respeitando visibilidade da camada GM.
 * @param {number} wx Coordenada X no mundo.
 * @param {number} wy Coordenada Y no mundo.
 * @param {Array<object>} [tokens=[]] Lista de tokens na cena/andar.
 * @param {object} [grid={}] Configuração da grade.
 * @param {"gm"|"player"} [viewerRole="player"] Papel do observador (fail-closed).
 * @returns {object|null} Token atingido ou `null`.
 */
export function hitTestTokens(wx, wy, tokens = [], grid = {}, viewerRole = "player") {
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const tok = tokens[i];
    if (!tok) continue;
    if (viewerRole !== "gm" && tok.layer !== "player") continue;
    const b = tokenBoundsWorld(tok, grid);
    if (Math.hypot(wx - b.cx, wy - b.cy) <= b.radius) return tok;
  }
  return null;
}

/**
 * Restringe coordenadas de célula de um token dentro das dimensões do piso atual.
 * @param {number} x Coluna desejada.
 * @param {number} y Linha desejada.
 * @param {number} [sizeCells=1] Tamanho do token em células.
 * @param {object} [floor={}] Piso atual (`widthPx`, `heightPx`, `grid`).
 * @returns {{ x: number, y: number }} Célula válida dentro do piso.
 */
export function clampTokenToFloor(x, y, sizeCells = 1, floor = {}) {
  const g = normalizeGrid(floor?.grid);
  const size = Math.max(1, Math.trunc(Number(sizeCells) || 1));
  const cols = Math.max(1, Math.floor((Number(floor?.widthPx) || 768) / g.cellPx));
  const rows = Math.max(1, Math.floor((Number(floor?.heightPx) || 576) / g.cellPx));
  return {
    x: Math.max(0, Math.min(Math.max(0, cols - size), Math.trunc(Number(x) || 0))),
    y: Math.max(0, Math.min(Math.max(0, rows - size), Math.trunc(Number(y) || 0))),
  };
}
