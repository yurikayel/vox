/**
 * @file Condições, Exaustão, Dados de Vida e descansos na aba Jogar. Só desenha o que recebe do pacote e das
 * escolhas normalizadas (`system-rest.js`); a Exaustão mostra o efeito, mas ele não é aplicado aos números.
 *
 * @module dungeon/screen-sheet-rest
 * @see docs/specs/ficha-personagem-brainstorm-v0.md (§4 e §5)
 */
import { escapeHtml } from "../shared/html.js";
import { exhaustionEffect } from "./system-rest.js";

function conditionChip(c, marked) {
  return `<button type="button" class="dungeon-chip-btn${marked ? " is-active" : ""}" data-dungeon="condition-toggle" data-condition-id="${escapeHtml(c.id)}" aria-pressed="${marked}">${escapeHtml(c.label)}</button>`;
}

function exhaustionText(effect, labels) {
  if (effect.level === 0) return `${labels.exhaustion} 0`;
  const meters = String(Math.round(effect.speedPenaltyFt * 0.3 * 10) / 10).replace(".", ",");
  const fatal = effect.fatal ? " · Morte" : "";
  return `${labels.exhaustion} ${effect.level}: −${effect.d20Penalty} nos testes de d20, −${meters} m de ${labels.speed}${fatal} (só informativo)`;
}

function renderExhaustion(pack, level) {
  const effect = exhaustionEffect(pack, level);
  const max = pack.formulas.exhaustion.max;
  const name = escapeHtml(pack.labels.exhaustion);
  return `
    <div class="dungeon-exhaustion" role="group" aria-label="${name}">
      <span role="status">${escapeHtml(exhaustionText(effect, pack.labels))}</span>
      <button type="button" class="dungeon-chip-btn" data-dungeon="exhaustion-step" data-step="-1"${level <= 0 ? " disabled" : ""} aria-label="Reduzir ${name}">−</button>
      <button type="button" class="dungeon-chip-btn" data-dungeon="exhaustion-step" data-step="1"${level >= max ? " disabled" : ""} aria-label="Aumentar ${name}">+</button>
    </div>`;
}

function renderRests(pack, rest) {
  const left = rest.hitDiceTotal - rest.hitDiceSpent;
  return `
    <div class="dungeon-rests" role="group" aria-label="Descansos">
      <p>${escapeHtml(pack.labels.hitDice)}: ${left}/${rest.hitDiceTotal} (d${rest.hitDie})</p>
      ${rest.hitDieSet ? "" : `<p class="dungeon-muted" role="note">O Dado de Vida está em d${rest.hitDie} até você definir o seu em Editar Dados da Ficha.</p>`}
      <div class="dungeon-card-actions">
        <button type="button" class="dungeon-chip-btn" data-dungeon="hit-die"${left <= 0 ? " disabled" : ""}>Gastar Dado de Vida</button>
        <button type="button" class="dungeon-chip-btn" data-dungeon="rest-short">${escapeHtml(pack.labels.shortRest)}</button>
        <button type="button" class="dungeon-chip-btn" data-dungeon="rest-long">${escapeHtml(pack.labels.longRest)}</button>
      </div>
    </div>`;
}

/**
 * Bloco de condições (marcas), Exaustão (nível e efeito) e descansos (Dados de Vida, curto, longo) da aba Jogar.
 * @param {object} pack Pacote de sistema.
 * @param {{conditions: string[], exhaustion: number, hitDie: number, hitDieSet: boolean, hitDiceTotal: number, hitDiceSpent: number}} rest Escolhas normalizadas.
 * @returns {string} HTML do bloco (vazio se o pacote não traz condições).
 */
export function renderConditionsAndRests(pack, rest) {
  if (!pack.conditions?.length) return "";
  const chips = pack.conditions.map((c) => conditionChip(c, rest.conditions.includes(c.id))).join("");
  return `
    <div class="dungeon-conditions">
      <h4 class="dungeon-eyebrow">${escapeHtml(pack.labels.conditions)}</h4>
      <div class="dungeon-chips-row" role="group" aria-label="${escapeHtml(pack.labels.conditions)}">${chips}</div>
      ${renderExhaustion(pack, rest.exhaustion)}
      ${renderRests(pack, rest)}
    </div>`;
}
