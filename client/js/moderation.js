/**
 * @file Moderação no aparelho: ações de moderação da comunidade (ocultar, banir, fixar, travar, arquivar por denúncia
 * ou pelo moderador natural) aplicadas ao feed, e as listas pessoais deste aparelho (bloqueados, silenciados e posts
 * em quarentena local). Nada aqui apaga conteúdo da malha ou do permaweb: só decide o que este aparelho mostra e ecoa.
 */

import { REVIEW_HIDE_ACTION } from "./report-review.js";

/**
 * Junta as ações de moderação de uma comunidade: as gravadas neste aparelho e as do índice remoto (GraphQL), sem
 * repetir id, mais os arquivamentos do moderador natural quando o carregador estiver ligado. Toda ação que vem de
 * fora perde a marca `naturalVerified`; só o carregador do aparelho a constrói.
 * @param {string} communityId Identificador da comunidade.
 * @returns {Promise<object[]>} Ações de moderação; falha de leitura local ou remota vira lista vazia daquela fonte.
 */
export async function fetchModActions(communityId) {
  let localActions = [];
  try {
    const { getLocalPosts } = await import("./cache-node.js");
    localActions = await getLocalPosts({ type: "mod-action", communityId });
  } catch {}

  let remoteActions = [];
  try {
    const { fetchModActions: gqlFetchModActions } = await import("./graphql.js");
    remoteActions = await gqlFetchModActions(communityId);
  } catch {}

  const seen = new Set();
  const merged = [];
  for (const a of localActions) {
    seen.add(a.id);
    merged.push({ ...a, owner: a.author || a.owner, naturalVerified: false });
  }
  for (const a of remoteActions) {
    if (!seen.has(a.id)) {
      seen.add(a.id);
      merged.push({ ...a, naturalVerified: false });
    }
  }
  return [...merged, ...(await naturalHideActions(communityId, merged))];
}

/** PM-83: quem constrói os arquivamentos firmes conferidos; a camada `app` liga na partida (ADR-035). */
let naturalHideLoader = null;

/**
 * Liga o carregador de arquivamentos de moderadores naturais (PM-83). A camada `app` chama na partida, para que
 * esta camada de base não importe fluxos de `app/` (ADR-035).
 * @param {((communityId: string, modActions: object[]) => Promise<object[]>)|null} fn Carregador, ou `null` para desligar.
 * @returns {void}
 */
export function setNaturalHideLoader(fn) {
  naturalHideLoader = typeof fn === "function" ? fn : null;
}

/** PM-83: arquivamentos firmes de moderadores naturais, já conferidos (só com a flag de laboratório). */
async function naturalHideActions(communityId, modActions) {
  if (!naturalHideLoader) return [];
  try {
    return await naturalHideLoader(communityId, modActions);
  } catch {
    return [];
  }
}

/**
 * Lista de moderadores a partir do campo da comunidade (texto separado por vírgula ou lista).
 * @param {string|string[]} [rawModerators=""] Moderadores como vieram dos metadados.
 * @returns {string[]} Identificadores aparados, sem vazios; tipo desconhecido vira lista vazia.
 */
export function parseModerators(rawModerators = "") {
  if (!rawModerators) return [];
  if (Array.isArray(rawModerators)) {
    return rawModerators.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof rawModerators !== "string") return [];
  return rawModerators
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Indica se a conta é dona ou moderadora da comunidade (comparação sem diferenciar maiúsculas).
 * @param {string} userAddress Conta a conferir.
 * @param {string} communityOwner Dono da comunidade.
 * @param {string|string[]} [rawModerators=""] Moderadores como vieram dos metadados.
 * @returns {boolean} Verdadeiro para o dono ou um moderador listado; falso sem conta.
 */
export function isModerator(userAddress, communityOwner, rawModerators = "") {
  if (!userAddress) return false;
  if (communityOwner && userAddress.toLowerCase() === communityOwner.toLowerCase()) {
    return true;
  }
  const list = parseModerators(rawModerators);
  return list.some((m) => m.toLowerCase() === userAddress.toLowerCase());
}

/**
 * Monta o conjunto de moderadores válidos (dono e lista informada).
 * @param {string} [communityOwner=""] Dono da comunidade
 * @param {string} [rawModerators=""] Lista bruta de moderadores
 * @returns {Set<string>} Endereços em minúsculas.
 */
function buildValidModeratorsSet(communityOwner = "", rawModerators = "") {
  const validModerators = new Set();
  if (communityOwner) validModerators.add(communityOwner.toLowerCase());
  for (const m of parseModerators(rawModerators)) {
    validModerators.add(m.toLowerCase());
  }
  return validModerators;
}

/**
 * Arquivamento natural: escondido como "em revisão"; vale só para posts do afilhado. Construído no aparelho.
 * Se a moderação já escondeu o post, a decisão dela fica como está: o arquivamento natural não a substitui.
 */
function applyNaturalHide(state, act) {
  if (state.hiddenTargets.has(act.target) && !state.naturalAuthors.has(act.target)) return;
  state.hiddenTargets.add(act.target);
  state.reviewTargets.set(act.target, Number(act.ts) || 0);
  state.naturalAuthors.set(act.target, String(act.targetAuthor || "").toLowerCase());
}

const MOD_ACTION_APPLY = Object.freeze({
  hide: (s, t) => { s.hiddenTargets.add(t); s.reviewTargets.delete(t); s.naturalAuthors.delete(t); },
  [REVIEW_HIDE_ACTION]: (s, t, ts) => { s.hiddenTargets.add(t); s.reviewTargets.set(t, ts); s.naturalAuthors.delete(t); },
  unhide: (s, t) => { s.hiddenTargets.delete(t); s.reviewTargets.delete(t); s.naturalAuthors.delete(t); },
  ban: (s, t) => s.bannedOwners.add(t.toLowerCase()),
  unban: (s, t) => s.bannedOwners.delete(t.toLowerCase()),
  pin: (s, t) => s.pinState.set(t, true),
  unpin: (s, t) => s.pinState.set(t, false),
  lock: (s, t) => s.lockState.set(t, true),
  unlock: (s, t) => s.lockState.set(t, false),
});

/** Fail-closed: sem dono/moderadores conhecidos, nenhuma ação de terceiros é aplicada. */
function collectModerationState(actions, validModerators) {
  const state = { hiddenTargets: new Set(), reviewTargets: new Map(), bannedOwners: new Set(), pinState: new Map(), lockState: new Map(), naturalAuthors: new Map() };
  const sortedActions = [...actions].sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
  for (const act of sortedActions) {
    if (act.naturalVerified === true && act.action === "natural-hide" && act.target) {
      applyNaturalHide(state, act);
      continue;
    }
    const actOwner = (act.owner || act.author || "").toLowerCase();
    const apply = Object.hasOwn(MOD_ACTION_APPLY, act.action) ? MOD_ACTION_APPLY[act.action] : null;
    if (!actOwner || !validModerators.has(actOwner) || !act.target || !apply) continue;
    apply(state, act.target, Number(act.ts) || 0);
  }
  return state;
}

/** PM-69: item arquivado por denúncia continua visível, marcado "em revisão", para o autor e para a moderação. */
function canSeeInReview(item, reviewTargets, viewerKey, viewerIsMod) {
  if (!viewerKey || !reviewTargets.has(item.id)) return false;
  return viewerIsMod || String(item.owner || item.author || "").toLowerCase() === viewerKey;
}

/**
 * Arquivamento natural só vale sobre post do afilhado: sobre post de outra pessoa, não esconde nada.
 * `naturalAuthors` só tem posts escondidos apenas pelo arquivamento natural; o que a moderação escondeu não passa por aqui.
 */
function keepNaturalHidesOnTheirAuthor(items, state) {
  for (const [postId, author] of state.naturalAuthors) {
    const item = items.find((i) => i.id === postId);
    if (item && String(item.owner || item.author || "").toLowerCase() !== author) state.hiddenTargets.delete(postId);
  }
}

/**
 * Aplica ao feed as ações de moderação válidas, em ordem de data. Só valem ações do dono ou de um moderador (sem
 * nenhum conhecido, nenhuma ação de terceiros vale) e arquivamentos naturais construídos no aparelho. Post oculto
 * some, salvo o arquivado "em revisão", que o autor e a moderação continuam vendo marcado (`inReview`).
 * @param {object[]} items Posts do feed.
 * @param {object[]} [actions=[]] Ações de moderação (ver `fetchModActions`).
 * @param {string} [communityOwner=""] Dono da comunidade.
 * @param {string|string[]} [rawModerators=""] Moderadores da comunidade.
 * @param {string} [viewer=""] Conta de quem está vendo.
 * @returns {object[]} Posts visíveis, com `isPinned`, `isLocked` e a marca de revisão aplicados.
 */
export function applyFilters(items, actions = [], communityOwner = "", rawModerators = "", viewer = "") {
  if (!Array.isArray(items) || !items.length) return [];
  if (!Array.isArray(actions) || !actions.length) return items;

  const validModerators = buildValidModeratorsSet(communityOwner, rawModerators);
  const state = collectModerationState(actions, validModerators);
  keepNaturalHidesOnTheirAuthor(items, state);
  const { hiddenTargets, reviewTargets, bannedOwners, pinState, lockState } = state;
  const viewerKey = String(viewer || "").toLowerCase();
  const viewerIsMod = Boolean(viewerKey) && validModerators.has(viewerKey);

  return items
    .filter((item) => {
      if (hiddenTargets.has(item.id)) return canSeeInReview(item, reviewTargets, viewerKey, viewerIsMod);
      if (item.owner && bannedOwners.has(item.owner.toLowerCase())) return false;
      return true;
    })
    .map((item) => {
      const isPinned = pinState.has(item.id) ? pinState.get(item.id) : item.isPinned;
      const isLocked = lockState.has(item.id) ? lockState.get(item.id) : item.isLocked;
      const review = hiddenTargets.has(item.id) ? { inReview: true, reviewSince: reviewTargets.get(item.id) } : null;
      if (review || isPinned !== item.isPinned || isLocked !== item.isLocked) {
        return { ...item, isPinned, isLocked, ...review };
      }
      return item;
    });
}

/**
 * Tópico aberto por link direto: quem não pode vê-lo recebe `archived: true` (a tela mostra "arquivado").
 * A moderação continua abrindo tópicos ocultos, como antes.
 * @param {object} topic Tópico aberto.
 * @param {object[]} [actions=[]] Ações de moderação da comunidade.
 * @param {string} [communityOwner=""] Dono da comunidade.
 * @param {string|string[]} [rawModerators=""] Moderadores da comunidade.
 * @param {string} [viewer=""] Conta de quem está vendo.
 * @returns {object} O tópico com os filtros aplicados, ou uma cópia com `archived: true` para quem não pode vê-lo.
 */
export function filterTopicForViewer(topic, actions = [], communityOwner = "", rawModerators = "", viewer = "") {
  if (!topic) return topic;
  const [visible] = applyFilters([topic], actions, communityOwner, rawModerators, viewer);
  if (visible) return visible;
  if (isModerator(viewer, communityOwner, rawModerators)) return topic;
  return { ...topic, archived: true };
}


const BLOCKED_STORAGE = "vox-moderation-blocked-v1";
const MUTED_STORAGE = "vox-moderation-muted-v1";
/** Chave do `localStorage` com os ids de posts em quarentena local. */
export const QUARANTINE_STORAGE_KEY = "vox-quarantine-posts-v1";
/** Rótulo da ação de quarentena local no menu do post. */
export const QUARANTINE_ACTION_LABEL = "Quarentena local / não ecoar";
/** Explicação curta do que a quarentena local faz (e do que não faz). */
export const QUARANTINE_HINT =
  "Só neste aparelho. Não apaga o permaweb nem é ban da plataforma.";

/**
 * Lê uma lista do `localStorage`; se falhar, devolve lista vazia.
 * @param {string} key Chave
 * @returns {Array} Lista lida.
 */
function loadStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Grava uma lista no `localStorage`; se falhar, segue sem gravar.
 * @param {string} key Chave
 * @param {Array} list Lista
 */
function saveStorage(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {}
}

/**
 * Contas bloqueadas neste aparelho.
 * @returns {{routeId: string, reason: string, blockedAt: number}[]} Lista guardada; vazia se não houver ou falhar a leitura.
 */
export function getBlockedUsers() {
  return loadStorage(BLOCKED_STORAGE);
}

/**
 * Indica se a conta está bloqueada neste aparelho.
 * @param {string} routeId Conta a conferir.
 * @returns {boolean} Verdadeiro se estiver na lista de bloqueados.
 */
export function isUserBlocked(routeId) {
  if (!routeId) return false;
  const list = getBlockedUsers();
  return list.some((b) => b.routeId === routeId);
}

/**
 * Bloqueia a conta neste aparelho (substitui um bloqueio anterior da mesma conta). O que ela assina deixa de ser
 * mostrado e repassado por aqui.
 * @param {string} routeId Conta a bloquear.
 * @param {string} [reason=""] Motivo, guardado com até 100 caracteres.
 * @returns {boolean} Falso só sem conta.
 */
export function blockUser(routeId, reason = "") {
  if (!routeId) return false;
  const list = getBlockedUsers().filter((b) => b.routeId !== routeId);
  list.push({ routeId, reason: String(reason || "").slice(0, 100), blockedAt: Date.now() });
  saveStorage(BLOCKED_STORAGE, list);
  return true;
}

/**
 * Tira a conta da lista de bloqueados deste aparelho.
 * @param {string} routeId Conta a desbloquear.
 * @returns {boolean} Falso só sem conta.
 */
export function unblockUser(routeId) {
  if (!routeId) return false;
  const list = getBlockedUsers().filter((b) => b.routeId !== routeId);
  saveStorage(BLOCKED_STORAGE, list);
  return true;
}

/**
 * Contas silenciadas neste aparelho: somem do feed, mas o que assinam continua sendo repassado na malha.
 * @returns {{routeId: string, mutedAt: number}[]} Lista guardada; vazia se não houver ou falhar a leitura.
 */
export function getMutedUsers() {
  return loadStorage(MUTED_STORAGE);
}

/**
 * Indica se a conta está silenciada neste aparelho.
 * @param {string} routeId Conta a conferir.
 * @returns {boolean} Verdadeiro se estiver na lista de silenciados.
 */
export function isUserMuted(routeId) {
  if (!routeId) return false;
  const list = getMutedUsers();
  return list.some((m) => m.routeId === routeId);
}

/**
 * Silencia a conta neste aparelho.
 * @param {string} routeId Conta a silenciar.
 * @returns {boolean} Falso só sem conta.
 */
export function muteUser(routeId) {
  if (!routeId) return false;
  const list = getMutedUsers().filter((m) => m.routeId !== routeId);
  list.push({ routeId, mutedAt: Date.now() });
  saveStorage(MUTED_STORAGE, list);
  return true;
}

/**
 * Tira a conta da lista de silenciados deste aparelho.
 * @param {string} routeId Conta a reativar.
 * @returns {boolean} Falso só sem conta.
 */
export function unmuteUser(routeId) {
  if (!routeId) return false;
  const list = getMutedUsers().filter((m) => m.routeId !== routeId);
  saveStorage(MUTED_STORAGE, list);
  return true;
}

/**
 * Indica se o que chega da malha assinado por esta conta deve ser descartado (conta bloqueada aqui).
 * @param {string} authorRouteId Autor do item recebido.
 * @returns {boolean} Verdadeiro para autor bloqueado.
 */
export function shouldDropGossip(authorRouteId) {
  if (!authorRouteId) return false;
  return isUserBlocked(authorRouteId);
}

/**
 * Converte o valor bruto em lista de ids de post.
 * @param {*} raw Valor bruto
 * @returns {string[]} Ids.
 */
function asPostIdList(raw) {
  if (!Array.isArray(raw)) return [];
  const ids = [];
  for (const item of raw) {
    const id = typeof item === "string" ? item : item?.id;
    if (id) ids.push(id);
  }
  return ids;
}

/**
 * Ids dos posts em quarentena local (aceita também o formato antigo, com objetos `{id}`).
 * @returns {string[]} Ids guardados neste aparelho.
 */
export function getQuarantinedPostIds() {
  return asPostIdList(loadStorage(QUARANTINE_STORAGE_KEY));
}

/**
 * Indica se o post está em quarentena local.
 * @param {string} postId Id do post.
 * @returns {boolean} Verdadeiro se estiver na quarentena.
 */
export function isPostQuarantined(postId) {
  if (!postId) return false;
  return getQuarantinedPostIds().includes(postId);
}

/**
 * Indica se este aparelho pode repassar o post na malha (tem id e não está em quarentena local).
 * @param {string} postId Id do post.
 * @returns {boolean} Verdadeiro se pode ecoar.
 */
export function canEchoPost(postId) {
  return Boolean(postId) && !isPostQuarantined(postId);
}

/**
 * Põe o post em quarentena local: some do feed e não é repassado por este aparelho. Não apaga nada em outro lugar.
 * @param {string} postId Id do post.
 * @returns {boolean} Falso só sem id.
 */
export function quarantinePost(postId) {
  if (!postId) return false;
  const ids = getQuarantinedPostIds().filter((id) => id !== postId);
  ids.push(postId);
  saveStorage(QUARANTINE_STORAGE_KEY, ids);
  return true;
}

/**
 * Tira o post da quarentena local.
 * @param {string} postId Id do post.
 * @returns {boolean} Falso só sem id.
 */
export function unquarantinePost(postId) {
  if (!postId) return false;
  const ids = getQuarantinedPostIds().filter((id) => id !== postId);
  saveStorage(QUARANTINE_STORAGE_KEY, ids);
  return true;
}

/**
 * Monta o conjunto de autores bloqueados ou silenciados.
 * @returns {Set<string>} Autores ocultos.
 */
function hiddenAuthorSet() {
  const blocked = getBlockedUsers().map((b) => b.routeId);
  const muted = getMutedUsers().map((m) => m.routeId);
  return new Set([...blocked, ...muted]);
}

/**
 * Diz se o post aparece no feed (nem oculto, nem de autor oculto).
 * @param {object} post Post
 * @param {Set<string>} hiddenAuthors Autores ocultos
 * @param {Set<string>} hiddenIds Posts ocultos
 * @returns {boolean} `true` se aparece.
 */
function isFeedPostVisible(post, hiddenAuthors, hiddenIds) {
  if (post?.id && hiddenIds.has(post.id)) return false;
  const author = post?.author || post?.owner || "";
  return !author || !hiddenAuthors.has(author);
}

/**
 * Tira do feed os posts de contas bloqueadas ou silenciadas e os posts em quarentena local.
 * @param {object[]} posts Posts do feed.
 * @returns {object[]} Posts visíveis neste aparelho; entrada que não é lista vira lista vazia.
 */
export function filterFeedPosts(posts) {
  if (!Array.isArray(posts)) return [];
  const hiddenAuthors = hiddenAuthorSet();
  const hiddenIds = new Set(getQuarantinedPostIds());
  return posts.filter((post) => isFeedPostVisible(post, hiddenAuthors, hiddenIds));
}

/**
 * Exporta as listas de bloqueados e silenciados deste aparelho, para levar a outro aparelho ou compartilhar.
 * @returns {string} JSON `vox-moderation-list` (versão 1) com `blocked`, `muted` e `exportedAt`.
 */
export function exportModerationBundle() {
  return JSON.stringify({
    voxVersion: 1,
    kind: "vox-moderation-list",
    blocked: getBlockedUsers(),
    muted: getMutedUsers(),
    exportedAt: Date.now(),
  }, null, 2);
}

/**
 * Junta às listas deste aparelho as de um pacote exportado; a entrada do pacote substitui a da mesma conta.
 * @param {string|object} bundleInput Pacote `vox-moderation-list`, em texto JSON ou objeto.
 * @returns {boolean} Falso se o pacote não puder ser lido ou não for desse tipo.
 */
export function importModerationBundle(bundleInput) {
  let parsed = null;
  if (typeof bundleInput === "string") {
    try { parsed = JSON.parse(bundleInput); } catch { return false; }
  } else if (bundleInput && typeof bundleInput === "object") {
    parsed = bundleInput;
  }
  if (!parsed || parsed.kind !== "vox-moderation-list") return false;

  if (Array.isArray(parsed.blocked)) {
    const current = getBlockedUsers();
    const map = new Map(current.map((b) => [b.routeId, b]));
    for (const b of parsed.blocked) {
      if (b?.routeId) map.set(b.routeId, b);
    }
    saveStorage(BLOCKED_STORAGE, Array.from(map.values()));
  }

  if (Array.isArray(parsed.muted)) {
    const current = getMutedUsers();
    const map = new Map(current.map((m) => [m.routeId, m]));
    for (const m of parsed.muted) {
      if (m?.routeId) map.set(m.routeId, m);
    }
    saveStorage(MUTED_STORAGE, Array.from(map.values()));
  }

  return true;
}
