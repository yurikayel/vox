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
const VALID_AMBIENTS = new Set(["day", "dusk", "night", "dungeon"]);
const VALID_SHAPES = new Set(["box", "cylinder", "ramp"]);
const VALID_DISPLAYS = new Set(["standee", "flat"]);
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

function numOr(val, fallback) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeDioramaConfig(raw = {}) {
  const ambient = VALID_AMBIENTS.has(raw?.ambient) ? raw.ambient : "dungeon";
  const wallDefaultHeight = Math.max(0.5, Math.min(8, numOr(raw?.wallDefaultHeight, 2.4)));
  return { ambient, wallDefaultHeight, wallCutaway: raw?.wallCutaway !== false };
}

/**
 * Cria uma parede estrutural 3D (`WallDoc`) sobre a grade 2D do piso.
 * Portas permanecem exclusivamente em `floor.doors[]`.
 * @param {object} [opts={}] Campos (`wallId`, `x1`, `y1`, `x2`, `y2`, `height`, `color`).
 * @returns {object} `WallDoc` normalizada.
 */
export function createWallDoc(opts = {}) {
  const color = HEX_COLOR_RE.test(String(opts.color || "")) ? opts.color : "#4a4e57";
  return {
    wallId: safeSceneId(opts.wallId, "wall"),
    x1: Math.max(0, numOr(opts.x1, 0)),
    y1: Math.max(0, numOr(opts.y1, 0)),
    x2: Math.max(0, numOr(opts.x2, 1)),
    y2: Math.max(0, numOr(opts.y2, 0)),
    height: Math.max(0.25, Math.min(8, numOr(opts.height, 2.4))),
    color,
  };
}

/**
 * Cria uma primitiva procedural (`box`, `cylinder` ou `ramp`) no piso com suporte à camada GM.
 * @param {object} [opts={}] Campos do volume.
 * @returns {object} `VolumeDoc` normalizado.
 */
export function createVolumeDoc(opts = {}) {
  const shape = VALID_SHAPES.has(opts.shape) ? opts.shape : "box";
  const layer = VALID_LAYERS.has(opts.layer) ? opts.layer : "player";
  const color = HEX_COLOR_RE.test(String(opts.color || "")) ? opts.color : "#6b4f35";
  return {
    volumeId: safeSceneId(opts.volumeId, "vol"),
    shape,
    x: Math.max(0, numOr(opts.x, 0)),
    y: Math.max(0, numOr(opts.y, 0)),
    elevation: Math.max(-4, Math.min(16, numOr(opts.elevation, 0))),
    w: Math.max(0.2, Math.min(16, numOr(opts.w, 1))),
    d: Math.max(0.2, Math.min(16, numOr(opts.d, 1))),
    h: Math.max(0.1, Math.min(8, numOr(opts.h, 1))),
    r: Math.max(0.1, Math.min(8, numOr(opts.r, 0.4))),
    rot: ((Math.round(numOr(opts.rot, 0)) % 360) + 360) % 360,
    color,
    layer,
  };
}

/**
 * Cria um portal de transição entre cenas/andares no piso (`PortalDoc`).
 * @param {object} [opts={}] Campos do portal.
 * @returns {object} `PortalDoc` normalizado.
 */
export function createPortalDoc(opts = {}) {
  const layer = VALID_LAYERS.has(opts.layer) ? opts.layer : "player";
  return {
    portalId: safeSceneId(opts.portalId, "prt"),
    x: Math.max(0, numOr(opts.x, 0)),
    y: Math.max(0, numOr(opts.y, 0)),
    radius: Math.max(0.25, Math.min(4, numOr(opts.radius, 0.8))),
    targetSceneId: typeof opts.targetSceneId === "string" ? opts.targetSceneId.trim().slice(0, 64) : "",
    targetFloorZ: intOr(opts.targetFloorZ, 0),
    label: String(opts.label || "Portal").trim().slice(0, 64) || "Portal",
    layer,
  };
}

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
    diorama: normalizeDioramaConfig(opts.diorama),
    walls: Array.isArray(opts.walls) ? opts.walls.map(createWallDoc) : [],
    volumes: Array.isArray(opts.volumes) ? opts.volumes.map(createVolumeDoc) : [],
    portals: Array.isArray(opts.portals) ? opts.portals.map(createPortalDoc) : [],
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
    elevation: Math.max(-4, Math.min(16, numOr(opts.elevation, 0))),
    display: VALID_DISPLAYS.has(opts.display) ? opts.display : "standee",
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
