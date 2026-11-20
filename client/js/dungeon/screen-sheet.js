/**
 * @file Tela 3 do AI Social Dungeon: Grimório da Ficha & Crônica @tag (#/dungeon/ficha/:charId).
 */
import { escapeHtml } from "../shared/html.js";
import { projectCharacterPools } from "../rpg-sheet-and-lore.js";
import { abilityModifier } from "./dice-engine.js";
import { dungeonIcon, renderHeroPortraitSvg } from "./rpg-illustrations.js";

const ABILITY_META = [
  { key: "str", short: "FOR", label: "Força" },
  { key: "dex", short: "DES", label: "Destreza" },
  { key: "con", short: "CON", label: "Constituição" },
  { key: "int", short: "INT", label: "Inteligência" },
  { key: "wis", short: "SAB", label: "Sabedoria" },
  { key: "cha", short: "CAR", label: "Carisma" },
];

const SHEET_ROLL_MODES = [
  { id: "normal", label: "Normal" },
  { id: "advantage", label: "Vantagem" },
  { id: "disadvantage", label: "Desvantagem" },
];

function formatMod(score) {
  const mod = abilityModifier(score);
  return mod >= 0 ? `+${mod}` : String(mod);
}

function renderAbilityButtons(sheet) {
  const ab = sheet.attributes_lww?.abilities || {};
  return ABILITY_META.map((item) => {
    const score = Number(ab[item.key]) || 10;
    return `<button type="button" class="dungeon-choice-card dungeon-attr-box" data-dungeon="roll-ability" data-ability="${item.key}" aria-label="Rolar teste de ${item.label}"><strong>${score} (${formatMod(score)})</strong><span>${item.short} · Rolar</span></button>`;
  }).join("");
}

function renderSheetHero(sheet) {
  const attrs = sheet.attributes_lww || {};
  const level = Number(attrs.level) || 1;
  const ac = Number(attrs.armor_class) || 10;
  const subtitle = sheet.role_title || attrs.class_name || "Paladina da Vigília";
  return `
    <section class="dungeon-sheet-hero">
      <div class="dungeon-portrait-box">${renderHeroPortraitSvg("PAL")}</div>
      <div class="dungeon-hero-copy">
        <span class="dungeon-eyebrow">Ficha Local Soberana (CRDT Offline) · Nível ${level} · CA ${ac}</span>
        <h1>${escapeHtml(sheet.name)}</h1>
        <p class="dungeon-muted">${escapeHtml(subtitle)} — clique em um atributo para rolar direto na crônica.</p>
        <div class="dungeon-attr-row">${renderAbilityButtons(sheet)}</div>
      </div>
    </section>`;
}

function renderClickableActionsPanel(state) {
  const actions = state.sheet?.sheet_meta?.clickable_actions || [];
  const mode = state.rollMode || "normal";
  const modesHtml = SHEET_ROLL_MODES.map((m) => {
    const cls = m.id === mode ? " is-selected" : "";
    return `<button type="button" class="dungeon-chip-btn${cls}" data-dungeon="roll-mode" data-mode="${m.id}" aria-pressed="${m.id === mode}">${escapeHtml(m.label)}</button>`;
  }).join("");
  const buttonsHtml = actions.map((act) => {
    const dmg = act.damage ? ` · Dano ${escapeHtml(act.damage)}` : "";
    return `<button type="button" class="dungeon-choice-card" data-dungeon="roll-action" data-action-id="${escapeHtml(act.id)}"><strong>${escapeHtml(act.label)}</strong><span>${escapeHtml(act.roll)}${dmg}</span></button>`;
  }).join("");
  const last = state.lastFormulaRoll;
  const statusHtml = state.rollError
    ? `<p class="dungeon-alert-warn" role="alert">${escapeHtml(state.rollError)}</p>`
    : last?.ok
      ? `<p class="dungeon-inline-status" role="status">Última rolagem (${escapeHtml(last.label || last.formula)}): <strong>${last.total}</strong></p>`
      : "";
  return `
    <section class="dungeon-panel" aria-label="Ações clicáveis da ficha">
      <div class="dungeon-section-head">
        <div>
          <span class="dungeon-eyebrow">Ficha Clicável · Dados Sem Viés</span>
          <h2>Ataques, Perícias e Atalhos</h2>
        </div>
        <div class="dungeon-chips-row" role="group" aria-label="Modo de rolagem">${modesHtml}</div>
      </div>
      <div class="dungeon-brain-grid">${buttonsHtml || "<p class=\"dungeon-muted\">Nenhuma ação clicável cadastrada nesta ficha.</p>"}</div>
      ${statusHtml}
    </section>`;
}

function renderResourceMeters(sheet, projected) {
  const pools = projected.pools;
  const hpMax = sheet.pools_base?.hp_max || 24;
  const conflictHtml = projected.overdraftConflicts.length
    ? `<p class="dungeon-alert-warn" role="status"><strong>Proteção contra Saldo Negativo (CRDT):</strong> ${projected.overdraftConflicts.length} tentativa(s) de gasto acima do limite foram travadas com segurança em 0.</p>`
    : "";
  return `
    <section class="dungeon-panel">
      <div class="dungeon-section-head">
        <div>
          <span class="dungeon-eyebrow">Recursos da Expedição</span>
          <h2>Vida, Moedas e Mochila</h2>
        </div>
        <div class="dungeon-card-actions">
          <button type="button" class="dungeon-btn dungeon-btn-secondary" data-dungeon="spend-10">Comprar Poção (-10 moedas)</button>
          <button type="button" class="dungeon-btn dungeon-btn-ghost" data-dungeon="test-overdraft">Testar Gasto Sem Saldo</button>
        </div>
      </div>
      <div class="dungeon-meters-grid">
        <div class="dungeon-meter-card"><span>Vida Total</span><strong>${pools.hp_current ?? hpMax} / ${hpMax} PV</strong></div>
        <div class="dungeon-meter-card"><span>Moedas de Ouro</span><strong>${pools.currency_gp ?? 0}</strong></div>
        <div class="dungeon-meter-card"><span>Rações / Slots</span><strong>${pools.spell_slot_l1 ?? 3} / 3</strong></div>
      </div>
      ${conflictHtml}
    </section>`;
}

function renderLoreCard(node) {
  const badgeCls = node.verified ? "is-verified" : node.disputed ? "is-disputed" : "is-rumor";
  const badgeLabel = node.verified ? "Fato Confirmado" : node.disputed ? "Contestado pela Mesa" : "Boato de Taverna";
  const icon = node.verified ? dungeonIcon("verified", 16) : dungeonIcon("beer", 16);
  const witnessesLabel = node.attestations.length === 1 ? "testemunha" : "testemunhas";
  const actionsHtml = node.verified
    ? `<span class="dungeon-muted">Assinado por ${node.attestations.length} ${witnessesLabel}</span>`
    : `<div class="dungeon-card-actions">
        <button type="button" class="dungeon-btn dungeon-btn-primary" data-dungeon="confirm-lore" data-lore-id="${escapeHtml(node.id)}">Confirmar como Verdade</button>
        <button type="button" class="dungeon-btn dungeon-btn-ghost" data-dungeon="dispute-lore" data-lore-id="${escapeHtml(node.id)}">Desmentir</button>
      </div>`;
  return `
    <article class="dungeon-lore-card ${badgeCls}">
      <div class="dungeon-lore-top">
        <span class="dungeon-code-tag">${escapeHtml(node.tag)}</span>
        <span class="dungeon-lore-badge ${badgeCls}">${icon}<span>${badgeLabel}</span></span>
      </div>
      <h3>${escapeHtml(node.title)}</h3>
      <p class="dungeon-muted">${escapeHtml(node.summary)}</p>
      <div class="dungeon-lore-foot"><span class="dungeon-muted">Relator: ${escapeHtml(node.authorName)}</span>${actionsHtml}</div>
    </article>`;
}

function renderBackpackAndLedger(sheet) {
  const items = (sheet.inventory || []).map((item) => `<li>${dungeonIcon("backpack", 15)}<span>${escapeHtml(item)}</span></li>`).join("");
  const ops = (sheet.delta_ledger || []).slice(-4).reverse().map((op) => {
    const sign = op.delta >= 0 ? "+" : "";
    const label = op.target_pool === "currency_gp" ? "moedas" : op.target_pool === "hp_current" ? "PV" : (op.target_pool || "recurso");
    return `<li><strong>${sign}${op.delta} ${escapeHtml(label)}</strong> — ${escapeHtml(op.reason || "Ação em mesa")}</li>`;
  }).join("");
  return `
    <div class="dungeon-two-col">
      <section class="dungeon-panel">
        <span class="dungeon-eyebrow">Equipamento Rápido</span>
        <h2>Mochila de Viagem</h2>
        <ul class="dungeon-clean-list">${items}</ul>
      </section>
      <section class="dungeon-panel">
        <span class="dungeon-eyebrow">Registro Imutável</span>
        <h2>Histórico da Mesa</h2>
        <ul class="dungeon-clean-list">${ops || "<li>Nenhuma movimentação ainda neste turno.</li>"}</ul>
      </section>
    </div>`;
}

/**
 * Renderiza a Tela 3 (Grimório da Ficha & Crônica @tag) com saldo CRDT e verificação bilateral de fatos.
 *
 * @param {object} state Estado atual da sessão AI Social Dungeon.
 * @returns {string} HTML interno para a moldura `.dungeon-sanctum`.
 */
export function renderSheetScreen(state) {
  const projected = projectCharacterPools(state.sheet.pools_base, state.sheet.delta_ledger);
  const loreHtml = state.loreNodes.map(renderLoreCard).join("");
  return `
    ${renderSheetHero(state.sheet)}
    ${renderClickableActionsPanel(state)}
    ${renderResourceMeters(state.sheet, projected)}
    ${renderBackpackAndLedger(state.sheet)}
    <section class="dungeon-panel">
      <div class="dungeon-section-head">
        <div>
          <span class="dungeon-eyebrow">Memória Coletiva Anti-Metagaming</span>
          <h2>Crônica @tag (Fatos vs Boatos de Taverna)</h2>
        </div>
      </div>
      <p class="dungeon-muted">Boatos unilaterais começam com <strong>peso baixo</strong> até outro jogador ou o Mestre confirmar em mesa.</p>
      <div class="dungeon-lore-grid">${loreHtml}</div>
    </section>
    <details class="dungeon-audit">
      <summary>Auditoria Técnica (CRDT Delta-Ledger &amp; Hybrid RRF)</summary>
      <div class="dungeon-audit-body">
        <p><strong>Operações assinadas:</strong> <code>${projected.orderedOpsCount}</code> deltas ordenados por relógio lógico de Lamport + idempotência de <code>op_id</code>.</p>
        <p><strong>Pesos RAG:</strong> <code>DM_CANON = 1.0</code> · <code>BILATERAL_VERIFIED = 0.85</code> · <code>UNCORROBORATED_CLAIM = 0.35</code>.</p>
      </div>
    </details>`;
}
