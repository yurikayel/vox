/**
 * @file Ficha em abas (spec da ficha §5.1/§5.2): Jogar / Habilidades / Itens / Sobre, "Mais usados" e "Todos os
 * testes" montados a partir das ações clicáveis e dos atributos que a ficha já tem. Só usa botões que o controlador
 * já trata (`roll-ability`, `roll-action`); as abas são um grupo de opções (rádio) que o navegador já sabe operar
 * com o teclado, e a aba escolhida sobrevive ao redesenho junto com o estado dos `<details>`.
 * @module dungeon/screen-sheet-tabs
 */
import { escapeHtml } from "../shared/html.js";

/** Abas da ficha, na ordem em que aparecem. */
export const SHEET_TABS = Object.freeze([
  Object.freeze({ id: "play", label: "Jogar" }),
  Object.freeze({ id: "abilities", label: "Habilidades" }),
  Object.freeze({ id: "items", label: "Itens" }),
  Object.freeze({ id: "about", label: "Sobre" }),
]);

const MOST_USED_LIMIT = 6;

/**
 * Separa as ações da ficha em ataques/habilidades e perícias, pela etiqueta `tag` que cada ação já tem.
 * @param {object[]} [actions] Ações clicáveis (`sheet_meta.clickable_actions`).
 * @returns {{skills: object[], abilities: object[]}} Perícias (`tag: "pericia"`) e as demais ações.
 */
export function splitSheetActions(actions = []) {
  const list = Array.isArray(actions) ? actions.filter((a) => a && a.id) : [];
  return { skills: list.filter((a) => a.tag === "pericia"), abilities: list.filter((a) => a.tag !== "pericia") };
}

/**
 * "Mais usados": ataques primeiro, depois perícias, na ordem da ficha (a ficha ainda não conta usos).
 * @param {object[]} [actions] Ações clicáveis.
 * @param {number} [limit] Máximo de itens.
 * @returns {object[]} Ações escolhidas.
 */
export function pickMostUsed(actions = [], limit = MOST_USED_LIMIT) {
  const { skills, abilities } = splitSheetActions(actions);
  return [...abilities, ...skills].slice(0, limit);
}

function actionButton(act, withDamage) {
  const dmg = withDamage && act.damage ? ` · Dano ${escapeHtml(act.damage)}` : "";
  return `<button type="button" class="dungeon-choice-card" data-dungeon="roll-action" data-action-id="${escapeHtml(act.id)}"><strong>${escapeHtml(act.label)}</strong><span>${escapeHtml(act.roll)}${dmg}</span></button>`;
}

/**
 * Botões de rolagem das ações dadas (usa o tratador `roll-action` que já existe).
 * @param {object[]} actions Ações clicáveis.
 * @param {boolean} [withDamage] Mostra a fórmula de dano.
 * @returns {string} HTML, ou aviso quando não há ações.
 */
export function renderActionGrid(actions, withDamage = false) {
  if (!actions.length) return '<p class="dungeon-muted">Nada cadastrado ainda nesta ficha.</p>';
  return `<div class="dungeon-brain-grid">${actions.map((a) => actionButton(a, withDamage)).join("")}</div>`;
}

/**
 * Aba Jogar: "Mais usados" e "Todos os testes" (perícias da ficha). Os testes de atributo ficam sempre à vista no
 * cabeçalho da ficha, então não se repetem aqui.
 * @param {object[]} actions Ações clicáveis da ficha.
 * @returns {string} HTML da aba.
 */
export function renderPlayTab(actions) {
  const { skills } = splitSheetActions(actions);
  return `
    <h3 class="dungeon-eyebrow">Mais usados</h3>
    ${renderActionGrid(pickMostUsed(actions))}
    <h3 class="dungeon-eyebrow">Todos os testes</h3>
    <p class="dungeon-muted">Os testes de atributo estão no cabeçalho da ficha.</p>
    ${renderActionGrid(skills)}`;
}

function renderTabControls(activeId) {
  const radios = SHEET_TABS.map((t) => `<input type="radio" class="dungeon-sheet-tab-input" name="sheet-tab" id="sheet-tab-${t.id}" data-dungeon-tab="${t.id}"${t.id === activeId ? " checked" : ""} />`).join("");
  const labels = SHEET_TABS.map((t) => `<label class="dungeon-sheet-tab-label" for="sheet-tab-${t.id}">${escapeHtml(t.label)}</label>`).join("");
  return { radios, labels };
}

/**
 * Monta as quatro abas. Cada painel é HTML já pronto; o CSS mostra só o da aba marcada.
 * @param {Record<string, string>} panels HTML por id de aba (`play`, `abilities`, `items`, `about`).
 * @param {string} [activeId] Aba aberta ao montar.
 * @returns {string} HTML das abas.
 */
export function renderSheetTabs(panels, activeId = "play") {
  const active = SHEET_TABS.some((t) => t.id === activeId) ? activeId : "play";
  const { radios, labels } = renderTabControls(active);
  const body = SHEET_TABS.map((t) => `<div class="dungeon-sheet-tab-panel is-${t.id}">${panels[t.id] || ""}</div>`).join("");
  return `
    <div class="dungeon-sheet-tabs">
      ${radios}
      <div class="dungeon-sheet-tab-list" role="group" aria-label="Seções da ficha">${labels}</div>
      <div class="dungeon-sheet-tab-panels">${body}</div>
    </div>`;
}
