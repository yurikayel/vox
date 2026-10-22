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
};

let gatewayConfig = null;

export async function loadConfig() {
  if (gatewayConfig) return gatewayConfig;
  const res = await fetch("./config/gateways.json");
  gatewayConfig = await res.json();
  return gatewayConfig;
}

export function tagValue(tags, name) {
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
    owner: node.owner?.address || "",
  };
}

function mapTopic(node, communityId) {
  const tags = node.tags || [];
  return {
    id: node.id,
    communityId,
    title: tagValue(tags, "Topic-Title") || tagValue(tags, "Title") || "Tópico",
    owner: node.owner?.address || "",
  };
}

function mapReply(node) {
  const tags = node.tags || [];
  return {
    id: node.id,
    replyTo: tagValue(tags, "Reply-To"),
    body: tagValue(tags, "Body") || tagValue(tags, "Content") || "",
    owner: node.owner?.address || "",
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
    try {
      return { data: await fn(gw.graphql), gateway: gw.label };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Nenhum gateway disponível");
}

export async function fetchCommunities() {
  const { data, gateway } = await withGateways((url) =>
    queryOne(url, QUERIES.communities, {})
  );
  const edges = data.transactions?.edges || [];
  const items = edges.map((e) => mapCommunity(e.node));
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

export async function fetchReplies(topicId) {
  const { data, gateway } = await withGateways((url) =>
    queryOne(url, QUERIES.replies, { topicId })
  );
  const edges = data.transactions?.edges || [];
  const items = edges.map((e) => mapReply(e.node));
  return { items, gateway, demo: false };
}
