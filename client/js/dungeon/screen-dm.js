/**
 * @file Tela 4 do AI Social Dungeon: Escudo do Mestre Sovereign (#/dungeon/mestre/:id).
 */
import { escapeHtml } from "../shared/html.js";
import { inspectPeerPromptForRole } from "./dungeon-state.js";
import { dungeonIcon, renderShamirSealSvg } from "./rpg-illustrations.js";

const INSPECT_ROLES = [
  { id: "STAGE1_JUDGE_RULES", label: "Juiz de Regras" },
  { id: "STAGE1_LORE_RAG", label: "Guardião de Lore" },
  { id: "STAGE1_NPC_ACTOR", label: "Voz NPC" },
];

function renderNarratorPanel() {
  return `
    <section class="dungeon-panel">
      <span class="dungeon-eyebrow">Narrador</span>
      <h2>Roteiro fixo, sem IA</h2>
      <p class="dungeon-muted">Nesta demonstração o narrador responde com frases prontas. Nenhum modelo roda e nada é enviado a serviço nenhum.</p>
      <p class="dungeon-muted">IA no Vox fica só no RPG, primeiro no próprio aparelho. Serviço externo (como a Maritaca) só com a chave da própria mesa e o consentimento de todos os jogadores (ADR-033).</p>
    </section>`;
}

function renderCoDmSection(state) {
  const w = state.coDmWhispers || {};
  const sensory = (w.sensoryOptionsPtBr || []).map((opt) => `<li>${escapeHtml(opt)}</li>`).join("");
  const rumorBadge = w.rumorAlertPtBr
    ? `<p class="dungeon-alert-warn">${escapeHtml(w.rumorAlertPtBr)}</p>`
    : "";
  return `
    <section class="dungeon-panel">
      <span class="dungeon-eyebrow">Dicas por regras (sem IA)</span>
      <h2>Sussurros Silenciosos do Co-Mestre</h2>
      <div class="dungeon-whisper-box">
        <strong>Sugestão Imediata: ${escapeHtml(w.silentToolCall?.skill || "Investigação")} (CD ${w.silentToolCall?.suggestedDc ?? 14})</strong>
        <p class="dungeon-muted">${escapeHtml(w.pacingHintPtBr || "Ofereça pistas antes de rolagens punitivas.")}</p>
        <ul class="dungeon-clean-list">${sensory}</ul>
        ${rumorBadge}
      </div>
    </section>`;
}

function renderVaultNotes(vault) {
  const attempt = !vault.unlocked && vault.lastAttemptPtBr
    ? `<p class="dungeon-alert-warn" role="status">${escapeHtml(vault.lastAttemptPtBr)}</p>`
    : "";
  return `<p class="dungeon-muted">O segredo é dividido em ${vault.totalPeers} partes e abre com ${vault.threshold}. Nesta demonstração todas as partes ficam neste aparelho; numa mesa de verdade, cada jogador guardaria a sua.</p>${attempt}`;
}

function renderVaultCard(vault) {
  const pct = Math.min(100, Math.round((vault.sharesSubmitted / vault.threshold) * 100));
  const statusLabel = vault.unlocked ? "SEGREDO ABERTO" : "LACRE FECHADO";
  const statusCls = vault.unlocked ? "is-unlocked" : "is-locked";
  const secretBlock = vault.unlocked
    ? `<p class="dungeon-vault-revealed">${escapeHtml(vault.revealedText)}</p>`
    : `<p class="dungeon-muted">${escapeHtml(vault.ruleLabel)}</p>`;
  return `
    <section class="dungeon-panel">
      <span class="dungeon-eyebrow">Cofre de Shamir · demonstração</span>
      <h2>Cofres de Shamir (${vault.threshold}-de-${vault.totalPeers})</h2>
      <article class="dungeon-vault-card ${statusCls}">
        <div class="dungeon-vault-head">
          ${renderShamirSealSvg(vault.unlocked)}
          <div>
            <span class="dungeon-code-tag">${statusLabel}</span>
            <h3>${escapeHtml(vault.title)}</h3>
            ${secretBlock}
          </div>
        </div>
        ${renderVaultNotes(vault)}
        <div class="dungeon-hp-label"><span>Quórum de Partes</span><strong>${vault.sharesSubmitted} / ${vault.threshold} partes</strong></div>
        <div class="dungeon-bar"><div class="dungeon-bar-fill" style="width:${pct}%"></div></div>
        <div class="dungeon-card-actions">
          <button type="button" class="dungeon-btn dungeon-btn-secondary" data-dungeon="unlock-vault"${vault.unlocked ? " disabled" : ""}>${vault.unlocked ? "Segredo Já Aberto" : "Tentar abrir o cofre"}</button>
        </div>
      </article>
    </section>`;
}

function renderPromptInspector(state) {
  const inspection = inspectPeerPromptForRole(state, state.inspectedRole);
  const roleBtns = INSPECT_ROLES.map((r) => {
    const active = r.id === state.inspectedRole ? " is-selected" : "";
    return `<button type="button" class="dungeon-chip-btn${active}" data-dungeon="inspect-role" data-role="${r.id}">${escapeHtml(r.label)}</button>`;
  }).join("");
  return `
    <section class="dungeon-panel">
      <span class="dungeon-eyebrow">O que cada papel veria</span>
      <h2>Inspetor de Contexto por Papel</h2>
      <p class="dungeon-muted">Escolha um papel para ver o texto que ele receberia, já sem os segredos do mestre:</p>
      <div class="dungeon-chips-row">${roleBtns}</div>
      <div class="dungeon-inspector-meta">
        <span class="dungeon-badge-ok">Escopo: ${escapeHtml(inspection.epistemicScope)}</span>
        <span class="dungeon-code-tag">Filtro de segredos: ${inspection.leaksPrevented ? "aplicado" : "não aplicado"}</span>
      </div>
      <pre class="dungeon-prompt-preview">${escapeHtml(inspection.promptText)}</pre>
    </section>`;
}

function renderInviteHrefBox(state) {
  if (!state.inviteHref) {
    return `<p class="dungeon-muted">Gere um link de convite com a chave da sala no fragmento <code>#k=</code> para sincronizar pares P2P sem servidor central.</p>`;
  }
  return `<pre class="dungeon-prompt-preview" id="dungeon-invite-href">${escapeHtml(state.inviteHref)}</pre>
        <div class="dungeon-card-actions">
          <button type="button" class="dungeon-btn dungeon-btn-secondary" data-dungeon="copy-invite">Copiar convite</button>
        </div>
        <p class="dungeon-muted">Abra uma segunda aba neste mesmo navegador, cole o link e entre como jogador (P2P local, sem servidor).</p>`;
}

function renderP2pInvitePanel(state) {
  const tokens = state.scene?.tokens || [];
  const gmCount = tokens.filter((t) => t.layer === "gm").length;
  const playerCount = tokens.filter((t) => t.layer === "player").length;
  const roleLabel = state.viewerRole === "gm" ? "Mestre (vê Camada GM)" : "Prévia Jogador (Zero-Spoiler)";
  const notice = state.campaignNotice
    ? `<p class="dungeon-inline-status" role="status">${escapeHtml(state.campaignNotice)}</p>`
    : "";
  const inviteBox = renderInviteHrefBox(state);
  return `
    <section class="dungeon-panel" aria-label="Camada do Mestre e convite P2P">
      <div class="dungeon-section-head">
        <div>
          <span class="dungeon-eyebrow">Mesa Soberana E2 · Zero-Spoiler</span>
          <h2>Camada do Mestre &amp; Convite P2P</h2>
        </div>
        <span class="dungeon-code-tag">${gmCount} oculto(s) GM · ${playerCount} visível(is)</span>
      </div>
      <div class="dungeon-card-actions">
        <button type="button" class="dungeon-btn dungeon-btn-secondary" data-dungeon="toggle-viewer-role">Papel atual: ${escapeHtml(roleLabel)}</button>
        <button type="button" class="dungeon-btn dungeon-btn-primary" data-dungeon="generate-invite">Gerar Convite da Mesa (P2P)</button>
      </div>
      ${notice}
      ${inviteBox}
    </section>`;
}

function renderGmNotesPanel(state) {
  const notes = (state.notes || []).filter((n) => n.gmSecretMarkdown);
  const sheetSecret = state.sheet?.sheet_meta?.notes_gm || "";
  if (!notes.length && !sheetSecret) return "";
  const items = [
    ...(sheetSecret ? [`<article class="dungeon-lore-card"><h3>Segredo da ficha (${escapeHtml(state.sheet.name)})</h3><p class="dungeon-muted">${escapeHtml(sheetSecret)}</p></article>`] : []),
    ...notes.map((n) => `<article class="dungeon-lore-card"><h3>${escapeHtml(n.title)}</h3><p class="dungeon-muted">${escapeHtml(n.gmSecretMarkdown)}</p></article>`),
  ].join("");
  return `<section class="dungeon-panel" aria-label="Segredos Obsidian do Mestre"><span class="dungeon-eyebrow">Camada do Mestre · Obsidian %%segredos%%</span><h2>Notas Secretas do Mestre</h2><div class="dungeon-lore-grid">${items}</div></section>`;
}

/**
 * Renderiza a Tela 4 (Escudo do Mestre): narrador por roteiro, dicas por regras, cofre de Shamir e inspetor por papel.
 *
 * @param {object} state Estado atual da sessão AI Social Dungeon.
 * @returns {string} HTML interno para a moldura `.dungeon-sanctum`.
 */
export function renderDmScreen(state) {
  return `
    <section class="dungeon-zero-spoiler-bar" role="status">
      <span class="dungeon-spoiler-icon">${dungeonIcon("lock", 18)}</span>
      <div>
        <strong>Escudo do Mestre — fica só neste aparelho</strong>
        <p class="dungeon-muted">O Escudo do Mestre fica protegido no seu aparelho e nunca é replicado aos feeds públicos do Vox.</p>
      </div>
    </section>
    ${renderP2pInvitePanel(state)}
    ${renderGmNotesPanel(state)}
    <div class="dungeon-two-col">
      ${renderNarratorPanel()}
      ${renderCoDmSection(state)}
    </div>
    <div class="dungeon-two-col">
      ${renderVaultCard(state.vaultSecret)}
      ${renderPromptInspector(state)}
    </div>`;
}
