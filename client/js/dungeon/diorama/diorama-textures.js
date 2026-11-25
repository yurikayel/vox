/**
 * @file Texturas da lente Diorama (quase puro): imagem do mapa no chão e avatares dos tokens num
 * atlas único. Tudo que desenha em canvas recebe a fábrica `createCanvas` por injeção, então roda
 * em Node com um canvas falso. Respeita o teto defensivo de VRAM (`2048×2048`).
 * @module dungeon/diorama/diorama-textures
 */
import { MAX_DIORAMA_TEX_DIM } from "./diorama-gl.js";
import { standeeCorners } from "./diorama-layers.js";
import { floorPxToWorld } from "./diorama-math.js";

/** Lado (px) de cada avatar no atlas. */
export const ATLAS_CELL = 64;
/** Máximo de avatares no atlas (mantém o atlas bem abaixo do teto de VRAM). */
export const MAX_ATLAS_AVATARS = 64;

/**
 * Reduz `(w, h)` mantendo a proporção para caber em `max` (nunca amplia).
 *
 * @param {number} w Largura original.
 * @param {number} h Altura original.
 * @param {number} [max=MAX_DIORAMA_TEX_DIM] Lado máximo.
 * @returns {{w: number, h: number}} Dimensões a usar no upload.
 */
export function fitTextureSize(w, h, max = MAX_DIORAMA_TEX_DIM) {
  const scale = Math.min(1, max / Math.max(1, w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/**
 * Posições dos avatares no atlas (grade quadrada, na ordem recebida, até `MAX_ATLAS_AVATARS`).
 *
 * @param {string[]} ids Identificadores de token com avatar.
 * @returns {{cols: number, size: number, cells: Map<string, {col: number, row: number}>}} Layout do atlas.
 */
export function atlasLayout(ids) {
  const list = ids.slice(0, MAX_ATLAS_AVATARS);
  const cols = Math.max(1, Math.ceil(Math.sqrt(list.length)));
  const cells = new Map(list.map((id, i) => [id, { col: i % cols, row: Math.floor(i / cols) }]));
  return { cols, size: cols * ATLAS_CELL, cells };
}

function drawInto(createCanvas, w, h, paint) {
  const canvas = createCanvas(w, h);
  paint(canvas.getContext("2d"));
  return canvas;
}

/**
 * Rasteriza as imagens carregadas: o chão (reduzido ao teto) e o atlas de avatares.
 *
 * @param {{map: object|null, avatars: Record<string, object>}} images Bitmaps já decodificados.
 * @param {(w: number, h: number) => object} createCanvas Fábrica de canvas.
 * @returns {{floor: object|null, atlas: {canvas: object, layout: object}|null}} Canvases prontos para upload.
 */
export function buildRasters(images, createCanvas) {
  const map = images?.map;
  const size = map ? fitTextureSize(map.width, map.height) : null;
  const floor = map ? drawInto(createCanvas, size.w, size.h, (ctx) => ctx.drawImage(map, 0, 0, size.w, size.h)) : null;
  const ids = Object.keys(images?.avatars || {});
  if (!ids.length) return { floor, atlas: null };
  const layout = atlasLayout(ids);
  const canvas = drawInto(createCanvas, layout.size, layout.size, (ctx) => {
    for (const [id, c] of layout.cells) ctx.drawImage(images.avatars[id], c.col * ATLAS_CELL, c.row * ATLAS_CELL, ATLAS_CELL, ATLAS_CELL);
  });
  return { floor, atlas: { canvas, layout } };
}

function pushVertex(out, p, u, v) {
  out.push(p[0], p[1], p[2], u, v);
}

/**
 * Quad do chão (`Y = 0`) cobrindo o mapa inteiro, com UV `0..1` (6 vértices `x, y, z, u, v`).
 *
 * @param {object} floor `FloorDoc` com `widthPx`, `heightPx` e `grid`.
 * @returns {Float32Array} Vértices do quad.
 */
export function floorQuadVertices(floor) {
  const a = floorPxToWorld(0, 0, floor);
  const b = floorPxToWorld(floor.widthPx, floor.heightPx, floor);
  const out = [];
  const corners = [[a.wx, a.wy, 0, 0], [b.wx, a.wy, 1, 0], [b.wx, b.wy, 1, 1], [a.wx, b.wy, 0, 1]];
  for (const i of [0, 1, 2, 0, 2, 3]) pushVertex(out, [corners[i][0], 0, corners[i][1]], corners[i][2], corners[i][3]);
  return new Float32Array(out);
}

/**
 * Quads de avatar (billboard voltado à câmera) para os tokens que têm entrada no atlas.
 *
 * @param {Array<object>} tokens Tokens já projetados pela visibilidade do papel.
 * @param {{cols: number, cells: Map<string, {col: number, row: number}>}} layout Layout do atlas.
 * @param {number[]} [eye] Posição da câmera.
 * @returns {{vertices: Float32Array, count: number}} Vértices (`x, y, z, u, v`) e quantidade de quads.
 */
export function avatarQuadVertices(tokens, layout, eye) {
  const out = [];
  const step = 1 / layout.cols;
  const drawn = tokens.filter((t) => layout.cells.has(t.tokenId));
  for (const tok of drawn) {
    const cell = layout.cells.get(tok.tokenId);
    const corners = standeeCorners(tok, eye);
    const uv = [[0, 1], [1, 1], [1, 0], [0, 0]].map(([u, v]) => [(cell.col + u) * step, (cell.row + v) * step]);
    for (const i of [0, 1, 2, 0, 2, 3]) pushVertex(out, corners[i], uv[i][0], uv[i][1]);
  }
  return { vertices: new Float32Array(out), count: drawn.length };
}

/**
 * Monta o passe texturizado do quadro: chão e avatares, mais os tokens que seguem coloridos
 * (sem avatar). `version` troca quando as imagens mudam, para o GL reenviar as texturas.
 *
 * @param {{floor: object|null, atlas: object|null, version: number}|null} rasters Resultado de `buildRasters`.
 * @param {{floor: object, tokens: Array<object>}} view Visão do papel.
 * @param {number[]} [eye] Posição da câmera.
 * @returns {{floor: object|null, avatars: object|null, plainTokens: Array<object>}} Passe pronto para o GL.
 */
export function buildTexturedPass(rasters, view, eye) {
  const layout = rasters?.atlas?.layout;
  const avatars = layout ? avatarQuadVertices(view.tokens, layout, eye) : null;
  return {
    floor: rasters?.floor ? { canvas: rasters.floor, vertices: floorQuadVertices(view.floor), version: rasters.version } : null,
    avatars: avatars?.count ? { canvas: rasters.atlas.canvas, ...avatars, version: rasters.version } : null,
    plainTokens: layout ? view.tokens.filter((t) => !layout.cells.has(t.tokenId)) : view.tokens,
  };
}

/**
 * Carrega o bitmap do mapa e os avatares dos tokens da cena a partir do armazenamento de blobs.
 *
 * @param {{floor: object, tokens: Array<object>}} src Piso ativo e tokens da cena.
 * @param {{getBlob: Function, decode: Function}} io Leitor de blobs e decodificador de imagem.
 * @returns {Promise<{map: object|null, avatars: Record<string, object>}>} Imagens decodificadas (falhas viram `null`).
 */
export async function loadDioramaImages(src, io) {
  const load = async (hash) => {
    if (!hash) return null;
    try {
      const bytes = await io.getBlob(hash);
      return bytes ? await io.decode(bytes) : null;
    } catch {
      return null;
    }
  };
  const map = await load(src.floor?.mapBlobHash);
  const avatars = {};
  for (const tok of src.tokens || []) {
    const img = await load(tok.avatarBlobHash);
    if (img) avatars[tok.tokenId] = img;
  }
  return { map, avatars };
}
