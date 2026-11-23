/**
 * @file Sincronização com servidor de memória central (push/pull e hidratação).
 
 * @module central-memory
 * Cliente de sincronização automática com o nó local zero-central-memory.
 * Copia todos os artefatos locais para o disco do nó local e reidrata o estado
 * completo ao iniciar ou reconectar, evitando perda de memória da rede.*/

import { fetchWithTimeout, readResponseText } from "./fetch-timeout.js";
import * as cacheNode from "./cache-node.js";
import * as hydrate from "./central-memory-hydrate.js";
import { isBeforeGenesisMs, isTestRouteId } from "./genesis.js";
import { getRelayHttpUrls } from "./inbox.js";
import * as localAccount from "./identity/index.js";
import * as mediaBlob from "./media-blob.js";
import * as manifestMesh from "./peers-cache-manifest.js";
import * as gossipProfile from "./peers-gossip-profile.js";
import * as serverChoice from "./memory-server-choice.js";
import * as profileDirectory from "./profile-directory.js";

const DEFAULT_MEMORY_URLS = ["http://127.0.0.1:3921", "http://127.0.0.1:3920"];
const REQUEST_TIMEOUT_MS = 3000;

let preferredUrl = null;
let hydratingDepth = 0;
let syncInFlight = false;
let syncTimerId = null;
let autoPushEnabled = false;
let lastServerRevision = 0;
let lastServerTimestamp = 0;
let lastLocalSyncMs = 0;
let lastHydratedCallback = null;

/** Operação `resetCentralMemoryCursor` do módulo.
 */
export function resetCentralMemoryCursor() {
  lastServerRevision = 0;
  lastServerTimestamp = 0;
  lastLocalSyncMs = 0;
}

/** PM-91: servidor anunciado por um par (ou pelo próprio servidor) só vira sugestão; nada muda sem a pessoa. 
 * @param {*} [rawUrl] URL bruta descoberta.
 * @param {*} [source] Origem da sugestão de memória.
 * @returns {*} Resultado da operação.*/
export function registerDiscoveredMemoryUrl(rawUrl, source = "par") {
  return serverChoice.suggestMemoryServer(rawUrl, source);
}

/** O servidor escolhido, se for público (é o que este aparelho anuncia aos pares). 
 * @returns {*} Resultado da operação.*/
export function getDiscoveredPublicMemoryUrl() {
  const chosen = serverChoice.getChosenMemoryServer();
  return /^https:\/\//i.test(chosen) ? chosen : "";
}

/** Define CentralMemoryAutoPush.
 * @param {*} [enabled] Parâmetro `enabled`.
 */
export function setCentralMemoryAutoPush(enabled) {
  autoPushEnabled = Boolean(enabled);
  const sink = autoPushEnabled ? notifyCentralMemory : null;
  cacheNode.registerCentralMemorySink(sink);
  mediaBlob.registerBlobMemorySink(sink);
  profileDirectory.registerProfileMemorySink(sink);
}

/** Operação `notifyCentralMemory` do módulo.
 * @param {*} [event] Evento Nostr.
 */
export function notifyCentralMemory(event) {
  if (!autoPushEnabled || !event || isHydratingFromCentralMemory()) return;
  void pushEventToCentralMemory(event);
  const blob = event?.item?.mediaBlob || event?.mediaBlob;
  if (blob?.hash && blob?.data) {
    void pushEventToCentralMemory({ type: "MEDIA_BLOB", blob });
  }
}

/**
 * Lê o parâmetro de memória da URL atual.
 * @returns {string} Valor ou texto vazio.
 */
function extractMemoryParamFromLocation() {
  if (typeof window === "undefined" || !window.location) return "";
  try {
    const searchParams = new URLSearchParams(window.location.search || "");
    const fromSearch = searchParams.get("memory") || searchParams.get("relay") || "";
    if (fromSearch) return fromSearch.trim();
    const hash = String(window.location.hash || "");
    const qIdx = hash.indexOf("?");
    if (qIdx === -1) return "";
    const hashParams = new URLSearchParams(hash.slice(qIdx + 1));
    return (hashParams.get("memory") || hashParams.get("relay") || "").trim();
  } catch {
    return "";
  }
}

/** Link com `?memory=` (ou `?relay=`): vira sugestão, perguntada ao abrir o app (PM-91). 
 * @returns {*} Resultado da operação.*/
export function captureMemoryUrlFromLocation() {
  return serverChoice.suggestMemoryServer(extractMemoryParamFromLocation(), "link");
}

/** Obtém CentralMemoryUrls.
 * @returns {*} Resultado da operação.
 */
export function getCentralMemoryUrls() {
  const storedMemoryUrl = serverChoice.getChosenMemoryServer();
  const configured = typeof getRelayHttpUrls === "function" ? getRelayHttpUrls() : [];
  const merged = [storedMemoryUrl, ...configured, ...DEFAULT_MEMORY_URLS]
    .map((u) => String(u || "").trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return [...new Set(merged)];
}

/** Indica se HydratingFromCentralMemory.
 * @returns {*} Resultado da operação.
 */
export function isHydratingFromCentralMemory() {
  return hydratingDepth > 0;
}

/**
 * Faz uma requisição com timeout e lê o JSON.
 * @param {string} url Endereço
 * @param {object} [options={}] Opções do `fetch`
 * @returns {Promise<object>} Resposta decodificada.
 */
async function fetchJsonWithTimeout(url, options = {}) {
  try {
    const res = await fetchWithTimeout(url, options, { timeoutMs: REQUEST_TIMEOUT_MS });
    if (typeof res.text === "function") {
      const text = await readResponseText(res);
      if (!res.ok) return null;
      if (text) return JSON.parse(text);
    }
    if (!res.ok) return null;
    return typeof res.json === "function" ? await res.json() : null;
  } catch {
    return null;
  }
}

/**
 * Envia o corpo ao primeiro servidor de memória que responder, preferindo o último bom.
 * @param {string} path Caminho da rota
 * @param {object} payload Corpo
 * @returns {Promise<object|null>} Resposta ou `null` se nenhum respondeu.
 */
async function postToFirstAvailable(path, payload) {
  const urls = preferredUrl
    ? [preferredUrl, ...getCentralMemoryUrls().filter((u) => u !== preferredUrl)]
    : getCentralMemoryUrls();
  const body = JSON.stringify(payload);
  for (const base of urls) {
    const data = await fetchJsonWithTimeout(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (data && typeof data === "object") {
      preferredUrl = base;
      return data;
    }
  }
  return null;
}

/** Operação `pushEventToCentralMemory` do módulo.
 * @param {*} [event] Evento Nostr.
 * @returns {*} Resultado da operação.
 */
export async function pushEventToCentralMemory(event) {
  if (!event || typeof event !== "object" || isHydratingFromCentralMemory()) {
    return null;
  }
  return postToFirstAvailable("/memory/ingest", event);
}

/**
 * Extrai o hash do blob de mídia de um post.
 * @param {object} post Post
 * @returns {string} Hash, ou texto vazio.
 */
function extractPostBlobHash(post) {
  if (!post || typeof post !== "object") return "";
  if (post.mediaRef && post.mediaRef.hash) return post.mediaRef.hash;
  if (post.mediaBlob && post.mediaBlob.hash) return post.mediaBlob.hash;
  return "";
}

/**
 * Resolve o blob de mídia de um post, do próprio post ou do cache.
 * @param {object} post Post
 * @param {string} hash Hash do blob
 * @returns {Promise<object|null>} Blob ou `null`.
 */
async function resolveBlobForPost(post, hash) {
  if (post.mediaBlob && post.mediaBlob.data) {
    return post.mediaBlob;
  }
  return mediaBlob.defaultBlobStorage.get(hash);
}

/**
 * Reúne os blobs locais dos posts, sem repetir.
 * @param {object[]} posts Posts
 * @returns {Promise<object[]>} Blobs.
 */
async function collectLocalBlobs(posts) {
  const blobs = [];
  const seen = new Set();
  for (const post of posts) {
    const hash = extractPostBlobHash(post);
    if (!hash || seen.has(hash)) continue;
    seen.add(hash);
    const stored = await resolveBlobForPost(post, hash);
    if (stored && stored.hash && stored.data) {
      blobs.push(stored);
    }
  }
  return blobs;
}

/**
 * Filtra os itens mais novos que a marca d'água.
 * @param {object[]} items Itens
 * @param {number} watermarkMs Marca d'água em ms
 * @returns {object[]} Itens novos.
 */
function filterDeltaItems(items, watermarkMs) {
  if (watermarkMs <= 0) return items;
  return items.filter((it) => hydrate.itemTimestamp(it) >= watermarkMs);
}

/**
 * Lista os hashes de blob conhecidos nos posts.
 * @param {object[]} posts Posts
 * @returns {string[]} Hashes.
 */
function listKnownBlobHashes(posts) {
  const hashes = new Set();
  for (const post of posts) {
    const h = extractPostBlobHash(post);
    if (h && mediaBlob.defaultBlobStorage.has(h)) hashes.add(h);
  }
  return [...hashes];
}

/**
 * Converte um valor em texto aparado.
 * @param {*} val Valor
 * @returns {string} Texto aparado.
 */
function cleanStr(val) {
  return val ? String(val).trim() : "";
}

/**
 * Diz se o novo valor existe e difere do anterior.
 * @param {string} nextVal Valor novo
 * @param {string} prevVal Valor anterior
 * @returns {boolean} `true` se mudou.
 */
function hasFieldDiff(nextVal, prevVal) {
  return Boolean(nextVal && nextVal !== prevVal);
}

/**
 * Diz se o cartão do diretório mudaria com os novos campos.
 * @param {object|null} existing Cartão atual
 * @param {string} cleanName Nome
 * @param {string} cleanAvatar Avatar
 * @param {string} cleanBio Bio
 * @returns {boolean} `true` se há mudança.
 */
function hasCardChanges(existing, cleanName, cleanAvatar, cleanBio) {
  if (!existing) return true;
  if (hasFieldDiff(cleanName, existing.name)) return true;
  if (hasFieldDiff(cleanAvatar, existing.avatarUrl)) return true;
  return hasFieldDiff(cleanBio, existing.bio);
}

/**
 * Escolhe o valor novo ou mantém o existente.
 * @param {string} cleanVal Valor novo
 * @param {string} existingVal Valor atual
 * @returns {string} Valor escolhido.
 */
function mergeCardField(cleanVal, existingVal) {
  return cleanVal ? cleanVal : cleanStr(existingVal);
}

/**
 * Cria ou atualiza o cartão do diretório de perfis, se houver mudança.
 * @param {string} routeId Id de rota (`vx_...`)
 * @param {string} name Nome
 * @param {string} [avatarUrl=""] Avatar
 * @param {string} [bio=""] Bio
 */
function upsertDirectoryCardIfNeeded(routeId, name, avatarUrl = "", bio = "") {
  const id = cleanStr(routeId);
  if (!id.startsWith("vx_")) return;
  const existing = profileDirectory.getProfileCard(id);
  const cleanName = cleanStr(name);
  const cleanAvatar = cleanStr(avatarUrl);
  const cleanBio = cleanStr(bio);
  if (!hasCardChanges(existing, cleanName, cleanAvatar, cleanBio)) return;
  const ex = existing ? existing : {};
  profileDirectory.setProfileCard(id, {
    name: mergeCardField(cleanName, ex.name),
    avatarUrl: mergeCardField(cleanAvatar, ex.avatarUrl),
    bio: mergeCardField(cleanBio, ex.bio),
    discoverable: true,
  });
}

// Só a conta ativa, com nome e visível na malha. As outras contas do cofre não saem daqui: publicá-las
// juntas contaria a quem lê que são da mesma pessoa.
/**
 * Sincroniza o cartão da conta ativa com o diretório de perfis.
 */
function syncActiveAccountCard() {
  const myId = localAccount.getCachedRouteIdSync();
  if (!myId || !localAccount.getMeshDiscoverable()) return;
  const enrichObj = localAccount.getProfileEnrichment() || {};
  const myName = localAccount.getDisplayName() || enrichObj.displayName;
  if (profileDirectory.hasChosenCardName({ name: myName, routeId: myId })) {
    upsertDirectoryCardIfNeeded(myId, myName, enrichObj.avatarUrl, enrichObj.bio);
  }
}

/**
 * Atualiza o cartão do autor de um post no diretório.
 * @param {object} post Post
 */
function upsertAuthorCard(post) {
  if (post) upsertDirectoryCardIfNeeded(post.author || post.owner, post.authorDisplay, post.authorAvatar, "");
}

/**
 * Sincroniza as contas locais e os autores dos posts com o diretório de perfis.
 * @param {object[]} allPosts Posts
 */
function syncLocalAccountsToProfileDirectory(allPosts) {
  syncActiveAccountCard();
  for (const post of Array.isArray(allPosts) ? allPosts : []) upsertAuthorCard(post);
}

/**
 * Monta o pacote local (posts, lápides, blobs) para enviar à memória central.
 * @returns {Promise<object>} Pacote de sincronização.
 */
async function buildLocalSyncBundle() {
  const [allPosts, allTombstones] = await Promise.all([
    cacheNode.getWirePosts(),
    cacheNode.getAllTombstones(),
  ]);
  syncLocalAccountsToProfileDirectory(allPosts);
  const posts = filterDeltaItems(allPosts, lastLocalSyncMs);
  const tombstones = filterDeltaItems(allTombstones, lastLocalSyncMs);
  const profiles = profileDirectory.listShareableProfileCards();
  const manifests = filterDeltaItems(manifestMesh.listKnownManifests(), lastLocalSyncMs);
  const blobs = await collectLocalBlobs(posts);
  return {
    posts,
    tombstones,
    profiles,
    manifests,
    blobs,
    includeBlobs: true,
    clientRevision: lastServerRevision,
    since: lastServerTimestamp,
    knownBlobs: listKnownBlobHashes(allPosts),
  };
}

/** Cartões da memória central passam pela mesma regra da malha: só entra o cartão assinado pelo dono. */
async function hydrateProfiles(profiles) {
  if (!Array.isArray(profiles)) return 0;
  let added = 0;
  for (const card of profiles) {
    if (await gossipProfile.applyDirectoryProfileCard(card)) added += 1;
  }
  return added;
}

/** Testes anteriores à data de corte ficam fora, mesmo que a memória central ainda os tenha. */
function afterGenesis(items) {
  if (!Array.isArray(items)) return items;
  return items.filter(
    (it) => !isBeforeGenesisMs(hydrate.itemTimestamp(it)) && !isTestRouteId(it?.routeId || it?.author || it?.owner),
  );
}

/**
 * Aplica localmente o pacote recebido da memória central.
 * @param {object} remote Pacote remoto
 * @returns {Promise<void>} Conclui quando aplicado.
 */
async function applyRemoteBundle(remote) {
  hydratingDepth += 1;
  try {
    const blobsByHash = await hydrate.hydrateBlobs(remote.blobs);
    const tombCount = await hydrate.hydrateTombstones(remote.tombstones);
    const postCount = await hydrate.hydratePosts(afterGenesis(remote.posts), blobsByHash, upsertAuthorCard);
    const profCount = await hydrateProfiles(afterGenesis(remote.profiles));
    return tombCount + postCount + profCount;
  } finally {
    hydratingDepth = Math.max(0, hydratingDepth - 1);
  }
}

/**
 * Registra a marca d'água da sincronização e os endereços descobertos.
 * @param {object} remote Resposta remota
 * @param {number} syncStartedMs Início da sincronização (ms)
 */
function recordRemoteSyncWatermark(remote, syncStartedMs) {
  if (remote.tunnelUrl) {
    registerDiscoveredMemoryUrl(remote.tunnelUrl, "servidor");
  }
  lastServerRevision = Number(remote.revision || lastServerRevision);
  lastServerTimestamp = Number(remote.updatedAt || lastServerTimestamp);
  lastLocalSyncMs = syncStartedMs;
}

/** Operação `syncWithCentralMemory` do módulo.
 * @param {object} [options={}] Opções da operação.
 * @returns {*} Resultado da operação.
 */
export async function syncWithCentralMemory({ onHydrated } = {}) {
  if (syncInFlight) return { ok: false, skipped: true };
  syncInFlight = true;
  try {
    const syncStartedMs = Date.now();
    const bundle = await buildLocalSyncBundle();
    const remote = await postToFirstAvailable("/memory/sync", bundle);
    if (!remote || remote.status !== "ok") {
      return { ok: false, hydratedCount: 0 };
    }
    recordRemoteSyncWatermark(remote, syncStartedMs);
    const hydratedCount = remote.upToDate ? 0 : await applyRemoteBundle(remote);
    const cb = typeof onHydrated === "function" ? onHydrated : lastHydratedCallback;
    if (hydratedCount > 0 && typeof cb === "function") {
      cb({ hydratedCount, revision: remote.revision });
    }
    return { ok: true, hydratedCount, revision: remote.revision, counts: remote.counts };
  } finally {
    syncInFlight = false;
  }
}

/** Operação `startCentralMemoryLoop` do módulo.
 * @param {object} [options={}] Opções da operação.
 * @returns {*} Resultado da operação.
 */
export function startCentralMemoryLoop({ intervalMs = 15000, onHydrated } = {}) {
  if (typeof onHydrated === "function") lastHydratedCallback = onHydrated;
  setCentralMemoryAutoPush(true);
  serverChoice.migrateLegacyMemoryServer();
  captureMemoryUrlFromLocation();
  if (serverChoice.askAboutMemorySuggestion()) resetCentralMemoryCursor();
  if (syncTimerId !== null) clearInterval(syncTimerId);
  void syncWithCentralMemory({ onHydrated });
  syncTimerId = setInterval(() => {
    void syncWithCentralMemory({ onHydrated });
  }, intervalMs);
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void syncWithCentralMemory({ onHydrated });
      }
    });
  }
  return () => {
    if (syncTimerId !== null) {
      clearInterval(syncTimerId);
      syncTimerId = null;
    }
  };
}
