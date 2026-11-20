/**
 * @file Contratos puros de Cenas, Andares e Tokens para o mapa 2D e Camada do Mestre (E2 + E3).
 * @module dungeon/vtt-scene-schema
 */
import {
  createAoeDoc,
  createDoorDoc,
  createDrawingDoc,
  createFogState,
  normalizeTokenConditions,
} from "./vtt-tactics-schema.js";

const SAFE_ID_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/i;
const VALID_LAYERS = new Set(["player", "gm"]);
const VALID_HP_MODES = new Set(["exact", "bar", "status"]);
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

function safeSceneId(raw, prefix) {
  if (typeof raw === "string" && SAFE_ID_RE.test(raw)) return raw;
  const slug = String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 44);
  if (slug.length >= 2 && SAFE_ID_RE.test(slug)) return slug;
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function intOr(val, fallback) {
  const n = Number(val);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/**
 * Normaliza a configuração da grade de um piso (`square` ou `hex`).
 * @param {object} [raw={}] Configuração parcial.
 * @returns {object} Grade normalizada.
 */
export function normalizeSceneGrid(raw = {}) {
  const cellPx = Math.max(24, Math.min(256, intOr(raw?.cellPx, 64)));
  const unitMeters = Number(raw?.unitMeters) > 0 ? Number(raw.unitMeters) : 1.5;
  return {
    type: raw?.type === "hex" ? "hex" : "square",
    cellPx,
    offsetX: intOr(raw?.offsetX, 0),
    offsetY: intOr(raw?.offsetY, 0),
    unitMeters,
    visible: raw?.visible !== false,
  };
}

/**
 * Cria um documento de piso/andar (`FloorDoc`) para uma cena 2D.
 * @param {object} [opts={}] Campos (`z`, `name`, `mapBlobHash`, `widthPx`, `heightPx`, `grid`).
 * @returns {object} `FloorDoc` normalizado.
 */
export function createFloorDoc(opts = {}) {
  return {
    z: intOr(opts.z, 0),
    name: String(opts.name || "Térreo").trim().slice(0, 48) || "Térreo",
    mapBlobHash: typeof opts.mapBlobHash === "string" ? opts.mapBlobHash.trim() : "",
    widthPx: Math.max(256, Math.min(8192, intOr(opts.widthPx, 768))),
    heightPx: Math.max(256, Math.min(8192, intOr(opts.heightPx, 576))),
    grid: normalizeSceneGrid(opts.grid),
    fog: createFogState(opts.fog),
    doors: Array.isArray(opts.doors) ? opts.doors.map(createDoorDoc) : [],
    drawings: Array.isArray(opts.drawings) ? opts.drawings.map(createDrawingDoc) : [],
    aoes: Array.isArray(opts.aoes) ? opts.aoes.map(createAoeDoc) : [],
  };
}

function deriveInitials(name) {
  const words = String(name || "TK").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return (words[0] || "TK").slice(0, 2).toUpperCase();
}

function normalizeTokenHp(opts) {
  if (opts.hpCurrent === null) {
    return { hpCurrent: null, hpMax: null, ...(opts.hpStatus ? { hpStatus: String(opts.hpStatus) } : {}) };
  }
  const hpMax = Math.max(1, intOr(opts.hpMax, 20));
  return { hpCurrent: Math.max(0, Math.min(hpMax, intOr(opts.hpCurrent, hpMax))), hpMax };
}

/**
 * Cria um documento de token (`TokenDoc`) com suporte a camada `player` vs `gm` e modo de vida.
 * @param {object} [opts={}] Campos do token.
 * @returns {object} `TokenDoc` normalizado.
 */
export function createTokenDoc(opts = {}) {
  const name = String(opts.name || "Token").trim().slice(0, 48) || "Token";
  const layer = VALID_LAYERS.has(opts.layer) ? opts.layer : "player";
  const color = HEX_COLOR_RE.test(String(opts.color || "")) ? opts.color : layer === "gm" ? "#e7c26b" : "#78d6cf";
  return {
    tokenId: safeSceneId(opts.tokenId || name, "tok"),
    sheetId: typeof opts.sheetId === "string" ? opts.sheetId.trim() : "",
    ownerRouteId: String(opts.ownerRouteId || ""),
    name,
    initials: String(opts.initials || deriveInitials(name)).slice(0, 3).toUpperCase(),
    color,
    avatarBlobHash: typeof opts.avatarBlobHash === "string" ? opts.avatarBlobHash.trim() : "",
    floorZ: intOr(opts.floorZ, 0),
    x: Math.max(0, intOr(opts.x, 0)),
    y: Math.max(0, intOr(opts.y, 0)),
    sizeCells: Math.max(1, Math.min(4, intOr(opts.sizeCells, 1))),
    layer,
    hpVisible: VALID_HP_MODES.has(opts.hpVisible) ? opts.hpVisible : "bar",
    ...normalizeTokenHp(opts),
    conditions: normalizeTokenConditions(opts.conditions),
  };
}

/**
 * Cria uma cena tática completa (`SceneDoc`) com pisos e lista de tokens.
 * @param {object} [opts={}] Campos (`sceneId`, `name`, `activeFloorZ`, `floors`, `tokens`).
 * @returns {object} `SceneDoc` normalizada.
 */
export function createSceneDoc(opts = {}) {
  const name = String(opts.name || "Cena sem título").trim().slice(0, 80) || "Cena sem título";
  const floors = Array.isArray(opts.floors) && opts.floors.length
    ? opts.floors.map(createFloorDoc)
    : [createFloorDoc({ z: 0, name: "Térreo" })];
  const tokens = Array.isArray(opts.tokens) ? opts.tokens.map(createTokenDoc) : [];
  const activeFloorZ = floors.some((f) => f.z === intOr(opts.activeFloorZ, floors[0].z))
    ? intOr(opts.activeFloorZ, floors[0].z)
    : floors[0].z;
  return {
    sceneId: safeSceneId(opts.sceneId || name, "sc"),
    name,
    activeFloorZ,
    floors,
    tokens,
  };
}

/**
 * Gera a cena inicial padrão da Cripta (12×9 células) com 1 token de jogadora e 1 token oculto na Camada GM.
 * @param {string} [ownerRouteId="local"] Identificador do dono do token inicial da jogadora.
 * @returns {object} `SceneDoc` inicial.
 */
export function createDefaultScene(ownerRouteId = "local") {
  return createSceneDoc({
    sceneId: "sc-cripta",
    name: "Cripta das Águas Sussurrantes",
    activeFloorZ: 0,
    floors: [
      createFloorDoc({
        z: 0,
        name: "Câmara Principal",
        widthPx: 768,
        heightPx: 576,
        grid: { type: "square", cellPx: 64, unitMeters: 1.5, visible: true },
        doors: [
          createDoorDoc({ doorId: "door-cripta", x1: 4, y1: 2, x2: 4, y2: 3, state: "closed" }),
          createDoorDoc({ doorId: "door-secreta", x1: 6, y1: 1, x2: 7, y2: 1, state: "secret" }),
        ],
      }),
    ],
    tokens: [
      createTokenDoc({ tokenId: "tok-lyra", sheetId: "lyra", ownerRouteId, name: "Lyra", initials: "LY", color: "#78d6cf", x: 2, y: 3, layer: "player", hpVisible: "exact", hpCurrent: 24, hpMax: 24 }),
      createTokenDoc({ tokenId: "tok-sentinela", ownerRouteId: "gm", name: "Sentinela da Cripta", initials: "SC", color: "#e7c26b", x: 7, y: 4, layer: "gm", hpVisible: "status", hpCurrent: 30, hpMax: 30 }),
    ],
  });
}

/**
 * Converte PV atual/máximo em rótulo qualitativo sem vazar o número exato de chefes/NPCs.
 * @param {number} hpCurrent PV atual.
 * @param {number} hpMax PV máximo.
 * @returns {"Caído"|"Crítico"|"Ferido"|"Ileso"} Estado qualitativo.
 */
export function hpStatusLabel(hpCurrent, hpMax) {
  const cur = Math.max(0, Number(hpCurrent) || 0);
  const max = Math.max(1, Number(hpMax) || 1);
  if (cur <= 0) return "Caído";
  const ratio = cur / max;
  if (ratio <= 0.25) return "Crítico";
  if (ratio < 1) return "Ferido";
  return "Ileso";
}
