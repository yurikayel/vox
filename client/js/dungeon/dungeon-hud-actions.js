/**
 * @file Ações do HUD (spec hud-jogo-v0): usar um consumível do cinto e marcar favorito. Carregado por `import()`.
 * @module dungeon/dungeon-hud-actions
 */
import { toggleFavorite } from "./hud-favorites.js";
import { closeHudPanel, toggleHudPanel } from "./hud-panels.js";
import { dispatchCampaignOp } from "./dungeon-sync-bridge.js";
import { mutateSheetInventory } from "./dungeon-persistence.js";
import { CONSUMABLE_TAG } from "./hud-bar-model.js";
import { listInventoryItems } from "./vtt-inventory.js";
import { ensureSheetMeta } from "./vtt-schema.js";
import { getDefaultVttStore } from "./vtt-store.js";

/**
 * Usa uma unidade de um consumível da ficha própria (a última unidade tira o item da mochila).
 * @param {object} state Estado da sessão.
 * @param {string} itemId Id do item.
 * @param {{store?: object}} [opts] Opções.
 * @returns {Promise<object|undefined>} Campanha atualizada; nada se o item não existe ou não é consumível.
 */
export async function useBeltItem(state, itemId, opts = {}) {
  const item = listInventoryItems(state.sheet?.inventory_orset).find((it) => it.id === itemId);
  if (!item || !item.tags.includes(CONSUMABLE_TAG)) return undefined;
  const res = await mutateSheetInventory(state, "adjust_qty", { itemId, delta: -1 }, opts.store);
  state.campaignNotice = `Usou 1 de ${item.label}.`;
  return res;
}

/**
 * Liga ou desliga um favorito na ficha própria. Com a barra cheia, avisa em vez de trocar em silêncio.
 * @param {object} state Estado da sessão.
 * @param {string} key Chave `action:<id>` ou `item:<id>`.
 * @param {{store?: object}} [opts] Opções.
 * @returns {Promise<object|undefined>} Campanha atualizada; nada se não mudou.
 */
export async function toggleHudFavorite(state, key, opts = {}) {
  if (!state.sheet) return undefined;
  const base = ensureSheetMeta(state.sheet);
  const { favorites, changed } = toggleFavorite(base.sheet_meta.favorites, key);
  if (!changed) {
    state.campaignNotice = "A barra de favoritos já tem 6.";
    return undefined;
  }
  const sheet = { ...base, sheet_meta: { ...base.sheet_meta, favorites } };
  return dispatchCampaignOp(state, "SHEET_UPSERT", { sheet, setActive: true }, { store: opts.store || getDefaultVttStore() });
}

/**
 * Despacha uma ação do HUD pelo `data-hud-op` do botão (`belt-use`, `favorite`, `panel-open` ou `panel-close`); op desconhecida não faz nada.
 * @param {object} state Estado da sessão.
 * @param {HTMLElement} el Botão clicado.
 * @param {{store?: object}} [opts] Opções.
 * @returns {Promise<object|undefined>} Resultado da ação, ou nada.
 */
export async function runHudOp(state, el, opts = {}) {
  const op = el?.dataset?.hudOp;
  if (op === "belt-use") return useBeltItem(state, el.dataset.itemId, opts);
  if (op === "favorite") return toggleHudFavorite(state, el.dataset.favoriteKey, opts);
  if (op === "panel-open") return toggleHudPanel(state, el.dataset.panelId);
  if (op === "panel-close") return closeHudPanel(state);
  return undefined;
}
