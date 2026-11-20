/**
 * @file Contratos puros da Entrega 3 (Tático & Combate): catálogo de condições, portas, desenhos,
 * áreas de efeito (AoE), névoa de guerra e rastreador de iniciativa.
 * @module dungeon/vtt-tactics-schema
 */

const SAFE_ID_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/i;
const VALID_DOOR_STATES = new Set(["closed", "open", "locked", "secret"]);
const VALID_AOE_KINDS = new Set(["circle", "cone", "cube", "line"]);
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

/** Catálogo compacto de 12 condições de combate com glifo e cor para badges no token. */
export const CONDITION_CATALOG = Object.freeze([
  { id: "envenenado", label: "Envenenado", glyph: "☠", color: "#69dba9" },
  { id: "caido", label: "Caído", glyph: "↓", color: "#e7c26b" },
  { id: "atordoado", label: "Atordoado", glyph: "★", color: "#f6d365" },
  { id: "invisivel", label: "Invisível", glyph: "◌", color: "#9fb5c9" },
  { id: "concentrando", label: "Concentrando", glyph: "◎", color: "#78d6cf" },
  { id: "queimando", label: "Queimando", glyph: "▲", color: "#ff8a65" },
  { id: "amedrontado", label: "Amedrontado", glyph: "!", color: "#ce93d8" },
  { id: "enfeiticado", label: "Enfeitiçado", glyph: "♥", color: "#f48fb1" },
  { id: "paralisado", label: "Paralisado", glyph: "∥", color: "#ffab91" },
  { id: "cego", label: "Cego", glyph: "✕", color: "#b0bec5" },
  { id: "agarrado", label: "Agarrado", glyph: "⊕", color: "#ffcc80" },
  { id: "inconsciente", label: "Inconsciente", glyph: "☾", color: "#ffb4ab" },
]);

const CONDITION_BY_ID = Object.fromEntries(CONDITION_CATALOG.map((c) => [c.id, c]));

function safeTacticId(raw, prefix) {
  if (typeof raw === "string" && SAFE_ID_RE.test(raw)) return raw;
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function numOr(val, fallback) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function extractConditionDuration(item) {
  if (!item || typeof item !== "object") return null;
  if (item.durationRounds === null || item.durationRounds === undefined) return null;
  return Math.max(1, Math.trunc(numOr(item.durationRounds, 1)));
}

function normalizeSingleCondition(item) {
  const obj = item && typeof item === "object" ? item : { id: item };
  const id = String(obj.id || obj.label || "").trim().toLowerCase().slice(0, 32);
  if (!id) return null;
  const meta = CONDITION_BY_ID[id] || { label: String(obj.label || id).trim().slice(0, 32), glyph: "•", color: "#e7c26b" };
  return { id, label: meta.label, glyph: meta.glyph, color: meta.color, durationRounds: extractConditionDuration(item) };
}

/**
 * Normaliza a lista de condições de um token (aceita strings legadas ou objetos `{ id, label, durationRounds }`).
 * @param {Array<string|object>} [raw=[]] Lista bruta de condições.
 * @returns {Array<{ id: string, label: string, glyph: string, color: string, durationRounds: number|null }>} Lista normalizada.
 */
export function normalizeTokenConditions(raw = []) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const cond = normalizeSingleCondition(item);
    if (!cond || seen.has(cond.id)) continue;
    seen.add(cond.id);
    out.push(cond);
  }
  return out;
}

/**
 * Cria um documento de porta (`DoorDoc`) entre dois vértices da grade (`x1,y1` -> `x2,y2`).
 * @param {object} [opts={}] Campos da porta (`doorId`, `x1`, `y1`, `x2`, `y2`, `state`).
 * @returns {object} `DoorDoc` normalizado.
 */
export function createDoorDoc(opts = {}) {
  const state = VALID_DOOR_STATES.has(opts.state) ? opts.state : "closed";
  return {
    doorId: safeTacticId(opts.doorId, "door"),
    x1: Math.max(0, numOr(opts.x1, 0)),
    y1: Math.max(0, numOr(opts.y1, 0)),
    x2: Math.max(0, numOr(opts.x2, 1)),
    y2: Math.max(0, numOr(opts.y2, 0)),
    state,
  };
}

/**
 * Cria um traço de desenho livre (`DrawingDoc`) com pontos em coordenadas do mundo.
 * @param {object} [opts={}] Campos (`drawingId`, `author`, `color`, `width`, `layer`, `points`).
 * @returns {object} `DrawingDoc` normalizado.
 */
export function createDrawingDoc(opts = {}) {
  const points = Array.isArray(opts.points)
    ? opts.points.slice(0, 200).map((p) => ({ wx: Math.round(numOr(p?.wx, 0)), wy: Math.round(numOr(p?.wy, 0)) }))
    : [];
  return {
    drawingId: safeTacticId(opts.drawingId, "drw"),
    author: String(opts.author || ""),
    color: HEX_COLOR_RE.test(String(opts.color || "")) ? opts.color : "#78d6cf",
    width: Math.max(1, Math.min(16, Math.round(numOr(opts.width, 3)))),
    layer: opts.layer === "gm" ? "gm" : "player",
    points,
  };
}

/**
 * Cria um gabarito paramétrico de Área de Efeito (`circle`, `cone`, `cube` ou `line`).
 * @param {object} [opts={}] Parâmetros geométricos do gabarito.
 * @returns {object} `AoeDoc` normalizado.
 */
export function createAoeDoc(opts = {}) {
  const kind = VALID_AOE_KINDS.has(opts.kind) ? opts.kind : "circle";
  return {
    aoeId: safeTacticId(opts.aoeId, "aoe"),
    kind,
    wx: Math.round(numOr(opts.wx, 128)),
    wy: Math.round(numOr(opts.wy, 128)),
    radiusCells: Math.max(0.5, Math.min(20, numOr(opts.radiusCells, 2))),
    lengthCells: Math.max(1, Math.min(30, numOr(opts.lengthCells, 4))),
    widthCells: Math.max(0.5, Math.min(10, numOr(opts.widthCells, 1))),
    angleRad: numOr(opts.angleRad, 0),
    spreadDeg: Math.max(15, Math.min(180, numOr(opts.spreadDeg, 53))),
    color: HEX_COLOR_RE.test(String(opts.color || "")) ? opts.color : "#ff8a65",
    layer: opts.layer === "gm" ? "gm" : "player",
  };
}

/**
 * Normaliza o estado de Névoa de Guerra de um piso (`enabled` + retângulos revelados).
 * @param {object} [opts={}] Estado parcial da névoa.
 * @returns {{ enabled: boolean, revealedRects: Array<{ id: string, x: number, y: number, w: number, h: number }> }} Estado normalizado.
 */
export function createFogState(opts = {}) {
  const rects = Array.isArray(opts?.revealedRects)
    ? opts.revealedRects.slice(0, 128).map((r) => ({
      id: safeTacticId(r?.id, "fog"),
      x: Math.round(numOr(r?.x, 0)),
      y: Math.round(numOr(r?.y, 0)),
      w: Math.max(8, Math.round(numOr(r?.w, 64))),
      h: Math.max(8, Math.round(numOr(r?.h, 64))),
    }))
    : [];
  return { enabled: Boolean(opts?.enabled), revealedRects: rects };
}

/**
 * Ordena entradas de iniciativa por `(roll desc, tieBreak desc, id asc)`.
 * @param {Array<object>} [entries=[]] Entradas de combate.
 * @returns {Array<object>} Nova lista ordenada.
 */
export function sortInitiativeEntries(entries = []) {
  return [...entries].sort(
    (a, b) => (numOr(b.roll, 0) - numOr(a.roll, 0)) || (numOr(b.tieBreak, 0) - numOr(a.tieBreak, 0)) || String(a.id).localeCompare(String(b.id)),
  );
}

/**
 * Cria o estado do rastreador de iniciativa da campanha.
 * @param {object} [opts={}] Estado parcial (`active`, `round`, `turnIndex`, `entries`).
 * @returns {{ active: boolean, round: number, turnIndex: number, entries: Array<object> }} Estado normalizado.
 */
export function createInitiativeState(opts = {}) {
  const entries = Array.isArray(opts?.entries)
    ? opts.entries.map((e) => ({
      id: safeTacticId(e?.id, "init"),
      tokenId: String(e?.tokenId || ""),
      name: String(e?.name || "Combatente").trim().slice(0, 48) || "Combatente",
      roll: Math.trunc(numOr(e?.roll, 10)),
      tieBreak: numOr(e?.tieBreak, 0),
      hidden: Boolean(e?.hidden),
    }))
    : [];
  const sorted = sortInitiativeEntries(entries);
  const rawIdx = Math.max(0, Math.trunc(numOr(opts?.turnIndex, 0)));
  return {
    active: Boolean(opts?.active),
    round: Math.max(1, Math.trunc(numOr(opts?.round, 1))),
    turnIndex: sorted.length ? Math.min(rawIdx, sorted.length - 1) : 0,
    entries: sorted,
  };
}
