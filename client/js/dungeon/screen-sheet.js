/**
 * @file Tela 3 do AI Social Dungeon: Grimório da Ficha & Crônica @tag (#/dungeon/ficha/:charId).
 */
import { escapeHtml } from "../shared/html.js";
import { projectCharacterPools } from "../rpg-sheet-and-lore.js";
import { abilityModifier } from "./dice-engine.js";
import { dungeonIcon, renderHeroPortraitSvg } from "./rpg-illustrations.js";
import { renderLevelUpWizard, renderSheetEditPanel } from "./screen-sheet-levelup.js";
import { renderDerivedStrip, resolveSheetSystem } from "./screen-sheet-derived.js";
import { renderPlayTab, renderSheetTabs, splitSheetActions } from "./screen-sheet-tabs.js";
import { renderInventoryPanel } from "./screen-sheet-inventory.js";

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

function derivePortraitCode(sheet) {
  const src = String(sheet?.role_title || sheet?.attributes_lww?.class_name || sheet?.name || "AVT").trim();
  const letters = src.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/gi, "");
  return (letters.slice(0, 3) || "AVT").toUpperCase();
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
  const sys = resolveSheetSystem(sheet);
  const ac = sys?.derived.armored ? sys.derived.armorClass : Number(attrs.armor_class) || 10;
  const subtitle = sheet.role_title || attrs.class_name || "Aventureiro";
  return `
    <section class="dungeon-sheet-hero">
      <div class="dungeon-portrait-box">${renderHeroPortraitSvg(derivePortraitCode(sheet))}</div>
      <div class="dungeon-hero-copy">
        <span class="dungeon-eyebrow">Ficha guardada neste aparelho, funciona sem internet · Nível ${level} · CA ${ac}</span>
        <h1>${escapeHtml(sheet.name)}</h1>
        <p class="dungeon-muted">${escapeHtml(subtitle)} — clique em um atributo para rolar direto na crônica.</p>
        <button type="button" class="dungeon-btn dungeon-btn-secondary" data-dungeon="level-up-open">Subir de Nível</button>
        <div class="dungeon-attr-row">${renderAbilityButtons(sheet)}</div>
      </div>
    </section>`;
}

function renderAddActionForm() {
  return `
    <form class="dungeon-action-form" data-dungeon="add-action-form">
      <div class="dungeon-input-row">
        <label class="sr-only" for="dungeon-action-label">Nome da ação</label>
        <input id="dungeon-action-label" class="dungeon-input" type="text" maxlength="60" placeholder="Nova ação (ex.: Arco Longo)" autocomplete="off" />
        <label class="sr-only" for="dungeon-action-formula">Fórmula da rolagem</label>
        <input id="dungeon-action-formula" class="dungeon-input" type="text" maxlength="80" placeholder="Rolagem (ex.: 1d20+@des+@prof)" autocomplete="off" />
        <label class="sr-only" for="dungeon-action-damage">Fórmula de dano opcional</label>
        <input id="dungeon-action-damage" class="dungeon-input" type="text" maxlength="80" placeholder="Dano opcional (ex.: 1d8+@des)" autocomplete="off" />
        <button type="submit" class="dungeon-btn dungeon-btn-secondary">Adicionar Ação</button>
      </div>
    </form>`;
}

function renderRollStatusBanner(state) {
  if (state.rollError) return `<p class="dungeon-alert-warn" role="alert">${escapeHtml(state.rollError)}</p>`;
  const last = state.lastFormulaRoll;
  if (!last?.ok) return "";
  return `<p class="dungeon-inline-status" role="status">Última rolagem (${escapeHtml(last.label || last.formula)}): <strong>${last.total}</strong></p>`;
}

function renderRollModes(state) {
  const mode = state.rollMode || "normal";
  const chips = SHEET_ROLL_MODES.map((m) => {
    const cls = m.id === mode ? " is-selected" : "";
    return `<button type="button" class="dungeon-chip-btn${cls}" data-dungeon="roll-mode" data-mode="${m.id}" aria-pressed="${m.id === mode}">${escapeHtml(m.label)}</button>`;
  }).join("");
  return `<div class="dungeon-chips-row" role="group" aria-label="Modo de rolagem">${chips}</div>${renderRollStatusBanner(state)}`;
}

function renderActionCard(act) {
  const dmg = act.damage ? ` · Dano ${escapeHtml(act.damage)}` : "";
  const id = escapeHtml(act.id);
  return `
      <div class="dungeon-action-card-wrap">
        <button type="button" class="dungeon-choice-card" data-dungeon="roll-action" data-action-id="${id}"><strong>${escapeHtml(act.label)}</strong><span>${escapeHtml(act.roll)}${dmg}</span></button>
        <button type="button" class="dungeon-chip-btn dungeon-action-remove" data-dungeon="remove-action" data-action-id="${id}" aria-label="Remover ação ${escapeHtml(act.label)}">×</button>
      </div>`;
}

function renderAbilitiesPanel(state) {
  const { abilities } = splitSheetActions(state.sheet?.sheet_meta?.clickable_actions || []);
  const cards = abilities.map(renderActionCard).join("");
  return `
    <section class="dungeon-panel" aria-label="Ataques e habilidades da ficha">
      <span class="dungeon-eyebrow">Ficha clicável · Dados justos</span>
      <h2>Ataques e Habilidades</h2>
      <div class="dungeon-brain-grid">${cards || "<p class=\"dungeon-muted\">Nenhuma ação clicável cadastrada nesta ficha.</p>"}</div>
      ${renderAddActionForm()}
    </section>`;
}

function renderResourceMeters(sheet, projected) {
  const pools = projected.pools;
  const hpMax = sheet.pools_base?.hp_max || 24;
  const slotMax = Number(sheet.pools_base?.spell_slots_max?.l1) || 3;
  const conflictHtml = projected.overdraftConflicts.length
    ? `<p class="dungeon-alert-warn" role="status"><strong>Proteção contra gasto além do saldo:</strong> ${projected.overdraftConflicts.length} tentativa(s) de gastar mais do que havia foram travadas em 0.</p>`
    : "";
  return `
    <section class="dungeon-panel">
      <div class="dungeon-section-head">
        <div>
          <span class="dungeon-eyebrow">Recursos da Expedição</span>
          <h2>Vida, Moedas e Magia</h2>
        </div>
        <div class="dungeon-card-actions">
          <button type="button" class="dungeon-btn dungeon-btn-ghost" data-dungeon="hp-minus">-1 PV</button>
          <button type="button" class="dungeon-btn dungeon-btn-ghost" data-dungeon="hp-plus">+1 PV</button>
          <button type="button" class="dungeon-btn dungeon-btn-secondary" data-dungeon="spend-10">Comprar Poção (-10 moedas)</button>
        </div>
      </div>
      <div class="dungeon-meters-grid">
        <div class="dungeon-meter-card"><span>Vida Total</span><strong>${pools.hp_current ?? hpMax} / ${hpMax} PV</strong></div>
        <div class="dungeon-meter-card"><span>Moedas de Ouro</span><strong>${pools.currency_gp ?? 0}</strong></div>
        <div class="dungeon-meter-card"><span>Espaços de Magia (1º)</span><strong>${pools.spell_slot_l1 ?? slotMax} / ${slotMax}</strong></div>
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

function renderLedgerPanel(sheet) {
  const ops = (sheet.delta_ledger || []).slice(-6).reverse().map((op) => {
    const sign = op.delta >= 0 ? "+" : "";
    const label = op.target_pool === "currency_gp" ? "moedas" : op.target_pool === "hp_current" ? "PV" : (op.target_pool || "recurso");
    return `<li><strong>${sign}${op.delta} ${escapeHtml(label)}</strong> — ${escapeHtml(op.reason || "Ação em mesa")}</li>`;
  }).join("");
  return `
    <section class="dungeon-panel">
      <span class="dungeon-eyebrow">Registro Imutável</span>
      <h2>Histórico da Mesa</h2>
      <ul class="dungeon-clean-list">${ops || "<li class=\"dungeon-muted\">Nenhuma movimentação ainda neste turno.</li>"}</ul>
    </section>`;
}

function renderPublicNotesSection(state) {
  const isGm = state.viewerRole === "gm";
  const notes = (state.notes || []).filter((n) => isGm || n.visibility !== "gm_only");
  if (!notes.length) return "";
  const cards = notes.map((n) => {
    const tags = (n.tags || []).map((t) => `<span class="dungeon-code-tag">#${escapeHtml(t)}</span>`).join(" ");
    const links = (n.links || []).length ? `<p class="dungeon-muted">Vínculos: ${n.links.map((l) => `<code>[[${escapeHtml(l)}]]</code>`).join(", ")}</p>` : "";
    return `<article class="dungeon-lore-card"><div class="dungeon-lore-top"><h3>${escapeHtml(n.title)}</h3><div>${tags}</div></div><p class="dungeon-muted">${escapeHtml(n.publicMarkdown || "")}</p>${links}</article>`;
  }).join("");
  return `<section class="dungeon-panel" aria-label="Notas públicas importadas"><span class="dungeon-eyebrow">Obsidian · Handouts Públicos</span><h2>Notas e Pistas da Campanha</h2><div class="dungeon-lore-grid">${cards}</div></section>`;
}

function renderLoreSection(loreNodes) {
  const loreHtml = loreNodes.map(renderLoreCard).join("");
  return `
    <section class="dungeon-panel">
      <div class="dungeon-section-head">
        <div><span class="dungeon-eyebrow">Memória Coletiva Anti-Metagaming</span><h2>Crônica @tag (Fatos vs Boatos de Taverna)</h2></div>
      </div>
      <p class="dungeon-muted">Boatos unilaterais começam com <strong>peso baixo</strong> até outro jogador ou o Mestre confirmar em mesa.</p>
      <div class="dungeon-lore-grid">${loreHtml}</div>
    </section>`;
}

function renderSheetAudit(orderedOpsCount) {
  return `
    <details class="dungeon-audit" data-dungeon-details="sheet-audit">
      <summary>Para conferir: como a ficha é guardada</summary>
      <div class="dungeon-audit-body">
        <p><strong>Ações registradas:</strong> <code>${orderedOpsCount}</code>, em ordem, cada uma contada uma só vez.</p>
        <p><strong>Confiança nas fontes:</strong> <code>DM_CANON = 1.0</code> · <code>BILATERAL_VERIFIED = 0.85</code> · <code>UNCORROBORATED_CLAIM = 0.35</code>.</p>
        <div class="dungeon-card-actions"><button type="button" class="dungeon-btn dungeon-btn-ghost" data-dungeon="test-overdraft">Testar proteção contra gasto além do saldo</button></div>
      </div>
    </details>`;
}

/**
 * Botão "Nova ficha" (markup mínimo) ou, com o assistente aberto, a tela dele (carregada sob demanda e guardada no estado).
 * @param {object} state Estado da sessão.
 * @returns {string} HTML do botão ou do assistente.
 */
function renderNewSheetSlot(state) {
  if (state.sheetWizard && state.sheetWizardView) return state.sheetWizardView(state.sheetWizard);
  return `<div class="dungeon-input-row"><button type="button" class="dungeon-btn dungeon-btn-ghost" data-dungeon="wizard-open">Nova ficha</button></div>`;
}

/**
 * Renderiza a Tela 3 (Grimório da Ficha & Crônica @tag) com saldo protegido, mochila unificada e Assistente de Nível.
 *
 * @param {object} state Estado atual da sessão AI Social Dungeon.
 * @returns {string} HTML interno para a moldura `.dungeon-sanctum`.
 */
export function renderSheetScreen(state) {
  const projected = projectCharacterPools(state.sheet.pools_base, state.sheet.delta_ledger);
  const noticeHtml = state.campaignNotice ? `<p class="dungeon-inline-status" role="status">${escapeHtml(state.campaignNotice)}</p>` : "";
  const actions = state.sheet?.sheet_meta?.clickable_actions || [];
  const panels = {
    play: `${renderDerivedStrip(state.sheet, projected.pools?.hp_current ?? null)}${renderPlayTab(actions)}`,
    abilities: renderAbilitiesPanel(state),
    items: renderInventoryPanel(state),
    about: `${renderSheetEditPanel(state.sheet, { issues: state.sheetEditIssues, draft: state.sheetEditDraft })}${renderLedgerPanel(state.sheet)}${renderPublicNotesSection(state)}${renderLoreSection(state.loreNodes)}${renderSheetAudit(projected.orderedOpsCount)}`,
  };
  return `
    ${noticeHtml}
    ${renderNewSheetSlot(state)}
    ${renderLevelUpWizard(state)}
    <section class="dungeon-sheet-roll-controls" aria-label="Modo e resultado das rolagens">${renderRollModes(state)}</section>
    <div class="dungeon-sheet-layout">
      <div class="dungeon-sheet-aside">${renderSheetHero(state.sheet)}${renderResourceMeters(state.sheet, projected)}</div>
      <div class="dungeon-sheet-main">${renderSheetTabs(panels)}</div>
    </div>`;
}
