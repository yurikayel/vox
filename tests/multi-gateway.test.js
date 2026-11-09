import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as gql from "../client/js/graphql.js";

test("graphql - mergeTopicEdgesWithConsensus detecta testemunhas e consenso", () => {
  const gw1 = {
    gateway: "Turbo Gateway",
    data: {
      transactions: {
        edges: [
          { node: { id: "tx_1", owner: { address: "addr_alice" }, tags: [{ name: "Title", value: "T1" }] } },
          { node: { id: "tx_2", owner: { address: "addr_bob" }, tags: [{ name: "Title", value: "T2" }] } },
        ],
      },
    },
  };

  const gw2 = {
    gateway: "arweave.net",
    data: {
      transactions: {
        edges: [
          { node: { id: "tx_1", owner: { address: "addr_alice" }, tags: [{ name: "Title", value: "T1" }] } },
          { node: { id: "tx_3", owner: { address: "addr_carol" }, tags: [{ name: "Title", value: "T3" }] } },
        ],
      },
    },
  };

  const merged = gql.mergeTopicEdgesWithConsensus([gw1, gw2]);
  assert.equal(merged.length, 3);

  const t1 = merged.find((e) => e.node.id === "tx_1");
  assert.equal(t1.crossChecked, true);
  assert.equal(t1.consensusCount, 2);
  assert.equal(t1.conflict, false);
  assert.deepEqual(t1.witnesses, ["Turbo Gateway", "arweave.net"]);

  const t2 = merged.find((e) => e.node.id === "tx_2");
  assert.equal(t2.crossChecked, false);
  assert.equal(t2.consensusCount, 1);
  assert.deepEqual(t2.witnesses, ["Turbo Gateway"]);
});

test("graphql - mergeTopicEdgesWithConsensus sinaliza conflito de proprietário", () => {
  const gw1 = {
    gateway: "Gateway A",
    data: {
      transactions: {
        edges: [
          { node: { id: "tx_spoof", owner: { address: "addr_legit" }, tags: [] } },
        ],
      },
    },
  };

  const gw2 = {
    gateway: "Gateway B (malicioso)",
    data: {
      transactions: {
        edges: [
          { node: { id: "tx_spoof", owner: { address: "addr_forged" }, tags: [] } },
        ],
      },
    },
  };

  const merged = gql.mergeTopicEdgesWithConsensus([gw1, gw2]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].conflict, true);
});

test("graphql - fetchRecentTopics com crossCheck consulta todos os gateways", async () => {
  const originalFetch = globalThis.fetch;
  gql.__resetGatewayConfigForTests();

  globalThis.fetch = async (url, opts) => {
    const s = String(url);
    if (s.includes("gateways.json")) {
      return {
        ok: true,
        json: async () => ({
          gateways: [
            { id: "g1", label: "Gateway 1", graphql: "https://g1.example/graphql" },
            { id: "g2", label: "Gateway 2", graphql: "https://g2.example/graphql" },
          ],
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        data: {
          transactions: {
            edges: [
              { node: { id: "tx_shared", owner: { address: "addr_common" }, tags: [{ name: "Topic-Title", value: "Paz" }] } },
            ],
          },
        },
      }),
    };
  };

  try {
    const res = await gql.fetchRecentTopics({ crossCheck: true });
    assert.equal(res.crossChecked, true);
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0].id, "tx_shared");
    assert.equal(res.items[0].consensusCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
    gql.__resetGatewayConfigForTests();
  }
});

test("LAN-27 + PM-50: ≥4 hosts de leitura raw e ≥3 testemunhas GraphQL; ar-io.dev só raw", async () => {
  const { readFileSync } = await import("node:fs");
  const cfg = JSON.parse(readFileSync(new URL("../client/config/gateways.json", import.meta.url), "utf8"));
  const rawHosts = new Set(cfg.gateways.map((g) => new URL(g.raw.replace("{txId}", "x")).host));
  assert.ok(rawHosts.size >= 4, `só ${rawHosts.size} hosts raw`);
  for (const g of cfg.gateways) assert.ok(g.raw.includes("{txId}"), g.id);
  const gqlHosts = new Set(gql.graphqlGateways(cfg).map((g) => new URL(g.graphql).host));
  assert.ok(gqlHosts.size >= 3, `só ${gqlHosts.size} testemunhas GraphQL`);
  assert.ok(!gqlHosts.has("ar-io.dev"), "ar-io.dev não indexa vox-brasil (PM-50)");
});

test("PM-50: gateway sem graphql não entra na consulta nem conta como testemunha", async () => {
  const originalFetch = globalThis.fetch;
  const called = [];
  globalThis.fetch = async (url) => {
    const s = String(url);
    if (s.includes("gateways.json")) {
      return {
        ok: true,
        json: async () => ({
          gateways: [
            { id: "g1", label: "Gateway 1", graphql: "https://g1.example/graphql", raw: "https://g1.example/{txId}" },
            { id: "so-raw", label: "Só raw", raw: "https://raw.example/{txId}" },
          ],
        }),
      };
    }
    called.push(s);
    return { ok: true, json: async () => ({ data: { transactions: { edges: [] } } }) };
  };
  try {
    gql.__resetGatewayConfigForTests();
    const res = await gql.queryAllGateways("{ x }", {});
    assert.equal(res.length, 1);
    assert.deepEqual(called, ["https://g1.example/graphql"]);
  } finally {
    globalThis.fetch = originalFetch;
    gql.__resetGatewayConfigForTests();
  }
});
