import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as gql from "../client/js/graphql.js";
import * as cacheNode from "../client/js/cache-node.js";

test("graphql - tagValue encontra tags ou retorna string vazia", () => {
  const tags = [
    { name: "App-Name", value: "vox-brasil" },
    { name: "Title", value: "Minha Comunidade" },
  ];

  assert.equal(gql.tagValue(tags, "App-Name"), "vox-brasil");
  assert.equal(gql.tagValue(tags, "Title"), "Minha Comunidade");
  assert.equal(gql.tagValue(tags, "Inexistente"), "");
  assert.equal(gql.tagValue(null, "App-Name"), "");
});

test("graphql - fetchTransactionData resolve a partir do cache local", async () => {
  assert.deepEqual(await gql.fetchTransactionData(null), { body: "", raw: "" });

  const mockPayload = { title: "Salvo no Cache", body: "Texto completo da postagem" };
  await cacheNode.setCachedTx("tx_test_gql", mockPayload);

  const res = await gql.fetchTransactionData("tx_test_gql");
  assert.deepEqual(res, mockPayload);
});

test("graphql - fetchTransactionData consulta relay HTTP antes dos gateways", async () => {
  localStorage.clear();
  await cacheNode.clearCache();

  const originalFetch = globalThis.fetch;
  const hits = [];

  globalThis.fetch = async (url) => {
    hits.push(String(url));
    if (String(url).includes("/tx/tx_relay_only")) {
      return {
        ok: true,
        text: async () => JSON.stringify({ body: "do relay", title: "Relay" }),
      };
    }
    throw new Error("gateway should not run");
  };

  try {
    localStorage.setItem("vox-relay-http-url", "http://192.168.0.2:3920");
    const res = await gql.fetchTransactionData("tx_relay_only");
    assert.equal(res.body, "do relay");
    assert.equal(hits.length, 1);
    assert.ok(hits[0].includes("192.168.0.2:3920/tx/tx_relay_only"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
