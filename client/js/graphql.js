import * as cacheNode from "./cache-node.js";
import * as peers from "./peers.js";
import * as handles from "./handles.js";
import { recordGatewayAttempt, recordReadOrigin } from "./gateway-telemetry.js";

const QUERIES = {
  communities: `query ListCommunities($after: String) {
    transactions(
      first: 30
      after: $after
      tags: [
        { name: "App-Name", values: ["vox-brasil"] }
        { name: "Type", values: ["community"] }
      ]
      sort: HEIGHT_DESC
    ) {
      pageInfo { hasNextPage }
      edges {
        cursor
        node {
          id
          owner { address }
          tags { name value }
        }
      }
    }
  }`,
  topics: `query ListTopics($communityId: String!, $after: String) {
    transactions(
      first: 50
      after: $after
      tags: [
        { name: "App-Name", values: ["vox-brasil"] }
        { name: "Type", values: ["topic"] }
        { name: "Community-Id", values: [$communityId] }
      ]
      sort: HEIGHT_DESC
    ) {
      pageInfo { hasNextPage }
      edges {
        cursor
        node {
          id
          owner { address }
          tags { name value }
        }
      }
    }
  }`,
  replies: `query ListReplies($topicId: String!) {
    transactions(
      first: 100
      tags: [
        { name: "App-Name", values: ["vox-brasil"] }
        { name: "Type", values: ["reply"] }
        { name: "Reply-To", values: [$topicId] }
      ]
      sort: HEIGHT_ASC
    ) {
      edges {
        node {
          id
          owner { address }
          tags { name value }
        }
      }
    }
  }`,
  topicById: `query GetTopic($id: ID!) {
    transaction(id: $id) {
      id
      owner { address }
      tags { name value }
    }
  }`,
  memberships: `query ListMemberships($address: String!) {
    transactions(
      first: 50
      owners: [$address]
      tags: [
        { name: "App-Name", values: ["vox-brasil"] }
        { name: "Type", values: ["membership"] }
      ]
      sort: HEIGHT_DESC
    ) {
      edges {
        node {
          id
          tags { name value }
        }
      }
    }
  }`,
  modActions: `query ListModActions($communityId: String!) {
    transactions(
      first: 50
      tags: [
        { name: "App-Name", values: ["vox-brasil"] }
        { name: "Type", values: ["mod-action"] }
        { name: "Community-Id", values: [$communityId] }
      ]
      sort: HEIGHT_DESC
    ) {
      edges {
        node {
          id
          owner { address }
          tags { name value }
        }
      }
    }
  }`,
  profileKeys: `query GetProfileKey($address: String!) {
    transactions(
      first: 10
      owners: [$address]
      tags: [
        { name: "App-Name", values: ["vox-brasil"] }
        { name: "Type", values: ["profile-key", "membership"] }
      ]
      sort: HEIGHT_DESC
    ) {
      edges {
        node {
          id
          tags { name value }
        }
      }
    }
  }`,
  handlesBySlug: `query GetHandleBySlug($slug: String!) {
    transactions(
      first: 10
      tags: [
        { name: "App-Name", values: ["vox-brasil"] }
        { name: "Type", values: ["handle"] }
        { name: "Handle", values: [$slug] }
      ]
      sort: HEIGHT_DESC
    ) {
      edges {
        node {
          id
          owner { address }
          tags { name value }
        }
      }
    }
  }`,
  handlesByAddress: `query GetHandleByAddress($address: String!) {
    transactions(
      first: 5
      owners: [$address]
      tags: [
        { name: "App-Name", values: ["vox-brasil"] }
        { name: "Type", values: ["handle"] }
      ]
      sort: HEIGHT_DESC
    ) {
      edges {
        node {
          id
          tags { name value }
        }
      }
    }
  }`,

  profileCardByAddress: `query GetProfileCardByAddress($address: String!) {
    transactions(
      first: 5
      owners: [$address]
      tags: [
        { name: "App-Name", values: ["vox-brasil"] }
        { name: "Type", values: ["profile-card"] }
      ]
      sort: HEIGHT_DESC
    ) {
      edges {
        node {
          id
          owner { address }
          tags { name value }
        }
      }
    }
  }`,
  profileCardByRoute: `query GetProfileCardByRoute($routeId: String!) {
    transactions(
      first: 5
      tags: [
        { name: "App-Name", values: ["vox-brasil"] }
        { name: "Type", values: ["profile-card"] }
        { name: "Route-Id", values: [$routeId] }
      ]
      sort: HEIGHT_DESC
    ) {
      edges {
        node {
          id
          owner { address }
          tags { name value }
        }
      }
    }
  }`,
  identityLinkByAddress: `query GetIdentityLinkByAddress($address: String!) {
    transactions(
      first: 5
      owners: [$address]
      tags: [
        { name: "App-Name", values: ["vox-brasil"] }
        { name: "Type", values: ["identity-link"] }
      ]
      sort: HEIGHT_DESC
    ) {
      edges {
        node {
          id
          owner { address }
          tags { name value }
        }
      }
    }
  }`,
  identityLinkByRoute: `query GetIdentityLinkByRoute($routeId: String!) {
    transactions(
      first: 5
      tags: [
        { name: "App-Name", values: ["vox-brasil"] }
        { name: "Type", values: ["identity-link"] }
        { name: "Route-Id", values: [$routeId] }
      ]
      sort: HEIGHT_DESC
    ) {
      edges {
        node {
          id
          owner { address }
          tags { name value }
        }
      }
    }
  }`,
  topicsByOwners: `query ListTopicsByOwners($owners: [String!]!, $after: String) {
    transactions(
      first: 30
      after: $after
      owners: $owners
      tags: [
        { name: "App-Name", values: ["vox-brasil"] }
        { name: "Type", values: ["topic"] }
      ]
      sort: HEIGHT_DESC
    ) {
      pageInfo { hasNextPage }
      edges {
        cursor
        node {
          id
          owner { address }
          tags { name value }
        }
      }
    }
  }`,
  recentTopics: `query ListRecentTopics($after: String) {
    transactions(
      first: 30
      after: $after
      tags: [
        { name: "App-Name", values: ["vox-brasil"] }
        { name: "Type", values: ["topic"] }
      ]
      sort: HEIGHT_DESC
    ) {
      pageInfo { hasNextPage }
      edges {
        cursor
        node {
          id
          owner { address }
          tags { name value }
        }
      }
    }
  }`
};

let gatewayConfig = null;
const dataCache = new Map();

export async function loadConfig() {
  if (gatewayConfig) return gatewayConfig;
  const res = await fetch("./config/gateways.json");
  gatewayConfig = await res.json();
  return gatewayConfig;
}

export function __resetGatewayConfigForTests() {
  gatewayConfig = null;
}

export function tagValue(tags, name) {
  if (!Array.isArray(tags)) return "";
  const t = tags.find((x) => x.name === name);
  return t ? t.value : "";
}

function mapCommunity(node) {
  const tags = node.tags || [];
  return {
    id: tagValue(tags, "Community-Id") || node.id,
    txId: node.id,
    title: tagValue(tags, "Title") || "Comunidade sem título",
    description: tagValue(tags, "Description") || "",
    category: tagValue(tags, "Category") || "",
    moderators: tagValue(tags, "Moderators") || "",
    owner: node.owner?.address || "",
  };
}

function mapTopic(node, communityId) {
  const tags = node.tags || [];
  const mediaTx = tagValue(tags, "Media-Tx");
  const mediaMime = tagValue(tags, "Media-Type") || "image/webp";
  const aspect = tagValue(tags, "Aspect-Ratio") || "original";
  return {
    id: node.id,
    communityId: communityId || tagValue(tags, "Community-Id"),
    title: tagValue(tags, "Topic-Title") || tagValue(tags, "Title") || "Tópico",
    owner: node.owner?.address || "",
    mediaTx: mediaTx || null,
    image: mediaTx ? `https://turbo-gateway.com/raw/${mediaTx}` : null,
    mediaType: mediaMime,
    aspectRatio: aspect,
    tags,
  };
}

function mapReply(node) {
  const tags = node.tags || [];
  return {
    id: node.id,
    replyTo: tagValue(tags, "Reply-To"),
    communityId: tagValue(tags, "Community-Id"),
    body: tagValue(tags, "Body") || tagValue(tags, "Content") || "",
    owner: node.owner?.address || "",
    tags,
  };
}

async function queryOne(gqlUrl, query, variables) {
  const res = await fetch(gqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

async function withGateways(fn) {
  const cfg = await loadConfig();
  let lastErr = null;
  for (const gw of cfg.gateways) {
    const label = gw.label || gw.graphql || "gateway";
    try {
      const data = await fn(gw.graphql);
      recordGatewayAttempt(label, true);
      return { data, gateway: gw.label };
    } catch (e) {
      recordGatewayAttempt(label, false);
      lastErr = e;
    }
  }
  throw lastErr || new Error("Nenhum gateway disponível");
}

function rawUrlsForTx(cfg, txId) {
  const urls = [];
  for (const gw of cfg.gateways || []) {
    if (typeof gw.raw === "string" && gw.raw.includes("{txId}")) {
      urls.push(gw.raw.replace("{txId}", txId));
    }
  }
  if (!urls.length) {
    urls.push(`https://arweave.net/${txId}`, `https://turbo-gateway.com/raw/${txId}`);
  }
  return urls;
}

async function fetchRawFromGateways(txId) {
  const cfg = await loadConfig();
  const tried = new Set();
  for (const gw of cfg.gateways || []) {
    if (typeof gw.raw !== "string" || !gw.raw.includes("{txId}")) continue;
    const url = gw.raw.replace("{txId}", txId);
    if (tried.has(url)) continue;
    tried.add(url);
    const label = gw.label || url;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) {
        recordGatewayAttempt(label, false);
        continue;
      }
      const ctype = res.headers?.get?.("content-type") || "";
      if (ctype.includes("text/html")) {
        recordGatewayAttempt(label, false);
        continue;
      }
      const text = await res.text();
      if (text.trim().toLowerCase().startsWith("<!doctype html") || text.trim().toLowerCase().startsWith("<html")) {
        recordGatewayAttempt(label, false);
        continue;
      }
      let parsed = { body: text, raw: text };
      try {
        const json = JSON.parse(text);
        if (typeof json === "object" && json !== null) {
          parsed.body = json.body || json.content || json.text || text;
          parsed.title = json.title || "";
        }
      } catch {
        // texto plano
      }
      recordGatewayAttempt(label, true);
      return parsed;
    } catch {
      recordGatewayAttempt(label, false);
    }
  }
  for (const url of rawUrlsForTx(cfg, txId)) {
    if (tried.has(url)) continue;
    tried.add(url);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const text = await res.text();
      let parsed = { body: text, raw: text };
      try {
        const json = JSON.parse(text);
        if (typeof json === "object" && json !== null) {
          parsed.body = json.body || json.content || json.text || text;
          parsed.title = json.title || "";
        }
      } catch {
        // texto plano
      }
      recordGatewayAttempt(url, true);
      return parsed;
    } catch {
      recordGatewayAttempt(url, false);
    }
  }
  return null;
}

export async function fetchCommunities() {
  const { data, gateway } = await withGateways((url) =>
    queryOne(url, QUERIES.communities, {})
  );
  const edges = data.transactions?.edges || [];
  const items = edges.map((e) => mapCommunity(e.node));
  return { items, gateway, demo: false };
}


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

export async function fetchTopics(communityId) {
  const { data, gateway } = await withGateways((url) =>
    queryOne(url, QUERIES.topics, { communityId })
  );
  const edges = data.transactions?.edges || [];
  const items = edges.map((e) => mapTopic(e.node, communityId));
  return { items, gateway, demo: false };
}

export async function queryAllGateways(query, variables) {
  const cfg = await loadConfig();
  const gateways = cfg.gateways || [];
  const results = [];

  for (const gw of gateways) {
    const label = gw.label || gw.graphql || "gateway";
    try {
      const data = await queryOne(gw.graphql, query, variables);
      recordGatewayAttempt(label, true);
      results.push({ gateway: label, data });
    } catch {
      recordGatewayAttempt(label, false);
    }
  }
  return results;
}

export function mergeTopicEdgesWithConsensus(gatewayResults) {
  const edgeMap = new Map();
  for (const res of gatewayResults || []) {
    const edges = res.data?.transactions?.edges || [];
    for (const edge of edges) {
      const id = edge.node?.id;
      if (!id) continue;
      if (!edgeMap.has(id)) {
        edgeMap.set(id, {
          node: edge.node,
          cursor: edge.cursor,
          witnesses: [res.gateway],
          conflict: false,
        });
      } else {
        const item = edgeMap.get(id);
        item.witnesses.push(res.gateway);
        if (item.node?.owner?.address !== edge.node?.owner?.address) {
          item.conflict = true;
        }
      }
    }
  }

  return Array.from(edgeMap.values()).map((item) => ({
    node: item.node,
    cursor: item.cursor,
    crossChecked: item.witnesses.length >= 2,
    consensusCount: item.witnesses.length,
    witnesses: item.witnesses,
    conflict: item.conflict,
  }));
}

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
      /* fallback to standard withGateways */
    }
  }

  const { data, gateway } = await withGateways((url) =>
    queryOne(url, QUERIES.recentTopics, {})
  );
  const edges = data.transactions?.edges || [];
  const items = edges.map((e) => mapTopic(e.node));
  return { items, gateway, demo: false, crossChecked: false };
}

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

export async function fetchReplies(topicId) {
  const { data, gateway } = await withGateways((url) =>
    queryOne(url, QUERIES.replies, { topicId })
  );
  const edges = data.transactions?.edges || [];
  const items = edges.map((e) => mapReply(e.node));
  return { items, gateway, demo: false };
}

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

export function cacheUserDmPub(address, pubJwk) {
  if (!address || !pubJwk) return;
  try {
    const raw = localStorage.getItem(KNOWN_DM_PUBS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[address] = typeof pubJwk === "string" ? JSON.parse(pubJwk) : pubJwk;
    localStorage.setItem(KNOWN_DM_PUBS_KEY, JSON.stringify(map));
  } catch {}
}

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
  } catch {}
  return null;
}

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
  } catch {}
  return null;
}

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

export async function fetchTransactionData(txId, { communityId = "" } = {}) {
  if (!txId) return { body: "", raw: "" };
  if (dataCache.has(txId)) return dataCache.get(txId);

  const comm = String(communityId || "").trim();

  // 1. Tenta Cache Local Persistente (IndexedDB)
  const cachedDb = await cacheNode.getCachedTx(txId);
  if (cachedDb) {
    recordReadOrigin("cache_idb", comm);
    dataCache.set(txId, cachedDb);
    return cachedDb;
  }

  // 2. Tenta relay HTTP configurado (local, LAN ou VPS)
  const relayData = await peers.fetchFromDesktopRelay(txId);
  if (relayData) {
    recordReadOrigin("relay", comm);
    dataCache.set(txId, relayData);
    cacheNode.setCachedTx(txId, relayData);
    return relayData;
  }

  // 3. Tenta Rede de Pares (Nós Leves via Broadcast / WebRTC)
  const peerData = await peers.requestTxFromPeers(txId);
  if (peerData) {
    recordReadOrigin("mesh", comm);
    dataCache.set(txId, peerData);
    cacheNode.setCachedTx(txId, peerData);
    return peerData;
  }

  // 4. Fallback: Gateways Públicos (ordem em config/gateways.json — estilo Channel-01)
  const gatewayParsed = await fetchRawFromGateways(txId);
  if (gatewayParsed) {
    recordReadOrigin("gateway", comm);
    dataCache.set(txId, gatewayParsed);
    cacheNode.setCachedTx(txId, gatewayParsed);
    return gatewayParsed;
  }

  const empty = { body: "", raw: "" };
  dataCache.set(txId, empty);
  return empty;
}

function mapProfileCard(node) {
  const tags = node.tags || [];
  return {
    txId: node.id,
    owner: node.owner?.address || "",
    routeId: tagValue(tags, "Route-Id"),
    displayName: tagValue(tags, "Display-Name"),
    name: tagValue(tags, "Display-Name"),
    bio: tagValue(tags, "Bio"),
    avatarUrl: tagValue(tags, "Avatar-Url"),
    discoverable: tagValue(tags, "Discoverable") !== "false",
    timestamp: Number(tagValue(tags, "Timestamp") || 0),
    tags,
  };
}

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

export async function fetchIdentityLinkOnChain({ address, routeId } = {}) {
  const targetAddr = String(address || "").trim();
  const targetRoute = String(routeId || "").trim();
  if (!targetAddr && !targetRoute) return null;

  try {
    const query = targetAddr ? QUERIES.identityLinkByAddress : QUERIES.identityLinkByRoute;
    const variables = targetAddr ? { address: targetAddr } : { routeId: targetRoute };
    const { data } = await withGateways((url) => queryOne(url, query, variables));
    const edges = data.transactions?.edges || [];
    if (!edges.length) return null;
    const node = edges[0].node;
    const rawData = await fetchTransactionData(node.id);
    if (!rawData?.body) return null;
    return typeof rawData.body === "string" ? JSON.parse(rawData.body) : rawData.body;
  } catch {
    return null;
  }
}
