/**
 * @file Cliente GraphQL Arweave — fachada: consultas públicas e cache de DM pub.
 */

import * as cacheNode from "./cache-node.js";
import * as peers from "./peers.js";
import * as handles from "./handles.js";
import { recordReadOrigin } from "./gateway-telemetry.js";
import {
  QUERIES,
  loadConfig,
  graphqlGateways,
  __resetGatewayConfigForTests,
  queryOne,
  withGateways,
  queryAllGateways,
  mergeTopicEdgesWithConsensus,
  fetchRawFromGateways,
} from "./graphql-gateway.js";
import { tagValue, mapCommunity, mapTopic, mapReply, mapProfileCard } from "./graphql-mappers.js";
import { isSafeKey, withEntry } from "./shared/safe-key.js";

export {
  loadConfig,
  graphqlGateways,
  __resetGatewayConfigForTests,
  tagValue,
  queryAllGateways,
  mergeTopicEdgesWithConsensus,
};

const dataCache = new Map();

/**
 * Busca comunidades nos gateways configurados.
 * @returns {*} Resultado da operação.
 */
export async function fetchCommunities() {
  const { data, gateway } = await withGateways((url) =>
    queryOne(url, QUERIES.communities, {})
  );
  const edges = data.transactions?.edges || [];
  const items = edges.map((e) => mapCommunity(e.node));
  return { items, gateway, demo: false };
}

/**
 * Busca tópicos por donos nos gateways configurados.
 * @param {string[]} [owners]
 * @param {object} [options]
 * @returns {*} Resultado da operação.
 */
export async function fetchTopicsByOwners(owners = [], { after } = {}) {
  const list = Array.isArray(owners) ? owners.filter(Boolean) : [];
  if (!list.length) return { items: [], gateway: "", demo: false };

  const { data, gateway } = await withGateways((url) =>
    queryOne(url, QUERIES.topicsByOwners, { owners: list, after: after || null })
  );
  const edges = data.transactions?.edges || [];
  const items = edges.map((e) => mapTopic(e.node));
  return { items, gateway, demo: false };
}

/**
 * Busca tópicos de uma comunidade nos gateways configurados.
 * @param {string} communityId
 * @returns {*} Resultado da operação.
 */
export async function fetchTopics(communityId) {
  const { data, gateway } = await withGateways((url) =>
    queryOne(url, QUERIES.topics, { communityId })
  );
  const edges = data.transactions?.edges || [];
  const items = edges.map((e) => mapTopic(e.node, communityId));
  return { items, gateway, demo: false };
}

/**
 * Busca tópicos recentes nos gateways configurados.
 * @param {object} [options]
 * @returns {*} Resultado da operação.
 */
export async function fetchRecentTopics({ crossCheck = false } = {}) {
  if (crossCheck) {
    try {
      const results = await queryAllGateways(QUERIES.recentTopics, {});
      if (results.length > 0) {
        const mergedEdges = mergeTopicEdgesWithConsensus(results);
        const items = mergedEdges.map((e) => {
          const item = mapTopic(e.node);
          item.crossChecked = e.crossChecked;
          item.consensusCount = e.consensusCount;
          item.witnesses = e.witnesses;
          item.conflict = e.conflict;
          return item;
        });
        const gws = results.map((r) => r.gateway).join(", ");
        return { items, gateway: gws, demo: false, crossChecked: true };
      }
    } catch {
      /* fallback */
    }
  }

  const { data, gateway } = await withGateways((url) =>
    queryOne(url, QUERIES.recentTopics, {})
  );
  const edges = data.transactions?.edges || [];
  const items = edges.map((e) => mapTopic(e.node));
  return { items, gateway, demo: false, crossChecked: false };
}

/**
 * Busca um tópico por id nos gateways configurados.
 * @param {string} topicId
 * @returns {*} Resultado da operação.
 */
export async function fetchTopicById(topicId) {
  try {
    const { data } = await withGateways((url) =>
      queryOne(url, QUERIES.topicById, { id: topicId })
    );
    if (!data?.transaction) return null;
    return mapTopic(data.transaction);
  } catch {
    return null;
  }
}

/**
 * Busca respostas de um tópico nos gateways configurados.
 * @param {string} topicId
 * @returns {*} Resultado da operação.
 */
export async function fetchReplies(topicId) {
  const { data, gateway } = await withGateways((url) =>
    queryOne(url, QUERIES.replies, { topicId })
  );
  const edges = data.transactions?.edges || [];
  const items = edges.map((e) => mapReply(e.node));
  return { items, gateway, demo: false };
}

/**
 * Busca filiações de um endereço nos gateways configurados.
 * @param {string} address
 * @returns {*} Resultado da operação.
 */
export async function fetchUserMemberships(address) {
  try {
    const { data } = await withGateways((url) =>
      queryOne(url, QUERIES.memberships, { address })
    );
    const edges = data.transactions?.edges || [];
    return edges.map((e) => {
      const tags = e.node?.tags || [];
      return {
        id: e.node.id,
        communityId: tagValue(tags, "Community-Id"),
        displayName: tagValue(tags, "Display-Name") || "",
      };
    }).filter((m) => Boolean(m.communityId));
  } catch {
    return [];
  }
}

const KNOWN_DM_PUBS_KEY = "vox-known-dm-pubs";

/**
 * Grava chave pública DM conhecida no `localStorage`.
 * @param {string} address
 * @param {object|string} pubJwk
 */
export function cacheUserDmPub(address, pubJwk) {
  if (!isSafeKey(address) || !pubJwk) return;
  try {
    const raw = localStorage.getItem(KNOWN_DM_PUBS_KEY);
    const map = withEntry(raw ? JSON.parse(raw) : {}, address, typeof pubJwk === "string" ? JSON.parse(pubJwk) : pubJwk);
    localStorage.setItem(KNOWN_DM_PUBS_KEY, JSON.stringify(map));
  } catch {
    /* storage */
  }
}

/**
 * Obtém chave pública DM em cache.
 * @param {string} address
 * @returns {*} Resultado da operação.
 */
export function getCachedUserDmPub(address) {
  if (!address) return null;
  try {
    const raw = localStorage.getItem(KNOWN_DM_PUBS_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw);
    return map[address] || null;
  } catch {
    return null;
  }
}

/**
 * Busca chave pública DM nos gateways configurados.
 * @param {string} address
 * @returns {*} Resultado da operação.
 */
export async function fetchUserDmPub(address) {
  if (!address) return null;
  const cached = getCachedUserDmPub(address);
  if (cached) return cached;
  try {
    const { data } = await withGateways((url) =>
      queryOne(url, QUERIES.profileKeys, { address })
    );
    const edges = data.transactions?.edges || [];
    for (const e of edges) {
      const dmPubRaw = tagValue(e.node?.tags || [], "Dm-Pub");
      if (dmPubRaw) {
        const parsed = JSON.parse(dmPubRaw);
        cacheUserDmPub(address, parsed);
        return parsed;
      }
    }
  } catch {
    /* gateways */
  }
  return null;
}

/**
 * Busca handle (@slug) nos gateways configurados.
 * @param {string} rawSlug
 * @returns {*} Resultado da operação.
 */
export async function fetchHandle(rawSlug) {
  const slug = handles.normalizeSlug(rawSlug);
  if (!slug) return null;
  try {
    const { data } = await withGateways((url) =>
      queryOne(url, QUERIES.handlesBySlug, { slug })
    );
    const edges = data.transactions?.edges || [];
    const resolution = handles.resolveHandleClaimants(edges);
    if (resolution?.primaryOwner) {
      handles.cacheHandleMapping(slug, resolution.primaryOwner);
    }
    return resolution;
  } catch {
    const cached = handles.getCachedHandleMapping(slug);
    if (cached) {
      return { primaryOwner: cached, isConflict: false, claimants: [{ owner: cached }] };
    }
    return null;
  }
}

/**
 * Busca handle de um endereço nos gateways configurados.
 * @param {string} address
 * @returns {*} Resultado da operação.
 */
export async function fetchHandleForAddress(address) {
  if (!address) return null;
  const cached = handles.getCachedAddressHandle(address);
  if (cached) return cached;
  try {
    const { data } = await withGateways((url) =>
      queryOne(url, QUERIES.handlesByAddress, { address })
    );
    const edges = data.transactions?.edges || [];
    for (const e of edges) {
      const slug = tagValue(e.node?.tags || [], "Handle");
      if (slug && handles.validateSlug(slug).valid) {
        handles.cacheHandleMapping(slug, address);
        return slug;
      }
    }
  } catch {
    /* gateways */
  }
  return null;
}

/**
 * Busca ações de moderação nos gateways configurados.
 * @param {string} communityId
 * @returns {*} Resultado da operação.
 */
export async function fetchModActions(communityId) {
  try {
    const { data } = await withGateways((url) =>
      queryOne(url, QUERIES.modActions, { communityId })
    );
    const edges = data.transactions?.edges || [];
    return edges.map((e) => {
      const tags = e.node?.tags || [];
      return {
        id: e.node.id,
        owner: e.node.owner?.address || "",
        action: tagValue(tags, "Action"),
        target: tagValue(tags, "Target"),
        communityId: tagValue(tags, "Community-Id"),
      };
    });
  } catch {
    return [];
  }
}

/**
 * Guarda a transação no cache e registra a origem da leitura.
 * @param {string} txId Id da transação
 * @param {*} data Dados lidos
 * @param {string} origin Origem da leitura
 * @param {string} comm Comunidade
 */
function cacheAndRecordTx(txId, data, origin, comm) {
  recordReadOrigin(origin, comm);
  dataCache.set(txId, data);
  if (origin !== "cache_idb") cacheNode.setCachedTx(txId, data);
  return data;
}

/**
 * Busca corpo de transação (cache, relay, malha, gateway).
 * @param {string} txId
 * @param {object} [options]
 * @returns {*} Resultado da operação.
 */
export async function fetchTransactionData(txId, { communityId = "" } = {}) {
  if (!txId) return { body: "", raw: "" };
  if (dataCache.has(txId)) return dataCache.get(txId);

  const comm = String(communityId || "").trim();
  const cachedDb = await cacheNode.getCachedTx(txId);
  if (cachedDb) return cacheAndRecordTx(txId, cachedDb, "cache_idb", comm);

  const relayData = await peers.fetchFromDesktopRelay(txId);
  if (relayData) return cacheAndRecordTx(txId, relayData, "relay", comm);

  const peerData = await peers.requestTxFromPeers(txId);
  if (peerData) return cacheAndRecordTx(txId, peerData, "mesh", comm);

  const gatewayParsed = await fetchRawFromGateways(txId);
  if (gatewayParsed) return cacheAndRecordTx(txId, gatewayParsed, "gateway", comm);

  const empty = { body: "", raw: "" };
  dataCache.set(txId, empty);
  return empty;
}

/**
 * Busca profile-card on-chain nos gateways configurados.
 * @param {object} [options]
 * @returns {*} Resultado da operação.
 */
export async function fetchProfileCardOnChain({ address, routeId } = {}) {
  const targetAddr = String(address || "").trim();
  const targetRoute = String(routeId || "").trim();
  if (!targetAddr && !targetRoute) return null;

  try {
    const query = targetAddr ? QUERIES.profileCardByAddress : QUERIES.profileCardByRoute;
    const variables = targetAddr ? { address: targetAddr } : { routeId: targetRoute };
    const { data } = await withGateways((url) => queryOne(url, query, variables));
    const edges = data.transactions?.edges || [];
    if (!edges.length) return null;
    return mapProfileCard(edges[0].node);
  } catch {
    return null;
  }
}