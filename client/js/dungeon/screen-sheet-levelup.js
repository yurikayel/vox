/**
 * @file Assistente de subida de nível com confirmação/preset e editor rápido da ficha no Grimório.
 * @module dungeon/screen-sheet-levelup
 */
import { escapeHtml } from "../shared/html.js";
import { buildLevelUpPlan } from "./vtt-levelup.js";
import { renderSystemEditFields, renderSystemSelect } from "./screen-sheet-derived.js";
import { fieldErrorAttrs, issueId } from "./field-issues.js";

const LEVELUP_PRESETS = [
  { id: "d20_fantasy", label: "d20 Fantasia (+8 PV + CON, +1 slot)" },
  { id: "tormenta20", label: "Tormenta20 (+6 PV, +1 slot)" },
  { id: "libre", label: "Livre (+5 PV)" },
  { id: "investigacao", label: "Investigação (+3 PV)" },
];

const ABILITY_FIELDS = [
  { key: "str", label: "FOR" },
  { key: "dex", label: "DES" },
  { key: "con", label: "CON" },
  { key: "int", label: "INT" },
  { key: "wis", label: "SAB" },
  { key: "cha", label: "CAR" },
];

function renderSlotPreview(slotsDelta) {
  const entries = Object.entries(slotsDelta || {}).filter(([, v]) => Number(v) > 0);
  if (!entries.length) return "Sem novos espaços de magia neste preset";
  return entries.map(([k, v]) => `+${v} espaço (${k.toUpperCase()})`).join(", ");
}

function renderLevelUpPlanSummary(built) {
  if (!built.plan) {
    return `<p class="dungeon-alert-warn" role="alert">${escapeHtml(built.error || "Não foi possível montar o plano de nível.")}</p>`;
  }
  const { plan } = built;
  return `<ul class="dungeon-clean-list">
    <li><strong>Nível:</strong> ${plan.fromLevel} → ${plan.toLevel}</li>
    <li><strong>Vitalidade máxima:</strong> +${plan.hpGain} PV</li>
    <li><strong>Bônus de proficiência:</strong> +${plan.proficiencyBonus}</li>
    <li><strong>Magia:</strong> ${escapeHtml(renderSlotPreview(plan.slotsDelta))}</li>
  </ul>`;
}

/**
 * Renderiza o Assistente de Nível (prévia de ganhos + escolha de preset + confirmação irreversível).
 * @param {object} state Estado da sessão.
 * @returns {string} HTML do assistente quando `state.levelUpOpen` está ativo, ou vazio.
 */
export function renderLevelUpWizard(state) {
  if (!state.levelUpOpen) return "";
  const curLevel = Number(state.sheet?.attributes_lww?.level) || 1;
  const nextLevel = curLevel + 1;
  const preset = state.levelUpPreset || state.campaignDoc?.dungeonPrefs?.preset || state.campaignDoc?.system || "d20_fantasy";
  const built = buildLevelUpPlan(state.sheet, nextLevel, preset);
  const presetBtns = LEVELUP_PRESETS.map((p) => {
    const sel = p.id === preset;
    return `<button type="button" class="dungeon-chip-btn${sel ? " is-selected" : ""}" data-dungeon="select-levelup-preset" data-preset="${p.id}" aria-pressed="${sel}">${escapeHtml(p.label)}</button>`;
  }).join("");
  return `
    <section class="dungeon-panel dungeon-levelup-wizard" aria-label="Assistente de nível">
      <div class="dungeon-section-head">
        <div><span class="dungeon-eyebrow">Evolução Guiada · Marco Imutável</span><h2>Subir de Nível (${curLevel} → ${nextLevel})</h2></div>
      </div>
      <div class="dungeon-chips-row" role="group" aria-label="Preset de regras">${presetBtns}</div>
      ${renderLevelUpPlanSummary(built)}
      <div class="dungeon-card-actions">
        <button type="button" class="dungeon-btn dungeon-btn-primary" data-dungeon="level-up"${built.plan ? "" : " disabled"}>Confirmar Nível ${nextLevel}</button>
        <button type="button" class="dungeon-btn dungeon-btn-ghost" data-dungeon="level-up-cancel">Cancelar</button>
      </div>
    </section>`;
}

/** Valor digitado no Salvar recusado, se houver; senão o da ficha. */
function draftOr(draft, key, fallback) {
  return draft[key] ?? fallback;
}

const EDIT_ISSUE_PREFIX = "sheet-edit-issue";

/**
 * Avisos da última recusa (Salvar ou importar `.voxchar`): cada um diz o campo e o motivo; nada foi gravado. O resumo
 * recebe o foco depois do redesenho, então não é `role="alert"` (focar um alerta recém-inserido pode anunciar duas
 * vezes): é um grupo nomeado pelo título e descrito pela lista, que o leitor fala numa vez só ao receber o foco.
 */
function renderEditIssues(issues) {
  if (!issues.length) return "";
  const items = issues.map((i, n) => `<li id="${issueId(EDIT_ISSUE_PREFIX, n)}">${escapeHtml(i.message)}</li>`).join("");
  return `<div class="dungeon-alert-warn" role="group" tabindex="-1" data-edit-focus aria-labelledby="sheet-edit-issues-title" aria-describedby="sheet-edit-issues-list"><strong id="sheet-edit-issues-title">Nada foi salvo. Corrija:</strong><ul id="sheet-edit-issues-list">${items}</ul></div>`;
}

/**
 * Bloco do link de ficha: a confirmação antes de gerar (o que vai, histórico e sincronização, sem revogação) ou o motivo da recusa.
 * @param {{href?: string, size?: number, reason?: string}|null|undefined} link Estado do link (`state.voxcharLink`).
 * @returns {string} HTML do bloco, ou vazio sem link pendente.
 */
export function renderVoxcharLinkBlock(link) {
  if (!link) return "";
  if (!link.href) return `<p class="dungeon-alert-warn" role="alert">${escapeHtml(link.reason || "Não foi possível gerar o link.")}</p>`;
  return `<div class="dungeon-alert-warn" role="alert" data-dungeon-voxchar-link>
    <strong>Confirmar o link da ficha</strong>
    <p>Vai a ficha-base inteira: nome, atributos, itens e notas públicas (${link.size} caracteres). Notas do Mestre, identidade e estado de jogo ficam de fora.</p>
    <p>O link fica no histórico e na sincronização do navegador e com quem o receber, e <strong>não pode ser revogado</strong>: quem o tem continua a ver esta cópia.</p>
    <button type="button" class="dungeon-btn dungeon-btn-secondary" data-dungeon="copy-voxchar-link">Copiar link</button>
    <button type="button" class="dungeon-btn dungeon-btn-ghost" data-dungeon="cancel-voxchar-link">Cancelar</button>
  </div>`;
}

/**
 * "Importar por cima": a caixa que arma a substituição desta ficha e, com um arquivo já lido, a confirmação antes de gravar.
 * @param {{armed?: boolean, pending?: {name?: string}|null}|null|undefined} over Estado de `state.voxcharOver`.
 * @returns {string} HTML da caixa e do bloco de confirmação (vazio de bloco sem arquivo pendente).
 */
export function renderVoxcharOverBlock(over) {
  const box = `<label class="dungeon-check"><input type="checkbox" data-dungeon="hud-op" data-hud-op="voxchar-over" data-step="arm"${over?.armed ? " checked" : ""} /> Importar por cima desta ficha (em vez de criar outra)</label>`;
  if (!over?.pending) return box;
  return `${box}<div class="dungeon-alert-warn" role="alert" data-dungeon-voxchar-over>
    <strong>Substituir os dados desta ficha por "${escapeHtml(over.pending.name || "ficha do arquivo")}"?</strong>
    <p>Trocam nome, atributos, escolhas do sistema, itens, notas públicas e máximos. Ficam: o id, o dono, o PV atual, as condições e as notas do Mestre.</p>
    <button type="button" class="dungeon-btn dungeon-btn-secondary" data-dungeon="hud-op" data-hud-op="voxchar-over" data-step="confirm">Substituir</button>
    <button type="button" class="dungeon-btn dungeon-btn-ghost" data-dungeon="hud-op" data-hud-op="voxchar-over" data-step="cancel">Cancelar</button>
  </div>`;
}

/**
 * Linha de arquivo e link da ficha: exportar, importar (nova ou por cima), copiar link e, se houver, as confirmações.
 * @param {object|null|undefined} link Estado do link (`state.voxcharLink`).
 * @param {object|null|undefined} over Estado de `state.voxcharOver`.
 * @returns {string} HTML da linha de ações.
 */
function renderSheetShareRow(link, over) {
  return `
    <div class="dungeon-input-row">
      <button type="button" class="dungeon-btn dungeon-btn-ghost" data-dungeon="export-voxchar">Exportar ficha (.voxchar)</button>
      <label for="dungeon-import-voxchar" class="dungeon-btn dungeon-btn-ghost dungeon-file-trigger">Importar ficha</label>
      <input id="dungeon-import-voxchar" class="sr-only" type="file" accept=".voxchar,application/json" data-dungeon="import-voxchar" />
      <button type="button" class="dungeon-btn dungeon-btn-ghost" data-dungeon="share-voxchar-link">Copiar link da ficha</button>
    </div>
    ${renderVoxcharOverBlock(over)}
    ${renderVoxcharLinkBlock(link)}`;
}

/**
 * Renderiza o painel retrátil de edição básica da ficha (nome, classe, CA e atributos FOR–CAR).
 * @param {object} sheet Ficha ativa.
 * @param {{issues?: Array<{field: string, message: string}>, draft?: object|null, link?: object|null, over?: object|null}} [edit] Avisos e valores digitados do último Salvar recusado, o estado do link de ficha e o do "importar por cima".
 * @returns {string} HTML do formulário de edição.
 */
export function renderSheetEditPanel(sheet, edit = {}) {
  const attrs = sheet?.attributes_lww || {};
  const draft = edit.draft || {};
  const issues = edit.issues || [];
  const ab = attrs.abilities || {};
  const abInputs = ABILITY_FIELDS.map((f) => {
    const val = escapeHtml(String(draftOr(draft, f.key, Number(ab[f.key]) || 10)));
    return `<label class="dungeon-field-mini"><span>${f.label}</span><input class="dungeon-input" name="${f.key}" type="number" min="1" max="30" value="${val}"${fieldErrorAttrs(issues, f.key, EDIT_ISSUE_PREFIX)} /></label>`;
  }).join("");
  return `
    <details class="dungeon-audit" data-dungeon-details="sheet-edit"${issues.length ? " open" : ""}>
      <summary>Editar Dados da Ficha (Nome, Classe, CA e Atributos)</summary>
      ${renderEditIssues(issues)}
      <form class="dungeon-token-edit-form" data-dungeon="edit-sheet-form" novalidate>
        <label class="dungeon-field-mini dungeon-field-wide"><span>Nome</span><input class="dungeon-input" name="sheetName" type="text" maxlength="60" value="${escapeHtml(draftOr(draft, "name", sheet?.name || ""))}"${fieldErrorAttrs(issues, "sheetName", EDIT_ISSUE_PREFIX)} /></label>
        <label class="dungeon-field-mini dungeon-field-wide"><span>Classe / Título</span><input class="dungeon-input" name="sheetClass" type="text" maxlength="60" value="${escapeHtml(draftOr(draft, "class_name", sheet?.role_title || attrs.class_name || ""))}" /></label>
        ${renderSystemSelect(sheet, draft.system)}
        ${renderSystemEditFields(sheet, draft)}
        <label class="dungeon-field-mini"><span>CA</span><input class="dungeon-input" name="armorClass" type="number" min="1" max="40" value="${escapeHtml(String(draftOr(draft, "armor_class", Number(attrs.armor_class) || 10)))}"${fieldErrorAttrs(issues, "armorClass", EDIT_ISSUE_PREFIX)} /></label>
        ${abInputs}
        <button type="submit" class="dungeon-btn dungeon-btn-secondary" data-edit-save>Salvar Ficha</button>
      </form>
      ${renderSheetShareRow(edit.link, edit.over)}
    </details>`;
}
