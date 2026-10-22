import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { mockStores } from "../tests/setup.js";
import * as cacheNode from "../client/js/cache-node.js";

test("cache-node - escrita e leitura com política de LRU", async () => {
  await cacheNode.clearCache();

  assert.equal(await cacheNode.getCachedTx(null), null);
  assert.equal(await cacheNode.getCachedTx("inexistente"), null);

  const testData = { title: "Tópico Salvo", body: "Corpo do tópico" };
  await cacheNode.setCachedTx("tx_abc", testData);

  const cached = await cacheNode.getCachedTx("tx_abc");
  assert.deepEqual(cached, testData);

  const stats = await cacheNode.getCacheStats();
  assert.equal(stats.count, 1);
  assert.ok(stats.sizeBytes > 0);
});

test("cache-node - limpeza completa do cache", async () => {
  await cacheNode.clearCache();
  await cacheNode.setCachedTx("tx_1", { body: "1" });
  await cacheNode.setCachedTx("tx_2", { body: "2" });

  let stats = await cacheNode.getCacheStats();
  assert.equal(stats.count, 2);

  await cacheNode.clearCache();
  stats = await cacheNode.getCacheStats();
  assert.equal(stats.count, 0);
});

test("cache-node - enforceMaxCacheSize descarta os mais antigos", async () => {
  await cacheNode.clearCache();
  const store = mockStores.get("tx-data");

  store.map.set("tx_antigo", {
    id: "tx_antigo",
    data: "dados",
    size: 200,
    lastAccessed: 1000,
  });
  store.map.set("tx_novo", {
    id: "tx_novo",
    data: "dados",
    size: 200,
    lastAccessed: 9000,
  });

  // Limite estrito de ~300 bytes
  await cacheNode.enforceMaxCacheSize(0.00025);

  assert.equal(store.map.has("tx_antigo"), false);
  assert.equal(store.map.has("tx_novo"), true);
});
