import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as gql from "../client/js/graphql.js";

test("graphql - fetchTopicsByOwners retorna vazio para lista nula ou vazia sem fazer fetch", async () => {
  const r1 = await gql.fetchTopicsByOwners([]);
  assert.deepEqual(r1.items, []);
  const r2 = await gql.fetchTopicsByOwners(null);
  assert.deepEqual(r2.items, []);
});

test("graphql - fetchTopicsByOwners envia lista de proprietários no GraphQL", async () => {
  const originalFetch = globalThis.fetch;
  gql.__resetGatewayConfigForTests();

  let capturedQuery = null;
  let capturedVariables = null;

  globalThis.fetch = async (url, opts) => {
    const s = String(url);
    if (s.includes("gateways.json")) {
      return {
        ok: true,
        json: async () => ({
          gateways: [
            { id: "g1", label: "G1", graphql: "https://g1.example/graphql" },
          ],
        }),
      };
    }
    const body = opts?.body ? JSON.parse(opts.body) : {};
    capturedQuery = body.query;
    capturedVariables = body.variables;

    return {
      ok: true,
      json: async () => ({
        data: {
          transactions: {
            edges: [
              {
                node: {
                  id: "tx_followed_1",
                  owner: { address: "addr_alice" },
                  tags: [
                    { name: "App-Name", value: "vox-brasil" },
                    { name: "Type", value: "topic" },
                    { name: "Topic-Title", value: "Post de Alice Seguido" },
                  ],
                },
              },
            ],
          },
        },
      }),
    };
  };

  try {
    const res = await gql.fetchTopicsByOwners(["addr_alice", "addr_bob"]);
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0].id, "tx_followed_1");
    assert.equal(res.items[0].owner, "addr_alice");
    assert.ok(capturedQuery.includes("ListTopicsByOwners"));
    assert.deepEqual(capturedVariables.owners, ["addr_alice", "addr_bob"]);
  } finally {
    globalThis.fetch = originalFetch;
    gql.__resetGatewayConfigForTests();
  }
});
