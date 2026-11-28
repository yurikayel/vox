/**
 * @file Botão "Rolar" do jogador na entrada de um pedido de teste (SUB-24c): quando o pedido está aberto e o leitor é um
 * dos alvos, a entrada "O Mestre pede X · CD n" da Crônica ganha o botão; o clique (em `dungeon-sheet-rolls.js`) rola a
 * perícia ligada ao pedido. A decisão de mostrar e a de aceitar o clique usam a mesma função, `rollableRequest`.
 * @module dungeon/check-roll-ui
 */
import { escapeHtml } from "../shared/html.js";

/**
 * Pedido de teste que o leitor pode rolar agora: aberto e com a rota do leitor entre os alvos.
 * @param {object} state Estado da sessão (`campaignDoc` com `checkRequestsById`, `vttKeypair` do leitor).
 * @param {string} requestId Id do pedido.
 * @returns {object|null} O pedido, ou `null` se não existe, já foi revelado ou o leitor não é alvo.
 */
export function rollableRequest(state, requestId) {
  const request = (state.campaignDoc || state).checkRequestsById?.[requestId];
  const me = state.vttKeypair?.routeId;
  return request?.status === "open" && me && request.targets.includes(me) ? request : null;
}

/**
 * HTML do botão "Rolar" de uma entrada da Crônica, ou texto vazio quando a entrada não é de um pedido que o leitor possa rolar.
 * @param {object} entry Entrada da Crônica.
 * @param {object} state Estado da sessão.
 * @returns {string} HTML do botão, ou `""`.
 */
export function renderCheckRollButton(entry, state) {
  const request = entry.badge === "Pedido" && entry.checkRequestId ? rollableRequest(state, entry.checkRequestId) : null;
  if (!request) return "";
  const label = `Rolar ${request.label}`;
  return `<button type="button" class="dungeon-btn dungeon-btn-primary" data-dungeon="check-roll" data-request-id="${escapeHtml(request.requestId)}" aria-label="${escapeHtml(label)}">Rolar</button>`;
}
