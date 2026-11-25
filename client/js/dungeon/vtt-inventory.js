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

/** Colunas da mochila em grade (ficha, spec §5.4). @type {number} */
export const BACKPACK_COLS = 10;

/** Linhas da mochila em grade. @type {number} */
export const BACKPACK_ROWS = 4;

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
    ...explicitSize(raw),
    ...armorField(raw),
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
const SIZE_RULES = Object.freeze([
  [1, 4, /montante|alabarda|lanca|arco longo|cajado longo/],
  [2, 3, /armadura|escudo de corpo|escudo torre|besta pesada/],
  [2, 2, /escudo|elmo|botas|manopla|grimorio|tomo|kit de aventura/],
  [1, 3, /espada|maca|machado|cajado|arco/],
  [1, 2, /adaga|varinha|tocha|algibeira|instrumento|ferramenta/],
  [1, 1, /pocao|elixir|anel|amuleto|pergaminho|municao|foco|chave|insignia/],
]);

function plainText(text) {
  return String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Tamanho padrão na grade pelo nome do item (tabela do ficha-personagem-brainstorm §5.4). Nome desconhecido ocupa 1×1.
 * @param {{label?: string}} item Item do inventário.
 * @returns {{w: number, h: number}} Largura e altura em células.
 */
export function defaultItemSize(item) {
  const name = plainText(item?.label);
  const rule = SIZE_RULES.find(([, , pattern]) => pattern.test(name));
  return rule ? { w: rule[0], h: rule[1] } : { w: 1, h: 1 };
}

/**
 * Tamanho do item na grade: o informado na ficha (`w`, `h`) ou o padrão pelo nome.
 * @param {{label?: string, w?: number, h?: number}} item Item do inventário.
 * @returns {{w: number, h: number}} Largura e altura em células.
 */
export function itemSize(item) {
  return item?.w && item?.h ? { w: item.w, h: item.h } : defaultItemSize(item);
}

function byAreaThenHeightThenName(a, b) {
  return b.w * b.h - a.w * a.h || b.h - a.h || a.label.localeCompare(b.label, "pt-BR") || a.id.localeCompare(b.id);
}

function newGrid(cols, rows) {
  return { cols, rows, cells: Array.from({ length: rows }, () => Array(cols).fill(false)) };
}

function fits(grid, x, y, size) {
  if (x + size.w > grid.cols || y + size.h > grid.rows) return false;
  for (let dy = 0; dy < size.h; dy += 1) for (let dx = 0; dx < size.w; dx += 1) if (grid.cells[y + dy][x + dx]) return false;
  return true;
}

function occupy(grid, x, y, size) {
  for (let dy = 0; dy < size.h; dy += 1) for (let dx = 0; dx < size.w; dx += 1) grid.cells[y + dy][x + dx] = true;
}

function firstFreeSpot(grid, size) {
  for (let y = 0; y < grid.rows; y += 1) for (let x = 0; x < grid.cols; x += 1) if (fits(grid, x, y, size)) return { x, y };
  return null;
}

/**
 * Arruma a mochila em grade, de forma determinística (spec §5.4, "Organizar"): maior área primeiro, desempate por maior
 * altura e depois por nome, preenchendo da esquerda para a direita e de cima para baixo (first-fit). Cada item ocupa uma
 * vez o seu tamanho, qualquer que seja a quantidade. Itens equipados não entram na grade.
 * @param {Array<{id: string, label: string, equipped?: boolean, w?: number, h?: number}>} items Itens listados.
 * @param {{cols?: number, rows?: number}} [options={}] Tamanho da grade (padrão 10×4).
 * @returns {{placements: Array<{id: string, x: number, y: number, w: number, h: number}>, overflow: string[]}} Posições e ids que não couberam.
 */
export function organizeBackpack(items, options = {}) {
  const cols = options.cols || BACKPACK_COLS;
  const rows = options.rows || BACKPACK_ROWS;
  const grid = newGrid(cols, rows);
  const sized = (items || []).filter((it) => !it.equipped).map((it) => ({ ...it, ...itemSize(it) })).sort(byAreaThenHeightThenName);
  const placements = [];
  const overflow = [];
  for (const it of sized) {
    const spot = firstFreeSpot(grid, it);
    if (!spot) overflow.push(it.id);
    else { occupy(grid, spot.x, spot.y, it); placements.push({ id: it.id, x: spot.x, y: spot.y, w: it.w, h: it.h }); }
  }
  return { placements, overflow };
}
