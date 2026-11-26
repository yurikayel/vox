/**
 * @file Sub-redutor E4: calendário, inventário, level-up e pin de notas.
 * @module dungeon/vtt-campaign-reducer
 */
import { createDefaultCalendar, advanceTime } from "./vtt-calendar.js";
import { applyInventoryMutation, applyCurrencyDelta } from "./vtt-inventory.js";
import { applyLevelUp } from "./vtt-levelup.js";
import { createNoteDoc } from "./vtt-schema.js";
import { isSheetOwner } from "./vtt-sheet-auth.js";

function applyCalendarSet(state, op) {
  const calendar = createDefaultCalendar(op.payload?.calendar || {});
  return { ...state, calendar };
}

function applyCalendarAdvance(state, op) {
  const delta = op.payload?.delta || "minutes_10";
  const { calendar, label } = advanceTime(state.calendar || createDefaultCalendar(), delta);
  const entry = {
    id: `cal-${op.opId}`,
    speaker: "Relógio da Campanha",
    badge: "Tempo",
    text: label || formatCalendarAdvance(delta),
    rollNote: "",
    visibility: "public",
    author: op.actor,
    ts: op.ts,
  };
  return {
    ...state,
    calendar,
    chronicle: [...(state.chronicle || []), entry],
  };
}

function formatCalendarAdvance(delta) {
  if (delta === "round") return "+1 rodada";
  if (delta === "minutes_10") return "+10 min";
  if (delta === "short_rest") return "Descanso curto";
  if (delta === "long_rest") return "Descanso longo";
  return "Tempo avançado";
}

function applyInventoryOp(state, op) {
  const sheetId = op.payload?.sheetId || state.activeSheetId;
  const current = state.sheetsById?.[sheetId];
  if (!current) return state;
  const kind = op.payload?.kind;
  const updated = applyInventoryMutation(current, kind, op.payload || {});
  return { ...state, sheetsById: { ...state.sheetsById, [sheetId]: updated } };
}

function applyCurrencyOp(state, op) {
  const sheetId = op.payload?.sheetId || state.activeSheetId;
  const current = state.sheetsById?.[sheetId];
  if (!current) return state;
  const updated = applyCurrencyDelta(current, op.payload?.coins || {}, {
    op_id: op.payload?.deltaOpId || op.opId,
    lamport_clock: op.lamport,
    actor_pubkey: op.actor,
    reason: op.payload?.reason,
  });
  return { ...state, sheetsById: { ...state.sheetsById, [sheetId]: updated } };
}

function applyLevelUpOp(state, op) {
  const sheetId = op.payload?.sheetId || state.activeSheetId;
  const current = state.sheetsById?.[sheetId];
  if (!current || !op.payload?.plan) return state;
  const updated = applyLevelUp(current, op.payload.plan, {
    op_id_hp: op.payload?.deltaOpId || op.opId,
    lamport_clock: op.lamport,
    actor_pubkey: op.actor,
    ts: op.ts,
  });
  return { ...state, sheetsById: { ...state.sheetsById, [sheetId]: updated } };
}

function applyNotePin(state, op) {
  const note = state.notesById?.[op.payload?.noteId];
  if (!note) return state;
  const pin = {
    sceneId: String(op.payload?.sceneId || state.activeSceneId || ""),
    floorZ: Math.trunc(Number(op.payload?.floorZ) || 0),
    x: Number(op.payload?.x) || 0,
    y: Number(op.payload?.y) || 0,
  };
  const next = createNoteDoc({ ...note, pin, updatedAt: op.ts });
  return { ...state, notesById: { ...state.notesById, [next.id]: next } };
}

function applyNoteVisibility(state, op) {
  const note = state.notesById?.[op.payload?.noteId];
  if (!note) return state;
  const visibility = ["shared", "gm_only", "player_private"].includes(op.payload?.visibility)
    ? op.payload.visibility
    : note.visibility || "shared";
  const next = createNoteDoc({ ...note, visibility, folder: op.payload?.folder || note.folder, updatedAt: op.ts });
  return { ...state, notesById: { ...state.notesById, [next.id]: next } };
}

/** @type {Record<string, (state: object, op: object) => object>} */
export const CAMPAIGN_OP_HANDLERS = {
  CALENDAR_SET: applyCalendarSet,
  CALENDAR_ADVANCE: applyCalendarAdvance,
  INVENTORY_MUTATE: applyInventoryOp,
  CURRENCY_DELTA: applyCurrencyOp,
  LEVEL_UP_APPLY: applyLevelUpOp,
  NOTE_PIN: applyNotePin,
  NOTE_VISIBILITY: applyNoteVisibility,
};

/**
 * Autorização de ops E4 para jogadores (calendário e pin só GM).
 * @param {object} state Estado.
 * @param {object} op Operação.
 * @param {boolean} isGm Se ator é GM.
 * @returns {boolean}
 */
export function isPlayerAuthorizedForCampaignOp(state, op, isGm) {
  if (isGm) return true;
  const gmOnly = new Set(["CALENDAR_SET", "CALENDAR_ADVANCE", "NOTE_PIN", "NOTE_VISIBILITY"]);
  if (gmOnly.has(op.type)) return false;
  if (op.type === "INVENTORY_MUTATE" || op.type === "CURRENCY_DELTA" || op.type === "LEVEL_UP_APPLY") {
    const sheetId = op.payload?.sheetId || state.activeSheetId;
    const sheet = state.sheetsById?.[sheetId];
    return Boolean(sheet && isSheetOwner(state, sheetId, op.actor));
  }
  return false;
}