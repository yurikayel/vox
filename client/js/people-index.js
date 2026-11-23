/** Índice local de pessoas para busca (V-DIS + V-MESH P1/P2). */

import * as cacheNode from "./cache-node.js";
import * as contacts from "./contacts.js";
import * as handles from "./handles.js";
import * as mock from "./mock.js";
import { getWelcomeProfile, WELCOME_ROUTE_ID } from "./vox-welcome-profile.js";
import * as profileDirectory from "./profile-directory.js";
import * as localAccount from "./identity/index.js";
import { getLocalIdentityMeta } from "./profile-identity-meta.js";
import * as webrtcPeer from "./webrtc-peer.js";
import { shortId } from "./short-id.js";
import { isTestRouteId } from "./genesis.js";

const DEFAULT_PREFER_SOURCES = ["system", "self", "contact", "vault", "mesh-card", "mesh-author", "route-direct"];
/**
 * Operação `PEOPLE_SEARCH_OK_METRIC` do módulo.
 * @type {*}
 */
export const PEOPLE_SEARCH_OK_METRIC = "vox-metric-people-search-ok";

/**
 * Diz se o nome é só o id de rota ou vazio.
 * @param {string} name Nome
 * @param {string} routeId Id de rota
 * @returns {boolean} `true` se for nome de reserva.
 */
function isFallbackRouteName(name, routeId) {
  if (!name) return true;
  return name === routeId || name === String(routeId || "").slice(0, 14) || name === String(routeId || "").slice(0, 12);
}

/**
 * Escolhe o melhor nome entre o existente e o recebido.
 * @param {string} existingName Nome atual
 * @param {string} incomingName Nome recebido
 * @param {string} routeId Id de rota
 * @returns {string} Nome escolhido.
 */
function chooseBestName(existingName, incomingName, routeId) {
  if (!isFallbackRouteName(incomingName, routeId) && isFallbackRouteName(existingName, routeId)) {
    return incomingName;
  }
  return existingName || incomingName || String(routeId || "").slice(0, 14);
}

// O host vem do parser de URL, nunca de busca por trecho: "https://x.example/?a=googleusercontent.com/" não é Google.
/**
 * Diz se o avatar é de um domínio do Google.
 * @param {string} avatarUrl Endereço do avatar
 * @returns {boolean} `true` se for.
 */
function isGoogleAvatar(avatarUrl) {
  try {
    const url = new URL(avatarUrl);
    return url.protocol === "https:" && `.${url.hostname}`.endsWith(".googleusercontent.com");
  } catch {
    return false;
  }
}

/**
 * Diz se os dois avatares são do Google e da mesma conta.
 * @param {string} avA Primeiro avatar
 * @param {string} avB Segundo avatar
 * @returns {boolean} `true` se forem o mesmo.
 */
function isSameGoogleAvatar(avA, avB) {
  return isGoogleAvatar(avA) && isGoogleAvatar(avB) && avA.split("=")[0] === avB.split("=")[0];
}

// Nome igual só une contas que moram neste aparelho (a sua e as do seu cofre). Uma chave de fora
// com o mesmo nome é outra pessoa (homônimo) e tem de aparecer no diretório, não sumir dentro de "Você".
/**
 * Diz se as duas entradas são a mesma identidade local com nome escolhido.
 * @param {object} entryA Primeira entrada
 * @param {object} entryB Segunda entrada
 * @param {string} nameA Nome da primeira
 * @param {string} nameB Nome da segunda
 * @returns {boolean} `true` se forem a mesma.
 */
function isSameNamedLocalIdentity(entryA, entryB, nameA, nameB) {
  const isNamedA = !isFallbackRouteName(nameA, entryA.routeId);
  const isNamedB = !isFallbackRouteName(nameB, entryB.routeId);
  if (!isNamedA || !isNamedB || nameA !== nameB) return false;
  /**
   * Diz se a entrada vem do próprio aparelho (conta ativa ou cofre).
   * @param {object} e Entrada
   * @returns {boolean} `true` se for local.
   */
  const isLocal = (e) => e.source === "self" || e.source === "vault";
  return isLocal(entryA) && isLocal(entryB);
}

/**
 * Diz se as duas entradas são a mesma conta social (mesmo avatar).
 * @param {object} entryA Primeira entrada
 * @param {object} entryB Segunda entrada
 * @returns {boolean} `true` se forem a mesma.
 */
function isSameSocialIdentity(entryA, entryB) {
  const avA = entryA.avatarUrl || profileDirectory.getAuthorAvatarSync(entryA.routeId) || "";
  const avB = entryB.avatarUrl || profileDirectory.getAuthorAvatarSync(entryB.routeId) || "";
  if (avA && avB && avA === avB) return true;
  if (isSameGoogleAvatar(avA, avB)) return true;
  return isSameNamedLocalIdentity(entryA, entryB, entryA.name, entryB.name);
}

/**
 * Operação `isSameGoogleIdentity` do módulo.
 * @type {*}
 */
export const isSameGoogleIdentity = isSameSocialIdentity;

/**
 * Remove duplicatas sociais do mapa, ficando com a fonte preferida.
 * @param {Map<string, object>} map Mapa de pessoas
 * @param {object} entry Entrada nova
 * @param {string[]} preferSources Fontes em ordem de preferência
 * @returns {boolean} `true` se a entrada nova deve ser descartada.
 */
function pruneSocialDuplicates(map, entry, preferSources) {
  /**
   * Posição da fonte na ordem de preferência (desconhecida vai por último).
   * @param {string} s Fonte
   * @returns {number} Posição.
   */
  const rank = (s) => {
    const i = preferSources.indexOf(s);
    return i >= 0 ? i : 99;
  };
  const toDelete = [];
  let shouldDropIncoming = false;

  for (const [id, ex] of map.entries()) {
    if (id === entry.routeId) continue;
    if (isSameSocialIdentity(entry, ex)) {
      if (rank(entry.source) < rank(ex.source)) {
        toDelete.push(id);
      } else {
        shouldDropIncoming = true;
      }
    }
  }

  for (const id of toDelete) {
    map.delete(id);
  }
  return shouldDropIncoming;
}

/**
 * Insere ou mescla uma pessoa no mapa, respeitando a fonte preferida.
 * @param {Map<string, object>} map Mapa de pessoas
 * @param {object} entry Entrada
 * @param {string[]} [preferSources=DEFAULT_PREFER_SOURCES] Fontes em ordem de preferência
 */
function upsert(map, entry, preferSources = DEFAULT_PREFER_SOURCES) {
  const shouldDrop = pruneSocialDuplicates(map, entry, preferSources);
  if (shouldDrop) return;

  const existing = map.get(entry.routeId);
  if (!existing) {
    map.set(entry.routeId, entry);
    return;
  }
  /**
   * Posição da fonte na ordem de preferência (desconhecida vai por último).
   * @param {string} s Fonte
   * @returns {number} Posição.
   */
  const rank = (s) => {
    const i = preferSources.indexOf(s);
    return i >= 0 ? i : 99;
  };
  const bestName = chooseBestName(existing.name, entry.name, entry.routeId);
  const bestHandle = existing.handle || entry.handle || "";
  const bestAvatar = existing.avatarUrl || entry.avatarUrl || "";
  if (rank(entry.source) < rank(existing.source)) {
    map.set(entry.routeId, { ...existing, ...entry, name: bestName, handle: bestHandle, avatarUrl: bestAvatar, source: entry.source });
  } else {
    map.set(entry.routeId, { ...existing, name: bestName, handle: bestHandle, avatarUrl: bestAvatar });
  }
}

/**
 * Monta a entrada de pessoa a partir do autor de um post.
 * @param {object} post Post
 * @returns {object|null} Entrada, ou `null` se não houver autor.
 */
function resolveMeshAuthorEntry(post) {
  if (!post) return null;
  const author = post.author ? post.author : post.owner;
  if (!author) return null;
  const dirName = profileDirectory.getAuthorDisplaySync(author);
  const name = dirName || post.authorDisplay || author.slice(0, 14);
  const handle = post.authorHandle || mock.getAuthorHandle(author) || handles.getCachedAddressHandle(author) || "";
  const avatarUrl = post.authorAvatar || profileDirectory.getAuthorAvatarSync(author) || "";
  return { routeId: author, name, handle, avatarUrl, source: "mesh-author" };
}

/**
 * Indexa os pares conhecidos pelo sinalizador.
 * @param {Map<string, object>} map Mapa de pessoas
 */
function indexSignalingPeers(map) {
  if (typeof webrtcPeer.listKnownPeerAddresses !== "function") return;
  for (const addr of webrtcPeer.listKnownPeerAddresses()) {
    upsert(map, {
      routeId: addr,
      name: profileDirectory.getAuthorDisplaySync(addr) || addr.slice(0, 14),
      handle: handles.getCachedAddressHandle(addr) || mock.getAuthorHandle(addr) || "",
      source: "mesh-author",
    });
  }
}

/**
 * Indexa os autores dos posts guardados no aparelho.
 * @param {Map<string, object>} map Mapa de pessoas
 * @returns {Promise<void>} Conclui quando indexado.
 */
async function indexMeshAuthors(map) {
  const posts = typeof cacheNode.getAllLocalPosts === "function"
    ? await cacheNode.getAllLocalPosts()
    : await cacheNode.getLocalPosts({});
  for (const p of posts) {
    const entry = resolveMeshAuthorEntry(p);
    if (entry) upsert(map, entry);
  }
  indexSignalingPeers(map);
}

/**
 * Indexa os cartões de perfil descobríveis.
 * @param {Map<string, object>} map Mapa de pessoas
 */
function indexMeshCards(map) {
  for (const card of profileDirectory.listDiscoverableProfileCards()) {
    const routeId = card.routeId;
    upsert(map, {
      routeId,
      name: card.name || card.displayName || profileDirectory.getAuthorDisplaySync(routeId) || routeId.slice(0, 14),
      handle: card.handle || handles.getCachedAddressHandle(routeId) || mock.getAuthorHandle(routeId) || "",
      avatarUrl: card.avatarUrl || card.avatar || "",
      pronouns: card.pronouns || "",
      source: "mesh-card",
    });
  }
}

/**
 * Indexa a conta ativa do aparelho.
 * @param {Map<string, object>} map Mapa de pessoas
 */
function indexSelfAccount(map) {
  const myId = localAccount.getCachedRouteIdSync();
  if (!myId) return;
  const myName = localAccount.getDisplayName()
    || localAccount.getProfileEnrichment()?.displayName
    || profileDirectory.getAuthorDisplaySync(myId)
    || "";
  const selfMeta = getLocalIdentityMeta(myId);
  upsert(map, {
    routeId: myId,
    name: myName || myId.slice(0, 14),
    handle: handles.getCachedAddressHandle(myId) || "",
    avatarUrl: localAccount.getProfileEnrichment()?.avatarUrl || profileDirectory.getAuthorAvatarSync(myId) || "",
    pronouns: selfMeta.pronouns || "",
    source: "self",
  });
}

/**
 * Indexa as contas do cofre local.
 * @param {Map<string, object>} map Mapa de pessoas
 */
function indexVaultAccounts(map) {
  if (typeof localAccount.listVaultAccountsSync !== "function") return;
  for (const v of localAccount.listVaultAccountsSync()) {
    if (!v?.routeId) continue;
    upsert(map, {
      routeId: v.routeId,
      name: v.displayName || profileDirectory.getAuthorDisplaySync(v.routeId) || v.routeId.slice(0, 14),
      handle: handles.getCachedAddressHandle(v.routeId) || "",
      avatarUrl: v.avatarUrl || "",
      source: "vault",
    });
  }
}

/**
 * Indexa a conta ativa e as do cofre.
 * @param {Map<string, object>} map Mapa de pessoas
 */
function indexLocalAndVaultAccounts(map) {
  indexSelfAccount(map);
  indexVaultAccounts(map);
}

/**
 * Compara duas pessoas para ordenar a lista (boas-vindas primeiro, nome real antes de reserva).
 * @param {object} a Primeira entrada
 * @param {object} b Segunda entrada
 * @returns {number} Resultado da comparação.
 */
function comparePeopleEntries(a, b) {
  if (a.routeId === WELCOME_ROUTE_ID) return -1;
  if (b.routeId === WELCOME_ROUTE_ID) return 1;
  const aFallback = isFallbackRouteName(a.name, a.routeId);
  const bFallback = isFallbackRouteName(b.name, b.routeId);
  if (aFallback !== bFallback) return aFallback ? 1 : -1;
  const nameCmp = String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", {
    sensitivity: "base",
  });
  if (nameCmp !== 0) return nameCmp;
  return String(a.routeId || "").localeCompare(String(b.routeId || ""));
}

/**
 * Operação `buildPeopleIndex` do módulo.
 * @returns {*} Resultado da operação.
 */
export async function buildPeopleIndex() {
  const map = new Map();

  const welcome = getWelcomeProfile();
  map.set(WELCOME_ROUTE_ID, {
    routeId: WELCOME_ROUTE_ID,
    name: welcome.name,
    handle: welcome.handle,
    source: "system",
  });

  indexLocalAndVaultAccounts(map);

  for (const c of contacts.listContacts()) {
    upsert(map, {
      routeId: c.routeId,
      name: c.label || profileDirectory.getAuthorDisplaySync(c.routeId) || c.routeId,
      handle: handles.getCachedAddressHandle(c.routeId) || "",
      source: "contact",
    });
  }

  await indexMeshAuthors(map);
  indexMeshCards(map);

  return Array.from(map.values()).filter((p) => !isTestRouteId(p.routeId)).sort(comparePeopleEntries);
}

/**
 * Pares da malha sem nome escolhido (só a chave `vx_…`) são visitantes de passagem ou contas
 * temporárias: não entram na lista do diretório. Continuam achados pela busca por chave.
 
 * @param {*} [p] Parâmetro `p`.
 * @returns {*} Resultado da operação.
 */
export function hasChosenName(p) {
  return profileDirectory.hasChosenCardName(p);
}

/**
 * Entra na lista do diretório: o perfil oficial, a própria pessoa e quem escolheu um nome.
 * Conta só com a chave (`vx_…`), venha da malha, do cofre deste aparelho ou dos contatos, não diz nada
 * a quem lê; continua achável pela chave completa na busca e a chave aparece no perfil.
 * @param {{source?: string, name?: string, routeId?: string}} p Entrada do índice.
 * @returns {boolean} True se a entrada aparece na lista.
 */
export function isListedPerson(p) {
  return p?.source === "self" || p?.source === "system" || hasChosenName(p);
}

/**
 * Operação `buildPeopleSections` do módulo.
 * @returns {*} Resultado da operação.
 */
export async function buildPeopleSections() {
  const all = await buildPeopleIndex();
  const contactsList = all.filter(
    (p) => (p.source === "contact" || p.source === "system" || p.source === "self" || p.source === "vault") && isListedPerson(p),
  );
  const mesh = all.filter(
    (p) => (p.source === "mesh-author" || p.source === "mesh-card" || p.source === "route-direct") && hasChosenName(p),
  );
  const tour = all.filter((p) => p.source === "demo");
  return { contacts: contactsList, mesh, tour, all: all.filter(isListedPerson) };
}

/**
 * Operação `recordPeopleSearchOk` do módulo.
 */
export function recordPeopleSearchOk() {
  try {
    localStorage.setItem(PEOPLE_SEARCH_OK_METRIC, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/**
 * Trata a busca por id de rota (`vx_...`) direto, mesmo sem a pessoa na lista.
 * @param {string} cleanQ Busca limpa
 * @param {object[]} all Pessoas conhecidas
 * @returns {object|null} Entrada direta, ou `null`.
 */
function resolveDirectRouteQuery(cleanQ, all) {
  const cleanQl = cleanQ.toLowerCase();
  if (cleanQl.startsWith("vx_") && cleanQl.length >= 6) {
    const already = all.some((p) => (p.routeId || "").toLowerCase().includes(cleanQl));
    if (!already) {
      const disp = profileDirectory.getAuthorDisplaySync(cleanQ);
      all.push({
        routeId: cleanQ,
        name: disp || cleanQ.slice(0, 14),
        handle: handles.getCachedAddressHandle(cleanQ) || "",
        source: "route-direct",
      });
    }
  }
}

/**
 * Diz se o texto contém a busca.
 * @param {string} text Texto em minúsculas
 * @param {string} ql Busca em minúsculas
 * @param {string} cleanQl Busca limpa em minúsculas
 * @returns {boolean} `true` se contém.
 */
function matchesTextQuery(text, ql, cleanQl) {
  if (!text) return false;
  return text.includes(ql) || Boolean(cleanQl && text.includes(cleanQl));
}

/**
 * Diz se o id de rota, inteiro ou curto, contém a busca.
 * @param {string} pRoute Id de rota
 * @param {string} pShort Id curto
 * @param {string} cleanQl Busca limpa
 * @returns {boolean} `true` se contém.
 */
function matchesRouteId(pRoute, pShort, cleanQl) {
  if (!cleanQl) return false;
  return pRoute.includes(cleanQl) || pShort.includes(cleanQl);
}

/**
 * Diz se a pessoa combina com a busca.
 * @param {object} p Pessoa
 * @param {string} ql Busca em minúsculas
 * @param {string} cleanQl Busca limpa
 * @param {string} handleRoute Rota resolvida por handle
 * @returns {boolean} `true` se combina.
 */
function matchesPerson(p, ql, cleanQl, handleRoute) {
  if (handleRoute && p.routeId === handleRoute) return true;
  const pRoute = (p.routeId || "").toLowerCase();
  const pShort = shortId(p.routeId).toLowerCase();
  if (matchesRouteId(pRoute, pShort, cleanQl)) return true;

  const pName = (p.name || "").toLowerCase();
  if (matchesTextQuery(pName, ql, cleanQl)) return true;

  const pHandle = (p.handle || "").toLowerCase();
  return matchesTextQuery(pHandle, ql, cleanQl);
}

/**
 * Operação `searchPeople` do módulo.
 * @param {*} [query] Parâmetro `query`.
 * @returns {*} Resultado da operação.
 */
export async function searchPeople(query) {
  const q = String(query || "").trim();
  const all = await buildPeopleIndex();
  if (!q) return all;

  const cleanQ = q.replace(/^@/, "").trim();
  let handleRoute = "";
  if (q.startsWith("@") || cleanQ) {
    const mapped = handles.getCachedHandleMapping(q.startsWith("@") ? q : `@${cleanQ}`);
    if (mapped) handleRoute = mapped;
  }
  if (handleRoute && !all.some((p) => p.routeId === handleRoute)) {
    all.push({
      routeId: handleRoute,
      name: profileDirectory.getAuthorDisplaySync(handleRoute) || handleRoute.slice(0, 14),
      handle: handles.getCachedAddressHandle(handleRoute) || handles.normalizeSlug(cleanQ),
      source: "handle-cache",
    });
  }

  resolveDirectRouteQuery(cleanQ, all);

  const ql = q.toLowerCase();
  const cleanQl = cleanQ.toLowerCase();
  /**
   * Diz se o id de rota é exatamente a busca.
   * @param {object} p Pessoa
   * @returns {boolean} `true` se for.
   */
  const isExactKey = (p) => String(p.routeId || "").toLowerCase() === cleanQl;
  const results = all.filter((p) => matchesPerson(p, ql, cleanQl, handleRoute) && (isListedPerson(p) || isExactKey(p)));

  if (results.length > 0) recordPeopleSearchOk();
  return results;
}

/**
 * Operação `extractRecentAuthors` do módulo.
 * @param {*} [topics] Parâmetro `topics`.
 * @param {*} [limit] Parâmetro `limit`.
 * @returns {*} Resultado da operação.
 */
export function extractRecentAuthors(topics, limit = 8) {
  const out = [];
  const seen = new Set();
  for (const t of topics || []) {
    const author = t.author || t.owner;
    if (!author || seen.has(author)) continue;
    seen.add(author);
    out.push({
      routeId: author,
      name: profileDirectory.getAuthorDisplaySync(author) || author.slice(0, 14),
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Operação `parseConnectTarget` do módulo.
 * @param {*} [input] Parâmetro `input`.
 * @returns {*} Resultado da operação.
 */
export function parseConnectTarget(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const connectMatch = raw.match(/#\/connect\/([^/?#]+)/i) || raw.match(/connect\/([^/?#]+)/i);
  if (connectMatch) return decodeURIComponent(connectMatch[1]);
  const clean = raw.replace(/^@/, "").trim();
  if (clean.startsWith("vx_")) return clean.split(/\s/)[0];
  return null;
}
