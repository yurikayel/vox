/**
 * @file Controlador unificado das 4 telas segregadas do AI Social Dungeon.
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

const ACTION_HANDLERS = {
  failover: (state) => simulatePillarFailover(state),
  "roll-d20": (state) => openVaultIfTriggered(performFairD20Roll(state)),
  "grid-cell": (state, el) => openVaultIfTriggered(movePlayerOnGrid(state, el.dataset.x, el.dataset.y)),
  "spend-10": (state) => applySheetResourceDelta(state, "coins", -10, "Poção de vigília"),
  "test-overdraft": (state) => applySheetResourceDelta(state, "coins", -500, "Tentativa sem saldo"),
  "confirm-lore": (state, el) => attestLoreNodeInState(state, el.dataset.loreId, "CONFIRM"),
  "dispute-lore": (state, el) => attestLoreNodeInState(state, el.dataset.loreId, "REJECT"),
  "unlock-vault": (state) => triggerShamirVaultUnlock(state),
  "inspect-role": (state, el) => inspectPeerPromptForRole(state, el.dataset.role),
};

/** Gatilho cumprido no mapa: tenta abrir o cofre de Shamir de verdade (assíncrono). */
function openVaultIfTriggered(state) {
  return state.vaultSecret?.triggerMet && !state.vaultSecret.unlocked ? triggerShamirVaultUnlock(state) : state;
}

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

function redrawContainer(container, opts) {
  container.innerHTML = renderDungeonView(opts);
}

function handleDungeonSubmit(container, viewOpts, ev) {
  const form = ev.target;
  if (form?.dataset?.dungeon !== "action-form") return;
  ev.preventDefault();
  const input = form.querySelector("#dungeon-action-input");
  const cleanText = String(input?.value || "").trim();
  if (!cleanText) return;
  submitTableAction(viewOpts.state || getDungeonSession(), cleanText);
  redrawContainer(container, viewOpts);
  container.querySelector("#dungeon-action-input")?.focus?.();
}

/**
 * Conecta delegação de eventos interativos das 4 telas no contêiner montado.
 *
 * @param {HTMLElement} container Elemento raiz onde a UI do Dungeon está montada.
 * @param {object} [opts={}] Opções da sub-tela (`screen`, `tableId`, `charId`, `state`).
 * @returns {void} Sem valor de retorno.
 */
export function wireDungeonView(container, opts = {}) {
  if (!container || container.dataset.dungeonWired === "1") return;
  container.dataset.dungeonWired = "1";
  const viewOpts = { ...opts };

  container.addEventListener("click", (ev) => {
    const target = ev.target?.closest?.("[data-dungeon]");
    if (!target) return;
    const action = target.dataset.dungeon;
    if (action === "chip") return handleChipClick(container, target);
    const handler = ACTION_HANDLERS[action];
    if (!handler) return;
    const result = handler(viewOpts.state || getDungeonSession(), target);
    redrawContainer(container, viewOpts);
    if (result && typeof result.then === "function") {
      return result.then(() => redrawContainer(container, viewOpts)).catch(() => redrawContainer(container, viewOpts));
    }
    return undefined;
  });

  container.addEventListener("input", (ev) => {
    const target = ev.target;
    if (target?.dataset?.dungeon !== "slider-fav") return;
    const state = viewOpts.state || getDungeonSession();
    updateFavoriteSlider(state, target.value);
    // Só os rótulos mudam: redesenhar a tela trocaria o slider no meio do arrasto (perde o toque e o foco).
    refreshFavoriteSlider(container, state);
  });

  container.addEventListener("submit", (ev) => handleDungeonSubmit(container, viewOpts, ev));
}
