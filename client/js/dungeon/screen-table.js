/**
 * @file Tela 2 do AI Social Dungeon: A Mesa de Jogo (#/dungeon/mesa/:id).
 */
import { escapeHtml } from "../shared/html.js";
import { projectCharacterPools } from "../rpg-sheet-and-lore.js";
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

function renderDiceAside(state) {
  const gridCells = renderTacticalGridCells(state.playerPos);
  return `
    <aside class="dungeon-dice-col">
      <div class="dungeon-panel dungeon-dice-tray">
        <span class="dungeon-eyebrow">Dado deste aparelho</span>
        <h2>Bandeja de Dados</h2>
        <div class="dungeon-d20-stage">${renderD20DieSvg(state.lastRoll.value, state.lastRoll.committed)}</div>
        <p class="dungeon-muted">Resultado atual: <strong>d20 = ${state.lastRoll.value}</strong> · sorteado neste aparelho, sem viés.</p>
        <button type="button" class="dungeon-btn dungeon-btn-secondary" data-dungeon="roll-d20">${dungeonIcon("casino", 16)}<span>Rolar d20</span></button>
      </div>
      <details class="dungeon-panel dungeon-tactical-box" open>
        <summary>Mapa Tático da Cripta (5×5 · Clique para mover)</summary>
        <div class="dungeon-tactical-grid">${gridCells}</div>
        <p class="dungeon-muted"><code>LY</code> Você · <code>AL</code> Altar [3,1] · <code>SA</code> Saída [0,4]</p>
      </details>
    </aside>`;
}

/**
 * Renderiza a Tela 2 (A Mesa de Jogo) focada em leitura narrativa, rolagem D20 justa e grade tática.
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
