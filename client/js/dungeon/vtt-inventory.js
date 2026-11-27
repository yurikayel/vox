/**
 * @file Inventário OR-Set mínimo da ficha (E4): itens, equipar e moedas via ledger.
 * @module dungeon/vtt-inventory
 */
import { appendPoolDeltaOp } from "../rpg-sheet-and-lore.js";
import { BACKPACK_COLS, BACKPACK_ROWS, footprint, inBounds, itemSize, layoutBackpack, organizeBackpack, overlaps } from "./vtt-inventory-grid.js";

export { BACKPACK_COLS, BACKPACK_ROWS, defaultItemSize, itemSize, layoutBackpack, organizeBackpack } from "./vtt-inventory-grid.js";

function itemIdFrom(label, fallback) {
  const clean = String(label || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return clean || fallback;
}

function sizeField(value, max) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= 1 && n <= max ? n : undefined;
}

/** Tamanho `w`/`h` só entra no item quando a ficha o informou; sem eles vale o padrão por nome (`defaultItemSize`). */
function explicitSize(raw) {
  const w = sizeField(raw.w, BACKPACK_COLS);
  const h = sizeField(raw.h, BACKPACK_ROWS);
  return w && h ? { w, h } : {};
}

/** Campo opcional `armor` ({kind, ac}) como digitado; o significado de `kind` e a matemática são do pacote de sistema. */
function armorField(raw) {
  const kind = String(raw.armor?.kind || "").trim().slice(0, 16);
  const ac = Math.trunc(Number(raw.armor?.ac));
  return kind && Number.isFinite(ac) && ac >= 0 && ac <= 40 ? { armor: { kind, ac } } : {};
}

/**
 * Posição guardada (`x`, `y`, `rot`): inteiros dentro da grade com o tamanho do item. Fora disso, ou em item equipado,
 * os campos caem e o item volta a "sem posição". `rot` só vale em item não quadrado.
 */
function positionField(raw, item) {
  if (item.equipped || !Number.isInteger(raw.x) || !Number.isInteger(raw.y)) return {};
  const size = itemSize(item);
  const rot = raw.rot === true && size.w !== size.h;
  return inBounds(raw.x, raw.y, footprint({ ...item, rot })) ? { x: raw.x, y: raw.y, ...(rot ? { rot } : {}) } : {};
}

function withoutSpot(item) {
  const rest = { ...item };
  delete rest.x;
  delete rest.y;
  delete rest.rot;
  return rest;
}

function normalizeItem(raw, idx = 0) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const label = String(raw.label || raw.name || "").trim().slice(0, 80);
  if (!label) return null;
  const item = {
    id: String(raw.id || itemIdFrom(label, `item-${idx}`)).slice(0, 48),
    label,
    qty: Math.max(0, Math.trunc(Number(raw.qty) || 1)),
    weightLb: Math.max(0, Number(raw.weightLb) || 0),
    equipped: Boolean(raw.equipped),
    tags: Array.isArray(raw.tags) ? raw.tags.map((t) => String(t).slice(0, 24)) : [],
    ...explicitSize(raw),
    ...armorField(raw),
  };
  return { ...item, ...positionField(raw, item) };
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

/** Quilos por libra (definição internacional: 0,45359237 kg). @type {number} */
export const KG_PER_LB = 0.45359237;

/**
 * Converte libras em quilos.
 * @param {number} lb Peso em libras.
 * @returns {number|null} Quilos, ou `null` quando `lb` não é um número finito e não negativo.
 */
export function lbToKg(lb) {
  const n = typeof lb === "number" ? lb : Number.NaN;
  return Number.isFinite(n) && n >= 0 ? n * KG_PER_LB : null;
}

/**
 * Carga total em quilos (o inventário guarda libras).
 * @param {object} orset Inventário.
 * @returns {number} Soma peso × quantidade, em kg.
 */
export function totalCarriedKg(orset) {
  return totalCarriedWeight(orset) * KG_PER_LB;
}

function addItem(sheet, payload, inv) {
  const item = normalizeItem({ ...withoutSpot(payload), id: payload.itemId || undefined }, Object.keys(inv).length);
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

/** `place`: grava x/y/rot só se o item cabe na grade e não toca o layout atual dos outros; senão a ficha segue igual. */
function placeItem(sheet, inv, itemId, payload) {
  const current = inv[itemId];
  if (payload.rot !== undefined && typeof payload.rot !== "boolean") return { ...sheet, inventory_orset: inv };
  const moved =current && !current.equipped ? normalizeItem({ ...withoutSpot(current), x: payload.x, y: payload.y, rot: payload.rot }) : null;
  if (!moved || !("x" in moved)) return { ...sheet, inventory_orset: inv };
  const others = Object.values(inv).filter((it) => it.id !== itemId);
  const rect = { x: moved.x, y: moved.y, ...footprint(moved) };
  if (!overlaps(layoutBackpack(others).placements, rect)) inv[itemId] = moved;
  return { ...sheet, inventory_orset: inv };
}

/** `organize`: grava o first-fit determinístico em todos os itens soltos; quem não coube fica sem posição. */
function organizeInventory(sheet, inv) {
  const at = new Map(organizeBackpack(Object.values(inv)).placements.map((p) => [p.id, p]));
  for (const it of Object.values(inv)) {
    if (it.equipped) continue;
    const spot = at.get(it.id);
    inv[it.id] = spot ? { ...withoutSpot(it), x: spot.x, y: spot.y } : withoutSpot(it);
  }
  return { ...sheet, inventory_orset: inv };
}

const QTY_DELTA_LIMIT = 99;

/** Delta de quantidade como inteiro entre −99 e 99; qualquer outra coisa vira 0 (sem efeito). */
function qtyDelta(raw) {
  const n = Math.trunc(Number(raw));
  return Number.isFinite(n) ? Math.max(-QTY_DELTA_LIMIT, Math.min(QTY_DELTA_LIMIT, n)) : 0;
}

/**
 * Aplica mutação de inventário na ficha (cópia pura). `adjust_qty` soma `payload.delta` (inteiro, −99 a 99) à
 * quantidade atual, que nunca fica negativa; zerar tira o item. Por ser relativo, dois ajustes seguidos somam.
 * @param {object} sheet Ficha CRDT.
 * `place` (`x`, `y`, `rot?`) guarda a posição do item na mochila se couber e não colidir; `organize` grava o first-fit
 * de todos. Em ambos, o que não passa na revalidação é no-op, então o resultado é o mesmo em todos os aparelhos.
 * @param {"add"|"remove"|"toggle_equip"|"set_qty"|"adjust_qty"|"place"|"organize"} kind Tipo.
 * @param {object} payload Dados do item.
 * @returns {object} Nova ficha.
 */
export function applyInventoryMutation(sheet, kind, payload = {}) {
  const inv = { ...normalizeInventoryOrset(sheet?.inventory_orset) };
  const itemId = String(payload.itemId || "").slice(0, 48);
  if (kind === "add") return addItem(sheet, payload, inv);
  if (kind === "remove") return mutateItem(sheet, inv, itemId, () => null);
  if (kind === "toggle_equip") return mutateItem(sheet, inv, itemId, (it) => ({ ...withoutSpot(it), equipped: !it.equipped }));
  if (kind === "set_qty") {
    const qty = Math.max(0, Math.trunc(Number(payload.qty) || 0));
    return mutateItem(sheet, inv, itemId, (it) => (qty === 0 ? null : { ...it, qty }));
  }
  if (kind === "place") return placeItem(sheet, inv, itemId, payload);
  if (kind === "organize") return organizeInventory(sheet, inv);
  if (kind === "adjust_qty") {
    const delta = qtyDelta(payload.delta);
    return mutateItem(sheet, inv, itemId, (it) => (it.qty + delta <= 0 ? null : { ...it, qty: it.qty + delta }));
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
