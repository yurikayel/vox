/**
 * @file Redutor puro determinístico da Mesa Soberana (E1 + E2): crônica, rolagens, fichas CRDT,
 * notas, cenas 2D, tokens, permissões Mestre/Jogador e projeção Zero-Spoiler fail-closed.
 * @module dungeon/vtt-reducer
 */
import { appendPoolDeltaOp } from "../rpg-sheet-and-lore.js";
import {
  createChronicleEntry,
  createDiceRollEntry,
  createNoteDoc,
  ensureSheetMeta,
  sanitizeVttId,
} from "./vtt-schema.js";
import { createFloorDoc, createSceneDoc, createTokenDoc, hpStatusLabel, normalizeSceneGrid } from "./vtt-scene-schema.js";
import { clampTokenToFloor } from "./vtt-geometry.js";
import { isDoorRevealedByFog, isTokenRevealedByFog } from "./vtt-tactics-geometry.js";
import {
  isPlayerAuthorizedForTacticsOp,
  projectInitiativeForPlayer,
  projectTacticsFloorForPlayer,
  TACTICS_OP_HANDLERS,
} from "./vtt-tactics-reducer.js";
import { CAMPAIGN_OP_HANDLERS, isPlayerAuthorizedForCampaignOp } from "./vtt-campaign-reducer.js";
import { FAIRPLAY_OP_HANDLERS } from "./vtt-fairplay-log.js";

const GM_ONLY_OPS = new Set([
  "SCENE_UPSERT",
  "SCENE_SELECT",
  "SCENE_MAP_SET",
  "TOKEN_UPSERT",
  "TOKEN_LAYER_SET",
  "TOKEN_REMOVE",
  "CAMPAIGN_META_UPDATE",
  "CALENDAR_SET",
  "CALENDAR_ADVANCE",
  "NOTE_PIN",
  "NOTE_VISIBILITY",
]);

function isGmActor(state, actor) {
  const gmId = String(state?.gmRouteId || "");
  if (!gmId || gmId === "local") return true;
  return Boolean(actor && actor === gmId);
}

function canPlayerMoveToken(state, op) {
  const scene = state.scenesById?.[op.payload?.sceneId || state.activeSceneId];
  const tok = scene?.tokens?.find((t) => t.tokenId === op.payload?.tokenId);
  return Boolean(tok && tok.layer === "player" && tok.ownerRouteId && tok.ownerRouteId === op.actor);
}

/**
 * Verifica se o autor de uma operação `VttOp` tem permissão para aplicá-la no estado atual (INV-7).
 * @param {object} state Estado atual da campanha.
 * @param {object} op Operação `VttOp` candidata.
 * @returns {boolean} `true` quando autorizada.
 */
export function isAuthorizedVttOp(state, op) {
  if (!state || !op?.type) return false;
  if (isGmActor(state, op.actor)) return true;
  if (GM_ONLY_OPS.has(op.type)) return false;
  if (op.type in TACTICS_OP_HANDLERS) return isPlayerAuthorizedForTacticsOp(state, op);
  if (op.type in CAMPAIGN_OP_HANDLERS) return isPlayerAuthorizedForCampaignOp(state, op, false);
  if (op.type === "TOKEN_MOVE") return canPlayerMoveToken(state, op);
  return true;
}

function formatRollSummary(roll) {
  const diceText = roll.rolls.map((d) => (d.kept ? `${d.value}` : `~~${d.value}~~`)).join(", ");
  const tag = roll.crits ? " · CRÍTICO!" : roll.fumbles ? " · FALHA CRÍTICA!" : "";
  const vis = roll.visibility === "gm" ? "[Mestre] " : roll.visibility === "blind" ? "[Cega] " : "";
  const label = roll.label ? `${roll.label}: ` : "";
  return `${vis}${label}${roll.formula} → [${diceText}] = ${roll.total}${tag}`;
}

function applyChronicleAppend(state, op) {
  const id = op.payload?.id || `turn-${op.opId}`;
  const entry = createChronicleEntry({ ...op.payload, id, author: op.payload?.author || op.actor, ts: op.ts });
  return { ...state, chronicle: [...state.chronicle, entry] };
}

function applyRollRecorded(state, op) {
  const fairplay = (op.payload?.rollResult || op.payload)?.fairplay;
  const roll = createDiceRollEntry({
    id: op.payload?.id || `roll-${op.opId}`,
    author: op.payload?.author || op.actor,
    speaker: op.payload?.speaker,
    rollResult: op.payload?.rollResult || op.payload,
    ts: op.ts,
  });
  const entry = createChronicleEntry({
    id: `turn-${roll.id}`,
    speaker: roll.speaker,
    badge: roll.visibility === "public" ? "Rolagem" : roll.visibility === "gm" ? "Rolagem GM" : "Rolagem Cega",
    text: formatRollSummary(roll),
    rollNote: `${roll.formula} = ${roll.total}`,
    visibility: roll.visibility,
    author: roll.author,
    ts: roll.ts,
    fairplayRollId: fairplay?.rollId,
    fairplayValue: fairplay?.value,
  });
  return { ...state, rolls: [...state.rolls, roll], chronicle: [...state.chronicle, entry] };
}

function applySheetUpsert(state, op) {
  const incoming = ensureSheetMeta({ ...op.payload?.sheet, campaign_id: state.id });
  const sheetsById = { ...state.sheetsById, [incoming.character_id]: incoming };
  const activeSheetId = op.payload?.setActive ? incoming.character_id : state.activeSheetId || incoming.character_id;
  return { ...state, sheetsById, activeSheetId };
}

function applySheetDelta(state, op) {
  const sheetId = op.payload?.sheetId || state.activeSheetId;
  const current = state.sheetsById?.[sheetId];
  if (!current) return state;
  const updated = appendPoolDeltaOp(current, {
    op_id: op.payload?.deltaOpId || op.opId,
    lamport_clock: op.lamport,
    actor_pubkey: op.actor,
    target_pool: op.payload?.target_pool,
    delta: op.payload?.delta,
    reason: op.payload?.reason || "Mesa",
  });
  return { ...state, sheetsById: { ...state.sheetsById, [sheetId]: { ...current, ...updated } } };
}

function applySheetActionUpsert(state, op) {
  const sheetId = op.payload?.sheetId || state.activeSheetId;
  const current = state.sheetsById?.[sheetId];
  if (!current || !op.payload?.action?.label) return state;
  const normalized = ensureSheetMeta(current);
  const existing = normalized.sheet_meta.clickable_actions;
  const action = {
    id: op.payload.action.id || sanitizeVttId(op.payload.action.label, "act"),
    label: String(op.payload.action.label).trim().slice(0, 60),
    roll: String(op.payload.action.roll || "1d20").trim().slice(0, 80),
    damage: String(op.payload.action.damage || "").trim().slice(0, 80),
    tag: String(op.payload.action.tag || "acao").trim().slice(0, 24),
  };
  const nextActions = [...existing.filter((a) => a.id !== action.id), action];
  return { ...state, sheetsById: { ...state.sheetsById, [sheetId]: { ...normalized, sheet_meta: { ...normalized.sheet_meta, clickable_actions: nextActions } } } };
}

function applySheetActionRemove(state, op) {
  const sheetId = op.payload?.sheetId || state.activeSheetId;
  const current = state.sheetsById?.[sheetId];
  const actionId = String(op.payload?.actionId || "");
  if (!current || !actionId) return state;
  const normalized = ensureSheetMeta(current);
  const nextActions = normalized.sheet_meta.clickable_actions.filter((a) => a.id !== actionId);
  return { ...state, sheetsById: { ...state.sheetsById, [sheetId]: { ...normalized, sheet_meta: { ...normalized.sheet_meta, clickable_actions: nextActions } } } };
}

function applyNoteUpsert(state, op) {
  const note = createNoteDoc({ ...op.payload?.note, updatedAt: op.ts });
  return { ...state, notesById: { ...state.notesById, [note.id]: note } };
}

function applyCampaignMetaUpdate(state, op) {
  const name = op.payload?.name ? String(op.payload.name).trim().slice(0, 80) : state.name;
  const system = op.payload?.system ? String(op.payload.system).trim().slice(0, 40) : state.system;
  const activeSheetId = op.payload?.activeSheetId && state.sheetsById[op.payload.activeSheetId]
    ? op.payload.activeSheetId
    : state.activeSheetId;
  return { ...state, name: name || state.name, system: system || state.system, activeSheetId };
}

function withUpdatedScene(state, sceneId, updater) {
  const targetId = sceneId || state.activeSceneId;
  const current = state.scenesById?.[targetId];
  if (!current) return state;
  const nextScene = updater(current);
  return { ...state, scenesById: { ...state.scenesById, [targetId]: nextScene } };
}

function applySceneUpsert(state, op) {
  const sc = createSceneDoc(op.payload?.scene || {});
  const scenesById = { ...(state.scenesById || {}), [sc.sceneId]: sc };
  const activeSceneId = op.payload?.setActive ? sc.sceneId : state.activeSceneId || sc.sceneId;
  return { ...state, scenesById, activeSceneId };
}

function applySceneSelect(state, op) {
  const target = op.payload?.sceneId;
  return target && state.scenesById?.[target] ? { ...state, activeSceneId: target } : state;
}

function applySceneMapSet(state, op) {
  return withUpdatedScene(state, op.payload?.sceneId, (scene) => {
    const floorZ = Number.isFinite(Number(op.payload?.floorZ)) ? Math.trunc(Number(op.payload.floorZ)) : scene.activeFloorZ;
    const floors = scene.floors.map((f) => {
      if (f.z !== floorZ) return f;
      return createFloorDoc({
        ...f,
        mapBlobHash: op.payload?.mapBlobHash !== undefined ? op.payload.mapBlobHash : f.mapBlobHash,
        widthPx: op.payload?.widthPx ?? f.widthPx,
        heightPx: op.payload?.heightPx ?? f.heightPx,
        grid: op.payload?.grid ? normalizeSceneGrid({ ...f.grid, ...op.payload.grid }) : f.grid,
      });
    });
    return { ...scene, floors };
  });
}

function applyTokenUpsert(state, op) {
  return withUpdatedScene(state, op.payload?.sceneId, (scene) => {
    const raw = op.payload?.token || {};
    const tok = createTokenDoc({ floorZ: scene.activeFloorZ, ...raw, tokenId: raw.tokenId || `tok-${op.opId}` });
    const rest = scene.tokens.filter((t) => t.tokenId !== tok.tokenId);
    return { ...scene, tokens: [...rest, tok] };
  });
}

function applyTokenMove(state, op) {
  return withUpdatedScene(state, op.payload?.sceneId, (scene) => {
    const floor = scene.floors.find((f) => f.z === scene.activeFloorZ) || scene.floors[0];
    const tokens = scene.tokens.map((t) => {
      if (t.tokenId !== op.payload?.tokenId) return t;
      const pos = clampTokenToFloor(op.payload.x, op.payload.y, t.sizeCells, floor);
      return { ...t, x: pos.x, y: pos.y };
    });
    return { ...scene, tokens };
  });
}

function applyTokenLayerSet(state, op) {
  const layer = op.payload?.layer === "gm" ? "gm" : "player";
  return withUpdatedScene(state, op.payload?.sceneId, (scene) => ({
    ...scene,
    tokens: scene.tokens.map((t) => (t.tokenId === op.payload?.tokenId ? { ...t, layer } : t)),
  }));
}

function applyTokenRemove(state, op) {
  return withUpdatedScene(state, op.payload?.sceneId, (scene) => ({
    ...scene,
    tokens: scene.tokens.filter((t) => t.tokenId !== op.payload?.tokenId),
  }));
}

const OP_HANDLERS = {
  CHRONICLE_APPEND: applyChronicleAppend,
  ROLL_RECORDED: applyRollRecorded,
  SHEET_UPSERT: applySheetUpsert,
  SHEET_DELTA: applySheetDelta,
  SHEET_ACTION_UPSERT: applySheetActionUpsert,
  SHEET_ACTION_REMOVE: applySheetActionRemove,
  NOTE_UPSERT: applyNoteUpsert,
  CAMPAIGN_META_UPDATE: applyCampaignMetaUpdate,
  SCENE_UPSERT: applySceneUpsert,
  SCENE_SELECT: applySceneSelect,
  SCENE_MAP_SET: applySceneMapSet,
  TOKEN_UPSERT: applyTokenUpsert,
  TOKEN_MOVE: applyTokenMove,
  TOKEN_LAYER_SET: applyTokenLayerSet,
  TOKEN_REMOVE: applyTokenRemove,
  ...TACTICS_OP_HANDLERS,
  ...CAMPAIGN_OP_HANDLERS,
  ...FAIRPLAY_OP_HANDLERS,
};

/**
 * Reduz uma `VttOp` sobre um `CampaignDoc` de forma pura, autorizada e idempotente por `opId`.
 * @param {object} state Estado atual da campanha.
 * @param {object} op Operação `VttOp`.
 * @returns {object} Novo estado da campanha (ou o mesmo se `opId` duplicado, tipo inválido ou sem permissão).
 */
export function reduceCampaign(state, op) {
  if (!state || !op?.opId || !OP_HANDLERS[op.type]) return state;
  if (state.appliedOpIds?.includes(op.opId)) return state;
  if (!isAuthorizedVttOp(state, op)) return state;
  const next = OP_HANDLERS[op.type](state, op);
  if (next === state && op.type in FAIRPLAY_OP_HANDLERS) return state; // recusada: não entra no log (ADR-040 §2.1a)
  return {
    ...next,
    appliedOpIds: [...(state.appliedOpIds || []), op.opId],
    lamport: Math.max(Number(state.lamport) || 0, Number(op.lamport) || 0),
    updatedAt: Math.max(Number(state.updatedAt) || 0, Number(op.ts) || 0),
  };
}

/**
 * Ordena operações por `(lamport, opId)` e as reaplica sobre o estado base de forma determinística.
 * @param {object} baseState Snapshot inicial da campanha.
 * @param {Array<object>} [ops=[]] Lista de operações (pode chegar fora de ordem ou duplicada).
 * @returns {object} Estado materializado final.
 */
export function replayCampaignOps(baseState, ops = []) {
  const ordered = [...(ops || [])].sort(
    (a, b) => (Number(a?.lamport) || 0) - (Number(b?.lamport) || 0) || String(a?.opId || "").localeCompare(String(b?.opId || "")),
  );
  return ordered.reduce((acc, op) => reduceCampaign(acc, op), baseState);
}

function canPlayerSeeEntry(entry, viewerRouteId) {
  if (entry.visibility === "public" || !entry.visibility) return true;
  if (entry.visibility === "gm") return Boolean(viewerRouteId && entry.author === viewerRouteId);
  return false;
}

function projectTokenForPlayer(tok, viewerRouteId) {
  if (tok.hpVisible === "status" && tok.ownerRouteId !== viewerRouteId) {
    return { ...tok, hpCurrent: null, hpMax: null, hpStatus: hpStatusLabel(tok.hpCurrent, tok.hpMax) };
  }
  return { ...tok };
}

function projectSceneForPlayer(scene, viewerRouteId) {
  const floors = (scene.floors || []).map(projectTacticsFloorForPlayer);
  const floorOf = (t) => floors.find((f) => f.z === t.floorZ);
  const visibleTokens = (scene.tokens || [])
    .filter((t) => t.layer === "player" && isTokenRevealedByFog(t, floorOf(t)))
    .map((t) => projectTokenForPlayer(t, viewerRouteId));
  const fogged = floors.map((f) => ({ ...f, doors: (f.doors || []).filter((d) => isDoorRevealedByFog(d, f)) }));
  return { ...scene, floors: fogged, tokens: visibleTokens };
}

function projectNotesForPlayer(notesById, viewerRouteId) {
  return Object.fromEntries(
    Object.entries(notesById || {})
      .filter(([, n]) => n.visibility !== "gm_only")
      .map(([id, n]) => [
        id,
        {
          ...n,
          gmSecretMarkdown: "",
          canvasJson: n.visibility === "player_private" && n.ownerRouteId && n.ownerRouteId !== viewerRouteId ? null : n.canvasJson,
        },
      ]),
  );
}

/**
 * Projeta o estado da campanha de forma fail-closed: apenas `viewerRole === "gm"` recebe segredos;
 * qualquer outro papel recebe projeção sem camada GM, portas secretas, iniciativa oculta, segredos `%%...%%`, PV exato oculto e rolagens cegas.
 * @param {object} state Estado completo da campanha.
 * @param {"gm"|"player"} [viewerRole="player"] Papel de quem lê.
 * @param {string} [viewerRouteId=""] Identidade do jogador.
 * @returns {object|null} Estado projetado sem vazamento de segredos.
 */
export function projectStateForPlayer(state, viewerRole = "player", viewerRouteId = "") {
  if (!state) return null;
  if (viewerRole === "gm") return structuredClone(state);
  const sheetsById = Object.fromEntries(
    Object.entries(state.sheetsById || {}).map(([id, s]) => [id, s?.sheet_meta ? { ...s, sheet_meta: { ...s.sheet_meta, notes_gm: "" } } : s]),
  );
  const notesById = projectNotesForPlayer(state.notesById, viewerRouteId);
  const scenesById = Object.fromEntries(
    Object.entries(state.scenesById || {}).map(([id, sc]) => [id, projectSceneForPlayer(sc, viewerRouteId)]),
  );
  return {
    ...state,
    sheetsById,
    notesById,
    scenesById,
    initiative: projectInitiativeForPlayer(state.initiative, state.scenesById),
    chronicle: (state.chronicle || []).filter((e) => canPlayerSeeEntry(e, viewerRouteId)),
    rolls: (state.rolls || []).filter((r) => canPlayerSeeEntry(r, viewerRouteId)),
  };
}
