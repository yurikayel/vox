/**
 * @file Painéis em meia tela do HUD (spec hud-jogo-v0, §2 e §3): quais existem, estado aberto/fechado, atalhos de teclado
 * e para onde o foco vai ao abrir e ao fechar. Sem DOM próprio: a tela vem de `screen-hud-panels.js`.
 * @module dungeon/hud-panels
 */

/** Painéis, na ordem da barra. `key` é o atalho de uma letra (sem Tab: Tab continua navegando o foco). */
export const HUD_PANELS = Object.freeze([
  Object.freeze({ id: "sheet", key: "c", label: "Ficha" }),
  Object.freeze({ id: "items", key: "i", label: "Itens" }),
  Object.freeze({ id: "abilities", key: "s", label: "Habilidades" }),
  Object.freeze({ id: "map", key: "m", label: "Mapa" }),
  Object.freeze({ id: "chronicle", key: "r", label: "Crônica" }),
]);

const IDS = new Set(HUD_PANELS.map((p) => p.id));
const TEXT_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** Seletor do corpo do painel aberto (recebe o foco ao abrir). */
export const HUD_PANEL_BODY_SELECTOR = "[data-hud-panel-body]";

/**
 * Diz se o alvo do evento é um campo de texto (nesse caso os atalhos não valem).
 * @param {{tagName?: string, isContentEditable?: boolean}|null|undefined} target Alvo do evento.
 * @returns {boolean} `true` em `input`, `textarea`, `select` ou conteúdo editável.
 */
export function isTextTarget(target) {
  if (!target) return false;
  return TEXT_TAGS.has(String(target.tagName || "").toUpperCase()) || target.isContentEditable === true;
}

/**
 * Abre um painel (troca o que estava aberto). Id desconhecido não faz nada. O foco entra no painel.
 * @param {object} state Estado da sessão.
 * @param {string} id Id do painel.
 * @returns {boolean} `true` se abriu.
 */
export function openHudPanel(state, id) {
  if (!IDS.has(id)) return false;
  state.hudPanel = id;
  state.hudPanelFocus = HUD_PANEL_BODY_SELECTOR;
  return true;
}

/**
 * Fecha o painel aberto; o foco volta ao botão que o abriu.
 * @param {object} state Estado da sessão.
 * @returns {boolean} `true` se havia painel aberto.
 */
export function closeHudPanel(state) {
  const id = state.hudPanel;
  if (!id) return false;
  state.hudPanel = "";
  state.hudPanelFocus = `[data-hud-op="panel-open"][data-panel-id="${id}"]`;
  return true;
}

/**
 * Liga ou desliga um painel: o mesmo botão (ou atalho) abre e fecha.
 * @param {object} state Estado da sessão.
 * @param {string} id Id do painel.
 * @returns {boolean} `true` se algo mudou.
 */
export function toggleHudPanel(state, id) {
  if (state.hudPanel === id) return closeHudPanel(state);
  return openHudPanel(state, id);
}

/**
 * Entrega (uma vez) o seletor do foco pedido por abrir ou fechar um painel.
 * @param {object} state Estado da sessão.
 * @returns {string} Seletor, ou vazio.
 */
export function takeHudPanelFocus(state) {
  const sel = state.hudPanelFocus || "";
  state.hudPanelFocus = "";
  return sel;
}

function panelForKey(ev) {
  if (ev.ctrlKey || ev.metaKey || ev.altKey || isTextTarget(ev.target)) return undefined;
  return HUD_PANELS.find((p) => p.key === String(ev.key || "").toLowerCase());
}

/**
 * Diz se a tecla é atalho de painel (letra sem modificador fora de campo de texto) ou Esc.
 * @param {{key?: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean, target?: object}} ev Evento de teclado.
 * @returns {boolean} `true` quando o HUD pode tratar a tecla.
 */
export function isHudPanelKey(ev) {
  return ev?.key === "Escape" || Boolean(panelForKey(ev || {}));
}

/**
 * Trata a tecla: Esc fecha o painel aberto; a letra do painel abre ou fecha. Devolve uma tarefa para a tela redesenhar.
 * @param {object} state Estado da sessão.
 * @param {{key?: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean, target?: object, preventDefault?: Function}} ev Evento.
 * @returns {Promise<void>|undefined} Tarefa pronta, ou `undefined` se a tecla não se aplica.
 */
export function hudPanelKeyJob(state, ev) {
  const panel = ev?.key === "Escape" ? null : panelForKey(ev || {});
  const changed = panel ? toggleHudPanel(state, panel.id) : ev?.key === "Escape" && closeHudPanel(state);
  if (!changed) return undefined;
  ev.preventDefault?.();
  return Promise.resolve();
}
