/**
 * @file Malha de pares do aparelho: troca de mensagens com outras abas (BroadcastChannel `vox-peer-v0`) e com outros
 * aparelhos (WebRTC, via `webrtc-peer.js`). Recebe e repassa gossip assinado (posts, edições, remoções, cartões de
 * perfil, manifestos de cache), serve e pede transações do cache local (WANT/BLOB) dentro dos tetos de banda, entrega
 * DMs e guarda as preferências e métricas de quem ajuda a rede. Nada que chega é aceito sem conferir a assinatura.
 */

import * as cacheNode from "./cache-node.js";
import * as webrtcPeer from "./webrtc-peer.js";
import { allowGossipFromAuthor } from "./rate-limit.js";
import { noteKeySeen } from "./new-key-guard.js";
import * as localAccount from "./identity/index.js";
import * as mediaBlob from "./media-blob.js";
import * as manifestMesh from "./peers-cache-manifest.js";
import * as blobAffinity from "./peers-blob-affinity.js";
import * as moderation from "./moderation.js";
import * as profileCard from "./profile-card.js";
import * as gossipProfile from "./peers-gossip-profile.js";
import * as profileDirectory from "./profile-directory.js";
import { normalizeStorageCommitment } from "./supporter-mode.js";
import * as centralMemory from "./central-memory.js";
import { isBeforeGenesisMs, isTestRouteId } from "./genesis.js";
import { isSupersededLocally } from "./post-supersede.js";
import { getRelayHttpUrls } from "./inbox.js";
import { createPeerSync, defaultPeerSyncDeps, SYNC_INV, SYNC_WANT } from "./peer-sync.js";
import { randomBase36 } from "./shared/html.js";
import {
  MAX_GOSSIP_ITEM_BYTES,
  MAX_GOSSIP_MESSAGE_BYTES,
  MAX_PROFILE_CARD_BYTES,
  exceedsBytes,
  noteGossipDrop,
} from "./peers-gossip-profile.js";

export { getGossipDropCounts, MAX_GOSSIP_ITEM_BYTES, MAX_GOSSIP_MESSAGE_BYTES, MAX_PROFILE_CARD_BYTES } from "./peers-gossip-profile.js";

export {
  collectPriorityPinTxIds,
  getLatestManifestForCommunity,
  isManifestPriorityTx,
  listKnownManifests,
  buildCacheManifestGossipDraft,
} from "./peers-cache-manifest.js";

export {
  isBlobPeerSoftPriorityEnabled,
  setBlobPeerSoftPriorityEnabled,
  bumpAffinity,
  getPeerAffinity,
  rankAffinity,
  clearAffinity,
  getAffinityEntries,
} from "./peers-blob-affinity.js";

const PEER_SETTINGS_KEY = "vox-peer-settings";
const PEER_METRICS_KEY = "vox-peer-metrics";
const DAILY_USAGE_KEY = "vox-daily-usage";
const CHANNEL_NAME = "vox-peer-v0";

const myPeerId = "peer_" + randomBase36(7);
const peerSync = createPeerSync(defaultPeerSyncDeps(myPeerId));
let broadcastChannel = null;
const pendingRequests = new Map(); // txId -> Array of resolver functions
const dmListeners = new Set();
const gossipListeners = new Set();

/**
 * Inscreve um ouvinte de DMs que chegam pela malha (WebRTC ou outra aba).
 * @param {(envelope: object, source: string) => void} listener Recebe o envelope cifrado e a origem (`"rtc"` ou `"broadcast"`).
 * @returns {() => boolean} Função que cancela a inscrição.
 */
export function onDirectMessage(listener) {
  dmListeners.add(listener);
  return () => dmListeners.delete(listener);
}

function dispatchDirectMessage(envelope, source = "rtc") {
  if (!envelope) return;
  for (const fn of dmListeners) {
    try {
      fn(envelope, source);
    } catch {}
  }
}

const gossipTombstoneListeners = new Set();

/**
 * Inscreve um ouvinte de posts e edições aceitos do gossip (já conferidos e gravados no cache local).
 * @param {(item: object, source: string) => void} listener Recebe o item assinado e a origem (`"rtc"` ou `"broadcast"`).
 * @returns {() => boolean} Função que cancela a inscrição.
 */
export function onGossipPost(listener) {
  gossipListeners.add(listener);
  return () => gossipListeners.delete(listener);
}

function dispatchGossipPost(item, source = "rtc") {
  if (!item) return;
  for (const fn of gossipListeners) {
    try {
      fn(item, source);
    } catch {}
  }
}

/**
 * Inscreve um ouvinte de remoções aceitas do gossip (lápides conferidas e gravadas no cache local).
 * @param {(tombstone: object, source: string) => void} listener Recebe a lápide assinada e a origem.
 * @returns {() => boolean} Função que cancela a inscrição.
 */
export function onGossipTombstone(listener) {
  gossipTombstoneListeners.add(listener);
  return () => gossipTombstoneListeners.delete(listener);
}

function dispatchGossipTombstone(tombstone, source = "rtc") {
  if (!tombstone) return;
  for (const fn of gossipTombstoneListeners) {
    try {
      fn(tombstone, source);
    } catch {}
  }
}

const DEFAULT_PEER_SETTINGS = Object.freeze({
  enabled: true,
  maxMb: 100,
  wifiOnly: true,
  commOnly: false,
  supporter: false,
  backgroundRelay: false,
  /** Proporcional ao disco: 2 × 100 MB (supporter-mode.js). */
  dailyCapMb: 200,
  /** PM-52: no 4G o teto é próprio e baixo (quem tem o plano mais barato paga mais pela ajuda). */
  cellularCapMb: 5,
  webrtcEnabled: true,
});

/** PM-52: limites aceitos para o teto no 4G (MB/dia). */
export const CELLULAR_CAP_MIN_MB = 1;
/** PM-52: teto máximo aceito para o 4G (MB/dia). */
export const CELLULAR_CAP_MAX_MB = 50;

/**
 * PM-52: ajusta o teto do 4G ao intervalo aceito, arredondado em MB.
 * @param {unknown} value Valor escolhido pela pessoa.
 * @returns {number} Entre `CELLULAR_CAP_MIN_MB` e `CELLULAR_CAP_MAX_MB`; valor inválido, zero ou negativo vira o padrão (5).
 */
export function clampCellularCapMb(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PEER_SETTINGS.cellularCapMb;
  return Math.min(CELLULAR_CAP_MAX_MB, Math.max(CELLULAR_CAP_MIN_MB, Math.round(n)));
}

/**
 * Preferências de ajuda à rede guardadas neste aparelho, com os padrões no que faltar e disco e teto diário
 * normalizados (`normalizeStorageCommitment`).
 * @returns {{enabled: boolean, maxMb: number, wifiOnly: boolean, commOnly: boolean, supporter: boolean, backgroundRelay: boolean, dailyCapMb: number, cellularCapMb: number, webrtcEnabled: boolean}}
 *   Preferências; os padrões se não houver nada guardado ou a leitura falhar.
 */
export function getPeerSettings() {
  try {
    const raw = localStorage.getItem(PEER_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_PEER_SETTINGS };
    const p = JSON.parse(raw);
    return normalizeStorageCommitment({
      enabled: p.enabled !== undefined ? p.enabled : DEFAULT_PEER_SETTINGS.enabled,
      maxMb: p.maxMb || DEFAULT_PEER_SETTINGS.maxMb,
      wifiOnly: p.wifiOnly !== undefined ? p.wifiOnly : DEFAULT_PEER_SETTINGS.wifiOnly,
      commOnly: p.commOnly !== undefined ? p.commOnly : DEFAULT_PEER_SETTINGS.commOnly,
      supporter: Boolean(p.supporter),
      backgroundRelay: p.backgroundRelay !== undefined ? p.backgroundRelay : DEFAULT_PEER_SETTINGS.backgroundRelay,
      dailyCapMb: p.dailyCapMb || DEFAULT_PEER_SETTINGS.dailyCapMb,
      cellularCapMb: clampCellularCapMb(p.cellularCapMb ?? DEFAULT_PEER_SETTINGS.cellularCapMb),
      webrtcEnabled: p.webrtcEnabled !== undefined ? p.webrtcEnabled : DEFAULT_PEER_SETTINGS.webrtcEnabled,
    });
  } catch {
    return { ...DEFAULT_PEER_SETTINGS };
  }
}

/**
 * Grava as preferências, religa ou desliga os canais da malha conforme elas e avisa o service worker.
 * @param {object} settings Preferências completas (formato de `getPeerSettings`).
 */
export function savePeerSettings(settings) {
  localStorage.setItem(PEER_SETTINGS_KEY, JSON.stringify(settings));
  initPeerChannel();
  updateServiceWorkerRelay(settings);
}

/**
 * Contadores acumulados de ajuda à rede deste aparelho.
 * @returns {{blobsServed: number, bytesServed: number, blobsReceived: number, bytesReceived: number, blobsServedRtc: number}}
 *   Contadores; zerados se não houver nada guardado ou a leitura falhar.
 */
export function getPeerMetrics() {
  try {
    const raw = localStorage.getItem(PEER_METRICS_KEY);
    if (!raw) {
      return {
        blobsServed: 0,
        bytesServed: 0,
        blobsReceived: 0,
        bytesReceived: 0,
        blobsServedRtc: 0,
      };
    }
    const parsed = JSON.parse(raw);
    return {
      blobsServed: parsed.blobsServed || 0,
      bytesServed: parsed.bytesServed || 0,
      blobsReceived: parsed.blobsReceived || 0,
      bytesReceived: parsed.bytesReceived || 0,
      blobsServedRtc: parsed.blobsServedRtc || 0,
    };
  } catch {
    return {
      blobsServed: 0,
      bytesServed: 0,
      blobsReceived: 0,
      bytesReceived: 0,
      blobsServedRtc: 0,
    };
  }
}

function updateMetrics(field, amount = 1) {
  const metrics = getPeerMetrics();
  metrics[field] = (metrics[field] || 0) + amount;
  localStorage.setItem(PEER_METRICS_KEY, JSON.stringify(metrics));
}

/**
 * Uso de banda servida hoje (data UTC). Registro de outro dia não conta: o dia começa zerado.
 * @returns {{date: string, bytesServedToday: number, bytesCellularToday: number}} Uso do dia.
 */
export function getDailyUsage() {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const raw = localStorage.getItem(DAILY_USAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.date === today) return data;
    }
  } catch {}
  return { date: today, bytesServedToday: 0, bytesCellularToday: 0 };
}

/**
 * Soma bytes servidos ao uso do dia (e ao uso no 4G, se for o caso).
 * @param {number} bytes Quantidade servida.
 * @param {boolean} [onCellular] Se foi no 4G (padrão: a conexão atual não é Wi-Fi nem ilimitada).
 */
export function recordBytesServed(bytes, onCellular = !isWifiOrUnlimited()) {
  const usage = getDailyUsage();
  usage.bytesServedToday += bytes;
  if (onCellular) usage.bytesCellularToday = (usage.bytesCellularToday || 0) + bytes;
  localStorage.setItem(DAILY_USAGE_KEY, JSON.stringify(usage));
}

/**
 * PM-52: pode servir dados agora? No Wi-Fi vale o teto diário; no 4G, só se a pessoa
 * desligou o "só Wi-Fi", e até o teto do 4G (padrão 5 MB/dia).
 * @param {object} [settings] Preferências (padrão: `getPeerSettings()`).
 * @param {boolean} [onWifi] Se a conexão é Wi-Fi ou ilimitada (padrão: `isWifiOrUnlimited()`).
 * @param {{bytesServedToday: number, bytesCellularToday?: number}} [usage] Uso do dia (padrão: `getDailyUsage()`).
 * @returns {boolean} Verdadeiro se ainda pode servir.
 */
export function canServeNow(settings = getPeerSettings(), onWifi = isWifiOrUnlimited(), usage = getDailyUsage()) {
  if (usage.bytesServedToday >= (settings.dailyCapMb || DEFAULT_PEER_SETTINGS.dailyCapMb) * 1024 * 1024) return false;
  if (onWifi) return true;
  if (settings.wifiOnly) return false;
  return (usage.bytesCellularToday || 0) < clampCellularCapMb(settings.cellularCapMb) * 1024 * 1024;
}

/**
 * Indica se o teto diário de banda servida já foi atingido.
 * @returns {boolean} Verdadeiro se o uso de hoje alcançou `dailyCapMb`.
 */
export function isDailyCapReached() {
  const settings = getPeerSettings();
  const usage = getDailyUsage();
  const capBytes = (settings.dailyCapMb || DEFAULT_PEER_SETTINGS.dailyCapMb) * 1024 * 1024;
  return usage.bytesServedToday >= capBytes;
}

/**
 * Palpite da conexão pela Network Information API: sem a API, conta como Wi-Fi; economia de dados ou tipo
 * `cellular` contam como 4G.
 * @returns {boolean} Verdadeiro para Wi-Fi ou conexão sem limite conhecido.
 */
export function isWifiOrUnlimited() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return true;
  if (conn.saveData) return false;
  if (conn.type && conn.type === "cellular") return false;
  return true;
}

/**
 * Pede permissão de notificação só se ainda não houve resposta.
 * @returns {Promise<NotificationPermission>} `"granted"`, `"denied"` ou `"default"`; `"denied"` onde não há a API.
 */
export async function requestNotificationPermission() {
  if (typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "default") {
      return await Notification.requestPermission();
    }
    return Notification.permission;
  }
  return "denied";
}

function updateServiceWorkerRelay(settings) {
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "VOX_SETTINGS_UPDATED",
      settings,
    });
  }
}

/**
 * Comunidades onde o usuário local é membro ou dono (escopo commOnly).
 * @returns {Promise<Set<string>>} Ids das comunidades; vazio sem conta local.
 */
export async function collectUserCommunityIds() {
  const account = await localAccount.ensureLocalAccount();
  const routeId = account?.routeId || "";
  const ids = new Set();
  if (!routeId) return ids;

  const memberships = await cacheNode.getLocalPosts({ type: "membership" });
  for (const m of memberships) {
    if (m.author === routeId && m.communityId) ids.add(m.communityId);
  }

  const communities = await cacheNode.getLocalCommunities();
  for (const c of communities) {
    const cid = c.communityId || c.id;
    if (cid && c.owner === routeId) ids.add(cid);
  }
  return ids;
}

async function resolveTxCommunityId(txId, cachedData) {
  if (cachedData && typeof cachedData === "object" && cachedData.communityId) {
    return cachedData.communityId;
  }
  const local = await cacheNode.getLocalPost(txId);
  if (local?.communityId) return local.communityId;
  if (local?.replyTo) {
    const parent = await cacheNode.getLocalPost(local.replyTo);
    if (parent?.communityId) return parent.communityId;
  }
  return null;
}

/**
 * Indica se a transação é de uma comunidade da pessoa (escopo do "só minhas comunidades"). A comunidade sai do dado
 * em cache, do post local ou do post a que ele responde.
 * @param {string} txId Id da transação.
 * @param {object} [cachedData] Dado em cache da transação, se já carregado.
 * @returns {Promise<boolean>} Falso sem comunidades, ou se a comunidade da transação não puder ser descoberta.
 */
export async function isTxInUserCommunityScope(txId, cachedData) {
  const scope = await collectUserCommunityIds();
  if (scope.size === 0) return false;
  const commId = await resolveTxCommunityId(txId, cachedData);
  if (!commId) return false;
  return scope.has(commId);
}

const TXID_REGEX = /^[a-zA-Z0-9_-]{3,128}$/;

function isValidTxId(txId) {
  return typeof txId === "string" && TXID_REGEX.test(txId);
}

/** Item recebido (post, edição, lápide ou cartão) acima do teto do seu tipo: descartado e contado. */
function isOversizedItem(item) {
  const isCard = item?.type === profileCard.PROFILE_CARD_TYPE || item?.routeId !== undefined;
  const max = isCard ? MAX_PROFILE_CARD_BYTES : MAX_GOSSIP_ITEM_BYTES;
  if (!exceedsBytes(item, max)) return false;
  noteGossipDrop(isCard ? "oversizedProfileCard" : "oversizedItem");
  return true;
}

async function handleProfileCardHello(card) {
  if (!card || typeof card !== "object" || !card.pubKey || !card.sig || !card.author) return;
  if (moderation.shouldDropGossip(card.author)) return;
  if (isOversizedItem(card)) return;
  const valid = await localAccount.verifyPayload(card);
  if (valid) {
    await gossipProfile.applyVerifiedProfileCardItem(card);
  }
}

async function handleWantMessage(msg, replyFn, settings, source) {
  if (!isValidTxId(msg.txId) || msg.fromPeer === myPeerId) return;
  if (!canServeNow(settings)) return;

  const cached = await cacheNode.getCachedTx(msg.txId);
  if (!cached || typeof replyFn !== "function") return;

  const inScope = !settings.commOnly || (await isTxInUserCommunityScope(msg.txId, cached));
  if (!inScope) return;

  const payload = {
    type: "BLOB",
    txId: msg.txId,
    data: cached,
    fromPeer: myPeerId,
  };
  replyFn(payload);
  const size = JSON.stringify(cached).length;
  updateMetrics("blobsServed", 1);
  updateMetrics("bytesServed", size);
  if (source === "rtc") {
    updateMetrics("blobsServedRtc", 1);
  }
  recordBytesServed(size);
}

function handleBlobMessage(msg) {
  if (!isValidTxId(msg.txId) || !msg.data) return;
  const resolvers = pendingRequests.get(msg.txId);
  if (!resolvers || !resolvers.length) return;

  if (msg.fromPeer && blobAffinity.isBlobPeerSoftPriorityEnabled()) {
    blobAffinity.bumpAffinity(msg.fromPeer);
  }
  const size = JSON.stringify(msg.data).length;
  updateMetrics("blobsReceived", 1);
  updateMetrics("bytesReceived", size);
  for (const resolve of resolvers) {
    resolve(msg.data);
  }
  pendingRequests.delete(msg.txId);
}

const VOX_MESSAGE_HANDLERS = new Map(Object.entries({
  PROFILE_CARD_HELLO: (msg) => handleProfileCardHello(msg.card),
  PROFILE_CARD: (msg) => (isOversizedItem(msg.card) ? null : gossipProfile.applyDirectoryProfileCard(msg.card)),
  MEMORY_BEACON: (msg) =>
    msg.memoryUrl ? centralMemory.registerDiscoveredMemoryUrl(msg.memoryUrl) : null,
  WANT: (msg, replyFn, settings, source) => handleWantMessage(msg, replyFn, settings, source),
  BLOB: (msg) => handleBlobMessage(msg),
  DM: (msg, _replyFn, _settings, source) => {
    if (msg.envelope) dispatchDirectMessage(msg.envelope, source);
  },
  GOSSIP: (msg, _replyFn, _settings, source) => (msg.item ? handleGossipMessage(msg.item, source, msg.blob) : null),
  GOSSIP_UPDATE: (msg, _replyFn, _settings, source) => (msg.item ? handleGossipUpdateMessage(msg.item, source) : null),
  GOSSIP_DELETE: (msg, _replyFn, _settings, source) => {
    const target = msg.tombstone || msg.item;
    return target ? handleGossipDeleteMessage(target, source) : null;
  },
  CACHE_MANIFEST: (msg, _replyFn, _settings, source) => (msg.item ? handleCacheManifestMessage(msg.item, source) : null),
  [SYNC_INV]: (msg, replyFn, _settings, source) => (source === "rtc" ? peerSync.onInventory(msg, replyFn) : null),
  [SYNC_WANT]: (msg, replyFn, _settings, source) => (source === "rtc" ? peerSync.onWant(msg, replyFn) : null),
}));

/**
 * Despacha uma mensagem da malha para o tratador do seu `type` (WANT, BLOB, DM, GOSSIP, SYNC_INV etc.). Com a ajuda
 * à rede desligada, ou tipo desconhecido, nada acontece.
 * @param {object} msg Mensagem recebida.
 * @param {(reply: object) => void} replyFn Responde a quem mandou.
 * @param {string} [source="broadcast"] Origem: `"broadcast"` (outra aba) ou `"rtc"` (outro aparelho).
 * @returns {Promise<void>} Resolve depois do tratador.
 */
export async function handleVoxMessage(msg, replyFn, source = "broadcast") {
  if (!msg || typeof msg !== "object") return;
  const settings = getPeerSettings();
  if (!settings.enabled) return;

  if (exceedsBytes(msg, MAX_GOSSIP_MESSAGE_BYTES)) return noteGossipDrop("oversizedMessage");
  // Map, não objeto: `type` vem de fora e "__proto__"/"constructor" não podem resolver para nada herdado.
  const handler = typeof msg.type === "string" ? VOX_MESSAGE_HANDLERS.get(msg.type) : undefined;
  if (!handler) return noteGossipDrop("unknownType");
  await handler(msg, replyFn, settings, source);
}

function relayToMesh(payload, source = "rtc") {
  if (source !== "broadcast" && broadcastChannel) {
    try {
      broadcastChannel.postMessage(payload);
    } catch {}
  }
  if (source !== "rtc") {
    webrtcPeer.broadcastRtcMessage(payload);
  }
}

/** PM-84: só segue adiante o cartão de perfil novo; o repetido circulava sem fim. */
async function applyAndRelayProfileCard(item, type, source) {
  if (await gossipProfile.applyVerifiedProfileCardItem(item)) relayToMesh({ type, item, fromPeer: myPeerId }, source);
}

async function handleCacheManifestMessage(item, source = "rtc") {
  const result = await manifestMesh.ingestSignedCacheManifestItem(item, localAccount.verifyPayload);
  if (!result.ok || result.skipped) return;
  relayToMesh({ type: "CACHE_MANIFEST", item, fromPeer: myPeerId }, source);
}

function syncProfileDirectoryFromGossip(item) {
  if (item.author && (item.authorDisplay || item.authorAvatar || item.authorHandle)) {
    profileDirectory.setProfileCard(item.author, {
      name: item.authorDisplay || "",
      avatarUrl: item.authorAvatar || "",
      handle: item.authorHandle || "",
    });
  }
}

/** PM-09 + imagem: community/community_update com mídia insegura ou update sem permissão. */
async function isRejectedCommunityGossipItem(item) {
  if (item.type !== "community" && item.type !== "community_update") return false;
  const { communityGossipHasRejectedImages } = await import("./shared/community-avatar-image.js");
  if (communityGossipHasRejectedImages(item)) return true;
  if (item.type === "community_update") return !(await cacheNode.isCommunityUpdateAcceptable(item));
  return false;
}

/**
 * Fora da rede viva: conta de teste (cartão ou post) ou post criado antes da gênese. Aparelho em versão antiga
 * ainda manda esses itens; aqui eles não são guardados nem repassados.
 */
function isOutsideLiveNetwork(item) {
  if (isTestRouteId(item.author || item.routeId)) return true;
  return item.type !== profileCard.PROFILE_CARD_TYPE && isBeforeGenesisMs(item.ts || item.timestamp || 0);
}

/** `sentBlob`: a mídia do `mediaHash`, que viaja ao lado do post (PM-87); só entra e segue adiante se bate com o hash. */
async function handleGossipMessage(item, source = "rtc", sentBlob = null) {
  if (!item?.id || !item?.sig || isOversizedItem(item)) return;
  if (moderation.shouldDropGossip(item.author) || isOutsideLiveNetwork(item)) return;
  if (await isSupersededLocally(item)) return;
  if (!(await localAccount.verifyPayload(item))) return;

  if (item.type === profileCard.PROFILE_CARD_TYPE) {
    await applyAndRelayProfileCard(item, "GOSSIP", source);
    return;
  }

  if (!allowGossipFromAuthor(item.author)) return;
  if (await isRejectedCommunityGossipItem(item)) return;
  noteKeySeen(item.author);

  syncProfileDirectoryFromGossip(item);
  const blob = await mediaBlob.blobForPost(item, sentBlob);
  await cacheNode.saveLocalPost(mediaBlob.withLocalMedia(item, blob));
  dispatchGossipPost(item, source);
  relayToMesh({ type: "GOSSIP", item, blob, fromPeer: myPeerId }, source);
}

async function isGossipUpdateSuperseded(item) {
  const tombstone = await cacheNode.getTombstone(item.id);
  if (tombstone && (tombstone.editedAt || 0) >= item.editedAt) return true;

  const existing = await cacheNode.getLocalPost(item.id);
  if (existing) {
    if (existing.author && existing.author !== item.author) return true;
    const existingTime = existing.editedAt || existing.ts || 0;
    if (item.editedAt <= existingTime) return true;
  }
  return false;
}

/** Edição que nem chega à assinatura: sem campos, de autor bloqueado, fora da rede viva ou sem data de edição. */
function isMalformedOrBlockedUpdate(item) {
  if (!item?.id || !item?.sig || !item?.author) return true;
  if (moderation.shouldDropGossip(item.author) || isOutsideLiveNetwork(item)) return true;
  return !(item.editedAt > 0);
}

async function handleGossipUpdateMessage(item, source = "rtc") {
  if (isMalformedOrBlockedUpdate(item) || isOversizedItem(item)) return;
  if (await isGossipUpdateSuperseded(item)) return;
  if (!(await localAccount.verifyPayload(item))) return;

  if (item.type === profileCard.PROFILE_CARD_TYPE) {
    await applyAndRelayProfileCard(item, "GOSSIP_UPDATE", source);
    return;
  }
  if (await isRejectedCommunityGossipItem(item)) return;

  await cacheNode.saveLocalPost(item);
  dispatchGossipPost(item, source);
  relayToMesh({ type: "GOSSIP_UPDATE", item, fromPeer: myPeerId }, source);
}

async function isTombstoneSuperseded(tombstone) {
  const deleteTime = tombstone.editedAt || tombstone.ts || 0;
  const existingTombstone = await cacheNode.getTombstone(tombstone.id);
  if (existingTombstone) {
    const existingDeleteTime = existingTombstone.editedAt || existingTombstone.ts || 0;
    if (existingDeleteTime >= deleteTime) return true;
  }

  const existingPost = await cacheNode.getLocalPost(tombstone.id);
  if (existingPost) {
    if (existingPost.author && existingPost.author !== tombstone.author) return true;
    const postTime = existingPost.editedAt || existingPost.ts || 0;
    if (deleteTime < postTime) return true;
  }
  return false;
}

/** Lápide sem campos, grande demais, de autor bloqueado ou sem data: nem chega à assinatura. */
function isMalformedOrBlockedTombstone(tombstone) {
  if (!tombstone?.id || !tombstone?.sig || !tombstone?.author || isOversizedItem(tombstone)) return true;
  return moderation.shouldDropGossip(tombstone.author) || !(tombstone.editedAt || tombstone.ts);
}

async function handleGossipDeleteMessage(tombstone, source = "rtc") {
  if (isMalformedOrBlockedTombstone(tombstone)) return;
  if (await isTombstoneSuperseded(tombstone)) return;

  const valid = await localAccount.verifyPayload(tombstone);
  if (!valid) return;

  const cardRoute = gossipProfile.routeIdFromProfileCardId(tombstone.id);
  if (cardRoute) {
    profileDirectory.removeProfileCard(cardRoute);
    relayToMesh(
      { type: "GOSSIP_DELETE", item: tombstone, tombstone, fromPeer: myPeerId },
      source,
    );
    return;
  }

  await cacheNode.saveTombstone(tombstone);
  dispatchGossipTombstone(tombstone, source);
  relayToMesh({ type: "GOSSIP_DELETE", item: tombstone, tombstone, fromPeer: myPeerId }, source);
}

/**
 * Anuncia um item assinado novo (post, cartão) às outras abas e aos pares WebRTC.
 * @param {object} item Item assinado; sem `id`, nada é enviado.
 * @param {object|null} [blob=null] Mídia do `mediaHash`, que viaja ao lado do post (PM-87).
 */
export function broadcastGossip(item, blob = null) {
  if (!item?.id) return;
  const payload = { type: "GOSSIP", item, blob, fromPeer: myPeerId };
  if (broadcastChannel) {
    try { broadcastChannel.postMessage(payload); } catch {}
  }
  webrtcPeer.broadcastRtcMessage(payload);
}

/**
 * Anuncia a edição de um item assinado às outras abas e aos pares WebRTC.
 * @param {object} item Item editado e assinado; sem `id`, nada é enviado.
 */
export function broadcastGossipUpdate(item) {
  if (!item?.id) return;
  const payload = { type: "GOSSIP_UPDATE", item, fromPeer: myPeerId };
  if (broadcastChannel) {
    try { broadcastChannel.postMessage(payload); } catch {}
  }
  webrtcPeer.broadcastRtcMessage(payload);
}

/**
 * Anuncia uma remoção (lápide assinada) às outras abas e aos pares WebRTC.
 * @param {object} tombstone Lápide assinada; sem `id`, nada é enviado.
 */
export function broadcastGossipDelete(tombstone) {
  if (!tombstone?.id) return;
  const payload = { type: "GOSSIP_DELETE", item: tombstone, tombstone, fromPeer: myPeerId };
  if (broadcastChannel) {
    try { broadcastChannel.postMessage(payload); } catch {}
  }
  webrtcPeer.broadcastRtcMessage(payload);
}

/**
 * Anuncia o cartão de perfil assinado como gossip novo.
 * @param {object} item Cartão de perfil; outro tipo é ignorado.
 */
export function broadcastProfileCard(item) {
  if (item?.type !== profileCard.PROFILE_CARD_TYPE) return;
  broadcastGossip(item);
}

/**
 * Anuncia a edição do cartão de perfil assinado.
 * @param {object} item Cartão de perfil; outro tipo é ignorado.
 */
export function broadcastProfileCardUpdate(item) {
  if (item?.type !== profileCard.PROFILE_CARD_TYPE) return;
  broadcastGossipUpdate(item);
}

/**
 * Anuncia um manifesto de cache assinado às outras abas e aos pares WebRTC.
 * @param {object} item Item `cache-manifest` assinado; outro tipo, ou sem `id`, é ignorado.
 */
export function broadcastCacheManifest(item) {
  if (!item?.id || item.type !== "cache-manifest") return;
  const payload = { type: "CACHE_MANIFEST", item, fromPeer: myPeerId };
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage(payload);
    } catch {}
  }
  webrtcPeer.broadcastRtcMessage(payload);
}

/**
 * Assina um manifesto de cache com a conta deste aparelho, guarda localmente e anuncia na malha.
 * @param {object} manifestBody Manifesto da comunidade (com `communityId`).
 * @returns {Promise<object>} O item assinado que foi anunciado.
 */
export async function publishSignedCacheManifest(manifestBody) {
  const draft = manifestMesh.buildCacheManifestGossipDraft({
    communityId: manifestBody?.communityId,
    manifest: manifestBody,
  });
  const signed = await localAccount.signPayload(draft);
  await manifestMesh.ingestSignedCacheManifestItem(signed, localAccount.verifyPayload);
  broadcastCacheManifest(signed);
  return signed;
}

/**
 * Liga ou desliga os canais da malha conforme as preferências: o BroadcastChannel entre abas e o WebRTC entre
 * aparelhos. Roda ao carregar o módulo e a cada `savePeerSettings`.
 */
export function initPeerChannel() {
  const settings = getPeerSettings();

  if (broadcastChannel) {
    if (!settings.enabled) {
      broadcastChannel.close();
      broadcastChannel = null;
    }
  } else if (settings.enabled && (typeof window !== "undefined" ? window.BroadcastChannel : globalThis.BroadcastChannel)) {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    if (typeof broadcastChannel.unref === "function") broadcastChannel.unref();
    broadcastChannel.onmessage = (event) => {
      handleVoxMessage(
        event.data,
        (reply) => {
          if (broadcastChannel) broadcastChannel.postMessage(reply);
        },
        "broadcast"
      );
    };
  }

  if (settings.enabled && settings.webrtcEnabled) {
    webrtcPeer.initWebRtc(myPeerId);
  } else {
    webrtcPeer.disconnectWebRtc();
  }
}

webrtcPeer.onVoxMessage((msg, replyFn, source) => {
  handleVoxMessage(msg, replyFn, source);
});

webrtcPeer.onDmMessage((envelope) => {
  dispatchDirectMessage(envelope, "rtc");
});

webrtcPeer.onPeerIdentity((address, dmPub) => {
  if (dmPub && typeof dmPub === "object" && dmPub.memoryUrl) {
    centralMemory.registerDiscoveredMemoryUrl(dmPub.memoryUrl);
  }
  // Nome e foto do par não vêm daqui (não são assinados): chegam no PROFILE_CARD_HELLO, conferido pela chave dele.
});

webrtcPeer.onPeerConnect(async (remotePeerId, sendFn) => {
  try {
    sendFn({ type: "PROFILE_CARD_HELLO", card: await profileCard.buildSignedProfileCard() });
    const memoryUrl = centralMemory.getDiscoveredPublicMemoryUrl();
    if (memoryUrl) sendFn({ type: "MEMORY_BEACON", memoryUrl, fromPeer: myPeerId });
    await peerSync.onConnect(sendFn);
  } catch {}
});

/**
 * Entrega um envelope de DM pelo melhor caminho: canal de DM WebRTC com a conta, senão outra aba.
 * @param {string} toAddress Conta de destino.
 * @param {object} envelope Envelope cifrado.
 * @returns {"rtc"|"broadcast"|null} Caminho usado, ou null se nenhum estava disponível.
 */
export function sendDirectMessageTransport(toAddress, envelope) {
  if (webrtcPeer.sendDmRtc(toAddress, envelope)) {
    return "rtc";
  }
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage({ type: "DM", envelope });
      return "broadcast";
    } catch {}
  }
  return null;
}

/** Anuncia conta e chave de DM deste aparelho à sinalização (ver `webrtc-peer.js`). */
export const announceIdentity = webrtcPeer.announceIdentity;
/** Indica se há canal de DM WebRTC aberto com a conta (ver `webrtc-peer.js`). */
export const isAddressConnectedRtc = webrtcPeer.isAddressConnectedRtc;
/** Chave pública de DM que o par da conta anunciou (ver `webrtc-peer.js`). */
export const getPeerDmPub = webrtcPeer.getPeerDmPub;

function requestWithTransport(txId, sendFn, timeoutMs) {
  return new Promise((resolve) => {
    let timer = null;
    const onResolve = (data) => {
      if (timer) clearTimeout(timer);
      resolve(data);
    };

    if (!pendingRequests.has(txId)) {
      pendingRequests.set(txId, []);
    }
    pendingRequests.get(txId).push(onResolve);

    try {
      sendFn();
    } catch {}

    timer = setTimeout(() => {
      const list = pendingRequests.get(txId);
      if (list) {
        const idx = list.indexOf(onResolve);
        if (idx !== -1) list.splice(idx, 1);
        if (list.length === 0) pendingRequests.delete(txId);
      }
      resolve(null);
    }, timeoutMs);
  });
}

function requestFromBroadcast(txId, timeoutMs = 600) {
  return requestWithTransport(
    txId,
    () => {
      if (broadcastChannel) {
        broadcastChannel.postMessage({ type: "WANT", txId, fromPeer: myPeerId });
      }
    },
    timeoutMs
  );
}

function requestFromRtc(txId, timeoutMs = 2000) {
  return requestWithTransport(
    txId,
    () => {
      webrtcPeer.broadcastRtcMessage({ type: "WANT", txId, fromPeer: myPeerId });
    },
    timeoutMs
  );
}

async function requestFromAffinityPeers(txId) {
  const openPeers = webrtcPeer.listOpenRtcPeerIds ? webrtcPeer.listOpenRtcPeerIds() : [];
  const ranked = blobAffinity.rankAffinity(openPeers);
  for (const peerId of ranked) {
    const result = await requestWithTransport(
      txId,
      () => webrtcPeer.sendVoxMessage(peerId, { type: "WANT", txId, fromPeer: myPeerId }),
      450,
    );
    if (result) return result;
  }
  return null;
}

async function requestFromLocalBroadcast(txId, priority) {
  if (!broadcastChannel) return null;
  return requestFromBroadcast(txId, priority ? 900 : 600);
}

async function requestFromMeshRtc(txId, priority, hasRtc) {
  if (!hasRtc) return null;
  return requestFromRtc(txId, priority ? 2500 : 2000);
}

/**
 * Pede uma transação aos pares e devolve a primeira resposta. Ordem: pares com afinidade (se ligado), WebRTC antes
 * das outras abas para itens prioritários (pedido ou manifesto), e as outras abas antes do WebRTC para os demais.
 * @param {string} txId Id da transação.
 * @param {{priority?: boolean}} [opts] `priority` força a ordem de item prioritário.
 * @returns {Promise<object|null>} O dado da transação, ou null se ninguém respondeu no prazo ou a malha está desligada.
 */
export async function requestTxFromPeers(txId, opts = {}) {
  const settings = getPeerSettings();
  if (!settings.enabled) return null;

  const priority = Boolean(opts.priority) || manifestMesh.isManifestPriorityTx(txId);
  const hasRtc = Boolean(settings.webrtcEnabled && webrtcPeer.getConnectedRtcPeersCount() > 0);

  if (settings.webrtcEnabled && blobAffinity.isBlobPeerSoftPriorityEnabled()) {
    const affinityResult = await requestFromAffinityPeers(txId);
    if (affinityResult) return affinityResult;
  }

  if (priority) {
    const rtcFirst = await requestFromMeshRtc(txId, true, hasRtc);
    if (rtcFirst) return rtcFirst;
  }

  const broadcastResult = await requestFromLocalBroadcast(txId, priority);
  if (broadcastResult) return broadcastResult;

  if (!priority) {
    const rtcFallback = await requestFromMeshRtc(txId, false, hasRtc);
    if (rtcFallback) return rtcFallback;
  }

  return null;
}

/**
 * Situação do WebRTC para a tela de rede.
 * @returns {{remotePeersConnected: number, myPeerId: string, signalingDown: boolean}} Pares abertos, id deste aparelho e se a sinalização caiu.
 */
export function getRtcStatus() {
  return {
    remotePeersConnected: webrtcPeer.getConnectedRtcPeersCount(),
    myPeerId,
    signalingDown: webrtcPeer.isSignalingDown(),
  };
}

/** LAN-21: avisa quando a sinalização cai (WebSocket e Nostr juntos) e quando volta. */
export const onSignalingHealth = webrtcPeer.onSignalingHealth;

/** TURN próprio configurado pela pessoa (ver `webrtc-peer.js`). */
export const getCustomTurnConfig = webrtcPeer.getCustomTurnConfig;
/** Grava o TURN próprio da pessoa (ver `webrtc-peer.js`). */
export const saveCustomTurnConfig = webrtcPeer.saveCustomTurnConfig;

/**
 * Procura um relay de desktop no ar pelo `/health` (450 ms por endereço).
 * @param {string|null} [url=null] Endereço a testar; sem ele, os relays configurados, em ordem.
 * @returns {Promise<{online: boolean, data?: object, activeUrl?: string}>} O primeiro que respondeu, ou `{online: false}`.
 */
export async function checkDesktopRelay(url = null) {
  const targets = url ? [url] : getRelayHttpUrls();
  for (const root of targets) {
    const healthUrl = `${root.replace(/\/+$/, "")}/health`;
    try {
      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(450) });
      if (!res.ok) continue;
      const data = await res.json();
      return { online: true, data, activeUrl: root };
    } catch {}
  }
  return { online: false };
}

/**
 * Busca uma transação no relay de desktop (`/tx/<id>`, 800 ms por endereço).
 * @param {string} txId Id da transação.
 * @param {string|null} [url=null] Endereço do relay; sem ele, os relays configurados, em ordem.
 * @returns {Promise<{body: string, raw: string, title?: string}|null>} Corpo (e título, se veio JSON), ou null se nenhum respondeu.
 */
export async function fetchFromDesktopRelay(txId, url = null) {
  const targets = url ? [url] : getRelayHttpUrls();
  for (const root of targets) {
    try {
      const res = await fetch(`${root.replace(/\/+$/, "")}/tx/${encodeURIComponent(txId)}`, {
        signal: AbortSignal.timeout(800),
      });
      if (!res.ok) continue;
      const text = await res.text();
      let parsed = { body: text, raw: text };
      try {
        const json = JSON.parse(text);
        if (typeof json === "object" && json !== null) {
          parsed.body = json.body || json.content || json.text || text;
          parsed.title = json.title || "";
        }
      } catch {}
      return parsed;
    } catch {
      continue;
    }
  }
  return null;
}

// Inicializa canal (ativo por padrão)
initPeerChannel();
