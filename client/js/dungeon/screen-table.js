/**
 * @file Tela 2 do AI Social Dungeon: A Mesa de Jogo (#/dungeon/mesa/:id).
 */
import { escapeHtml } from "../shared/html.js";
import { projectCharacterPools } from "../rpg-sheet-and-lore.js";
import { createDefaultScene } from "./vtt-scene-schema.js";
import { renderInitiativePanel, renderTacticalToolbar } from "./screen-table-tactics.js";
import { dungeonIcon, renderCavernArchSvg, renderD20DieSvg } from "./rpg-illustrations.js";

const QUICK_CHIPS = [
  "Examinar inscrições do altar",
  "Conversar com o ermitão",
  "Iluminar a água negra",
];

const TABLE_SCENE_TITLES = {
  "floresta-de-vidro": "Assembleia na Floresta de Vidro",
};

function renderUnlockedVaultBanner(vaultSecret) {
  if (!vaultSecret?.unlocked) return "";
  return `
    <section class="dungeon-unlocked-banner" role="status">
      <strong>${escapeHtml(vaultSecret.title)} · Aberto com ${vaultSecret.sharesSubmitted} de ${vaultSecret.totalPeers} partes:</strong>
      <p>${escapeHtml(vaultSecret.revealedText)}</p>
    </section>`;
}

function renderPlayerStatusStrip(state, pools) {
  const hp = pools.hp_current ?? 24;
  const hpMax = state.sheet.pools_base?.hp_max || 24;
  const pct = Math.max(0, Math.min(100, Math.round((hp / hpMax) * 100)));
  const charHref = `#/dungeon/ficha/${encodeURIComponent(state.sheet.char_id)}`;
  return `
    <section class="dungeon-status-strip" aria-label="Resumo do personagem na mesa">
      <div class="dungeon-player-id">
        <span class="dungeon-badge-shield">${dungeonIcon("shield", 18)}</span>
        <div>
          <strong>${escapeHtml(state.sheet.name)}</strong>
          <span class="dungeon-muted">${escapeHtml(state.sheet.role_title || "Paladina")}</span>
        </div>
      </div>
      <div class="dungeon-vital-meters">
        <div class="dungeon-hp-wrap">
          <div class="dungeon-hp-label"><span>Vitalidade</span><strong>${hp} / ${hpMax} PV</strong></div>
          <div class="dungeon-bar"><div class="dungeon-bar-fill" style="width:${pct}%"></div></div>
        </div>
        <span class="dungeon-coin-pill">${pools.currency_gp ?? 50} Moedas</span>
        <span class="dungeon-chip">Em Vigília</span>
        <a class="dungeon-btn dungeon-btn-ghost" href="${charHref}">Ver Grimório →</a>
      </div>
    </section>`;
}

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

function renderChronicleEntry(entry) {
  const isDm = entry.speaker.includes("Narrador") || entry.speaker.includes("Guardião");
  return `
    <article class="dungeon-turn-card${isDm ? " is-dm" : " is-player"}">
      <header class="dungeon-turn-head">
        <strong>${escapeHtml(entry.speaker)}</strong>
        <span class="dungeon-code-tag">${escapeHtml(entry.badge)} · ${escapeHtml(entry.rollNote)}</span>
      </header>
      <p class="dungeon-turn-prose">${escapeHtml(entry.text)}</p>
    </article>`;
}

function renderChronicleColumn(state) {
  const turnsHtml = state.chronicle.map(renderChronicleEntry).join("");
  const chipsHtml = QUICK_CHIPS.map((txt) => `<button type="button" class="dungeon-chip-btn" data-dungeon="chip" data-text="${escapeHtml(txt)}">${escapeHtml(txt)}</button>`).join("");
  return `
    <section class="dungeon-chronicle-col" aria-label="Crônica da Mesa">
      <div class="dungeon-chronicle-list">${turnsHtml}</div>
      <form class="dungeon-action-form" data-dungeon="action-form">
        <div class="dungeon-chips-row">${chipsHtml}</div>
        <label class="sr-only" for="dungeon-action-input">O que você faz neste turno?</label>
        <div class="dungeon-input-row">
          <input id="dungeon-action-input" class="dungeon-input" type="text" name="actionText" placeholder="Descreva o que Lyra faz agora..." autocomplete="off" />
          <button type="submit" class="dungeon-btn dungeon-btn-primary" data-dungeon="submit-action">Declarar Ação →</button>
        </div>
      </form>
    </section>`;
}

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
  const dice = (r.rolls || []).map((d) => (d.kept ? String(d.value) : `(${d.value})`)).join(", ");
  const tag = r.crits ? " · CRÍTICO!" : r.fumbles ? " · FALHA CRÍTICA!" : "";
  return `<p class="dungeon-inline-status" role="status">${escapeHtml(r.label || r.formula)}: [${escapeHtml(dice)}] = <strong>${r.total}</strong>${tag}</p>`;
}

function renderFormulaTray(state) {
  const quickBtns = QUICK_FORMULAS.map((q) => `<button type="button" class="dungeon-chip-btn" data-dungeon="roll-quick" data-formula="${escapeHtml(q.formula)}">${escapeHtml(q.label)}</button>`).join("");
  const dice3d = state.dice3dEnabled !== false;
  const dice3dLabel = dice3d ? "Dados 3D ligados" : "Dados 3D desligados";
  return `
    <div class="dungeon-chips-row" role="group" aria-label="Modo de rolagem">${renderRollModeChips(state.rollMode)}</div>
    <button type="button" class="dungeon-chip-btn" data-dungeon="toggle-dice3d" aria-pressed="${dice3d}">${escapeHtml(dice3dLabel)}</button>
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

function renderDiceAside(state) {
  const gridCells = renderTacticalGridCells(state.playerPos);
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
      <details class="dungeon-panel dungeon-tactical-box" open>
        <summary>Mapa Tático da Cripta (5×5 · Clique para mover)</summary>
        <div class="dungeon-tactical-grid">${gridCells}</div>
        <p class="dungeon-muted"><code>LY</code> Você · <code>AL</code> Altar [3,1] · <code>SA</code> Saída [0,4]</p>
      </details>
    </aside>`;
}

function renderTokenRosterRow(tok, isGm, selectedId) {
  const selCls = tok.tokenId === selectedId ? " is-selected" : "";
  const layerTag = tok.layer === "gm" ? " [GM]" : "";
  const gmBtns = isGm
    ? `<button type="button" class="dungeon-chip-btn" data-dungeon="toggle-token-layer" data-token-id="${escapeHtml(tok.tokenId)}">${tok.layer === "gm" ? "Revelar" : "Ocultar GM"}</button><button type="button" class="dungeon-chip-btn" data-dungeon="remove-token" data-token-id="${escapeHtml(tok.tokenId)}">Remover</button>`
    : "";
  return `<li><button type="button" class="dungeon-chip-btn${selCls}" data-dungeon="select-token" data-token-id="${escapeHtml(tok.tokenId)}">${escapeHtml(tok.name)}${layerTag} (${tok.x},${tok.y})</button>${gmBtns}</li>`;
}

function renderMapControlsBar(scene, floor, state, isGm) {
  const gridLabel = floor?.grid?.type === "hex" ? "Hex" : "Quadrada";
  const zoomPct = Math.round((state.camera?.zoom || 1) * 100);
  const roleLabel = isGm ? "Visão: Mestre" : "Visão: Jogador";
  return `
    <div class="dungeon-section-head">
      <div>
        <span class="dungeon-eyebrow">Mapa 2D Interativo · Arraste Tokens ou Pinça para Zoom</span>
        <h2>${escapeHtml(scene.name)} (${gridLabel} · ${zoomPct}%)</h2>
      </div>
      <div class="dungeon-chips-row">
        <button type="button" class="dungeon-chip-btn" data-dungeon="canvas-zoom-out" aria-label="Diminuir zoom">-</button>
        <button type="button" class="dungeon-chip-btn" data-dungeon="canvas-reset">100%</button>
        <button type="button" class="dungeon-chip-btn" data-dungeon="canvas-zoom-in" aria-label="Aumentar zoom">+</button>
        <button type="button" class="dungeon-chip-btn" data-dungeon="toggle-grid-type">Grade: ${gridLabel}</button>
        <button type="button" class="dungeon-chip-btn is-selected" data-dungeon="toggle-viewer-role">${roleLabel}</button>
      </div>
    </div>`;
}

function renderMapFormsRow(isGm) {
  const layerSelect = isGm
    ? `<label class="sr-only" for="dungeon-token-layer">Camada do token</label><select id="dungeon-token-layer" class="dungeon-input"><option value="player">Camada Jogadores</option><option value="gm">Camada Mestre (oculto)</option></select>`
    : "";
  return `
    <div class="dungeon-two-col">
      <form class="dungeon-action-form" data-dungeon="add-token-form">
        <div class="dungeon-input-row">
          <label class="sr-only" for="dungeon-token-name">Nome do token</label>
          <input id="dungeon-token-name" class="dungeon-input" type="text" maxlength="48" placeholder="Novo token (ex.: Goblin Arqueiro)" autocomplete="off" />
          ${layerSelect}
          <button type="submit" class="dungeon-btn dungeon-btn-secondary">Adicionar Token</button>
        </div>
      </form>
      <div class="dungeon-action-form">
        <label for="dungeon-map-upload" class="dungeon-muted">Subir imagem de mapa (deduplicada por SHA-256):</label>
        <input id="dungeon-map-upload" class="dungeon-input" type="file" accept="image/*" data-dungeon="upload-map" />
      </div>
    </div>`;
}

function renderInteractiveMapSection(state) {
  const scene = state.scene?.floors?.length ? state.scene : createDefaultScene(state.localActor || "local");
  const floor = scene.floors.find((f) => f.z === scene.activeFloorZ) || scene.floors[0];
  const isGm = state.viewerRole === "gm";
  const visibleTokens = (scene.tokens || []).filter((t) => t.floorZ === floor.z && (isGm || t.layer === "player"));
  const rosterHtml = visibleTokens.map((t) => renderTokenRosterRow(t, isGm, state.selectedTokenId)).join("");
  const notice = isGm && state.mapNotice ? `<p class="dungeon-inline-status" role="status">${escapeHtml(state.mapNotice)}</p>` : "";
  return `
    <section class="dungeon-panel" aria-label="Mapa tático 2D">
      ${renderMapControlsBar(scene, floor, state, isGm)}
      ${renderTacticalToolbar(state, scene, floor, isGm)}
      <canvas id="dungeon-vtt-canvas" width="768" height="420" style="width:100%;max-height:420px;display:block;border-radius:6px;background:#0c0e11;touch-action:none" aria-label="Tabuleiro 2D da cena"></canvas>
      ${notice}
      ${renderMapFormsRow(isGm)}
      <ul class="dungeon-clean-list">${rosterHtml}</ul>
    </section>
    ${renderInitiativePanel(state, scene, isGm)}`;
}

/**
 * Renderiza a Tela 2 (A Mesa de Jogo) focada em mapa 2D, leitura narrativa, rolagem justa e grade tática.
 *
 * @param {object} state Estado atual da sessão AI Social Dungeon.
 * @returns {string} HTML interno para a moldura `.dungeon-sanctum`.
 */
export function renderTableScreen(state) {
  const projected = projectCharacterPools(state.sheet.pools_base, state.sheet.delta_ledger);
  const sceneTitle = TABLE_SCENE_TITLES[state.tableId] || "Cripta das Águas Sussurrantes";
  return `
    ${renderPlayerStatusStrip(state, projected.pools)}
    <section class="dungeon-scene-vignette">
      ${renderCavernArchSvg()}
      <div class="dungeon-scene-caption">
        <span class="dungeon-eyebrow">Local Atual · Posição [${state.playerPos.x}, ${state.playerPos.y}]</span>
        <h1>${escapeHtml(sceneTitle)}</h1>
      </div>
    </section>
    ${renderUnlockedVaultBanner(state.vaultSecret)}
    ${renderInteractiveMapSection(state)}
    <div class="dungeon-table-layout">
      ${renderChronicleColumn(state)}
      ${renderDiceAside(state)}
    </div>
    <details class="dungeon-audit">
      <summary>Como o dado funciona</summary>
      <div class="dungeon-audit-body">
        <p>Aqui o d20 é sorteado só neste aparelho (<code>crypto.getRandomValues</code>, sem viés de módulo).</p>
        <p>Numa mesa com outros aparelhos, a rolagem justa entre jogadores (Commit-Reveal²) já está escrita e testada em <code>rpg-crypto-table.js</code>, mas ainda não é usada nesta demonstração.</p>
      </div>
    </details>`;
}
