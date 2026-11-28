/**
 * @file Tela 2 do AI Social Dungeon: A Mesa de Jogo (#/dungeon/mesa/:id).
 * Mapa 2D como herói (Z2), ferramentas táticas seguras p/ jogador e GM, editor de token, iniciativa e drawer Z3.
 */
import { escapeHtml } from "../shared/html.js";
import { projectCharacterPools } from "../rpg-sheet-and-lore.js";
import { resolveSessionMode, SESSION_MODES } from "./dungeon-ui-contract.js";
import { dungeonIcon, renderCavernArchSvg } from "./rpg-illustrations.js";
import { renderMapHud } from "./screen-map-hud.js";
import { renderZ3SessionBlock } from "./screen-table-layout.js";
import { renderAddDoorForm, renderCompactWorldClock, renderSelectedTokenEditor } from "./screen-table-panels.js";
import { renderInitiativePanel, renderTacticalToolbar } from "./screen-table-tactics.js";
import { buildCoinsView, buildVitalsView } from "./sheet-view-model.js";
import { createDefaultScene } from "./vtt-scene-schema.js";
import { isDioramaFlagEnabled, renderDioramaModePill } from "./diorama-lens.js";
import { renderTokenTray } from "./screen-token-tray.js";
import { formatFairplayBadge } from "./vtt-fairplay-roll.js";
import { projectInitiativeForPlayer } from "./vtt-tactics-reducer.js";
import { createInitiativeState } from "./vtt-tactics-schema.js";

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

function renderStatusChip(state, scene) {
  const tok = (scene?.tokens || []).find((t) => t.sheetId && t.sheetId === state.sheet?.character_id);
  const firstCond = tok?.conditions?.[0];
  if (firstCond?.label) return `<span class="dungeon-chip">${escapeHtml(firstCond.label)}</span>`;
  const lastRoll = state.campaignDoc?.rolls?.[state.campaignDoc.rolls.length - 1];
  const fairplay = formatFairplayBadge(lastRoll);
  if (fairplay.label) return `<span class="dungeon-chip" title="${escapeHtml(fairplay.title)}">${escapeHtml(fairplay.label)}</span>`;
  return state.joinMode === "p2p_player" ? `<span class="dungeon-chip">Conectado P2P</span>` : `<span class="dungeon-chip">Pronto</span>`;
}

function renderPlayerStatusStrip(state, pools, scene) {
  const vitals = buildVitalsView(state.sheet, pools);
  const coins = buildCoinsView(pools);
  const charHref = `#/dungeon/ficha/${encodeURIComponent(state.sheet.char_id)}`;
  return `
    <section class="dungeon-status-strip" aria-label="Resumo do personagem na mesa">
      <div class="dungeon-player-id">
        <span class="dungeon-badge-shield">${dungeonIcon("shield", 18)}</span>
        <div>
          <strong>${escapeHtml(state.sheet.name)}</strong>
          <span class="dungeon-muted">${escapeHtml(state.sheet.role_title || "Aventureiro")}</span>
        </div>
      </div>
      <div class="dungeon-vital-meters">
        <div class="dungeon-hp-wrap">
          <div class="dungeon-hp-label"><span>Vitalidade</span><strong>${vitals.text}</strong></div>
          <div class="dungeon-bar"><div class="dungeon-bar-fill" style="width:${vitals.pct}%"></div></div>
        </div>
        <span class="dungeon-coin-pill">${coins.text}</span>
        ${renderStatusChip(state, scene)}
        <a class="dungeon-btn dungeon-btn-ghost" href="${charHref}">Abrir Ficha →</a>
      </div>
    </section>`;
}

function renderTokenRosterRow(tok, isGm, selectedId) {
  const sel = tok.tokenId === selectedId;
  const selCls = sel ? " is-selected" : "";
  const layerTag = tok.layer === "gm" ? " [GM]" : "";
  const tokName = escapeHtml(tok.name);
  const layerLabel = tok.layer === "gm" ? "Revelar" : "Ocultar GM";
  const gmBtns = isGm
    ? `<button type="button" class="dungeon-chip-btn" data-dungeon="toggle-token-layer" data-token-id="${escapeHtml(tok.tokenId)}" aria-label="${layerLabel} ${tokName}">${layerLabel}</button><button type="button" class="dungeon-chip-btn" data-dungeon="remove-token" data-token-id="${escapeHtml(tok.tokenId)}" aria-label="Remover ${tokName}">Remover</button>`
    : "";
  return `<li><button type="button" class="dungeon-chip-btn${selCls}" data-dungeon="select-token" data-token-id="${escapeHtml(tok.tokenId)}" aria-pressed="${sel}">${escapeHtml(tok.name)}${layerTag} (${tok.x},${tok.y})</button>${gmBtns}</li>`;
}

function renderRoleToggleOrBadge(state, isGm) {
  if (state.joinMode === "p2p_player") {
    return `<span class="dungeon-code-tag">Visão: Jogador (P2P)</span>`;
  }
  const roleLabel = isGm ? "Visão: Mestre" : "Visão: Jogador";
  return `<button type="button" class="dungeon-chip-btn${isGm ? " is-selected" : ""}" data-dungeon="toggle-viewer-role" aria-pressed="${isGm}">${roleLabel}</button>`;
}

function renderDioramaLensStrip(state) {
  if (!state?.dioramaEnabled && !isDioramaFlagEnabled()) return "";
  return renderDioramaModePill(state?.dioramaMode || "2d");
}

function renderMapControlsBar(scene, floor, state, isGm) {
  const gridLabel = floor?.grid?.type === "hex" ? "Hex" : "Quadrada";
  const zoomPct = Math.round((state.camera?.zoom || 1) * 100);
  const gridBtn = isGm
    ? `<button type="button" class="dungeon-chip-btn" data-dungeon="toggle-grid-type" aria-pressed="${floor?.grid?.type === "hex"}">Grade: ${gridLabel}</button>`
    : "";
  return `
    <div class="dungeon-section-head">
      <div>
        <span class="dungeon-eyebrow">Subversus · Arraste Tokens · Ctrl+Roda ou Pinça para Zoom</span>
        <h2>${escapeHtml(scene.name)} (${gridLabel} · <span data-dungeon-zoom-label>${zoomPct}%</span>)</h2>
      </div>
      <div class="dungeon-chips-row">
        ${renderDioramaLensStrip(state)}
        <button type="button" class="dungeon-chip-btn" data-dungeon="canvas-zoom-out" aria-label="Diminuir zoom">−</button>
        <button type="button" class="dungeon-chip-btn" data-dungeon="canvas-fit" aria-label="Enquadrar mapa inteiro">Ajustar</button>
        <button type="button" class="dungeon-chip-btn" data-dungeon="canvas-reset">100%</button>
        <button type="button" class="dungeon-chip-btn" data-dungeon="canvas-zoom-in" aria-label="Aumentar zoom">+</button>
        ${gridBtn}
        ${renderRoleToggleOrBadge(state, isGm)}
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
        <span class="dungeon-eyebrow">Mapa de fundo (SHA-256)</span>
        <label for="dungeon-map-upload" class="dungeon-btn dungeon-btn-ghost dungeon-file-trigger">Carregar imagem do mapa</label>
        <input id="dungeon-map-upload" class="sr-only" type="file" accept="image/*" data-dungeon="upload-map" />
      </div>
    </div>
    ${renderAddDoorForm(isGm)}`;
}

function shouldShowInitiative(state, scene, isGm) {
  if (isGm) return true;
  const projected = projectInitiativeForPlayer(createInitiativeState(state.initiative), { [scene.sceneId]: scene });
  return projected.entries.length > 0;
}

function renderInteractiveMapSection(state, scene) {
  const floor = scene.floors.find((f) => f.z === scene.activeFloorZ) || scene.floors[0];
  const isGm = state.viewerRole === "gm";
  const visibleTokens = (scene.tokens || []).filter((t) => t.floorZ === floor.z && (isGm || t.layer === "player"));
  const rosterHtml = visibleTokens.map((t) => renderTokenRosterRow(t, isGm, state.selectedTokenId)).join("");
  const notice = isGm && state.mapNotice ? `<p class="dungeon-inline-status" role="status">${escapeHtml(state.mapNotice)}</p>` : "";
  const initHtml = shouldShowInitiative(state, scene, isGm) ? renderInitiativePanel(state, scene, isGm) : "";
  return `
    <section class="dungeon-panel dungeon-map-hero" aria-label="Mapa tático 2D" data-dungeon-zone="mapHero">
      ${renderMapControlsBar(scene, floor, state, isGm)}
      ${renderTacticalToolbar(state, scene, floor, isGm)}
      <canvas id="dungeon-vtt-canvas" class="dungeon-vtt-canvas" width="768" height="480" tabindex="0" aria-label="Tabuleiro 2D da cena"></canvas>
      ${renderMapHud(state, scene)}
      ${notice}
      <ul class="dungeon-clean-list dungeon-token-roster">${rosterHtml}</ul>
      ${renderSelectedTokenEditor(scene, state.selectedTokenId, isGm)}
      ${renderTokenTray(state, scene)}
      ${renderMapFormsRow(isGm)}
    </section>
    ${initHtml}`;
}

function resolveCoords(state, scene) {
  const tok = (scene.tokens || []).find((t) => t.sheetId && t.sheetId === state.sheet?.character_id);
  return tok ? { x: tok.x, y: tok.y } : state.playerPos;
}

function renderSceneVignette(sceneTitle, pos) {
  return `
    <section class="dungeon-scene-vignette dungeon-scene-vignette--compact">
      ${renderCavernArchSvg()}
      <div class="dungeon-scene-caption">
        <span class="dungeon-eyebrow">Local Atual · Posição [${pos.x}, ${pos.y}]</span>
        <h1>${escapeHtml(sceneTitle)}</h1>
      </div>
    </section>`;
}

function renderDiceAuditBlock() {
  return `
    <details class="dungeon-audit" data-dungeon-details="dice-audit">
      <summary>Como o dado funciona</summary>
      <div class="dungeon-audit-body">
        <p>Aqui o d20 é sorteado só neste aparelho (<code>crypto.getRandomValues</code>, sem viés de módulo).</p>
        <p>Numa mesa com outros aparelhos, a rolagem justa entre jogadores (Commit-Reveal²) já está escrita e testada em <code>rpg-crypto-table.js</code>, mas ainda não é usada nesta demonstração.</p>
      </div>
    </details>`;
}

/**
 * Renderiza a Tela 2 (A Mesa de Jogo) focada em mapa 2D herói, ferramentas táticas, crônica e rolagem justa.
 *
 * @param {object} state Estado atual da sessão AI Social Dungeon.
 * @returns {string} HTML interno para a moldura `.dungeon-sanctum`.
 */
export function renderTableScreen(state) {
  const scene = state.scene?.floors?.length ? state.scene : createDefaultScene(state.localActor || "local");
  const projected = projectCharacterPools(state.sheet.pools_base, state.sheet.delta_ledger);
  const sceneTitle = state.campaignId
    ? state.tableName || scene.name
    : TABLE_SCENE_TITLES[state.tableId] || scene.name || "Cripta das Águas Sussurrantes";
  const playerLayout = resolveSessionMode("mesa", state.viewerRole || "player") === SESSION_MODES.PLAYER_SESSION;
  const isGm = state.viewerRole === "gm";
  const noticeBanner = state.campaignNotice
    ? `<p class="dungeon-inline-status dungeon-table-notice" role="status">${escapeHtml(state.campaignNotice)}</p>`
    : "";
  const clockHtml = state.campaignId || isGm ? renderCompactWorldClock(state, isGm) : "";
  return `
    ${noticeBanner}
    ${renderPlayerStatusStrip(state, projected.pools, scene)}
    ${renderSceneVignette(sceneTitle, resolveCoords(state, scene))}
    ${renderUnlockedVaultBanner(state.vaultSecret)}
    ${renderInteractiveMapSection(state, scene)}
    ${clockHtml}
    ${renderZ3SessionBlock(state, playerLayout)}
    ${renderDiceAuditBlock()}`;
}
