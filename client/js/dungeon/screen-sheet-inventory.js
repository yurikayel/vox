/**
 * @file Painel de inventário da ficha (Subversus): mochila em grade 10×4 com "Organizar" automático, itens equipados à
 * parte e indicador de carga com o motivo por escrito (ficha-personagem-brainstorm §5.4).
 *
 * Só renderização: usa apenas as ações já existentes (`inv-equip`, `inv-remove`, `add-item-form`).
 * A posição de cada item vem de `layoutBackpack`: a guardada na ficha (`x`, `y`, `rot`) quando vale, first-fit para
 * o resto. Cada célula leva `data-inv-*` para o arrastar (`inventory-drag-ui.js`); o cinto e o boneco de equipamento
 * ficam fora daqui.
 * @module dungeon/screen-sheet-inventory
 */
import { escapeHtml } from "../shared/html.js";
import { dungeonIcon } from "./rpg-illustrations.js";
import { resolveSheetSystem } from "./screen-sheet-derived.js";
import { buildItemWeightView, buildLoadView } from "./sheet-view-model.js";
import { BACKPACK_COLS, BACKPACK_ROWS, layoutBackpack } from "./vtt-inventory.js";

function itemLabel(it) {
  return `${escapeHtml(it.label)} ×${it.qty}`;
}

function gridCell(it, spot) {
  const style = `grid-column:${spot.x + 1} / span ${spot.w};grid-row:${spot.y + 1} / span ${spot.h}`;
  const drag = `data-inv-cell="${escapeHtml(it.id)}" data-inv-w="${spot.w}" data-inv-h="${spot.h}"${spot.rot ? ` data-inv-rot="1"` : ""} aria-keyshortcuts="Enter"`;
  return `<button type="button" class="dungeon-backpack-item" style="${style}" ${drag} data-dungeon="inv-equip" data-item-id="${escapeHtml(it.id)}" aria-label="Equipar ${escapeHtml(it.label)}, ${it.qty} na mochila" title="${escapeHtml(it.label)} ×${it.qty}">${itemLabel(it)}</button>`;
}

function renderBackpackGrid(items) {
  const { placements, overflow } = layoutBackpack(items);
  const byId = new Map(items.map((it) => [it.id, it]));
  const cells = placements.map((spot) => gridCell(byId.get(spot.id), spot)).join("");
  const lost = overflow.map((id) => escapeHtml(byId.get(id).label)).join(", ");
  const warn = overflow.length ? `<p class="dungeon-alert-warn" role="status">Não coube na mochila (${BACKPACK_COLS}×${BACKPACK_ROWS}): ${lost}.</p>` : "";
  const hint = `<p class="dungeon-muted" data-inv-hint>Arraste um item (no toque, segure 300 ms) ou foque e aperte Enter: setas movem, R gira, Enter solta, Esc cancela.</p><p class="sv-inv-notice" role="status" data-inv-notice></p>`;
  return `<div class="dungeon-backpack-grid" data-inv-grid role="group" aria-label="Mochila ${BACKPACK_COLS} por ${BACKPACK_ROWS}">${cells}</div>${hint}${warn}`;
}

function renderEquipped(items) {
  const equipped = items.filter((it) => it.equipped);
  if (!equipped.length) return `<p class="dungeon-muted">Nada equipado.</p>`;
  const chips = equipped.map((it) => `<button type="button" class="dungeon-chip-btn is-selected" data-dungeon="inv-equip" data-item-id="${escapeHtml(it.id)}" aria-pressed="true" aria-label="Desequipar ${escapeHtml(it.label)}">${escapeHtml(it.label)}</button>`).join("");
  return `<div class="dungeon-chips-row" role="group" aria-label="Equipado">${chips}</div>`;
}

function renderLoadIndicator(load) {
  const cls = load.over ? " is-over" : "";
  return `<p class="dungeon-load${cls}" role="status"><strong>Carga ${escapeHtml(load.text)} / ${escapeHtml(load.limitText)}</strong> — ${escapeHtml(load.reason)}</p>`;
}

function renderFavoriteToggle(it, favorites) {
  const on = favorites.includes(`item:${it.id}`);
  return `<button type="button" class="dungeon-chip-btn${on ? " is-selected" : ""}" data-dungeon="hud-op" data-hud-op="favorite" data-favorite-key="item:${escapeHtml(it.id)}" aria-pressed="${on}">${on ? "Tirar dos favoritos" : "Favoritar"}</button>`;
}

function renderItemRow(it, favorites = []) {
  return `
    <li class="dungeon-inventory-row">
      ${dungeonIcon("backpack", 15)}
      <span>${itemLabel(it)} · ${escapeHtml(buildItemWeightView(it).text)}${it.equipped ? " · equipado" : ""}</span>
      <div class="dungeon-card-actions">
        <button type="button" class="dungeon-chip-btn${it.equipped ? " is-selected" : ""}" data-dungeon="inv-equip" data-item-id="${escapeHtml(it.id)}" aria-pressed="${Boolean(it.equipped)}">${it.equipped ? "Desequipar" : "Equipar"}</button>
        ${renderFavoriteToggle(it, favorites)}
        <button type="button" class="dungeon-chip-btn" data-dungeon="inv-remove" data-item-id="${escapeHtml(it.id)}">Remover</button>
      </div>
    </li>`;
}

/** Campo opcional Armadura do item: tipos e rótulos vêm do pacote do sistema da ficha; sem `armor` no pacote, não aparece. */
function renderArmorFields(sheet) {
  const kinds = resolveSheetSystem(sheet)?.pack.formulas.armor?.kinds;
  if (!kinds) return "";
  const opts = Object.entries(kinds).map(([id, k]) => `<option value="${escapeHtml(id)}">${escapeHtml(k.label)}</option>`).join("");
  return `<label class="sr-only" for="dungeon-item-armor-kind">Armadura (opcional)</label>
          <select id="dungeon-item-armor-kind" class="dungeon-input" name="itemArmorKind"><option value="">Sem armadura</option>${opts}</select>
          <label class="sr-only" for="dungeon-item-armor-ac">CA da armadura</label>
          <input id="dungeon-item-armor-ac" class="dungeon-input dungeon-input-qty" name="itemArmorAc" type="number" min="0" max="30" placeholder="CA" aria-label="CA da armadura" />`;
}

function renderAddItemForm(sheet) {
  return `
      <form class="dungeon-action-form" data-dungeon="add-item-form">
        <div class="dungeon-input-row">
          <label class="sr-only" for="dungeon-item-label">Nome do novo item</label>
          <input id="dungeon-item-label" class="dungeon-input" name="itemLabel" maxlength="80" placeholder="Novo item (ex.: Tocha)" autocomplete="off" />
          <label for="dungeon-item-qty">Quantidade</label>
          <input id="dungeon-item-qty" class="dungeon-input dungeon-input-qty" name="itemQty" type="number" min="1" max="99" value="1" aria-label="Quantidade" />
          <label for="dungeon-item-weight">Peso em libras (lb)</label>
          <input id="dungeon-item-weight" class="dungeon-input dungeon-input-qty" name="itemWeight" type="number" min="0" max="500" step="0.5" value="0.5" aria-label="Peso em libras (lb)" />
          ${renderArmorFields(sheet)}
          <button type="submit" class="dungeon-btn dungeon-btn-secondary">Adicionar</button>
        </div>
      </form>`;
}

/**
 * Painel de inventário da ficha: mochila em grade, equipados, carga com motivo e a lista de itens com as ações.
 * @param {{sheet?: {inventoryItems?: object[], attributes_lww?: object}}} state Estado da sessão.
 * @returns {string} HTML do painel.
 */
export function renderInventoryPanel(state) {
  const items = state.sheet?.inventoryItems || [];
  const load = buildLoadView(state.sheet, items);
  const favs = state.sheet?.sheet_meta?.favorites || [];
  const rows = items.map((it) => renderItemRow(it, favs)).join("");
  const grid = items.some((it) => !it.equipped) ? renderBackpackGrid(items) : `<p class="dungeon-muted">Mochila vazia — adicione itens acima.</p>`;
  return `
    <section class="dungeon-panel" aria-label="Inventário da ficha">
      <div class="dungeon-section-head">
        <div><span class="dungeon-eyebrow">Inventário compartilhado</span><h2>Mochila (${escapeHtml(load.text)})</h2></div>
      </div>
      ${renderLoadIndicator(load)}
      ${renderAddItemForm(state.sheet)}
      <h3 class="dungeon-eyebrow">Equipado</h3>
      ${renderEquipped(items)}
      <h3 class="dungeon-eyebrow">Mochila</h3>
      ${grid}
      <ul class="dungeon-clean-list">${rows}</ul>
    </section>`;
}
