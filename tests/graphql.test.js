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
