/**
 * @file Inventário OR-Set mínimo da ficha (E4): itens, equipar e moedas via ledger.
 * @module dungeon/vtt-inventory
 */
import { appendPoolDeltaOp } from "../rpg-sheet-and-lore.js";

function itemIdFrom(label, fallback) {
  const clean = String(label || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return clean || fallback;
}

function normalizeItem(raw = {}, idx = 0) {
  const label = String(raw.label || raw.name || "").trim().slice(0, 80);
  if (!label) return null;
  return {
    id: String(raw.id || itemIdFrom(label, `item-${idx}`)).slice(0, 48),
    label,
    qty: Math.max(0, Math.trunc(Number(raw.qty) || 1)),
    weightLb: Math.max(0, Number(raw.weightLb) || 0),
    equipped: Boolean(raw.equipped),
    tags: Array.isArray(raw.tags) ? raw.tags.map((t) => String(t).slice(0, 24)) : [],
  };
}

/**
 * Estado vazio ou normalizado de `inventory_orset`.
 * @param {object} [orset] Mapa bruto `id -> item`.
 * @returns {object} Mapa normalizado.
 */
export function normalizeInventoryOrset(orset = {}) {
  if (!orset || typeof orset !== "object" || Array.isArray(orset)) return {};
  const out = {};
  let i = 0;
  for (const val of Object.values(orset)) {
    const item = normalizeItem(val, i++);
    if (item) out[item.id] = item;
  }
  return out;
}

/**
 * Lista itens ordenados por rótulo.
 * @param {object} orset Mapa de inventário.
 * @returns {Array<object>} Itens.
 */
export function listInventoryItems(orset) {
  return Object.values(normalizeInventoryOrset(orset)).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

/**
 * Carga total (opcional d20).
 * @param {object} orset Inventário.
 * @returns {number} Soma peso × qty.
 */
export function totalCarriedWeight(orset) {
  return listInventoryItems(orset).reduce((sum, it) => sum + it.weightLb * it.qty, 0);
}

function addItem(sheet, payload, inv) {
  const item = normalizeItem({ ...payload, id: payload.itemId || undefined }, Object.keys(inv).length);
  if (!item) return { ...sheet, inventory_orset: inv };
  const prev = inv[item.id];
  inv[item.id] = prev ? { ...prev, qty: prev.qty + (item.qty || 1) } : item;
  return { ...sheet, inventory_orset: inv };
}

function mutateItem(sheet, inv, itemId, updater) {
  if (!itemId || !inv[itemId]) return { ...sheet, inventory_orset: inv };
  inv[itemId] = updater(inv[itemId]);
  if (!inv[itemId]) delete inv[itemId];
  return { ...sheet, inventory_orset: inv };
}

/**
 * Aplica mutação de inventário na ficha (cópia pura).
 * @param {object} sheet Ficha CRDT.
 * @param {"add"|"remove"|"toggle_equip"|"set_qty"} kind Tipo.
 * @param {object} payload Dados do item.
 * @returns {object} Nova ficha.
 */
export function applyInventoryMutation(sheet, kind, payload = {}) {
  const inv = { ...normalizeInventoryOrset(sheet?.inventory_orset) };
  const itemId = String(payload.itemId || "").slice(0, 48);
  if (kind === "add") return addItem(sheet, payload, inv);
  if (kind === "remove") return mutateItem(sheet, inv, itemId, () => null);
  if (kind === "toggle_equip") return mutateItem(sheet, inv, itemId, (it) => ({ ...it, equipped: !it.equipped }));
  if (kind === "set_qty") {
    const qty = Math.max(0, Math.trunc(Number(payload.qty) || 0));
    return mutateItem(sheet, inv, itemId, (it) => (qty === 0 ? null : { ...it, qty }));
  }
  return { ...sheet, inventory_orset: inv };
}

/**
 * Converte moedas no `delta_ledger` (PO base).
 * @param {object} sheet Ficha.
 * @param {{ pp?: number, gp?: number, sp?: number, cp?: number }} delta Peças a somar.
 * @param {object} opMeta `op_id`, `lamport_clock`, `actor_pubkey`.
 * @returns {object} Ficha com ledger atualizado (só `currency_gp` em PO equivalente).
 */
export function applyCurrencyDelta(sheet, delta = {}, opMeta = {}) {
  const gp = Math.trunc(Number(delta.gp) || 0);
  const sp = Math.trunc(Number(delta.sp) || 0);
  const cp = Math.trunc(Number(delta.cp) || 0);
  const pp = Math.trunc(Number(delta.pp) || 0);
  const totalGp = pp * 10 + gp + sp * 0.1 + cp * 0.01;
  const po = Math.round(totalGp * 100) / 100;
  if (!po) return sheet;
  return {
    ...sheet,
    ...appendPoolDeltaOp(sheet, {
      op_id: opMeta.op_id || `cur-${crypto.randomUUID().slice(0, 8)}`,
      lamport_clock: opMeta.lamport_clock || 1,
      actor_pubkey: opMeta.actor_pubkey || "",
      target_pool: "currency_gp",
      delta: po,
      reason: String(opMeta.reason || "Moedas").slice(0, 80),
    }),
  };
}