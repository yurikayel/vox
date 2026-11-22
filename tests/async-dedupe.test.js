/**
 * Deduplicador em voo (`client/js/shared/async-dedupe.js`) e consumidores reais.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createAsyncDeduper, clearInFlight, dedupeAsync } from "../client/js/shared/async-dedupe.js";
import { loadConfig, __resetGatewayConfigForTests } from "../client/js/graphql-gateway.js";

test("async-dedupe — agrupa chamadas concorrentes e remove após concluir", async () => {
  const deduper = createAsyncDeduper();
  let calls = 0;
  let release;
  const barrier = new Promise((r) => { release = r; });

  const p1 = deduper.run("k:1", async () => { calls += 1; await barrier; return { ok: calls }; });
  const p2 = deduper.run("k:1", async () => { calls += 1; return { ok: calls }; });

  assert.equal(p1, p2);
  assert.equal(deduper.size(), 1);
  release();
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(calls, 1);
  assert.equal(r1.ok, 1);
  assert.equal(r2.ok, 1);
  assert.equal(deduper.size(), 0);
});

test("async-dedupe — falha libera chave e clear(prefix) não apaga promessa mais nova", async () => {
  const deduper = createAsyncDeduper();
  await assert.rejects(() => deduper.run("err", () => Promise.reject(new Error("boom"))), /boom/);
  assert.equal(deduper.has("err"), false);

  let resolveOld;
  const oldP = deduper.run("profile:1", () => new Promise((r) => { resolveOld = r; }));
  deduper.clear("profile:");
  const newP = deduper.run("profile:1", async () => "novo");
  assert.notEqual(oldP, newP);
  resolveOld("antigo");
  assert.equal(await oldP, "antigo");
  assert.equal(await newP, "novo");
  assert.equal(deduper.size(), 0);
});

test("graphql-gateway — loadConfig deduplica fetches concorrentes", async () => {
  __resetGatewayConfigForTests();
  clearInFlight();
  const origFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return { ok: true, json: async () => ({ gateways: [] }) };
  };
  try {
    const [a, b, c] = await Promise.all([loadConfig(), loadConfig(), dedupeAsync("other", async () => 1)]);
    assert.equal(fetchCount, 1);
    assert.deepEqual(a, { gateways: [] });
    assert.equal(a, b);
    assert.equal(c, 1);
  } finally {
    globalThis.fetch = origFetch;
    __resetGatewayConfigForTests();
  }
});
