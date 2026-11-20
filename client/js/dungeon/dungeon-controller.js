/**
 * @file Controlador unificado das 4 telas segregadas do AI Social Dungeon + Mesa Soberana (E1 + E2).
 */
import {
  getDungeonSession,
  updateFavoriteSlider,
  simulatePillarFailover,
  performFairD20Roll,
  submitTableAction,
  movePlayerOnGrid,
  applySheetResourceDelta,
  attestLoreNodeInState,
  triggerShamirVaultUnlock,
  inspectPeerPromptForRole,
} from "./dungeon-state.js";
import { attachVttPlayerJoin } from "./dungeon-vtt-join.js";
import {
  addCustomSheetAction,
  bootstrapDungeonPersistence,
  createAndSelectCampaign,
  deleteSavedCampaign,
  exportCampaignBackup,
  importCampaignFile,
  openSavedCampaign,
  persistD20RollIfActive,
  persistSheetDeltaIfActive,
  persistTableTurnIfActive,
  recordAbilityRoll,
  recordFormulaRoll,
  recordSheetActionRoll,
  advanceCampaignCalendar,
  applySheetLevelUp,
  loadDungeonPrefs,
  mutateSheetInventory,
  saveDungeonPrefs,
} from "./dungeon-persistence.js";
import {
  addTokenToScene,
  generateTableInvite,
  mountSceneCanvas,
  removeTokenFromScene,
  toggleSceneGridType,
  toggleTokenLayerInScene,
  uploadSceneMapBlob,
} from "./dungeon-scene-actions.js";
import {
  addFloorToScene,
  advanceInitiativeTurn,
  clearSceneAoes,
  clearSceneDrawings,
  commitAoeTemplate,
  commitDrawingStroke,
  moveTokenToFloor,
  resetFogInScene,
  resetInitiativeTracker,
  revealFogRectInScene,
  rollInitiativeForScene,
  selectSceneFloor,
  toggleConditionOnToken,
  toggleDoorInScene,
  toggleFogEnabled,
} from "./dungeon-tactics-actions.js";
import { clampZoom } from "./vtt-geometry.js";
import { renderDungeonChrome } from "./dungeon-chrome.js";
import { ensureDungeonLayoutStyles } from "./dungeon-layout-style.js";
import { renderCampScreen, refreshFavoriteSlider } from "./screen-camp.js";
import { renderTableScreen } from "./screen-table.js";
import { renderSheetScreen } from "./screen-sheet.js";
import { renderDmScreen } from "./screen-dm.js";

const SCREEN_RENDERERS = {
  acampamento: renderCampScreen,
  mesa: renderTableScreen,
  ficha: renderSheetScreen,
  mestre: renderDmScreen,
};

const SLASH_ROLL_RE = /^\/(gmroll|gm|blindroll|blind|roll|r)\b/i;
const SUBMIT_FORMS = new Set(["action-form", "create-campaign-form", "roll-formula-form", "add-action-form", "add-token-form", "add-item-form"]);
const DICE3D_PREFS = loadDungeonPrefs();
const CANVAS_DETACHERS = new WeakMap();

function openVaultIfTriggered(state) {
  return state.vaultSecret?.triggerMet && !state.vaultSecret.unlocked ? triggerShamirVaultUnlock(state) : state;
}

function rollD20AndPersist(state, opts) {
  performFairD20Roll(state);
  const vaultStep = openVaultIfTriggered(state);
  if (!state.campaignId) return vaultStep;
  return Promise.resolve(vaultStep).then(() => persistD20RollIfActive(state, state.lastRoll.value, opts.store));
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
  state.camera = mult === 0 ? { panX: 0, panY: 0, zoom: 1 } : { ...cam, zoom: clampZoom(cam.zoom * mult) };
}

const ACTION_HANDLERS = {
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
  "export-voxrpg": (state, _el, c, opts) => runExportAction(state, c, "zip", opts),
  "export-chronicle-md": (state, _el, c, opts) => runExportAction(state, c, "md", opts),
  "export-voxrpg-enc": (state, _el, c, opts) => runExportAction(state, c, "enc", opts),
  "canvas-zoom-in": (state) => adjustCameraZoom(state, 1.2),
  "canvas-zoom-out": (state) => adjustCameraZoom(state, 0.84),
  "canvas-reset": (state) => adjustCameraZoom(state, 0),
  "toggle-grid-type": (state, _el, _c, opts) => toggleSceneGridType(state, { store: opts.store }),
  "toggle-viewer-role": (state) => {
    state.viewerRole = state.viewerRole === "gm" ? "player" : "gm";
    state.mapNotice = "";
  },
  "select-token": (state, el) => { state.selectedTokenId = el.dataset.tokenId || ""; },
  "toggle-token-layer": (state, el, _c, opts) => toggleTokenLayerInScene(state, el.dataset.tokenId, { store: opts.store }),
  "remove-token": (state, el, _c, opts) => removeTokenFromScene(state, el.dataset.tokenId, { store: opts.store }),
  "generate-invite": (state, _el, _c, opts) => generateTableInvite(state, { store: opts.store }),
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
  "level-up": (state, _el, _c, opts) => applySheetLevelUp(state, opts.store),
  "toggle-dice3d": (state) => {
    state.dice3dEnabled = !state.dice3dEnabled;
    saveDungeonPrefs({ dice3d: state.dice3dEnabled });
  },
};

function handleChipClick(rootEl, el) {
  const input = rootEl.querySelector("#dungeon-action-input");
  if (!input) return false;
  input.value = el.dataset.text || "";
  input.focus?.();
  return false;
}

/**
 * Renderiza qualquer uma das 4 telas isoladas do AI Social Dungeon dentro da moldura `.dungeon-sanctum`.
 *
 * @param {object} [opts={}] Parâmetros da sub-tela (`screen`, `tableId`, `charId`, `state`).
 * @returns {string} HTML completo pronto para montagem no DOM.
 */
export function renderDungeonView(opts = {}) {
  const activeTab = SCREEN_RENDERERS[opts.screen] ? opts.screen : "acampamento";
  const state = opts.state || getDungeonSession();
  if (opts.tableId) state.tableId = opts.tableId;
  if (opts.charId) state.sheet.char_id = opts.charId;
  const renderer = SCREEN_RENDERERS[activeTab];
  return renderDungeonChrome({
    activeTab,
    tableId: state.tableId,
    charId: state.sheet.char_id,
    guardiansOnline: state.leases.length,
    viewerRole: state.viewerRole || "player",
    bodyHtml: renderer(state),
  });
}

function bindActiveCanvas(container, opts) {
  CANVAS_DETACHERS.get(container)?.();
  const state = opts.state || getDungeonSession();
  const storeOpts = { store: opts.store };
  const detach = mountSceneCanvas(container, state, {
    store: opts.store,
    onStateMutated: () => redrawContainer(container, opts),
    onDoorToggle: (doorId) => toggleDoorInScene(state, doorId, storeOpts),
    onDrawingCommit: (pts) => commitDrawingStroke(state, pts, storeOpts),
    onFogReveal: (rect) => revealFogRectInScene(state, rect, storeOpts),
    onAoeCommit: (aoe) => commitAoeTemplate(state, aoe, storeOpts),
  });
  CANVAS_DETACHERS.set(container, detach);
}

function redrawContainer(container, opts) {
  container.innerHTML = renderDungeonView(opts);
  bindActiveCanvas(container, opts);
}

function settleAndRedraw(promise, container, viewOpts, focusSelector = "") {
  if (!promise || typeof promise.then !== "function") return undefined;
  return promise
    .catch((err) => {
      const state = viewOpts.state || getDungeonSession();
      state.campaignNotice = err?.message || "Erro na operação local.";
    })
    .finally(() => {
      redrawContainer(container, viewOpts);
      if (focusSelector) container.querySelector(focusSelector)?.focus?.();
    });
}

function handleActionFormSubmit(container, viewOpts, form) {
  const input = form.querySelector("#dungeon-action-input");
  const cleanText = String(input?.value || "").trim();
  if (!cleanText) return undefined;
  const state = viewOpts.state || getDungeonSession();
  if (SLASH_ROLL_RE.test(cleanText)) {
    const job = recordFormulaRoll(state, cleanText, { store: viewOpts.store }).then((res) => {
      maybeShowDice3d(container, res, state.dice3dEnabled ?? DICE3D_PREFS.dice3d);
      return res;
    });
    return settleAndRedraw(job, container, viewOpts, "#dungeon-action-input");
  }
  const prevChronicleLen = state.chronicle.length;
  const prevLedgerLen = state.sheet?.delta_ledger?.length || 0;
  submitTableAction(state, cleanText);
  redrawContainer(container, viewOpts);
  container.querySelector("#dungeon-action-input")?.focus?.();
  if (!state.campaignId) return undefined;
  const addedEntries = state.chronicle.slice(prevChronicleLen);
  const addedDeltas = (state.sheet?.delta_ledger || []).slice(prevLedgerLen);
  return settleAndRedraw(persistTableTurnIfActive(state, addedEntries, addedDeltas, viewOpts.store), container, viewOpts);
}

async function maybeShowDice3d(container, rollResult, enabled) {
  if (!enabled || !rollResult?.ok) return;
  try {
    const mod = await import("./dice-3d.js");
    mod.mountDice3dOverlay(container.querySelector("#dungeon-main") || container, rollResult);
  } catch {
    /* overlay opcional */
  }
}

function handleAddItemSubmit(container, viewOpts, form) {
  const state = viewOpts.state || getDungeonSession();
  const label = String(form.querySelector("[name=itemLabel]")?.value || "").trim();
  if (!label) return undefined;
  const job = mutateSheetInventory(state, "add", { label, qty: 1, weightLb: 1 }, viewOpts.store);
  return settleAndRedraw(job, container, viewOpts);
}

function handleAddActionSubmit(container, viewOpts, form) {
  const state = viewOpts.state || getDungeonSession();
  const label = String(form.querySelector("#dungeon-action-label")?.value || "").trim();
  const roll = String(form.querySelector("#dungeon-action-formula")?.value || "").trim();
  const damage = String(form.querySelector("#dungeon-action-damage")?.value || "").trim();
  return settleAndRedraw(addCustomSheetAction(state, { label, roll, damage }, { store: viewOpts.store }), container, viewOpts);
}

function handleAddTokenSubmit(container, viewOpts, form) {
  const state = viewOpts.state || getDungeonSession();
  const name = String(form.querySelector("#dungeon-token-name")?.value || "").trim();
  const layer = String(form.querySelector("#dungeon-token-layer")?.value || "player");
  return name ? settleAndRedraw(addTokenToScene(state, { name, layer }, { store: viewOpts.store }), container, viewOpts) : undefined;
}

const SUBMIT_ROUTES = {
  "action-form": (c, v, f) => handleActionFormSubmit(c, v, f),
  "add-action-form": (c, v, f) => handleAddActionSubmit(c, v, f),
  "add-item-form": (c, v, f) => handleAddItemSubmit(c, v, f),
  "add-token-form": (c, v, f) => handleAddTokenSubmit(c, v, f),
};

function submitCreateCampaign(container, viewOpts, form) {
  const name = String(form.querySelector("#dungeon-campaign-name")?.value || "").trim();
  if (!name) return undefined;
  const state = viewOpts.state || getDungeonSession();
  return settleAndRedraw(createAndSelectCampaign(state, name, { store: viewOpts.store }), container, viewOpts);
}

function submitRollFormula(container, viewOpts, form) {
  const formula = String(form.querySelector("#dungeon-roll-input")?.value || "").trim();
  if (!formula) return undefined;
  const state = viewOpts.state || getDungeonSession();
  const job = recordFormulaRoll(state, formula, { store: viewOpts.store }).then((res) => {
    maybeShowDice3d(container, res, state.dice3dEnabled ?? DICE3D_PREFS.dice3d);
    return res;
  });
  return settleAndRedraw(job, container, viewOpts, "#dungeon-roll-input");
}

function handleDungeonSubmit(container, viewOpts, ev) {
  const form = ev.target;
  const kind = form?.dataset?.dungeon;
  if (!SUBMIT_FORMS.has(kind)) return undefined;
  ev.preventDefault();
  if (SUBMIT_ROUTES[kind]) return SUBMIT_ROUTES[kind](container, viewOpts, form);
  if (kind === "create-campaign-form") return submitCreateCampaign(container, viewOpts, form);
  if (kind === "roll-formula-form") return submitRollFormula(container, viewOpts, form);
  return undefined;
}

async function readUploadedBytes(file) {
  if (file?.bytes instanceof Uint8Array) return file.bytes;
  if (typeof file?.arrayBuffer === "function") return new Uint8Array(await file.arrayBuffer());
  return new TextEncoder().encode(String(file?.text || ""));
}

function handleDungeonChange(container, viewOpts, ev) {
  const target = ev.target;
  const kind = target?.dataset?.dungeon;
  const file = target?.files?.[0];
  if (!file || (kind !== "import-file" && kind !== "upload-map")) return undefined;
  const state = viewOpts.state || getDungeonSession();
  if (kind === "upload-map") {
    const job = readUploadedBytes(file).then((bytes) => uploadSceneMapBlob(state, { bytes, mime: file.type }, { store: viewOpts.store }));
    return settleAndRedraw(job, container, viewOpts);
  }
  const passphrase = container.querySelector("#dungeon-backup-passphrase")?.value || "";
  const job = readUploadedBytes(file).then((bytes) => importCampaignFile(state, { name: file.name, bytes }, { passphrase, store: viewOpts.store }));
  return settleAndRedraw(job, container, viewOpts);
}

function handleDungeonClick(container, viewOpts, ev) {
  const target = ev.target?.closest?.("[data-dungeon]");
  if (!target) return undefined;
  const action = target.dataset.dungeon;
  if (action === "chip") return handleChipClick(container, target);
  const handler = ACTION_HANDLERS[action];
  if (!handler) return undefined;
  const result = handler(viewOpts.state || getDungeonSession(), target, container, viewOpts);
  redrawContainer(container, viewOpts);
  return settleAndRedraw(result, container, viewOpts);
}

function hydrateP2pJoin(container, viewOpts) {
  if (!viewOpts.joinP2p) return false;
  const state = viewOpts.state || getDungeonSession();
  const hash = typeof location !== "undefined" ? location.hash : "";
  const job = attachVttPlayerJoin(state, hash, {
    store: viewOpts.store,
    onCampaign: () => redrawContainer(container, viewOpts),
  });
  settleAndRedraw(job, container, viewOpts);
  return true;
}

function hydrateViewPersistence(container, viewOpts) {
  if (hydrateP2pJoin(container, viewOpts)) return;
  const state = viewOpts.state || getDungeonSession();
  const hasBackend = Boolean(viewOpts.store || typeof globalThis.indexedDB?.open === "function");
  if (!hasBackend) return;
  if (!state.persistenceReady) {
    settleAndRedraw(bootstrapDungeonPersistence(state, viewOpts.store), container, viewOpts);
    return;
  }
  if (viewOpts.tableId && viewOpts.tableId !== state.campaignId && state.campaigns?.some((c) => c.id === viewOpts.tableId)) {
    settleAndRedraw(openSavedCampaign(state, viewOpts.tableId, viewOpts.store), container, viewOpts);
  }
}

/**
 * Conecta delegação de eventos interativos das 4 telas no contêiner montado, monta o canvas 2D e hidrata a persistência local.
 *
 * @param {HTMLElement} container Elemento raiz onde a UI do Dungeon está montada.
 * @param {object} [opts={}] Opções da sub-tela (`screen`, `tableId`, `charId`, `state`, `store`, `onDownload`).
 * @returns {void} Sem valor de retorno.
 */
export function wireDungeonView(container, opts = {}) {
  if (!container || container.dataset.dungeonWired === "1") return;
  const layoutDoc = container.ownerDocument;
  if (layoutDoc) ensureDungeonLayoutStyles(layoutDoc);
  else if (typeof document !== "undefined") ensureDungeonLayoutStyles(document);
  container.dataset.dungeonWired = "1";
  const viewOpts = { ...opts };
  container.addEventListener("click", (ev) => handleDungeonClick(container, viewOpts, ev));
  container.addEventListener("input", (ev) => {
    const target = ev.target;
    if (target?.dataset?.dungeon !== "slider-fav") return;
    const state = viewOpts.state || getDungeonSession();
    updateFavoriteSlider(state, target.value);
    refreshFavoriteSlider(container, state);
  });
  container.addEventListener("submit", (ev) => handleDungeonSubmit(container, viewOpts, ev));
  container.addEventListener("change", (ev) => handleDungeonChange(container, viewOpts, ev));
  bindActiveCanvas(container, viewOpts);
  hydrateViewPersistence(container, viewOpts);
}
