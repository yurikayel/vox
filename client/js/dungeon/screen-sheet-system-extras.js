/**
 * @file Peças da ficha que vêm do pacote de sistema além da faixa de números: salvaguardas e Deslocamento
 * (leitura), testes contra a morte (marcas) e os campos do painel Editar (salvaguardas treinadas, especialização
 * e Deslocamento). Só desenha o que recebe: o pacote e os derivados já resolvidos por `screen-sheet-derived.js`.
 *
 * @module dungeon/screen-sheet-system-extras
 * @see docs/specs/ficha-personagem-brainstorm-v0.md (§4 e §5)
 */
import { escapeHtml } from "../shared/html.js";

/**
 * Soma com sinal explícito ("+3", "−1", "+0").
 * @param {number} n Valor.
 * @returns {string} Texto com sinal (menos tipográfico para negativos).
 */
export function signed(n) {
  return n >= 0 ? `+${n}` : `−${Math.abs(n)}`;
}

/**
 * Lista de salvaguardas com o bônus de cada atributo; a treinada vem destacada.
 * @param {object} pack Pacote de sistema.
 * @param {{saves: Array<{id: string, label: string, bonus: number, proficient: boolean}>}} derived Derivados da ficha.
 * @returns {string} HTML da lista.
 */
export function renderSavesList(pack, derived) {
  const items = derived.saves.map((s) => `<li class="dungeon-derived-save${s.proficient ? " is-trained" : ""}"><span>${escapeHtml(s.label)}</span> <strong>${signed(s.bonus)}</strong>${s.proficient ? ' <span class="dungeon-muted">(treinada)</span>' : ""}</li>`).join("");
  return `<h4 class="dungeon-eyebrow">${escapeHtml(pack.labels.saves)}</h4><ul class="dungeon-derived-saves">${items}</ul>`;
}

function markButton(kind, label) {
  return `<button type="button" class="dungeon-chip-btn" data-dungeon="death-save" data-kind="${kind}">${label}</button>`;
}

const STATUS_TEXT = { dying: "Morrendo", stable: "Estável", dead: "Morto" };

/**
 * Marcas dos testes contra a morte, com botões para registrar sucesso, falha ou zerar. Aparece com 0 PV ou com marcas.
 * @param {object} pack Pacote de sistema.
 * @param {{deathSaves: {successes: number, failures: number, status: string}}} derived Derivados da ficha.
 * @param {number|null} hpCurrent PV atuais (`null` se desconhecido).
 * @returns {string} HTML do bloco (vazio quando não se aplica).
 */
export function renderDeathSaves(pack, derived, hpCurrent) {
  const d = derived.deathSaves;
  if (hpCurrent !== 0 && d.successes + d.failures === 0) return "";
  return `
    <div class="dungeon-death-saves" role="group" aria-label="${escapeHtml(pack.labels.deathSaves)}">
      <h4 class="dungeon-eyebrow">${escapeHtml(pack.labels.deathSaves)}</h4>
      <p role="status">Sucessos ${d.successes}/3 · Falhas ${d.failures}/3 · <strong>${STATUS_TEXT[d.status]}</strong></p>
      <div class="dungeon-card-actions">${markButton("success", "Sucesso")}${markButton("failure", "Falha")}${markButton("reset", "Zerar")}</div>
    </div>`;
}

function checkbox(name, id, label, checked, disabled = false) {
  return `<label class="dungeon-field-check"><input type="checkbox" name="${name}" value="${escapeHtml(id)}"${checked ? " checked" : ""}${disabled ? " disabled" : ""} /> <span>${escapeHtml(label)}</span></label>`;
}

/**
 * Campos do painel Editar ligados ao pacote: salvaguardas treinadas, especialização (só em perícia treinada) e Deslocamento.
 * @param {object} pack Pacote de sistema.
 * @param {object} choices Escolhas normalizadas da ficha (`proficientSaves`, `expertSkills`, `proficientSkills`, `speedFt`).
 * @returns {string} HTML dos campos (dentro do formulário de edição).
 */
export function renderSystemChoiceFields(pack, choices) {
  const saves = pack.abilities.map((a) => checkbox("saveProf", a.id, a.label, choices.proficientSaves.includes(a.id))).join("");
  const skills = pack.skills.map((s) => checkbox("expertSkill", s.id, s.label, choices.expertSkills.includes(s.id), !choices.proficientSkills.includes(s.id))).join("");
  return `
    <label class="dungeon-field-mini"><span>${escapeHtml(pack.labels.speed)} (pés)</span><input class="dungeon-input" name="speedFt" type="number" min="0" max="${pack.formulas.speed.maxFt}" value="${escapeHtml(String(choices.speedFt))}" /></label>
    <fieldset class="dungeon-field-wide"><legend>Salvaguardas treinadas</legend>${saves}</fieldset>
    <fieldset class="dungeon-field-wide"><legend>Especialização (só em perícia treinada)</legend>${skills}</fieldset>`;
}
