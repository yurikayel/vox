/**
 * @file Modelo da base do HUD (spec hud-jogo-v0): cinto 4×1, indicador de magia e favoritos. Só da ficha própria; lógica pura.
 * @module dungeon/hud-bar-model
 */
import { projectCharacterPools } from "../rpg-sheet-and-lore.js";
import { normalizeFavorites } from "./hud-favorites.js";
import { getSystemPack } from "./system-pack.js";
import { listInventoryItems } from "./vtt-inventory.js";

/** Vagas do cinto (D2). */
export const HUD_BELT_SLOTS = 4;
/** Tag que marca um item como consumível. */
export const CONSUMABLE_TAG = "consumivel";
const SLOT_POOLS = ["l1", "l2", "l3"];
const DEFAULT_MAGIC_LABEL = "Magia";

/**
 * Cinto: os primeiros consumíveis do inventário (por rótulo), sempre `HUD_BELT_SLOTS` vagas (`null` = vazia).
 * @param {{inventory_orset?: object}|null} sheet Ficha própria.
 * @returns {Array<{id: string, label: string, qty: number}|null>} Vagas.
 */
export function buildHudBelt(sheet) {
  const picked = listInventoryItems(sheet?.inventory_orset)
    .filter((it) => it.qty > 0 && it.tags.includes(CONSUMABLE_TAG))
    .slice(0, HUD_BELT_SLOTS)
    .map((it) => ({ id: it.id, label: it.label, qty: it.qty }));
  return Array.from({ length: HUD_BELT_SLOTS }, (_, i) => picked[i] || null);
}

/**
 * Indicador de magia: só existe com recurso de magia acima de zero; o rótulo vem do pacote do sistema (D3).
 * @param {object|null} sheet Ficha própria.
 * @returns {{label: string, text: string}|null} Rótulo e "atual/máximo", ou null sem magia.
 */
export function buildHudMagic(sheet) {
  const maxes = sheet?.pools_base?.spell_slots_max || {};
  const max = SLOT_POOLS.reduce((sum, l) => sum + (Number(maxes[l]) > 0 ? Number(maxes[l]) : 0), 0);
  if (max <= 0) return null;
  const pools = projectCharacterPools(sheet.pools_base, sheet.delta_ledger || []).pools;
  const cur = SLOT_POOLS.reduce((sum, l) => sum + (Number(pools[`spell_slot_${l}`]) || 0), 0);
  const label = getSystemPack(sheet.system?.id)?.resources?.find((r) => r.id === "spell-slots")?.label || DEFAULT_MAGIC_LABEL;
  return { label, text: `${cur}/${max}` };
}

function resolveFavorite(sheet, key) {
  const [kind, id] = key.split(/:(.+)/);
  if (kind === "action") {
    const act = (sheet.sheet_meta?.clickable_actions || []).find((a) => a?.id === id && a?.label);
    return act ? { key, kind, id, label: String(act.label) } : null;
  }
  const item = listInventoryItems(sheet.inventory_orset).find((it) => it.id === id);
  return item ? { key, kind, id, label: item.label } : null;
}

/**
 * Favoritos resolvidos (até 6): chaves sem ação ou item correspondente são ignoradas.
 * @param {object|null} sheet Ficha própria.
 * @returns {Array<{key: string, kind: "action"|"item", id: string, label: string}>} Favoritos válidos, na ordem guardada.
 */
export function resolveHudFavorites(sheet) {
  if (!sheet) return [];
  return normalizeFavorites(sheet.sheet_meta?.favorites).map((k) => resolveFavorite(sheet, k)).filter(Boolean);
}
