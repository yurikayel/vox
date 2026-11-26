/**
 * @file Interface da entrada no Fairplay (ADR-040 §3.1, SUB-03), atrás da flag `vox.lab.fairplay`: o Mestre aprova
 * ou recusa quem pede para entrar; o jogador vê "Aguardando aprovação do Mestre", "Entrada recusada" ou o aviso de que
 * não deu para falar com o Mestre, com a opção de tentar de novo. Só usa a API do par de sincronização.
 * @module dungeon/vtt-fairplay-acesso
 */
import { escapeHtml } from "../shared/html.js";
import { duplicatePeerIds, fairplayPeerLabel } from "./vtt-fairplay-nome.js";

/** Seletor do contêiner de acesso (recebe o foco depois de uma ação, para o foco ser previsível). */
export const FAIRPLAY_ACCESS_ID = "dungeon-fairplay-access";

function peerName(state, id) {
  return fairplayPeerLabel(id, state?.fairplayNames?.[id]);
}

const DUP_WARNING = `<strong class="dungeon-fairplay-dup" role="alert">Atenção: outro par tem o mesmo nome ou identificador. Confira o identificador.</strong>`;

function requestRow(state, id, dups) {
  const name = escapeHtml(peerName(state, id));
  const warning = dups.has(id) ? DUP_WARNING : "";
  return `<li class="dungeon-fairplay-request"><span>${name} pede para entrar</span>${warning}
    <button type="button" class="dungeon-btn" data-dungeon="fairplay-approve" data-peer="${escapeHtml(id)}" aria-label="Aprovar a entrada de ${name}">Aprovar</button>
    <button type="button" class="dungeon-btn" data-dungeon="fairplay-refuse" data-peer="${escapeHtml(id)}" aria-label="Recusar a entrada de ${name}">Recusar</button></li>`;
}

/**
 * Lista de pedidos de entrada para o Mestre.
 * @param {object} state Estado com `fairplayPendingPeers` (ids pendentes) e, opcionalmente, `fairplayNames`.
 * @returns {string} HTML ou vazio quando não há pedidos.
 */
export function renderFairplayRequests(state) {
  const ids = state?.fairplayPendingPeers || [];
  if (!ids.length) return "";
  const admitted = Object.keys(state?.campaign?.fairplay?.admitted || {});
  const dups = duplicatePeerIds([...ids, ...admitted], state?.fairplayNames);
  return `<ul class="dungeon-fairplay-requests" aria-label="Pedidos de entrada no Fairplay">${ids.map((id) => requestRow(state, id, dups)).join("")}</ul>`;
}

const PLAYER_TEXT = { waiting: "Aguardando aprovação do Mestre", refused: "Entrada recusada" };

/**
 * Estado honesto do jogador: aguardando, recusado ou sem contato com o Mestre (com botão para tentar de novo).
 * @param {object} state Estado com `fairplayAccess` ("waiting"|"refused"|"ok") e `fairplayHelloGaveUp`.
 * @returns {string} HTML ou vazio.
 */
export function renderFairplayPlayerAccess(state) {
  const text = PLAYER_TEXT[state?.fairplayAccess];
  if (text) return `<p class="dungeon-fairplay-access is-${state.fairplayAccess}" role="status">${text}</p>`;
  if (!state?.fairplayHelloGaveUp) return "";
  return `<p class="dungeon-fairplay-access is-offline" role="status">Não deu para falar com o Mestre.
    <button type="button" class="dungeon-btn" data-dungeon="fairplay-retry">Tentar de novo</button></p>`;
}

/**
 * Bloco de acesso do Fairplay para a coluna da Crônica (Mestre: pedidos; jogador: estado).
 * @param {object} state Estado da sessão.
 * @returns {string} HTML do bloco; vazio por dentro quando não há nada a mostrar (o foco continua tendo onde pousar).
 */
export function renderFairplayAccess(state) {
  const inner = `${renderFairplayRequests(state)}${renderFairplayPlayerAccess(state)}`;
  return `<div id="${FAIRPLAY_ACCESS_ID}" class="dungeon-fairplay-access-box" tabindex="-1">${inner}</div>`;
}

/**
 * Ação do botão Aprovar ou Recusar: chama a API do par e atualiza a fila local.
 * @param {object} state Estado da sessão (com `syncPeer`).
 * @param {HTMLElement} target Botão clicado (`data-dungeon` e `data-peer`).
 * @returns {Promise<boolean>} `true` se o par mudou de situação.
 */
export async function handleFairplayRequest(state, target) {
  const peer = state?.syncPeer;
  const id = target?.dataset?.peer || "";
  if (!peer || !id) return false;
  const act = target.dataset.dungeon === "fairplay-refuse" ? peer.refuseFairplayPeer : peer.approveFairplayPeer;
  const changed = await act(id);
  state.fairplayPendingPeers = peer.getPendingFairplayPeers();
  return changed;
}

/**
 * Ação do botão "Tentar de novo": limpa o aviso e refaz a entrada na mesa.
 * @param {object} state Estado da sessão (com `syncPeer`).
 * @returns {boolean} `true` se um novo pedido foi enviado.
 */
export function handleFairplayRetry(state) {
  if (!state?.syncPeer) return false;
  state.fairplayHelloGaveUp = false;
  state.syncPeer.join();
  return true;
}
