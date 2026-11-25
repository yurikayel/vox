/**
 * @file Tabelas de despacho de ações (cliques e formulários) do controlador da Mesa Soberana.
 * @module dungeon/dungeon-controller-actions
 */
import { copyInviteLinkToClipboard } from "./dungeon-dom-focus.js";
import {
  addCustomSheetAction,
  advanceCampaignCalendar,
  applySheetLevelUp,
  createAndSelectCampaign,
  deleteSavedCampaign,
  exportCampaignBackup,
  mutateSheetInventory,
  openSavedCampaign,
  persistD20RollIfActive,
  persistSheetDeltaIfActive,
  persistTableTurnIfActive,
  pinNoteToScene,
  recordAbilityRoll,
  recordFormulaRoll,
  recordSheetActionRoll,
  removeCustomSheetAction,
  saveDungeonPrefs,
  updateNoteVisibility,
  updateSheetBasicInfo,
} from "./dungeon-persistence.js";
import { validateSheetEdit } from "./sheet-edit-validate.js";
import {
  addDoorToScene,
  addTokenToScene,
  computeFitCamera,
  generateTableInvite,
  getActiveScene,
  nudgeTokenInScene,
  removeTokenFromScene,
  toggleSceneGridType,
  toggleTokenLayerInScene,
  updateTokenPropsInScene,
} from "./dungeon-scene-actions.js";
import {
  applySheetResourceDelta,
  attestLoreNodeInState,
  inspectPeerPromptForRole,
  movePlayerOnGrid,
  performFairD20Roll,
  simulatePillarFailover,
  submitTableAction,
  triggerShamirVaultUnlock,
} from "./dungeon-state.js";
import {
  addFloorToScene,
  advanceInitiativeTurn,
  clearSceneAoes,
  clearSceneDrawings,
  moveTokenToFloor,
  resetFogInScene,
  resetInitiativeTracker,
  rollInitiativeForScene,
  selectSceneFloor,
  toggleConditionOnToken,
  toggleFogEnabled,
} from "./dungeon-tactics-actions.js";
import { clampZoom } from "./vtt-geometry.js";

const SLASH_ROLL_RE = /^\/(gmroll|gm|blindroll|blind|roll|r)\b/i;

/** Ações de clique que disparam overlay 3D após o redesenho quando habilitado. */
export const DICE3D_CLICK_ACTIONS = new Set(["roll-d20", "roll-quick", "roll-ability", "roll-action"]);

/** Formulários interceptados pelo controlador da Mesa. */
export const SUBMIT_FORMS = new Set([
  "action-form",
  "create-campaign-form",
  "roll-formula-form",
  "add-action-form",
  "add-token-form",
  "add-item-form",
  "edit-token-form",
  "add-door-form",
  "edit-sheet-form",
]);

function openVaultIfTriggered(state) {
  return state.vaultSecret?.triggerMet && !state.vaultSecret.unlocked ? triggerShamirVaultUnlock(state) : state;
}

function buildD20OverlayPayload(value) {
  return {
    ok: true,
    total: value,
    label: "Bandeja D20",
    rolls: [{ sides: 20, value, kept: true }],
    crits: value === 20 ? 1 : 0,
    fumbles: value === 1 ? 1 : 0,
  };
}

function rollD20AndPersist(state, opts) {
  performFairD20Roll(state);
  const vaultStep = openVaultIfTriggered(state);
  const payload = buildD20OverlayPayload(state.lastRoll.value);
  if (!state.campaignId && !state.syncPeer) return Promise.resolve(vaultStep).then(() => payload);
  return Promise.resolve(vaultStep)
    .then(() => persistD20RollIfActive(state, state.lastRoll.value, opts.store))
    .then(() => payload);
}

function triggerBrowserDownload(artifact, onDownload) {
  if (typeof onDownload === "function") return onDownload(artifact);
  if (typeof document === "undefined" || typeof URL?.createObjectURL !== "function") return undefined;
  const blob = new Blob([artifact.bytes], { type: artifact.mime });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = artifact.filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1500);
  return undefined;
}

async function runExportAction(state, container, format, opts) {
  try {
    const passphrase = container.querySelector("#dungeon-backup-passphrase")?.value || "";
    const artifact = await exportCampaignBackup(state, { format, passphrase, store: opts.store });
    triggerBrowserDownload(artifact, opts.onDownload);
    state.campaignNotice = `Backup gerado: ${artifact.filename}.`;
  } catch (err) {
    state.campaignNotice = err?.message || "Não foi possível exportar o backup.";
  }
}

function deltaAndPersist(state, poolKey, delta, reason, opts) {
  applySheetResourceDelta(state, poolKey, delta, reason);
  return persistSheetDeltaIfActive(state, poolKey, delta, reason, opts.store);
}

function adjustCameraZoom(state, mult) {
  const cam = state.camera || { panX: 0, panY: 0, zoom: 1 };
  state._cameraTouched = true;
  state.camera = mult === 0 ? { panX: 0, panY: 0, zoom: 1 } : { ...cam, zoom: clampZoom(cam.zoom * mult) };
}

function fitCameraToCanvas(state, container) {
  const canvas = container?.querySelector?.("#dungeon-vtt-canvas");
  const scene = getActiveScene(state);
  const floor = scene.floors.find((f) => f.z === scene.activeFloorZ) || scene.floors[0];
  state._cameraTouched = true;
  state.camera = computeFitCamera(canvas, floor);
}

function toggleViewerRoleSafe(state) {
  if (state.joinMode === "p2p_player") return;
  state.viewerRole = state.viewerRole === "gm" ? "player" : "gm";
  state.mapNotice = "";
  saveDungeonPrefs({ viewerRole: state.viewerRole });
}

/** Mapa de handlers de clique `data-dungeon="..."`. */
export const ACTION_HANDLERS = {
  failover: (state) => simulatePillarFailover(state),
  "roll-d20": (state, _el, _c, opts) => rollD20AndPersist(state, opts),
  "grid-cell": (state, el) => openVaultIfTriggered(movePlayerOnGrid(state, el.dataset.x, el.dataset.y)),
  "hp-minus": (state, _el, _c, opts) => deltaAndPersist(state, "hp_current", -1, "Ajuste manual (-1 PV)", opts),
  "hp-plus": (state, _el, _c, opts) => deltaAndPersist(state, "hp_current", 1, "Ajuste manual (+1 PV)", opts),
  "spend-10": (state, _el, _c, opts) => deltaAndPersist(state, "coins", -10, "Poção de vigília", opts),
  "test-overdraft": (state, _el, _c, opts) => deltaAndPersist(state, "coins", -500, "Tentativa sem saldo", opts),
  "confirm-lore": (state, el) => attestLoreNodeInState(state, el.dataset.loreId, "CONFIRM"),
  "dispute-lore": (state, el) => attestLoreNodeInState(state, el.dataset.loreId, "REJECT"),
  "unlock-vault": (state) => triggerShamirVaultUnlock(state),
  "inspect-role": (state, el) => inspectPeerPromptForRole(state, el.dataset.role),
  "open-campaign": (state, el, _c, opts) => openSavedCampaign(state, el.dataset.campaignId, opts.store),
  "arm-delete-campaign": (state, el) => { state.pendingDeleteId = el.dataset.campaignId || ""; },
  "cancel-delete-campaign": (state) => { state.pendingDeleteId = ""; },
  "confirm-delete-campaign": (state, el, _c, opts) => deleteSavedCampaign(state, el.dataset.campaignId, opts.store),
  "roll-mode": (state, el) => { state.rollMode = el.dataset.mode || "normal"; },
  "roll-quick": (state, el, _c, opts) => recordFormulaRoll(state, el.dataset.formula, { store: opts.store }),
  "roll-ability": (state, el, _c, opts) => recordAbilityRoll(state, el.dataset.ability, { store: opts.store }),
  "roll-action": (state, el, _c, opts) => recordSheetActionRoll(state, el.dataset.actionId, { store: opts.store }),
  "remove-action": (state, el, _c, opts) => removeCustomSheetAction(state, el.dataset.actionId, { store: opts.store }),
  "export-voxrpg": (state, _el, c, opts) => runExportAction(state, c, "zip", opts),
  "export-chronicle-md": (state, _el, c, opts) => runExportAction(state, c, "md", opts),
  "export-voxrpg-enc": (state, _el, c, opts) => runExportAction(state, c, "enc", opts),
  "canvas-zoom-in": (state) => adjustCameraZoom(state, 1.2),
  "canvas-zoom-out": (state) => adjustCameraZoom(state, 0.84),
  "canvas-reset": (state) => adjustCameraZoom(state, 0),
  "canvas-fit": (state, _el, c) => fitCameraToCanvas(state, c),
  "toggle-grid-type": (state, _el, _c, opts) => toggleSceneGridType(state, { store: opts.store }),
  "toggle-viewer-role": (state) => toggleViewerRoleSafe(state),
  "select-token": (state, el) => { state.selectedTokenId = el.dataset.tokenId || ""; },
  "nudge-token": (state, el, _c, opts) => nudgeTokenInScene(state, el.dataset.tokenId, Number(el.dataset.dx), Number(el.dataset.dy), { store: opts.store }),
  "toggle-token-layer": (state, el, _c, opts) => toggleTokenLayerInScene(state, el.dataset.tokenId, { store: opts.store }),
  "remove-token": (state, el, _c, opts) => removeTokenFromScene(state, el.dataset.tokenId, { store: opts.store }),
  "generate-invite": (state, _el, _c, opts) => generateTableInvite(state, { store: opts.store, onSyncUpdate: opts.onSyncUpdate }),
  "copy-invite": (state) => copyInviteLinkToClipboard(state),
  "select-tool": (state, el) => { state.activeTool = el.dataset.tool || "select"; },
  "toggle-fog": (state, _el, _c, opts) => toggleFogEnabled(state, { store: opts.store }),
  "reset-fog": (state, _el, _c, opts) => resetFogInScene(state, { store: opts.store }),
  "clear-drawings": (state, _el, _c, opts) => clearSceneDrawings(state, { store: opts.store }),
  "clear-aoes": (state, _el, _c, opts) => clearSceneAoes(state, { store: opts.store }),
  "add-floor": (state, _el, _c, opts) => addFloorToScene(state, "", { store: opts.store }),
  "select-floor": (state, el, _c, opts) => selectSceneFloor(state, el.dataset.floorZ, { store: opts.store }),
  "move-token-floor": (state, el, _c, opts) => moveTokenToFloor(state, el.dataset.tokenId, el.dataset.floorZ, { store: opts.store }),
  "roll-initiative": (state, _el, _c, opts) => rollInitiativeForScene(state, { store: opts.store }),
  "next-turn": (state, _el, _c, opts) => advanceInitiativeTurn(state, { store: opts.store }),
  "reset-initiative": (state, _el, _c, opts) => resetInitiativeTracker(state, { store: opts.store }),
  "toggle-condition": (state, el, _c, opts) => toggleConditionOnToken(state, el.dataset.tokenId, el.dataset.conditionId, { store: opts.store }),
  "calendar-round": (state, _el, _c, opts) => advanceCampaignCalendar(state, "round", opts.store),
  "calendar-10m": (state, _el, _c, opts) => advanceCampaignCalendar(state, "minutes_10", opts.store),
  "calendar-short-rest": (state, _el, _c, opts) => advanceCampaignCalendar(state, "short_rest", opts.store),
  "calendar-long-rest": (state, _el, _c, opts) => advanceCampaignCalendar(state, "long_rest", opts.store),
  "inv-equip": (state, el, _c, opts) => mutateSheetInventory(state, "toggle_equip", { itemId: el.dataset.itemId }, opts.store),
  "inv-remove": (state, el, _c, opts) => mutateSheetInventory(state, "remove", { itemId: el.dataset.itemId }, opts.store),
  "level-up-open": (state) => { state.levelUpOpen = true; },
  "level-up-cancel": (state) => { state.levelUpOpen = false; },
  "select-levelup-preset": (state, el) => { state.levelUpPreset = el.dataset.preset || "d20_fantasy"; },
  "level-up": (state, _el, _c, opts) => applySheetLevelUp(state, opts.store, state.levelUpPreset),
  "note-toggle-vis": (state, el, _c, opts) => updateNoteVisibility(state, el.dataset.noteId, el.dataset.nextVis || "shared", opts.store),
  "note-pin": (state, el, _c, opts) => pinNoteToScene(state, el.dataset.noteId, {}, opts.store),
  "toggle-dice3d": (state) => {
    state.dice3dEnabled = !state.dice3dEnabled;
    saveDungeonPrefs({ dice3d: state.dice3dEnabled });
  },
};

function valOf(form, sel, fallback = "") {
  return String(form?.querySelector?.(sel)?.value ?? fallback).trim();
}

function submitActionForm(state, form, ctx) {
  const cleanText = valOf(form, "#dungeon-action-input");
  if (!cleanText) return undefined;
  if (SLASH_ROLL_RE.test(cleanText)) {
    const job = recordFormulaRoll(state, cleanText, { store: ctx.viewOpts.store });
    return ctx.settle(job, { focusSelector: "#dungeon-action-input", showDice3d: true });
  }
  const prevLen = state.chronicle.length;
  const prevLedger = state.sheet?.delta_ledger?.length || 0;
  submitTableAction(state, cleanText);
  ctx.redraw("#dungeon-action-input");
  if (!state.campaignId && !state.syncPeer) return undefined;
  const addedEntries = state.chronicle.slice(prevLen);
  const addedDeltas = (state.sheet?.delta_ledger || []).slice(prevLedger);
  return ctx.settle(persistTableTurnIfActive(state, addedEntries, addedDeltas, ctx.viewOpts.store));
}

function submitEditSheet(state, form, ctx) {
  const patch = {
    name: valOf(form, "[name=sheetName]"),
    class_name: valOf(form, "[name=sheetClass]"),
    armor_class: Number(valOf(form, "[name=armorClass]")),
    system: valOf(form, "[name=sheetSystem]"),
  };
  for (const k of ["str", "dex", "con", "int", "wis", "cha"]) {
    const raw = valOf(form, `[name=${k}]`);
    if (raw) patch[k] = Number(raw);
  }
  const { ok, issues } = validateSheetEdit(patch);
  state.sheetEditIssues = issues;
  state.sheetEditDraft = ok ? null : patch;
  if (!ok) return ctx.settle(Promise.resolve());
  return ctx.settle(updateSheetBasicInfo(state, patch, { store: ctx.viewOpts.store }));
}

function submitEditToken(state, form, ctx) {
  const tokenId = form?.dataset?.tokenId || state.selectedTokenId;
  if (!tokenId) return undefined;
  const patch = {
    hpCurrent: Number(valOf(form, "[name=hpCurrent]")),
    hpMax: Number(valOf(form, "[name=hpMax]")),
    hpVisible: valOf(form, "[name=hpVisible]", "bar"),
    sizeCells: Number(valOf(form, "[name=sizeCells]", "1")),
    color: valOf(form, "[name=color]"),
  };
  return ctx.settle(updateTokenPropsInScene(state, tokenId, patch, { store: ctx.viewOpts.store }));
}

function submitAddDoor(state, form, ctx) {
  const doorSpec = {
    x1: Number(valOf(form, "[name=x1]", "3")),
    y1: Number(valOf(form, "[name=y1]", "2")),
    x2: Number(valOf(form, "[name=x2]", "3")),
    y2: Number(valOf(form, "[name=y2]", "3")),
    state: valOf(form, "[name=doorState]", "closed"),
  };
  return ctx.settle(addDoorToScene(state, doorSpec, { store: ctx.viewOpts.store }));
}

function submitAddItem(state, form, ctx) {
  const label = valOf(form, "[name=itemLabel]");
  if (!label) return undefined;
  const qty = Math.max(1, Math.trunc(Number(valOf(form, "[name=itemQty]", "1")) || 1));
  const weightLb = Math.max(0, Number(valOf(form, "[name=itemWeight]", "0.5")) || 0);
  return ctx.settle(mutateSheetInventory(state, "add", { label, qty, weightLb }, ctx.viewOpts.store));
}

const FORM_DISPATCHERS = {
  "action-form": submitActionForm,
  "edit-sheet-form": submitEditSheet,
  "edit-token-form": submitEditToken,
  "add-door-form": submitAddDoor,
  "add-item-form": submitAddItem,
  "add-action-form": (state, form, ctx) => ctx.settle(addCustomSheetAction(state, {
    label: valOf(form, "#dungeon-action-label"),
    roll: valOf(form, "#dungeon-action-formula"),
    damage: valOf(form, "#dungeon-action-damage"),
  }, { store: ctx.viewOpts.store })),
  "add-token-form": (state, form, ctx) => {
    const name = valOf(form, "#dungeon-token-name");
    const layer = valOf(form, "#dungeon-token-layer", "player");
    return name ? ctx.settle(addTokenToScene(state, { name, layer }, { store: ctx.viewOpts.store })) : undefined;
  },
  "create-campaign-form": (state, form, ctx) => {
    const name = valOf(form, "#dungeon-campaign-name");
    const system = valOf(form, "#dungeon-campaign-system", "d20_fantasy");
    return name ? ctx.settle(createAndSelectCampaign(state, name, { system, store: ctx.viewOpts.store })) : undefined;
  },
  "roll-formula-form": (state, form, ctx) => {
    const formula = valOf(form, "#dungeon-roll-input");
    if (!formula) return undefined;
    return ctx.settle(recordFormulaRoll(state, formula, { store: ctx.viewOpts.store }), { focusSelector: "#dungeon-roll-input", showDice3d: true });
  },
};

/**
 * Despacha submissão de qualquer formulário suportado nas 4 telas do Dungeon.
 * @param {string} kind Valor de `form.dataset.dungeon`.
 * @param {object} state Estado da sessão.
 * @param {HTMLFormElement|object} form Formulário submetido.
 * @param {{ viewOpts: object, redraw: (focus?: string) => void, settle: (p: Promise<any>, o?: object) => any }} ctx Contexto de redraw.
 * @returns {Promise<any>|undefined} Promessa de liquidação ou `undefined`.
 */
export function dispatchDungeonFormSubmit(kind, state, form, ctx) {
  const fn = FORM_DISPATCHERS[kind];
  return fn ? fn(state, form, ctx) : undefined;
}
