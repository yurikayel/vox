/**
 * @file Ponto de entrada de laboratório para o AI Social Dungeon (`#/labs/dungeon` e `#/dungeon`).
 * Delega a renderização e interatividade para as 4 telas segregadas em `client/js/dungeon/`.
 * @module labs/ai-social-dungeon-lab
 */
import { renderDungeonView, wireDungeonView } from "../dungeon/dungeon-controller.js";

/**
 * Renderiza a tela inicial do Acampamento AI Social Dungeon (`renderDungeonLab` preservado p/ compatibilidade).
 *
 * @param {object} [opts={}] Opções opcionais (`screen`, `tableId`, `charId`, `state`).
 * @returns {string} HTML completo da tela isolada `.dungeon-sanctum`.
 */
export function renderDungeonLab(opts = {}) {
  return renderDungeonView(opts);
}

/**
 * Conecta eventos de interação da UI do AI Social Dungeon no elemento contêiner.
 *
 * @param {HTMLElement} rootEl Nó DOM onde o HTML foi inserido.
 * @param {object} [opts={}] Parâmetros da sub-tela montada.
 * @returns {void} Sem valor de retorno.
 */
export function wireDungeonLab(rootEl, opts = {}) {
  wireDungeonView(rootEl, opts);
}
