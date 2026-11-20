/**
 * @file Blocos de interface tática da Tela 2 (Entrega 3): barra de ferramentas (régua, desenho, névoa,
 * AoE, andares), rastreador de iniciativa (Zero-Spoiler) e controles rápidos de condições.
 * @module dungeon/screen-table-tactics
 */
import { escapeHtml } from "../shared/html.js";
import { projectInitiativeForPlayer } from "./vtt-tactics-reducer.js";
import { CONDITION_CATALOG, createInitiativeState, normalizeTokenConditions } from "./vtt-tactics-schema.js";

const TOOLS = [
  { id: "select", label: "Mover / Porta", gmOnly: false },
  { id: "ruler", label: "Régua", gmOnly: false },
  { id: "draw", label: "Desenhar", gmOnly: false },
  { id: "aoe-circle", label: "Esfera", gmOnly: false },
  { id: "aoe-cone", label: "Cone", gmOnly: false },
  { id: "aoe-cube", label: "Cubo", gmOnly: false },
  { id: "aoe-line", label: "Linha", gmOnly: false },
  { id: "fog-reveal", label: "Cortar Névoa", gmOnly: true },
];

function renderFloorPills(scene, isGm) {
  const floors = scene.floors || [];
  const pills = floors.map((f) => {
    const cls = f.z === scene.activeFloorZ ? " is-selected" : "";
    return `<button type="button" class="dungeon-chip-btn${cls}" data-dungeon="select-floor" data-floor-z="${f.z}">${escapeHtml(f.name)} (z=${f.z})</button>`;
  }).join("");
  const addBtn = isGm ? `<button type="button" class="dungeon-chip-btn" data-dungeon="add-floor">+ Andar</button>` : "";
  return `<div class="dungeon-chips-row" role="group" aria-label="Andares da cena">${pills}${addBtn}</div>`;
}

/**
 * Renderiza a barra de ferramentas táticas (ferramenta ativa, névoa, limpeza e seletor de andares).
 * @param {object} state Estado da sessão.
 * @param {object} scene Cena ativa.
 * @param {object} floor Piso ativo.
 * @param {boolean} isGm `true` quando a visão atual é do Mestre.
 * @returns {string} HTML da barra tática.
 */
export function renderTacticalToolbar(state, scene, floor, isGm) {
  const activeTool = state.activeTool || "select";
  const toolBtns = TOOLS.filter((t) => isGm || !t.gmOnly).map((t) => {
    const cls = t.id === activeTool ? " is-selected" : "";
    return `<button type="button" class="dungeon-chip-btn${cls}" data-dungeon="select-tool" data-tool="${t.id}" aria-pressed="${t.id === activeTool}">${escapeHtml(t.label)}</button>`;
  }).join("");
  const fogControls = isGm
    ? `<button type="button" class="dungeon-chip-btn${floor?.fog?.enabled ? " is-selected" : ""}" data-dungeon="toggle-fog">Névoa: ${floor?.fog?.enabled ? "ON" : "OFF"}</button><button type="button" class="dungeon-chip-btn" data-dungeon="reset-fog">Cobrir Névoa</button>`
    : "";
  return `
    <div class="dungeon-chips-row" role="group" aria-label="Ferramentas do mapa">${toolBtns}</div>
    <div class="dungeon-chips-row">
      ${fogControls}
      <button type="button" class="dungeon-chip-btn" data-dungeon="clear-drawings">Limpar Desenhos</button>
      <button type="button" class="dungeon-chip-btn" data-dungeon="clear-aoes">Limpar AoE</button>
    </div>
    ${renderFloorPills(scene, isGm)}`;
}

function renderConditionControls(scene, selectedId, isGm) {
  if (!isGm || !selectedId) return "";
  const tok = (scene.tokens || []).find((t) => t.tokenId === selectedId);
  if (!tok) return "";
  const activeIds = new Set(normalizeTokenConditions(tok.conditions).map((c) => c.id));
  const condBtns = CONDITION_CATALOG.slice(0, 8).map((c) => {
    const cls = activeIds.has(c.id) ? " is-selected" : "";
    return `<button type="button" class="dungeon-chip-btn${cls}" data-dungeon="toggle-condition" data-token-id="${escapeHtml(tok.tokenId)}" data-condition-id="${c.id}">${escapeHtml(c.glyph)} ${escapeHtml(c.label)}</button>`;
  }).join("");
  const otherFloors = (scene.floors || []).filter((f) => f.z !== tok.floorZ);
  const floorBtns = otherFloors.map((f) => `<button type="button" class="dungeon-chip-btn" data-dungeon="move-token-floor" data-token-id="${escapeHtml(tok.tokenId)}" data-floor-z="${f.z}">Mover p/ ${escapeHtml(f.name)}</button>`).join("");
  return `
    <div class="dungeon-action-form">
      <span class="dungeon-eyebrow">Condições (2 rodadas) &amp; Andar · ${escapeHtml(tok.name)}</span>
      <div class="dungeon-chips-row">${condBtns}${floorBtns}</div>
    </div>`;
}

/**
 * Renderiza o Rastreador de Iniciativa (ocultando combatentes secretos na visão jogador) e condições do token selecionado.
 * @param {object} state Estado da sessão.
 * @param {object} scene Cena ativa.
 * @param {boolean} isGm `true` quando a visão atual é do Mestre.
 * @returns {string} HTML do painel de iniciativa e condições.
 */
export function renderInitiativePanel(state, scene, isGm) {
  const rawInit = createInitiativeState(state.initiative);
  const init = isGm ? rawInit : projectInitiativeForPlayer(rawInit, { [scene.sceneId]: scene });
  const rows = init.entries.map((entry, idx) => {
    const activeTag = idx === init.turnIndex && init.active ? " <strong>◀ TURNO</strong>" : "";
    const hiddenTag = isGm && entry.hidden ? " <span class=\"dungeon-code-tag\">[GM]</span>" : "";
    return `<li><span class="dungeon-code-tag">${entry.roll}</span> <span>${escapeHtml(entry.name)}${hiddenTag}${activeTag}</span></li>`;
  }).join("");
  const gmControls = isGm
    ? `<div class="dungeon-card-actions">
        <button type="button" class="dungeon-btn dungeon-btn-secondary" data-dungeon="roll-initiative">Rolar Iniciativa</button>
        <button type="button" class="dungeon-btn dungeon-btn-primary" data-dungeon="next-turn">Próximo Turno →</button>
        <button type="button" class="dungeon-btn dungeon-btn-ghost" data-dungeon="reset-initiative">Limpar</button>
      </div>`
    : "";
  return `
    <section class="dungeon-panel" aria-label="Rastreador de Iniciativa">
      <div class="dungeon-section-head">
        <div>
          <span class="dungeon-eyebrow">Combate · Rodada ${init.round}</span>
          <h2>Rastreador de Iniciativa</h2>
        </div>
        <span class="dungeon-code-tag">${init.entries.length} combatente(s)</span>
      </div>
      ${gmControls}
      <ul class="dungeon-clean-list">${rows || "<li class=\"dungeon-muted\">Nenhuma iniciativa ativa. Clique em Rolar Iniciativa para iniciar o combate.</li>"}</ul>
      ${renderConditionControls(scene, state.selectedTokenId, isGm)}
    </section>`;
}
