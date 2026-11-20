/**
 * @file Painéis auxiliares da Tela 2 (Mesa): editor de token selecionado (com movimento acessível por teclado),
 * criador rápido de portas (GM) e Relógio do Mundo compacto para Mesa/Escudo do Mestre.
 * @module dungeon/screen-table-panels
 */
import { escapeHtml } from "../shared/html.js";

const HP_VIS_OPTIONS = [
  { id: "exact", label: "Número exato" },
  { id: "bar", label: "Barra" },
  { id: "status", label: "Só status (Zero-Spoiler)" },
];

const COLOR_SWATCHES = ["#78d6cf", "#e7c26b", "#69dba9", "#ffb4ab", "#ce93d8", "#90caf9"];

function renderNudgePad(tok) {
  const id = escapeHtml(tok.tokenId);
  const name = escapeHtml(tok.name);
  return `
    <div class="dungeon-nudge-pad" role="group" aria-label="Mover ${name} pelo teclado">
      <button type="button" class="dungeon-chip-btn" data-dungeon="nudge-token" data-token-id="${id}" data-dx="0" data-dy="-1" aria-label="Mover ${name} para cima">↑</button>
      <button type="button" class="dungeon-chip-btn" data-dungeon="nudge-token" data-token-id="${id}" data-dx="-1" data-dy="0" aria-label="Mover ${name} para esquerda">←</button>
      <button type="button" class="dungeon-chip-btn" data-dungeon="nudge-token" data-token-id="${id}" data-dx="1" data-dy="0" aria-label="Mover ${name} para direita">→</button>
      <button type="button" class="dungeon-chip-btn" data-dungeon="nudge-token" data-token-id="${id}" data-dx="0" data-dy="1" aria-label="Mover ${name} para baixo">↓</button>
    </div>`;
}

function renderGmTokenForm(tok) {
  const visOpts = HP_VIS_OPTIONS.map((o) => `<option value="${o.id}"${tok.hpVisible === o.id ? " selected" : ""}>${o.label}</option>`).join("");
  const sizeOpts = [1, 2, 3, 4].map((s) => `<option value="${s}"${(tok.sizeCells || 1) === s ? " selected" : ""}>${s}×${s}</option>`).join("");
  const colorOpts = COLOR_SWATCHES.map((hex) => `<option value="${hex}"${tok.color === hex ? " selected" : ""}>${hex}</option>`).join("");
  return `
    <form class="dungeon-token-edit-form" data-dungeon="edit-token-form" data-token-id="${escapeHtml(tok.tokenId)}">
      <label class="dungeon-field-mini"><span>PV atual</span><input class="dungeon-input" name="hpCurrent" type="number" min="0" max="999" value="${tok.hpCurrent ?? 20}" /></label>
      <label class="dungeon-field-mini"><span>PV máx</span><input class="dungeon-input" name="hpMax" type="number" min="1" max="999" value="${tok.hpMax ?? 20}" /></label>
      <label class="dungeon-field-mini"><span>Exibir PV</span><select class="dungeon-input" name="hpVisible">${visOpts}</select></label>
      <label class="dungeon-field-mini"><span>Tamanho</span><select class="dungeon-input" name="sizeCells">${sizeOpts}</select></label>
      <label class="dungeon-field-mini"><span>Cor</span><select class="dungeon-input" name="color">${colorOpts}</select></label>
      <button type="submit" class="dungeon-btn dungeon-btn-secondary">Salvar Token</button>
    </form>`;
}

/**
 * Renderiza controles do token selecionado: setas acessíveis para mover por teclado e (para GM) editor de PV/tamanho/cor.
 * @param {object} scene Cena ativa.
 * @param {string} selectedId `tokenId` selecionado.
 * @param {boolean} isGm `true` quando em visão Mestre.
 * @returns {string} HTML ou vazio.
 */
export function renderSelectedTokenEditor(scene, selectedId, isGm) {
  if (!selectedId) return "";
  const tok = (scene?.tokens || []).find((t) => t.tokenId === selectedId && (isGm || t.layer === "player"));
  if (!tok) return "";
  return `
    <div class="dungeon-action-form dungeon-token-inspector" aria-label="Controles do token selecionado">
      <div class="dungeon-section-head">
        <div>
          <span class="dungeon-eyebrow">Token selecionado · (${tok.x}, ${tok.y})</span>
          <strong>${escapeHtml(tok.name)}</strong>
        </div>
        ${renderNudgePad(tok)}
      </div>
      ${isGm ? renderGmTokenForm(tok) : ""}
    </div>`;
}

/**
 * Renderiza o criador compacto de portas na grade do piso ativo (somente Mestre).
 * @param {boolean} isGm `true` quando em visão Mestre.
 * @returns {string} HTML ou vazio.
 */
export function renderAddDoorForm(isGm) {
  if (!isGm) return "";
  return `
    <details class="dungeon-audit" data-dungeon-details="add-door">
      <summary>+ Adicionar Porta na Grade</summary>
      <form class="dungeon-token-edit-form" data-dungeon="add-door-form">
        <label class="dungeon-field-mini"><span>X1</span><input class="dungeon-input" name="x1" type="number" min="0" max="40" value="3" /></label>
        <label class="dungeon-field-mini"><span>Y1</span><input class="dungeon-input" name="y1" type="number" min="0" max="40" value="2" /></label>
        <label class="dungeon-field-mini"><span>X2</span><input class="dungeon-input" name="x2" type="number" min="0" max="40" value="3" /></label>
        <label class="dungeon-field-mini"><span>Y2</span><input class="dungeon-input" name="y2" type="number" min="0" max="40" value="3" /></label>
        <label class="dungeon-field-mini"><span>Estado</span>
          <select class="dungeon-input" name="doorState">
            <option value="closed">Fechada</option>
            <option value="open">Aberta</option>
            <option value="locked">Trancada</option>
            <option value="secret">Secreta (só GM)</option>
          </select>
        </label>
        <button type="submit" class="dungeon-btn dungeon-btn-secondary">Criar Porta</button>
      </form>
    </details>`;
}

/**
 * Renderiza a barra compacta do Relógio do Mundo (visível na Mesa e no Escudo do Mestre).
 * @param {object} state Estado da sessão.
 * @param {boolean} isGm `true` para mostrar botões de avanço de tempo.
 * @returns {string} HTML do relógio.
 */
export function renderCompactWorldClock(state, isGm) {
  const label = state.worldDateLabel || "Ano 1, 1 de Veredas — 08:00 (lua crescente)";
  const controls = isGm
    ? `<div class="dungeon-chips-row">
        <button type="button" class="dungeon-chip-btn" data-dungeon="calendar-round">+1 Rodada (6s)</button>
        <button type="button" class="dungeon-chip-btn" data-dungeon="calendar-10m">+10 min</button>
        <button type="button" class="dungeon-chip-btn" data-dungeon="calendar-short-rest">Descanso Curto</button>
        <button type="button" class="dungeon-chip-btn" data-dungeon="calendar-long-rest">Descanso Longo</button>
      </div>`
    : "";
  return `
    <section class="dungeon-clock-bar" aria-label="Relógio do mundo na mesa">
      <div><span class="dungeon-eyebrow">Tempo do Mundo</span><strong class="dungeon-clock-readout" role="status">${escapeHtml(label)}</strong></div>
      ${controls}
    </section>`;
}
