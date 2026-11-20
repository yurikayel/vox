/**
 * @file Redutor puro determinístico da Mesa Soberana (E1) + projeção Zero-Spoiler por papel.
 *
 * Aplica `VttOp` de forma idempotente por `opId` com ordenação determinística `(lamport, opId)`,
 * preparando o mesmo motor para sincronização P2P na Entrega 2.
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

function formatRollSummary(roll) {
  const diceText = roll.rolls
    .map((d) => (d.kept ? `${d.value}` : `~~${d.value}~~`))
    .join(", ");
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
  const nextSheet = { ...normalized, sheet_meta: { ...normalized.sheet_meta, clickable_actions: nextActions } };
  return { ...state, sheetsById: { ...state.sheetsById, [sheetId]: nextSheet } };
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

const OP_HANDLERS = {
  CHRONICLE_APPEND: applyChronicleAppend,
  ROLL_RECORDED: applyRollRecorded,
  SHEET_UPSERT: applySheetUpsert,
  SHEET_DELTA: applySheetDelta,
  SHEET_ACTION_UPSERT: applySheetActionUpsert,
  NOTE_UPSERT: applyNoteUpsert,
  CAMPAIGN_META_UPDATE: applyCampaignMetaUpdate,
};

/**
 * Reduz uma `VttOp` sobre um `CampaignDoc` de forma pura e idempotente por `opId`.
 * @param {object} state Estado atual da campanha.
 * @param {object} op Operação `VttOp`.
 * @returns {object} Novo estado da campanha (ou o mesmo se `opId` já foi aplicado ou tipo desconhecido).
 */
export function reduceCampaign(state, op) {
  if (!state || !op?.opId || !OP_HANDLERS[op.type]) return state;
  if (state.appliedOpIds?.includes(op.opId)) return state;
  const next = OP_HANDLERS[op.type](state, op);
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

function sanitizeSheetForPlayer(sheet) {
  if (!sheet?.sheet_meta) return sheet;
  return { ...sheet, sheet_meta: { ...sheet.sheet_meta, notes_gm: "" } };
}

function sanitizeNoteForPlayer(note) {
  return { ...note, gmSecretMarkdown: "" };
}

/**
 * Projeta o estado da campanha de forma fail-closed: apenas `viewerRole === "gm"` recebe segredos;
 * qualquer outro papel (`"player"`, indefinido ou desconhecido) recebe projeção sem segredos GM nem rolagens cegas.
 * @param {object} state Estado completo da campanha.
 * @param {"gm"|"player"} [viewerRole="player"] Papel de quem lê.
 * @param {string} [viewerRouteId=""] Identidade do jogador.
 * @returns {object|null} Estado projetado sem vazamento de segredos.
 */
export function projectStateForPlayer(state, viewerRole = "player", viewerRouteId = "") {
  if (!state) return null;
  if (viewerRole === "gm") return structuredClone(state);
  const sheetsById = Object.fromEntries(
    Object.entries(state.sheetsById || {}).map(([id, s]) => [id, sanitizeSheetForPlayer(s)]),
  );
  const notesById = Object.fromEntries(
    Object.entries(state.notesById || {}).map(([id, n]) => [id, sanitizeNoteForPlayer(n)]),
  );
  return {
    ...state,
    sheetsById,
    notesById,
    chronicle: (state.chronicle || []).filter((e) => canPlayerSeeEntry(e, viewerRouteId)),
    rolls: (state.rolls || []).filter((r) => canPlayerSeeEntry(r, viewerRouteId)),
  };
}
