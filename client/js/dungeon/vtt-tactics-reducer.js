/**
 * @file Sub-redutor puro da Entrega 3 (Tático & Combate): iniciativa com decremento de condições,
 * névoa de guerra, desenhos, áreas de efeito, portas, andares, permissões e projeção Zero-Spoiler.
 * @module dungeon/vtt-tactics-reducer
 */
import { createFloorDoc } from "./vtt-scene-schema.js";
import {
  createAoeDoc,
  createDoorDoc,
  createDrawingDoc,
  createFogState,
  createInitiativeState,
  normalizeTokenConditions,
  sortInitiativeEntries,
} from "./vtt-tactics-schema.js";

function updateScene(state, sceneId, updater) {
  const id = sceneId || state.activeSceneId;
  const current = state.scenesById?.[id];
  if (!current) return state;
  return { ...state, scenesById: { ...state.scenesById, [id]: updater(current) } };
}

function updateFloor(state, sceneId, floorZ, updater) {
  return updateScene(state, sceneId, (scene) => {
    const z = Number.isFinite(Number(floorZ)) ? Math.trunc(Number(floorZ)) : scene.activeFloorZ;
    const floors = scene.floors.map((f) => (f.z === z ? updater(f) : f));
    return { ...scene, floors };
  });
}

function findTokenById(state, tokenId) {
  for (const scene of Object.values(state.scenesById || {})) {
    const tok = (scene.tokens || []).find((t) => t.tokenId === tokenId);
    if (tok) return tok;
  }
  return null;
}

function decrementConditionsForToken(state, tokenId) {
  if (!tokenId) return state;
  const scenesById = {};
  for (const [id, scene] of Object.entries(state.scenesById || {})) {
    const tokens = (scene.tokens || []).map((t) => {
      if (t.tokenId !== tokenId) return t;
      const nextConds = normalizeTokenConditions(t.conditions)
        .map((c) => (c.durationRounds === null ? c : { ...c, durationRounds: c.durationRounds - 1 }))
        .filter((c) => c.durationRounds === null || c.durationRounds > 0);
      return { ...t, conditions: nextConds };
    });
    scenesById[id] = { ...scene, tokens };
  }
  return { ...state, scenesById };
}

function applyInitiativeSetEntry(state, op) {
  const init = createInitiativeState(state.initiative);
  const raw = op.payload?.entry || {};
  const tok = raw.tokenId ? findTokenById(state, raw.tokenId) : null;
  const entry = {
    id: raw.id || (raw.tokenId ? `init-${raw.tokenId}` : `init-${op.opId}`),
    tokenId: String(raw.tokenId || ""),
    name: String(raw.name || tok?.name || "Combatente").trim().slice(0, 48),
    roll: Math.trunc(Number(raw.roll) || 0),
    tieBreak: Number(raw.tieBreak) || 0,
    hidden: Boolean(raw.hidden || tok?.layer === "gm"),
  };
  const rest = init.entries.filter((e) => e.id !== entry.id && (!entry.tokenId || e.tokenId !== entry.tokenId));
  return { ...state, initiative: createInitiativeState({ ...init, active: true, entries: sortInitiativeEntries([...rest, entry]) }) };
}

function applyInitiativeRemoveEntry(state, op) {
  const init = createInitiativeState(state.initiative);
  const entries = init.entries.filter((e) => e.id !== op.payload?.entryId && e.tokenId !== op.payload?.tokenId);
  return { ...state, initiative: createInitiativeState({ ...init, active: entries.length > 0, entries }) };
}

function applyInitiativeNext(state) {
  const init = createInitiativeState(state.initiative);
  if (!init.entries.length) return state;
  const ending = init.entries[init.turnIndex];
  const afterTick = decrementConditionsForToken(state, ending?.tokenId);
  const nextIndex = (init.turnIndex + 1) % init.entries.length;
  const nextRound = nextIndex === 0 ? init.round + 1 : init.round;
  return { ...afterTick, initiative: { ...init, active: true, turnIndex: nextIndex, round: nextRound } };
}

function applyInitiativeReset(state) {
  return { ...state, initiative: createInitiativeState({ active: false, round: 1, turnIndex: 0, entries: [] }) };
}

function applyTokenConditionSet(state, op) {
  const rawCond = op.payload?.condition;
  if (!rawCond || !op.payload?.tokenId) return state;
  return updateScene(state, op.payload?.sceneId, (scene) => ({
    ...scene,
    tokens: scene.tokens.map((t) => {
      if (t.tokenId !== op.payload.tokenId) return t;
      const incoming = normalizeTokenConditions([rawCond])[0];
      if (!incoming) return t;
      const existing = normalizeTokenConditions(t.conditions).filter((c) => c.id !== incoming.id);
      return { ...t, conditions: [...existing, incoming] };
    }),
  }));
}

function applyTokenConditionRemove(state, op) {
  const condId = String(op.payload?.conditionId || "").trim().toLowerCase();
  if (!condId || !op.payload?.tokenId) return state;
  return updateScene(state, op.payload?.sceneId, (scene) => ({
    ...scene,
    tokens: scene.tokens.map((t) => (
      t.tokenId !== op.payload.tokenId
        ? t
        : { ...t, conditions: normalizeTokenConditions(t.conditions).filter((c) => c.id !== condId) }
    )),
  }));
}

function applyFogSet(state, op) {
  return updateFloor(state, op.payload?.sceneId, op.payload?.floorZ, (floor) => {
    const fog = createFogState(floor.fog);
    const enabled = op.payload?.enabled !== undefined ? Boolean(op.payload.enabled) : fog.enabled;
    if (op.payload?.reset) return { ...floor, fog: { enabled, revealedRects: [] } };
    let rects = [...fog.revealedRects];
    if (op.payload?.revealRect) {
      const r = op.payload.revealRect;
      rects.push({ id: r.id || `fog-${op.opId}`, x: Math.round(r.x), y: Math.round(r.y), w: Math.max(8, Math.round(r.w)), h: Math.max(8, Math.round(r.h)) });
    }
    if (op.payload?.hideRectId) rects = rects.filter((r) => r.id !== op.payload.hideRectId);
    return { ...floor, fog: createFogState({ enabled, revealedRects: rects }) };
  });
}

function applyDrawingAdd(state, op) {
  const raw = op.payload?.drawing;
  if (!raw?.points?.length) return state;
  return updateFloor(state, op.payload?.sceneId, op.payload?.floorZ, (floor) => {
    const drw = createDrawingDoc({ ...raw, drawingId: raw.drawingId || `drw-${op.opId}`, author: op.actor });
    return { ...floor, drawings: [...(floor.drawings || []), drw].slice(-120) };
  });
}

function applyDrawingClear(state, op) {
  return updateFloor(state, op.payload?.sceneId, op.payload?.floorZ, (floor) => ({ ...floor, drawings: [] }));
}

function applyAoeUpsert(state, op) {
  const raw = op.payload?.aoe;
  if (!raw) return state;
  return updateFloor(state, op.payload?.sceneId, op.payload?.floorZ, (floor) => {
    const aoe = createAoeDoc({ ...raw, aoeId: raw.aoeId || `aoe-${op.opId}` });
    const rest = (floor.aoes || []).filter((a) => a.aoeId !== aoe.aoeId);
    return { ...floor, aoes: [...rest, aoe].slice(-24) };
  });
}

function applyAoeRemove(state, op) {
  return updateFloor(state, op.payload?.sceneId, op.payload?.floorZ, (floor) => ({
    ...floor,
    aoes: (floor.aoes || []).filter((a) => a.aoeId !== op.payload?.aoeId),
  }));
}

function applyAoeClear(state, op) {
  return updateFloor(state, op.payload?.sceneId, op.payload?.floorZ, (floor) => ({ ...floor, aoes: [] }));
}

function applyDoorUpsert(state, op) {
  const raw = op.payload?.door;
  if (!raw) return state;
  return updateFloor(state, op.payload?.sceneId, op.payload?.floorZ, (floor) => {
    const door = createDoorDoc({ ...raw, doorId: raw.doorId || `door-${op.opId}` });
    const rest = (floor.doors || []).filter((d) => d.doorId !== door.doorId);
    return { ...floor, doors: [...rest, door] };
  });
}

function applyDoorStateSet(state, op) {
  const nextState = op.payload?.state;
  if (!["closed", "open", "locked", "secret"].includes(nextState)) return state;
  return updateFloor(state, op.payload?.sceneId, op.payload?.floorZ, (floor) => ({
    ...floor,
    doors: (floor.doors || []).map((d) => (d.doorId === op.payload?.doorId ? { ...d, state: nextState } : d)),
  }));
}

function applyDoorRemove(state, op) {
  return updateFloor(state, op.payload?.sceneId, op.payload?.floorZ, (floor) => ({
    ...floor,
    doors: (floor.doors || []).filter((d) => d.doorId !== op.payload?.doorId),
  }));
}

function applyFloorAdd(state, op) {
  return updateScene(state, op.payload?.sceneId, (scene) => {
    const base = scene.floors[0];
    const maxZ = Math.max(...scene.floors.map((f) => f.z));
    const z = Number.isFinite(Number(op.payload?.floor?.z)) ? Math.trunc(Number(op.payload.floor.z)) : maxZ + 1;
    if (scene.floors.some((f) => f.z === z)) return scene;
    const floor = createFloorDoc({
      widthPx: base?.widthPx,
      heightPx: base?.heightPx,
      grid: base?.grid,
      ...op.payload?.floor,
      z,
      name: op.payload?.floor?.name || (z < 0 ? `Subsolo ${Math.abs(z)}` : `${z}º Andar`),
    });
    const floors = [...scene.floors, floor].sort((a, b) => a.z - b.z);
    return { ...scene, floors, activeFloorZ: op.payload?.select ? z : scene.activeFloorZ };
  });
}

function applyFloorSelect(state, op) {
  const targetZ = Math.trunc(Number(op.payload?.floorZ));
  if (!Number.isFinite(targetZ)) return state;
  return updateScene(state, op.payload?.sceneId, (scene) => (
    scene.floors.some((f) => f.z === targetZ) ? { ...scene, activeFloorZ: targetZ } : scene
  ));
}

function applyTokenChangeFloor(state, op) {
  const targetZ = Math.trunc(Number(op.payload?.floorZ));
  if (!Number.isFinite(targetZ)) return state;
  return updateScene(state, op.payload?.sceneId, (scene) => {
    if (!scene.floors.some((f) => f.z === targetZ)) return scene;
    const tokens = scene.tokens.map((t) => {
      if (t.tokenId !== op.payload?.tokenId) return t;
      const x = Number.isFinite(Number(op.payload?.x)) ? Math.max(0, Math.trunc(Number(op.payload.x))) : t.x;
      const y = Number.isFinite(Number(op.payload?.y)) ? Math.max(0, Math.trunc(Number(op.payload.y))) : t.y;
      return { ...t, floorZ: targetZ, x, y };
    });
    return { ...scene, tokens };
  });
}

/** Mapa de redutores puros das operações táticas da Entrega 3. */
export const TACTICS_OP_HANDLERS = Object.freeze({
  INITIATIVE_SET_ENTRY: applyInitiativeSetEntry,
  INITIATIVE_REMOVE_ENTRY: applyInitiativeRemoveEntry,
  INITIATIVE_NEXT: applyInitiativeNext,
  INITIATIVE_RESET: applyInitiativeReset,
  TOKEN_CONDITION_SET: applyTokenConditionSet,
  TOKEN_CONDITION_REMOVE: applyTokenConditionRemove,
  FOG_SET: applyFogSet,
  DRAWING_ADD: applyDrawingAdd,
  DRAWING_CLEAR: applyDrawingClear,
  AOE_UPSERT: applyAoeUpsert,
  AOE_REMOVE: applyAoeRemove,
  AOE_CLEAR: applyAoeClear,
  DOOR_UPSERT: applyDoorUpsert,
  DOOR_STATE_SET: applyDoorStateSet,
  DOOR_REMOVE: applyDoorRemove,
  FLOOR_ADD: applyFloorAdd,
  FLOOR_SELECT: applyFloorSelect,
  TOKEN_CHANGE_FLOOR: applyTokenChangeFloor,
});

function resolveTargetFloor(state, payload) {
  const scene = state.scenesById?.[payload?.sceneId || state.activeSceneId];
  if (!scene) return null;
  const z = Number.isFinite(Number(payload?.floorZ)) ? Math.trunc(Number(payload.floorZ)) : scene.activeFloorZ;
  return scene.floors?.find((f) => f.z === z) || null;
}

function canPlayerToggleDoor(state, op) {
  const targetState = op.payload?.state;
  if (targetState !== "open" && targetState !== "closed") return false;
  const floor = resolveTargetFloor(state, op.payload);
  const door = floor?.doors?.find((d) => d.doorId === op.payload?.doorId);
  return Boolean(door && (door.state === "closed" || door.state === "open"));
}

/**
 * Avalia permissões de um não-Mestre para operações táticas da Entrega 3 (fail-closed).
 * @param {object} state Estado da campanha.
 * @param {object} op Operação `VttOp`.
 * @returns {boolean} `true` se um jogador comum pode executar esta operação tática.
 */
export function isPlayerAuthorizedForTacticsOp(state, op) {
  if (op.type === "DRAWING_ADD") return op.payload?.drawing?.layer !== "gm";
  if (op.type === "AOE_UPSERT") return op.payload?.aoe?.layer !== "gm";
  if (op.type === "DOOR_STATE_SET") return canPlayerToggleDoor(state, op);
  if (op.type === "TOKEN_CHANGE_FLOOR") {
    const tok = findTokenById(state, op.payload?.tokenId);
    return Boolean(tok && tok.layer === "player" && tok.ownerRouteId && tok.ownerRouteId === op.actor);
  }
  return false;
}

/**
 * Remove portas secretas e desenhos/AoEs da Camada GM de um piso antes do envio a jogadores.
 * @param {object} floor Documento `FloorDoc`.
 * @returns {object} Piso sanitizado (Zero-Spoiler).
 */
export function projectTacticsFloorForPlayer(floor) {
  return {
    ...floor,
    doors: (floor.doors || []).filter((d) => d.state !== "secret"),
    drawings: (floor.drawings || []).filter((d) => d.layer !== "gm"),
    aoes: (floor.aoes || []).filter((a) => a.layer !== "gm"),
    volumes: (floor.volumes || []).filter((v) => v.layer !== "gm"),
    portals: (floor.portals || []).filter((p) => p.layer !== "gm"),
  };
}

/**
 * Filtra entradas ocultas/camada GM do rastreador de iniciativa para jogadores (Zero-Spoiler).
 * @param {object} initiative Estado de iniciativa completo.
 * @param {Record<string, object>} scenesById Mapa de cenas da campanha.
 * @returns {object} Iniciativa projetada sem combatentes secretos.
 */
export function projectInitiativeForPlayer(initiative, scenesById = {}) {
  const init = createInitiativeState(initiative);
  const gmTokenIds = new Set();
  for (const sc of Object.values(scenesById || {})) {
    for (const t of sc.tokens || []) if (t.layer === "gm") gmTokenIds.add(t.tokenId);
  }
  const activeEntryId = init.entries[init.turnIndex]?.id || "";
  const visible = init.entries.filter((e) => !e.hidden && !gmTokenIds.has(e.tokenId));
  const nextTurnIdx = Math.max(0, visible.findIndex((e) => e.id === activeEntryId));
  return { ...init, entries: visible, turnIndex: visible.length ? nextTurnIdx : 0 };
}
