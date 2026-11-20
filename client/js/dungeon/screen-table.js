/**
 * @file Tela 2 do AI Social Dungeon: A Mesa de Jogo (#/dungeon/mesa/:id).
 */
import { escapeHtml } from "../shared/html.js";
import { projectCharacterPools } from "../rpg-sheet-and-lore.js";
import { createDefaultScene } from "./vtt-scene-schema.js";
import { renderInitiativePanel, renderTacticalToolbar } from "./screen-table-tactics.js";
import { dungeonIcon, renderCavernArchSvg } from "./rpg-illustrations.js";
import { resolveSessionMode, SESSION_MODES } from "./dungeon-ui-contract.js";
import { renderZ3SessionBlock } from "./screen-table-layout.js";

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
  if (!isGm) return "";
  const layerSelect = `<label class="sr-only" for="dungeon-token-layer">Camada do token</label><select id="dungeon-token-layer" class="dungeon-input"><option value="player">Camada Jogadores</option><option value="gm">Camada Mestre (oculto)</option></select>`;
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
    <section class="dungeon-panel dungeon-map-hero" aria-label="Mapa tático 2D" data-dungeon-zone="mapHero">
      ${renderMapControlsBar(scene, floor, state, isGm)}
      ${isGm ? renderTacticalToolbar(state, scene, floor, isGm) : ""}
      <canvas id="dungeon-vtt-canvas" width="768" height="420" style="width:100%;max-height:420px;display:block;border-radius:6px;background:#0c0e11;touch-action:none" aria-label="Tabuleiro 2D da cena"></canvas>
      ${notice}
      ${renderMapFormsRow(isGm)}
      <ul class="dungeon-clean-list">${rosterHtml}</ul>
    </section>
    ${isGm ? renderInitiativePanel(state, scene, isGm) : ""}`;
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
  const sessionMode = resolveSessionMode("mesa", state.viewerRole || "player");
  const playerLayout = sessionMode === SESSION_MODES.PLAYER_SESSION;
  return `
    ${renderPlayerStatusStrip(state, projected.pools)}
    <section class="dungeon-scene-vignette dungeon-scene-vignette--compact">
      ${renderCavernArchSvg()}
      <div class="dungeon-scene-caption">
        <span class="dungeon-eyebrow">Local Atual · Posição [${state.playerPos.x}, ${state.playerPos.y}]</span>
        <h1>${escapeHtml(sceneTitle)}</h1>
      </div>
    </section>
    ${renderUnlockedVaultBanner(state.vaultSecret)}
    ${renderInteractiveMapSection(state)}
    ${renderZ3SessionBlock(state, playerLayout)}
    <details class="dungeon-audit">
      <summary>Como o dado funciona</summary>
      <div class="dungeon-audit-body">
        <p>Aqui o d20 é sorteado só neste aparelho (<code>crypto.getRandomValues</code>, sem viés de módulo).</p>
        <p>Numa mesa com outros aparelhos, a rolagem justa entre jogadores (Commit-Reveal²) já está escrita e testada em <code>rpg-crypto-table.js</code>, mas ainda não é usada nesta demonstração.</p>
      </div>
    </details>`;
}