/**
 * @file Geometria da mochila em grade (ficha-personagem-brainstorm §5.4): tamanho por item, posição guardada
 * (`x`, `y`, `rot`) e arrumação determinística. Funções puras; não conhece a ficha nem a rede.
 * @module dungeon/vtt-inventory-grid
 */

/** Colunas da mochila em grade (ficha, spec §5.4). @type {number} */
export const BACKPACK_COLS = 10;

/** Linhas da mochila em grade. @type {number} */
export const BACKPACK_ROWS = 4;

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

/**
 * Área que o item ocupa de fato: o tamanho, com `w` e `h` trocados quando o item está girado (`rot`).
 * @param {{label?: string, w?: number, h?: number, rot?: boolean}} item Item do inventário.
 * @returns {{w: number, h: number}} Largura e altura em células.
 */
export function footprint(item) {
  const { w, h } = itemSize(item);
  return item?.rot ? { w: h, h: w } : { w, h };
}

function byAreaThenHeightThenName(a, b) {
  return b.w * b.h - a.w * a.h || b.h - a.h || a.label.localeCompare(b.label, "pt-BR") || a.id.localeCompare(b.id);
}

function byIdAscending(a, b) {
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

function newGrid(cols, rows) {
  return { cols, rows, cells: Array.from({ length: rows }, () => Array(cols).fill(false)) };
}

/**
 * Diz se um retângulo cabe inteiro na grade (sem olhar o que já está nela).
 * @param {number} x Coluna da célula de cima à esquerda.
 * @param {number} y Linha da célula de cima à esquerda.
 * @param {{w: number, h: number}} size Largura e altura em células.
 * @param {{cols?: number, rows?: number}} [grid={}] Tamanho da grade (padrão 10×4).
 * @returns {boolean} `true` quando está dentro dos limites.
 */
export function inBounds(x, y, size, grid = {}) {
  return x >= 0 && y >= 0 && x + size.w <= (grid.cols || BACKPACK_COLS) && y + size.h <= (grid.rows || BACKPACK_ROWS);
}

/**
 * Diz se um retângulo toca alguma das posições já ocupadas.
 * @param {Array<{x: number, y: number, w: number, h: number}>} placements Posições ocupadas (saída de `layoutBackpack`).
 * @param {{x: number, y: number, w: number, h: number}} rect Retângulo a testar.
 * @returns {boolean} `true` quando há sobreposição.
 */
export function overlaps(placements, rect) {
  return placements.some((p) => rect.x < p.x + p.w && p.x < rect.x + rect.w && rect.y < p.y + p.h && p.y < rect.y + rect.h);
}

function fits(grid, x, y, size) {
  if (!inBounds(x, y, size, grid)) return false;
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

function hasSpot(item) {
  return Number.isInteger(item.x) && Number.isInteger(item.y);
}

function seat(grid, item, spot, size) {
  occupy(grid, spot.x, spot.y, size);
  return { id: item.id, x: spot.x, y: spot.y, w: size.w, h: size.h, rot: Boolean(item.rot) };
}

/**
 * Layout da mochila respeitando a posição guardada de cada item. Determinístico: primeiro entram os itens com `x`/`y`
 * válidos, por `id` crescente; quem colide com um já posto perde a posição só neste cálculo (nada é gravado). Depois os
 * sem posição, por first-fit na ordem maior área → maior altura → nome. Equipados ficam fora; o que não cabe vai para
 * `overflow`. Mesma entrada, mesma saída em qualquer aparelho.
 * @param {Array<{id: string, label: string, equipped?: boolean, w?: number, h?: number, x?: number, y?: number, rot?: boolean}>} items Itens listados.
 * @param {{cols?: number, rows?: number}} [options={}] Tamanho da grade (padrão 10×4).
 * @returns {{placements: Array<{id: string, x: number, y: number, w: number, h: number, rot: boolean}>, overflow: string[]}} Posições e ids que não couberam.
 */
export function layoutBackpack(items, options = {}) {
  const grid = newGrid(options.cols || BACKPACK_COLS, options.rows || BACKPACK_ROWS);
  const loose = (items || []).filter((it) => !it.equipped);
  const placements = [];
  const unplaced = [];
  for (const it of loose.filter(hasSpot).sort(byIdAscending)) {
    const size = footprint(it);
    if (fits(grid, it.x, it.y, size)) placements.push(seat(grid, it, it, size));
    else unplaced.push({ ...it, rot: false, ...itemSize(it) });
  }
  const free = [...loose.filter((it) => !hasSpot(it)).map((it) => ({ ...it, rot: false, ...itemSize(it) })), ...unplaced];
  const overflow = [];
  for (const it of free.sort(byAreaThenHeightThenName)) {
    const spot = firstFreeSpot(grid, it);
    if (spot) placements.push(seat(grid, it, spot, it));
    else overflow.push(it.id);
  }
  return { placements, overflow };
}

/**
 * Arruma a mochila em grade ignorando posições guardadas (spec §5.4, "Organizar"): maior área primeiro, desempate por
 * maior altura e depois por nome, preenchendo da esquerda para a direita e de cima para baixo (first-fit). Cada item
 * ocupa uma vez o seu tamanho, qualquer que seja a quantidade. Itens equipados não entram na grade.
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
