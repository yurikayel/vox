/**
 * @file Transferência P2P de transações do cache local (mensagens WANT e BLOB) e requisição com timeout.
 */

import * as cacheNode from "./cache-node.js";
import * as localAccount from "./identity/index.js";
import * as webrtcPeer from "./webrtc-peer.js";
import * as manifestMesh from "./peers-cache-manifest.js";
import * as blobAffinity from "./peers-blob-affinity.js";
import { myPeerId, isValidTxId } from "./peers-base.js";
import { canServeNow, getPeerSettings, updateMetrics, recordBytesServed } from "./peers-settings.js";
import { getBroadcastChannel, postBroadcastChannel } from "./peers-transport.js";

const pendingRequests = new Map();

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

/**
 * Descobre a comunidade da transação, pelos dados em cache ou por consulta.
 * @param {string} txId Id da transação
 * @param {object} cachedData Dados em cache
 * @returns {Promise<string|undefined>} Comunidade, se houver.
 */
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

/**
 * Trata uma solicitação WANT recebida da malha, respondendo com BLOB se houver cache e cota.
 * @param {object} msg Mensagem WANT recebida.
 * @param {(reply: object) => void} replyFn Função de resposta.
 * @param {object} settings Preferências atuais do nó.
 * @param {string} source Origem da mensagem (`"rtc"` ou `"broadcast"`).
 */
export async function handleWantMessage(msg, replyFn, settings, source) {
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

/**
 * Trata um BLOB de transação recebido em resposta a um pedido prévio.
 * @param {object} msg Mensagem BLOB recebida.
 */
export function handleBlobMessage(msg) {
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

/**
 * Pede a transação por um transporte e resolve com a resposta ou `null` no prazo.
 * @param {string} txId Id da transação
 * @param {Function} sendFn Envia o pedido
 * @param {number} timeoutMs Prazo em ms
 * @returns {Promise<object|null>} Dados recebidos, ou `null`.
 */
function requestWithTransport(txId, sendFn, timeoutMs) {
  return new Promise((resolve) => {
    let timer = null;
    /**
     * Encerra a espera com os dados recebidos.
     * @param {object|null} data Dados
     */
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

/**
 * Pede a transação pelos pares da mesma aba/aparelho (BroadcastChannel).
 * @param {string} txId Id da transação
 * @param {number} [timeoutMs=600] Prazo em ms
 * @returns {Promise<object|null>} Dados recebidos, ou `null`.
 */
function requestFromBroadcast(txId, timeoutMs = 600) {
  return requestWithTransport(
    txId,
    () => {
      postBroadcastChannel({ type: "WANT", txId, fromPeer: myPeerId });
    },
    timeoutMs
  );
}

/**
 * Pede a transação pela malha WebRTC.
 * @param {string} txId Id da transação
 * @param {number} [timeoutMs=2000] Prazo em ms
 * @returns {Promise<object|null>} Dados recebidos, ou `null`.
 */
function requestFromRtc(txId, timeoutMs = 2000) {
  return requestWithTransport(
    txId,
    () => {
      webrtcPeer.broadcastRtcMessage({ type: "WANT", txId, fromPeer: myPeerId });
    },
    timeoutMs
  );
}

/**
 * Pede a transação aos pares com mais afinidade, um a um.
 * @param {string} txId Id da transação
 * @returns {Promise<object|null>} Dados recebidos, ou `null`.
 */
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

/**
 * Pede a transação ao canal local, se existir.
 * @param {string} txId Id da transação
 * @param {boolean} priority Se tem prioridade (prazo maior)
 * @returns {Promise<object|null>} Dados recebidos, ou `null`.
 */
async function requestFromLocalBroadcast(txId, priority) {
  if (!getBroadcastChannel()) return null;
  return requestFromBroadcast(txId, priority ? 900 : 600);
}

/**
 * Pede a transação à malha WebRTC, se houver conexão.
 * @param {string} txId Id da transação
 * @param {boolean} priority Se tem prioridade (prazo maior)
 * @param {boolean} hasRtc Se há conexão WebRTC
 * @returns {Promise<object|null>} Dados recebidos, ou `null`.
 */
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
