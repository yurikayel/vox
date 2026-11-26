/**
 * @file Controlador unificado das 4 telas segregadas do AI Social Dungeon + Mesa Soberana (E1–E5).
 */
import { renderDungeonChrome } from "./dungeon-chrome.js";
import {
  ACTION_HANDLERS,
  DICE3D_CLICK_ACTIONS,
  FOCUS_AFTER_ACTION,
  FILE_CHANGE_ACTIONS,
  dispatchDungeonFormSubmit,
  SUBMIT_FORMS,
} from "./dungeon-controller-actions.js";
import {
  captureUiViewState,
  restoreUiViewState,
  showDice3dAfterRedraw,
} from "./dungeon-dom-focus.js";
import { ensureDungeonLayoutStyles } from "./dungeon-layout-style.js";
import {
  bootstrapDungeonPersistence,
  hasStoredDungeonPrefs,
  importCampaignFile,
  loadDungeonPrefs,
  openSavedCampaign,
} from "./dungeon-persistence.js";
import {
  mountSceneCanvas,
  nudgeTokenInScene,
  uploadSceneMapBlob,
} from "./dungeon-scene-actions.js";
import { getDungeonSession, updateFavoriteSlider } from "./dungeon-state.js";
import {
  commitAoeTemplate,
  commitDrawingStroke,
  revealFogRectInScene,
  toggleDoorInScene,
} from "./dungeon-tactics-actions.js";
import { attachVttPlayerJoin, joinFailureRollMessage } from "./dungeon-vtt-join.js";
import { hudPanelKeyJob, isHudPanelKey, takeHudPanelFocus } from "./hud-panels.js";
import { refreshFavoriteSlider, renderCampScreen } from "./screen-camp.js";
import { renderDmScreen } from "./screen-dm.js";
import { renderSheetScreen } from "./screen-sheet.js";
import { renderTableScreen } from "./screen-table.js";
import { refreshFairplaySeals } from "./vtt-fairplay-selo.js";
import { getDefaultVttStore } from "./vtt-store.js";

const SCREEN_RENDERERS = {
  acampamento: renderCampScreen,
  mesa: renderTableScreen,
  ficha: renderSheetScreen,
  mestre: renderDmScreen,
};

const ARROW_DELTAS = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

const DICE3D_PREFS = loadDungeonPrefs();
const CANVAS_DETACHERS = new WeakMap();

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

/** Overlay Diorama vivo por container (o `innerHTML` do redesenho apaga o DOM, não o overlay). */
const DIORAMA_OVERLAYS = new WeakMap();

function activeFloor(state) {
  const scene = state.campaignDoc?.scenesById?.[state.campaignDoc?.activeSceneId];
  return scene?.floors?.find((f) => f.z === scene.activeFloorZ) || scene?.floors?.[0];
}

/** Cena que o overlay precisa: papel, tokens do mapa e seleção atuais. */
function dioramaScene(state) {
  const scene = state.campaignDoc?.scenesById?.[state.campaignDoc?.activeSceneId];
  return { role: state.viewerRole, tokens: scene?.tokens || [], selectedId: state.selectedTokenId || "" };
}

function rebindDioramaOverlay(container, state) {
  const canvas = container.querySelector("#dungeon-vtt-canvas");
  const floor = activeFloor(state);
  if (canvas && floor) DIORAMA_OVERLAYS.get(container)?.rebind(canvas, floor, dioramaScene(state));
}

/** Clique na lente 3D = a mesma ação do 2D: token seleciona, porta alterna. */
function handleDioramaPick(container, viewOpts, hit) {
  const state = viewOpts.state || getDungeonSession();
  if (hit.kind === "token") {
    state.selectedTokenId = hit.tokenId;
    return redrawContainer(container, viewOpts);
  }
  if (hit.kind === "portal") {
    state.campaignNotice = `Portal: ${hit.label || "passagem"}`;
    return redrawContainer(container, viewOpts);
  }
  return settleAndRedraw(toggleDoorInScene(state, hit.doorId, { store: viewOpts.store }), container, viewOpts);
}

function redrawContainer(container, opts, focusOverride = "", preserveDraft = false) {
  const snap = captureUiViewState(container);
  const state = opts.state || getDungeonSession();
  DIORAMA_OVERLAYS.get(container)?.detach();
  container.innerHTML = renderDungeonView(opts);
  bindActiveCanvas(container, opts);
  rebindDioramaOverlay(container, state);
  restoreUiViewState(container, snap, focusOverride || takeHudPanelFocus(state), preserveDraft);
  refreshSealsAfterDraw(container, opts);
}

function refreshSealsAfterDraw(container, opts) {
  const state = opts.state || getDungeonSession();
  refreshFairplaySeals(state)
    .then((changed) => { if (changed && container.isConnected) redrawContainer(container, opts, "", true); })
    .catch(() => {});
}

function settleAndRedraw(promise, container, viewOpts, extra = {}) {
  if (!promise || typeof promise.then !== "function") return undefined;
  const state = viewOpts.state || getDungeonSession();
  let settledVal = null;
  return promise
    .then((val) => { settledVal = val; return val; })
    .catch((err) => { state.campaignNotice = err?.message || "Erro na operação local."; })
    .finally(() => {
      redrawContainer(container, viewOpts, extra.focusSelector || "");
      if (extra.showDice3d) {
        showDice3dAfterRedraw(container, settledVal, state.dice3dEnabled ?? DICE3D_PREFS.dice3d);
      }
    });
}

function handleChipClick(rootEl, el) {
  const input = rootEl.querySelector("#dungeon-action-input");
  if (!input) return false;
  input.value = el.dataset.text || "";
  input.focus?.();
  return false;
}

function handleDungeonSubmit(container, viewOpts, ev) {
  const form = ev.target;
  const kind = form?.dataset?.dungeon;
  if (!SUBMIT_FORMS.has(kind)) return undefined;
  ev.preventDefault();
  const state = viewOpts.state || getDungeonSession();
  return dispatchDungeonFormSubmit(kind, state, form, {
    viewOpts,
    redraw: (focusSel) => redrawContainer(container, viewOpts, focusSel),
    settle: (job, extra) => settleAndRedraw(job, container, viewOpts, extra),
  });
}

async function readUploadedBytes(file) {
  if (file?.bytes instanceof Uint8Array) return file.bytes;
  if (typeof file?.arrayBuffer === "function") return new Uint8Array(await file.arrayBuffer());
  return new TextEncoder().encode(String(file?.text || ""));
}

/** Importa um `.voxchar`: confere o tamanho antes de ler, carrega o módulo só agora e mostra os motivos da recusa no painel Editar. */
async function importVoxcharFile(state, file, viewOpts) {
  const { VOXCHAR_MAX_BYTES } = await import("./voxchar-check.js");
  const fail = (issues) => { state.sheetEditIssues = issues.map((message) => ({ field: "voxchar", message })); };
  if (file.size > VOXCHAR_MAX_BYTES) return fail([`Arquivo grande demais (${file.size} bytes; o limite é ${VOXCHAR_MAX_BYTES}).`]);
  const { importVoxchar } = await import("./voxchar.js");
  const out = await importVoxchar(state, { bytes: await readUploadedBytes(file) }, { store: viewOpts.store });
  state.sheetEditIssues = [];
  if (!out.ok) fail(out.issues);
  return undefined;
}

function handleDungeonChange(container, viewOpts, ev) {
  const target = ev.target;
  const kind = target?.dataset?.dungeon;
  const file = target?.files?.[0];
  if (!file || (kind !== "import-file" && kind !== "upload-map" && !FILE_CHANGE_ACTIONS.has(kind))) return undefined;
  const state = viewOpts.state || getDungeonSession();
  if (kind === "wizard-import") return settleAndRedraw(import("./sheet-wizard-actions.js").then((m) => m.importInWizard(state, file, { store: viewOpts.store })), container, viewOpts, { focusSelector: "[data-wizard-focus]" });
  if (kind === "import-voxchar") return settleAndRedraw(importVoxcharFile(state, file, viewOpts), container, viewOpts);
  if (kind === "upload-map") {
    const job = readUploadedBytes(file).then((bytes) => uploadSceneMapBlob(state, { bytes, mime: file.type }, { store: viewOpts.store }));
    return settleAndRedraw(job, container, viewOpts);
  }
  const passphrase = container.querySelector("#dungeon-backup-passphrase")?.value || "";
  const job = readUploadedBytes(file).then((bytes) => importCampaignFile(state, { name: file.name, bytes }, { passphrase, store: viewOpts.store }));
  return settleAndRedraw(job, container, viewOpts);
}

/** Carrega a imagem do mapa e os avatares em segundo plano e entrega ao overlay (falha = fica sem textura). */
function loadDioramaTextures(mod, overlay, floor, tokens, viewOpts) {
  const store = viewOpts.store || getDefaultVttStore();
  const io = { getBlob: (hash) => store.getBlob(hash), decode: (bytes) => globalThis.createImageBitmap(new Blob([bytes])) };
  mod.loadDioramaImages({ floor, tokens }, io).then((images) => overlay.setImages(images)).catch(() => {});
}

function syncDioramaOverlay(mod, container, state, viewOpts, extras = null) {
  const overlay = DIORAMA_OVERLAYS.get(container);
  if (state.dioramaMode === "2d") { overlay?.destroy(); DIORAMA_OVERLAYS.delete(container); return; }
  const canvas = container.querySelector("#dungeon-vtt-canvas");
  const floor = activeFloor(state);
  if (!canvas || !floor) return;
  if (overlay) { overlay.rebind(canvas, floor, dioramaScene(state)); overlay.setMode(state.dioramaMode); return; }
  const scene = dioramaScene(state);
  const created = mod.attachDioramaOverlay(canvas, floor, {
    extras,
    mode: state.dioramaMode,
    viewerRole: scene.role,
    tokens: scene.tokens,
    selectedId: scene.selectedId,
    onPick: (hit) => handleDioramaPick(container, viewOpts, hit),
    onFallback2d: (msg) => { state.dioramaMode = "2d"; state.campaignNotice = msg; },
  });
  DIORAMA_OVERLAYS.set(container, created);
  created.draw();
  loadDioramaTextures(mod, created, floor, scene.tokens, viewOpts);
}

function handleDioramaModeClick(container, viewOpts, target) {
  const state = viewOpts.state || getDungeonSession();
  const nextMode = target.dataset.mode || "2d";
  const job = import("./diorama/diorama-view.js").then(async (mod) => {
    const extras = nextMode === "2d" ? null : await (await import("./diorama/diorama-extras.js")).loadDioramaExtras();
    state.dioramaMode = mod.saveDioramaMode(nextMode);
    syncDioramaOverlay(mod, container, state, viewOpts, extras);
  });
  return settleAndRedraw(job, container, viewOpts);
}

function handleDungeonClick(container, viewOpts, ev) {
  const target = ev.target?.closest?.("[data-dungeon]");
  if (!target) return undefined;
  const action = target.dataset.dungeon;
  if (action === "chip") return handleChipClick(container, target);
  if (action === "diorama-mode") return handleDioramaModeClick(container, viewOpts, target);
  const handler = ACTION_HANDLERS[action];
  if (!handler) return undefined;
  const state = viewOpts.state || getDungeonSession();
  const optsWithSync = { ...viewOpts, onSyncUpdate: () => redrawContainer(container, viewOpts) };
  const result = handler(state, target, container, optsWithSync);
  redrawContainer(container, viewOpts);
  return settleAndRedraw(result, container, viewOpts, { showDice3d: DICE3D_CLICK_ACTIONS.has(action), focusSelector: FOCUS_AFTER_ACTION[action] });
}

/**
 * Esc no assistente de criar ficha pede a confirmação de descarte (o mesmo que Cancelar); com a confirmação já aberta, não faz nada.
 * @param {object} state Estado da sessão.
 * @param {HTMLElement} container Raiz da tela.
 * @param {{key?: string, preventDefault?: Function}} ev Evento de teclado.
 * @returns {Promise<void>|undefined} Tarefa da ação, ou `undefined` se o evento não se aplica.
 */
export function escapeWizardJob(state, container, ev) {
  if (ev?.key !== "Escape" || !state.sheetWizard || state.sheetWizard.confirmCancel) return undefined;
  ev.preventDefault?.();
  return ACTION_HANDLERS["wizard-cancel"](state, null, container, {});
}

function handleWizardEscape(container, viewOpts, ev, settle = settleAndRedraw) {
  const state = viewOpts.state || getDungeonSession();
  const job = escapeWizardJob(state, container, ev) || hudPanelKeyJob(state, ev);
  return job && settle(job, container, viewOpts, { focusSelector: state.sheetWizard ? "[data-wizard-focus]" : "" });
}

/**
 * Teclado da tela: Esc no assistente de criar ficha e setas para empurrar o token selecionado no mapa.
 * @param {HTMLElement} container Raiz da tela.
 * @param {{state?: object, store?: object}} viewOpts Opções da tela.
 * @param {{key?: string, target?: object, preventDefault?: Function}} ev Evento de teclado.
 * @param {Function} [settle] Quem espera a tarefa e redesenha (substituível em teste).
 * @returns {Promise<void>|undefined} Tarefa em andamento, ou `undefined` se a tecla não se aplica.
 */
export function handleCanvasKeydown(container, viewOpts, ev, settle = settleAndRedraw) {
  if (ev?.key === "Escape" || (viewOpts.screen === "mesa" && isHudPanelKey(ev))) return handleWizardEscape(container, viewOpts, ev, settle);
  const delta = ARROW_DELTAS[ev?.key];
  if (!delta || ev.target?.id !== "dungeon-vtt-canvas") return undefined;
  const state = viewOpts.state || getDungeonSession();
  if (!state.selectedTokenId) return undefined;
  ev.preventDefault?.();
  const job = nudgeTokenInScene(state, state.selectedTokenId, delta[0], delta[1], { store: viewOpts.store });
  return settle(job, container, viewOpts, { focusSelector: "#dungeon-vtt-canvas" });
}

function hydrateP2pJoin(container, viewOpts) {
  if (!viewOpts.joinP2p) return false;
  const state = viewOpts.state || getDungeonSession();
  const hash = typeof location !== "undefined" ? location.hash : "";
  const job = attachVttPlayerJoin(state, hash, {
    store: viewOpts.store,
    onCampaign: () => (state._onSyncUpdate ? state._onSyncUpdate() : redrawContainer(container, viewOpts, "", true)),
  }).then((res) => {
    if (res?.ok === false) state.rollError = joinFailureRollMessage(res.error);
    return res;
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

/** @param {object} sessionState @param {object} viewOpts */
function applyDungeonWirePrefs(sessionState, viewOpts) {
  if (sessionState._dungeonPrefsApplied || sessionState.joinMode === "p2p_player") return;
  const prefs = loadDungeonPrefs();
  sessionState.dice3dEnabled = prefs.dice3d;
  const screen = viewOpts.screen || "acampamento";
  const stored = hasStoredDungeonPrefs();
  sessionState.viewerRole = !stored && screen === "mesa"
    ? "player"
    : stored
      ? prefs.viewerRole
      : sessionState.viewerRole || prefs.viewerRole;
  sessionState._dungeonPrefsApplied = true;
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
  const sessionState = viewOpts.state || getDungeonSession();
  sessionState._onSyncUpdate = () => redrawContainer(container, viewOpts, "", true);
  applyDungeonWirePrefs(sessionState, viewOpts);
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
  container.addEventListener("keydown", (ev) => handleCanvasKeydown(container, viewOpts, ev));
  bindActiveCanvas(container, viewOpts);
  hydrateViewPersistence(container, viewOpts);
}
