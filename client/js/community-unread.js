/** @file Gestão de leitura e novidades por comunidade (anti-abandono do Orkut, sem ansiedade algorítmica). */
import { resolveTopicLastActivityTs } from "./community-topic-order.js";
import { escapeHtml } from "./shared/html.js";
import { isSafeKey, withEntry } from "./shared/safe-key.js";

/**
 * Operação `LAST_SEEN_STORAGE_KEY` do módulo.
 * @type {*}
 */
export const LAST_SEEN_STORAGE_KEY = "vox-community-last-seen-v1";

/**
 * Devolve o `localStorage` se disponível, ou `null`.
 * @returns {Storage|null} Armazenamento.
 */
function getStorage() {
  try {
    return typeof globalThis.localStorage !== "undefined" ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Operação `loadLastSeenMap` do módulo.
 * @returns {*} Resultado da operação.
 */
export function loadLastSeenMap() {
  const store = getStorage();
  if (!store) return {};
  try {
    const raw = store.getItem(LAST_SEEN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Operação `saveLastSeenMap` do módulo.
 * @param {*} [map] Parâmetro `map`.
 */
export function saveLastSeenMap(map = {}) {
  const store = getStorage();
  if (!store) return;
  try {
    store.setItem(LAST_SEEN_STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

/**
 * Operação `getCommunityLastSeenTs` do módulo.
 * @param {*} [communityId] Parâmetro `communityId`.
 * @returns {*} Resultado da operação.
 */
export function getCommunityLastSeenTs(communityId) {
  if (!communityId) return 0;
  const map = loadLastSeenMap();
  return Number(map[communityId]) || 0;
}

/**
 * Operação `markCommunitySeen` do módulo.
 * @param {*} [communityId] Parâmetro `communityId`.
 * @param {*} [ts] Parâmetro `ts`.
 */
export function markCommunitySeen(communityId, ts = Date.now()) {
  if (!isSafeKey(communityId)) return;
  saveLastSeenMap(withEntry(loadLastSeenMap(), communityId, Number(ts) || Date.now()));
}

/**
 * Conta tópicos com atividade posterior ao último visto.
 * Se lastSeenTs não existir (primeira visita), retorna 0 para não gerar falsa urgência.
 
 * @param {*} [topics] Parâmetro `topics`.
 * @param {*} [lastSeenTs] Parâmetro `lastSeenTs`.
 * @returns {*} Resultado da operação.
 */
export function computeCommunityUnreadCount(topics = [], lastSeenTs = 0) {
  if (!Array.isArray(topics) || !lastSeenTs || lastSeenTs <= 0) return 0;
  let unread = 0;
  for (const t of topics) {
    if (resolveTopicLastActivityTs(t) > lastSeenTs) {
      unread++;
    }
  }
  return unread;
}

/**
 * Operação `renderCommunityUnreadBadge` do módulo.
 * @param {*} [unreadCount] Parâmetro `unreadCount`.
 * @returns {*} Resultado da operação.
 */
export function renderCommunityUnreadBadge(unreadCount) {
  const n = Number(unreadCount) || 0;
  if (n <= 0) return "";
  return `<span class="badge-pill community-unread-pill" aria-label="${n} novidades">${n} novos</span>`;
}

/**
 * Operação `renderCommunityCatchupBanner` do módulo.
 * @param {Object} [options] Total de não lidos e opções de exibição.
 * @returns {*} Resultado da operação.
 */
export function renderCommunityCatchupBanner({ totalUnread = 0 } = {}) {
  const n = Number(totalUnread) || 0;
  if (n === 0) {
    return `
      <div class="community-catchup-card card" style="padding: 0.75rem 1rem; margin-bottom: 1rem; text-align: center;">
        <p class="meta" style="margin: 0; font-size: 0.85rem;">☕ Você está em dia com suas comunidades. Sem rolagem infinita.</p>
      </div>`;
  }
  const label = n === 1 ? "1 novidade" : `${n} novidades`;
  return `
    <div class="community-catchup-card card" style="padding: 0.75rem 1rem; margin-bottom: 1rem;">
      <p class="meta" style="margin: 0; font-size: 0.85rem;">📬 Há <strong>${escapeHtml(label)}</strong> nas suas comunidades desde sua última visita.</p>
    </div>`;
}
