/**
 * @file Geração procedural pura da geometria Diorama (extrusão de `walls` e `floor.doors`
 * com Vertex AO, cutaway automático, 3 primitivas `box`/`cylinder`/`ramp` e descrição acessível).
 * @module dungeon/diorama/diorama-geom
 */
import { appendStandees } from "./diorama-layers.js";

const FLOOR_AO = 0.62;
const TOP_AO = 1.0;
const CUTAWAY_HEIGHT = 0.25;
const CYLINDER_SEGMENTS = 12;
const OPEN_DOOR_HEIGHT = 0.3;

/** Cores de iluminação ambiente por preset da cena. */
export const AMBIENT_PRESETS = Object.freeze({
  day: [1.0, 0.98, 0.94],
  dusk: [0.95, 0.78, 0.62],
  night: [0.58, 0.66, 0.85],
  dungeon: [0.76, 0.82, 0.84],
});

const PORTAL_RGB = [0.62, 0.42, 0.92];

function parseHexRgb(hex) {
  const clean = String(hex || "#4a4e57").replace("#", "");
  if (clean.length !== 6) return [0.3, 0.32, 0.35];
  return [
    Number.parseInt(clean.slice(0, 2), 16) / 255,
    Number.parseInt(clean.slice(2, 4), 16) / 255,
    Number.parseInt(clean.slice(4, 6), 16) / 255,
  ];
}

function pushQuad(out, corners, rgb) {
  const [p0, p1, p2, p3] = corners;
  const verts = [
    [...p0, ...rgb, FLOOR_AO],
    [...p1, ...rgb, FLOOR_AO],
    [...p2, ...rgb, TOP_AO],
    [...p0, ...rgb, FLOOR_AO],
    [...p2, ...rgb, TOP_AO],
    [...p3, ...rgb, TOP_AO],
  ];
  for (const v of verts) out.push(...v);
}

function isSegmentInCutawayCone(seg, eye, target) {
  const mx = (seg.x1 + seg.x2) * 0.5;
  const mz = (seg.y1 + seg.y2) * 0.5;
  const toSegX = mx - target[0];
  const toSegZ = mz - target[2];
  const toEyeX = eye[0] - target[0];
  const toEyeZ = eye[2] - target[2];
  const dot = toSegX * toEyeX + toSegZ * toEyeZ;
  const eyeLenSq = toEyeX * toEyeX + toEyeZ * toEyeZ;
  return eyeLenSq > 0.01 && dot > 0 && dot < eyeLenSq * 0.85;
}

function appendSegmentMesh(out, seg, height, rgb) {
  pushQuad(out, [[seg.x1, 0, seg.y1], [seg.x2, 0, seg.y2], [seg.x2, height, seg.y2], [seg.x1, height, seg.y1]], rgb);
}

function appendBoxVolume(out, vol, rgb) {
  const x0 = vol.x - vol.w * 0.5;
  const x1 = vol.x + vol.w * 0.5;
  const z0 = vol.y - vol.d * 0.5;
  const z1 = vol.y + vol.d * 0.5;
  const y0 = vol.elevation || 0;
  const y1 = y0 + vol.h;
  pushQuad(out, [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], rgb);
  pushQuad(out, [[x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1]], rgb);
  pushQuad(out, [[x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]], rgb);
  pushQuad(out, [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], rgb);
}

function appendCylinderVolume(out, vol, rgb) {
  const y0 = vol.elevation || 0;
  const y1 = y0 + vol.h;
  for (let i = 0; i < CYLINDER_SEGMENTS; i++) {
    const a0 = (i / CYLINDER_SEGMENTS) * Math.PI * 2;
    const a1 = ((i + 1) / CYLINDER_SEGMENTS) * Math.PI * 2;
    const x0 = vol.x + Math.cos(a0) * vol.r;
    const z0 = vol.y + Math.sin(a0) * vol.r;
    const x1 = vol.x + Math.cos(a1) * vol.r;
    const z1 = vol.y + Math.sin(a1) * vol.r;
    pushQuad(out, [[x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0]], rgb);
  }
}

function appendRampVolume(out, vol, rgb) {
  const x0 = vol.x - vol.w * 0.5;
  const x1 = vol.x + vol.w * 0.5;
  const z0 = vol.y - vol.d * 0.5;
  const z1 = vol.y + vol.d * 0.5;
  const y0 = vol.elevation || 0;
  const y1 = y0 + vol.h;
  pushQuad(out, [[x0, y0, z0], [x1, y0, z0], [x1, y1, z1], [x0, y1, z1]], rgb);
  pushQuad(out, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], rgb);
}

function appendWalls(out, walls, defaultH, cutawayCtx) {
  let cutawayWalls = 0;
  for (const w of walls) {
    const cut = cutawayCtx.enabled && isSegmentInCutawayCone(w, cutawayCtx.eye, cutawayCtx.target);
    if (cut) cutawayWalls++;
    appendSegmentMesh(out, w, cut ? CUTAWAY_HEIGHT : (Number(w.height) || defaultH), parseHexRgb(w.color));
  }
  return cutawayWalls;
}

function appendDoors(out, doors, defaultH) {
  for (const d of doors) {
    const isOpen = d.state === "open";
    const doorRgb = d.state === "locked" ? [0.72, 0.52, 0.25] : isOpen ? [0.8, 0.7, 0.45] : [0.55, 0.39, 0.24];
    appendSegmentMesh(out, d, isOpen ? OPEN_DOOR_HEIGHT : Math.min(2.2, defaultH), doorRgb);
  }
}

function appendVolumes(out, volumes) {
  for (const vol of volumes) {
    const rgb = parseHexRgb(vol.color);
    if (vol.shape === "cylinder") appendCylinderVolume(out, vol, rgb);
    else if (vol.shape === "ramp") appendRampVolume(out, vol, rgb);
    else appendBoxVolume(out, vol, rgb);
  }
}

function appendPortals(out, portals) {
  for (const p of portals) appendCylinderVolume(out, { x: p.x, y: p.y, r: Number(p.radius) || 0.8, h: 0.08, elevation: 0 }, PORTAL_RGB);
}

function appendObjectLayers(out, floor, opts) {
  appendStandees(out, opts.tokens || [], { eye: opts.eye, selectedId: opts.selectedId });
  if (opts.b2 === true) appendVolumes(out, floor.volumes || []);
  if (opts.b2 === true) appendPortals(out, floor.portals || []);
}

/**
 * Constrói o buffer de vértices intercalados (`x, y, z, r, g, b, ao`) para paredes, portas fechadas e volumes.
 *
 * Não filtra nada por papel: `floor` e `opts.tokens` devem vir já projetados por `projectDioramaView`.
 *
 * @param {object} floor Documento `FloorDoc` já projetado.
 * @param {object} [opts={}] Opções (`eye`, `target`, `cutawayEnabled`, `tokens`, `selectedId`, `b2` para volumes do escopo B2).
 * @returns {{vertices: Float32Array, triangleCount: number, cutawayWalls: number}} Malha pronta para upload WebGL2.
 */
export function buildFloorDioramaGeometry(floor = {}, opts = {}) {
  const out = [];
  const defaultH = Number(floor?.diorama?.wallDefaultHeight) || 2.4;
  const enabled = opts.cutawayEnabled !== false && floor?.diorama?.wallCutaway !== false && Boolean(opts.eye && opts.target);
  const cutawayWalls = appendWalls(out, floor.walls || [], defaultH, { enabled, eye: opts.eye, target: opts.target });
  appendDoors(out, floor.doors || [], defaultH);
  appendObjectLayers(out, floor, opts);
  return { vertices: new Float32Array(out), triangleCount: out.length / 21, cutawayWalls };
}

function cardinalDirection(dx, dy) {
  if (Math.abs(dx) < 0.25 && Math.abs(dy) < 0.25) return "aqui";
  const ns = dy < -0.25 ? "norte" : dy > 0.25 ? "sul" : "";
  const ew = dx > 0.25 ? "leste" : dx < -0.25 ? "oeste" : "";
  return [ns, ew].filter(Boolean).join("-");
}

/**
 * Gera descrição textual estruturada do entorno do token ativo para leitores de tela (código puro, sem IA).
 *
 * @param {object} floor Documento `FloorDoc` (já projetado para o papel do usuário).
 * @param {Array<object>} tokens Tokens visíveis no andar.
 * @param {object} activeToken Token de referência.
 * @param {{b2?: boolean}} [opts={}] `b2: true` inclui portais (escopo B2).
 * @returns {string} Resumo acessível com distâncias e direções cardeais.
 */
export function describeTokenSurroundings(floor = {}, tokens = [], activeToken = null, opts = {}) {
  if (!activeToken) return "Nenhum token selecionado no mapa.";
  const unit = Number(floor?.grid?.unitMeters) || 1.5;
  const parts = [`${activeToken.name} em (${activeToken.x}, ${activeToken.y})`];
  for (const tok of tokens || []) {
    if (tok.tokenId === activeToken.tokenId) continue;
    const dist = (Math.hypot(tok.x - activeToken.x, tok.y - activeToken.y) * unit).toFixed(1);
    parts.push(`${tok.name} a ${dist}m ao ${cardinalDirection(tok.x - activeToken.x, tok.y - activeToken.y)}`);
  }
  for (const p of opts.b2 === true ? floor.portals || [] : []) {
    const dist = (Math.hypot(p.x - activeToken.x, p.y - activeToken.y) * unit).toFixed(1);
    parts.push(`portal ${p.label} a ${dist}m ao ${cardinalDirection(p.x - activeToken.x, p.y - activeToken.y)}`);
  }
  return `${parts.join("; ")}.`;
}

const DOOR_STATE_LABEL = Object.freeze({ closed: "fechada", open: "aberta", locked: "trancada", secret: "secreta" });

function describeDoors(floor, from) {
  const unit = Number(floor?.grid?.unitMeters) || 1.5;
  return (floor?.doors || []).map((d) => {
    const dx = (d.x1 + d.x2) / 2 - from.x;
    const dy = (d.y1 + d.y2) / 2 - from.y;
    return `porta ${DOOR_STATE_LABEL[d.state] || d.state} a ${(Math.hypot(dx, dy) * unit).toFixed(1)}m ao ${cardinalDirection(dx, dy)}`;
  });
}

/**
 * Resumo em texto da cena que o observador vê (para `aria-live`): tokens e portas, a partir de
 * uma visão já projetada por `projectDioramaView`, então nada que esteja na névoa, na camada do
 * Mestre ou em porta secreta (para o jogador) aparece. Com token selecionado, dá distâncias e direções.
 *
 * @param {{floor: object, tokens: Array<object>}} view Visão do papel (`projectDioramaView`).
 * @param {string} [selectedId=""] Token selecionado.
 * @returns {string} Texto curto em português.
 */
export function describeDioramaView(view, selectedId = "") {
  const tokens = view?.tokens || [];
  const active = tokens.find((t) => t.tokenId === selectedId) || null;
  if (!active) {
    const names = tokens.map((t) => t.name).join(", ") || "nenhum";
    return `Mapa 3D. Tokens visíveis: ${names}. Portas visíveis: ${(view?.floor?.doors || []).length}.`;
  }
  const doors = describeDoors(view.floor, active);
  return [describeTokenSurroundings(view.floor, tokens, active, { b2: true }).replace(/\.$/, ""), ...doors].join("; ") + ".";
}
