/**
 * @file Fragmentos de layout da Mesa (Z3 crônica/dados/handouts) — extraídos de screen-table.js.
 * @module dungeon/screen-table-layout
 */
import { escapeHtml } from "../shared/html.js";
import { dungeonIcon, renderD20DieSvg } from "./rpg-illustrations.js";
import { renderHandoutViewer } from "./screen-notes.js";
import { renderEntrySeal, renderFairplayUnclosed, isFairplayLabEnabled } from "./vtt-fairplay-selo.js";

/** Atalhos de ação sugeridos na crônica da Mesa. */
export const QUICK_CHIPS = [
  "Examinar inscrições do altar",
  "Conversar com o ermitão",
  "Iluminar a água negra",
];

const ROLL_MODES = [
  { id: "normal", label: "Normal" },
  { id: "advantage", label: "Vantagem" },
  { id: "disadvantage", label: "Desvantagem" },
];

const QUICK_FORMULAS = [
  { label: "1d20+@for", formula: "1d20+@for # Ataque" },
  { label: "1d20+@des", formula: "1d20+@des # Destreza" },
  { label: "2d6+3", formula: "2d6+3 # Dano" },
  { label: "/gmroll 1d20", formula: "/gmroll 1d20 # Teste Secreto" },
];

function renderTacticalGridCells(playerPos) {
  const rows = [];
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 5; x += 1) {
      const isPlayer = playerPos.x === x && playerPos.y === y;
      const isAltar = x === 3 && y === 1;
      const isExit = x === 0 && y === 4;
      const token = isPlayer ? "LY" : isAltar ? "AL" : isExit ? "SA" : "·";
      const cls = isPlayer ? " is-player" : isAltar ? " is-altar" : isExit ? " is-exit" : "";
      rows.push(`<button type="button" class="dungeon-grid-cell${cls}" data-dungeon="grid-cell" data-x="${x}" data-y="${y}" aria-label="Célula ${x},${y}">${token}</button>`);
    }
  }
  return rows.join("");
}

function canViewChronicleEntry(entry, state) {
  if (state.viewerRole === "gm") return true;
  if (!entry?.visibility || entry.visibility === "public") return true;
  if (entry.visibility === "gm" && state.joinMode === "p2p_player") {
    const myId = state.vttKeypair?.routeId;
    return Boolean(myId && entry.author === myId);
  }
  return false;
}

function renderChronicleEntry(entry, state) {
  const isDm = entry.speaker.includes("Narrador") || entry.speaker.includes("Guardião");
  const isSecret = entry.visibility === "gm" || entry.visibility === "blind";
  const secretCls = isSecret ? " is-secret-roll" : "";
  const secretIcon = isSecret ? `${dungeonIcon("lock", 13)} ` : "";
  const metaText = entry.rollNote ? `${entry.badge} · ${entry.rollNote}` : entry.badge;
  return `
    <article class="dungeon-turn-card${isDm ? " is-dm" : " is-player"}${secretCls}">
      <header class="dungeon-turn-head">
        <strong>${secretIcon}${escapeHtml(entry.speaker)}</strong>
        <span class="dungeon-code-tag">${escapeHtml(metaText || "")}</span>
      </header>
      <p class="dungeon-turn-prose">${escapeHtml(entry.text)}</p>
      ${renderEntrySeal(entry, state)}
    </article>`;
}

function renderRollModeChips(activeMode) {
  const mode = activeMode || "normal";
  return ROLL_MODES.map((m) => {
    const cls = m.id === mode ? " is-selected" : "";
    return `<button type="button" class="dungeon-chip-btn${cls}" data-dungeon="roll-mode" data-mode="${m.id}" aria-pressed="${m.id === mode}">${escapeHtml(m.label)}</button>`;
  }).join("");
}

function renderLastFormulaSummary(state) {
  if (state.rollError) return `<p class="dungeon-alert-warn" role="alert">${escapeHtml(state.rollError)}</p>`;
  const r = state.lastFormulaRoll;
  if (!r || !r.ok) return "";
  if (state.viewerRole !== "gm" && (r.visibility === "blind" || (r.visibility === "gm" && state.joinMode !== "p2p_player"))) {
    return "";
  }
  const dice = (r.rolls || []).map((d) => (d.kept ? String(d.value) : `(${d.value})`)).join(", ");
  const tag = r.crits ? " · CRÍTICO!" : r.fumbles ? " · FALHA CRÍTICA!" : "";
  return `<p class="dungeon-inline-status" role="status">${escapeHtml(r.label || r.formula)}: [${escapeHtml(dice)}] = <strong>${escapeHtml(String(r.total))}</strong>${tag}</p>`;
}

function renderFormulaTray(state) {
  const quickBtns = QUICK_FORMULAS.map((q) => `<button type="button" class="dungeon-chip-btn" data-dungeon="roll-quick" data-formula="${escapeHtml(q.formula)}">${escapeHtml(q.label)}</button>`).join("");
  const dice3d = state.dice3dEnabled !== false;
  const dice3dLabel = dice3d ? "Dados 3D ligados" : "Dados 3D desligados";
  return `
    <div class="dungeon-chips-row" role="group" aria-label="Modo de rolagem">${renderRollModeChips(state.rollMode)}</div>
    <button type="button" class="dungeon-chip-btn${dice3d ? " is-selected" : ""}" data-dungeon="toggle-dice3d" aria-pressed="${dice3d}">${escapeHtml(dice3dLabel)}</button>
    <form class="dungeon-action-form" data-dungeon="roll-formula-form">
      <label class="sr-only" for="dungeon-roll-input">Fórmula de dados</label>
      <div class="dungeon-input-row">
        <input id="dungeon-roll-input" class="dungeon-input" type="text" name="formula" placeholder="ex.: 2d20kh1+@for ou /gmroll 1d20" autocomplete="off" />
        <button type="submit" class="dungeon-btn dungeon-btn-primary">Rolar</button>
      </div>
      <div class="dungeon-chips-row">${quickBtns}</div>
    </form>
    ${renderLastFormulaSummary(state)}`;
}

/**
 * Coluna de crônica + entrada de ação do turno (com filtro Zero-Spoiler em visão Jogador).
 *
 * @param {object} state Estado da sessão dungeon.
 * @returns {string} HTML interno.
 */
export function renderChronicleColumn(state) {
  const visibleTurns = (state.chronicle || []).filter((e) => canViewChronicleEntry(e, state));
  const turnsHtml = visibleTurns.map((e) => renderChronicleEntry(e, state)).join("");
  const unclosedHtml = state.fairplayLabEnabled || isFairplayLabEnabled() ? renderFairplayUnclosed(state) : "";
  const chipsHtml = QUICK_CHIPS.map((txt) => `<button type="button" class="dungeon-chip-btn" data-dungeon="chip" data-text="${escapeHtml(txt)}">${escapeHtml(txt)}</button>`).join("");
  const actorFirst = String(state.sheet?.name || "seu personagem").split(/[,\s]+/)[0] || "seu personagem";
  return `
    <section class="dungeon-chronicle-col" aria-label="Crônica da Mesa">
      ${unclosedHtml}
      <div class="dungeon-chronicle-list">${turnsHtml}</div>
      <form class="dungeon-action-form" data-dungeon="action-form">
        <div class="dungeon-chips-row">${chipsHtml}</div>
        <label class="sr-only" for="dungeon-action-input">O que você faz neste turno?</label>
        <div class="dungeon-input-row">
          <input id="dungeon-action-input" class="dungeon-input" type="text" name="actionText" placeholder="Descreva o que ${escapeHtml(actorFirst)} faz agora (ou /roll 1d20)..." autocomplete="off" />
          <button type="submit" class="dungeon-btn dungeon-btn-primary" data-dungeon="submit-action">Declarar Ação →</button>
        </div>
      </form>
    </section>`;
}

/**
 * Aside com bandeja de dados e mini-grade 5×5 (recolhida por padrão para não competir com o Mapa 2D).
 *
 * @param {object} state Estado da sessão dungeon.
 * @param {{ hideTacticalDemo?: boolean }} [opts] Opções de renderização.
 * @returns {string} HTML interno.
 */
export function renderDiceAside(state, opts = {}) {
  const hideTactical = Boolean(opts.hideTacticalDemo);
  const gridCells = renderTacticalGridCells(state.playerPos);
  const tactical = hideTactical
    ? ""
    : `<details class="dungeon-panel dungeon-tactical-box" data-dungeon-details="legacy-grid">
        <summary>Mini-grade da Cripta (5×5 · compatibilidade do Cofre)</summary>
        <div class="dungeon-tactical-grid">${gridCells}</div>
        <p class="dungeon-muted"><code>LY</code> Você · <code>AL</code> Altar [3,1] · <code>SA</code> Saída [0,4]</p>
      </details>`;
  return `
    <aside class="dungeon-dice-col">
      <div class="dungeon-panel dungeon-dice-tray">
        <span class="dungeon-eyebrow">Dado deste aparelho</span>
        <h2>Bandeja de Dados</h2>
        <div class="dungeon-d20-stage">${renderD20DieSvg(state.lastRoll.value, state.lastRoll.committed)}</div>
        <p class="dungeon-muted">Resultado atual: <strong>d20 = ${state.lastRoll.value}</strong> · sorteado neste aparelho, sem viés.</p>
        <div class="dungeon-card-actions">
          <button type="button" class="dungeon-btn dungeon-btn-secondary" data-dungeon="roll-d20">${dungeonIcon("casino", 16)}<span>Rolar d20</span></button>
        </div>
        ${renderFormulaTray(state)}
      </div>
      ${tactical}
    </aside>`;
}

/**
 * Zona Z3: drawer colapsável (crônica, dados e handouts) para sessão jogador; grade 2 colunas + handouts para GM.
 *
 * @param {object} state Estado da sessão.
 * @param {boolean} [playerSession=false] Se true, usa layout drawer; se false, grade 2 colunas.
 * @returns {string} HTML do bloco Z3.
 */
export function renderZ3SessionBlock(state, playerSession = false) {
  const chronicle = renderChronicleColumn(state);
  const dice = renderDiceAside(state, { hideTacticalDemo: playerSession });
  const handouts = renderHandoutViewer(state);
  const hasShared = (state.notes || []).some((n) => n.visibility === "shared" || n.visibility === "public");
  if (!playerSession) {
    const gmHandouts = hasShared
      ? `<details class="dungeon-drawer-segment dungeon-drawer-handouts" data-dungeon-details="z3-handouts" open><summary>Handouts compartilhados</summary>${handouts}</details>`
      : "";
    return `<div class="dungeon-table-layout">${chronicle}${dice}</div>${gmHandouts}`;
  }
  return `
    <div class="dungeon-z3-drawer" data-dungeon-zone="narrativeRoll">
      <details class="dungeon-drawer-segment" data-dungeon-details="z3-chronicle" open>
        <summary>Crônica da mesa</summary>
        ${chronicle}
      </details>
      <details class="dungeon-drawer-segment" data-dungeon-details="z3-dice" open>
        <summary>Bandeja de dados</summary>
        ${dice}
      </details>
      <details class="dungeon-drawer-segment dungeon-drawer-handouts" data-dungeon-details="z3-handouts"${hasShared ? " open" : ""}>
        <summary>Handouts</summary>
        ${handouts}
      </details>
    </div>`;
}
