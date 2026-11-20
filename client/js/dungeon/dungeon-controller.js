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
import { clampZoom } from "./vtt-geometry.js";
import { renderDungeonChrome } from "./dungeon-chrome.js";
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
const SUBMIT_FORMS = new Set(["action-form", "create-campaign-form", "roll-formula-form", "add-action-form", "add-token-form"]);
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
    bodyHtml: renderer(state),
  });
}

function bindActiveCanvas(container, opts) {
  CANVAS_DETACHERS.get(container)?.();
  const state = opts.state || getDungeonSession();
  const detach = mountSceneCanvas(container, state, {
    store: opts.store,
    onStateMutated: () => redrawContainer(container, opts),
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
    return settleAndRedraw(recordFormulaRoll(state, cleanText, { store: viewOpts.store }), container, viewOpts, "#dungeon-action-input");
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

function handleDungeonSubmit(container, viewOpts, ev) {
  const form = ev.target;
  const kind = form?.dataset?.dungeon;
  if (!SUBMIT_FORMS.has(kind)) return undefined;
  ev.preventDefault();
  if (kind === "action-form") return handleActionFormSubmit(container, viewOpts, form);
  if (kind === "add-action-form") return handleAddActionSubmit(container, viewOpts, form);
  if (kind === "add-token-form") return handleAddTokenSubmit(container, viewOpts, form);
  const state = viewOpts.state || getDungeonSession();
  if (kind === "create-campaign-form") {
    const name = String(form.querySelector("#dungeon-campaign-name")?.value || "").trim();
    return name ? settleAndRedraw(createAndSelectCampaign(state, name, { store: viewOpts.store }), container, viewOpts) : undefined;
  }
  const formula = String(form.querySelector("#dungeon-roll-input")?.value || "").trim();
  return formula ? settleAndRedraw(recordFormulaRoll(state, formula, { store: viewOpts.store }), container, viewOpts, "#dungeon-roll-input") : undefined;
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

function hydrateViewPersistence(container, viewOpts) {
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
