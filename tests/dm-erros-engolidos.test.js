/**
 * @file Erros engolidos na DM: chave de DM, caixa de saída e despacho não podem perder dado em silêncio.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const cryptoDm = await import("../client/js/crypto-dm.js");
const outbox = await import("../client/js/dm-outbox.js");
const { dispatchSealedEnvelope } = await import("../client/js/app/dm-wire.js");

const NOW = 1_800_000_000_000;
const env = (id) => ({ v: 1, id, from: "vx_ana", to: "vx_bia", ts: NOW, ephPub: {}, iv: "i", ct: "c" });

function memStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

test("ensureDmKeys - par ilegível não é apagado ao gerar outro", async () => {
  localStorage.setItem("vox-dm-keypair", "{corrompido");
  await cryptoDm.ensureDmKeys();
  assert.equal(localStorage.getItem("vox-dm-keypair-ilegivel"), "{corrompido");
  localStorage.removeItem("vox-dm-keypair");
  localStorage.removeItem("vox-dm-keypair-ilegivel");
});

test("dm-outbox - caixa ilegível é guardada à parte antes de ser regravada", () => {
  const storage = memStorage({ [outbox.OUTBOX_KEY]: "[{quebrado" });
  assert.equal(outbox.enqueueEnvelope("vx_bia", env("dm_1"), { storage, now: NOW }).queued, true);
  assert.equal(storage.map.get(`${outbox.OUTBOX_KEY}-ilegivel`), "[{quebrado");
});

test("dm-outbox - vencida que não conseguiu receber 'Não entregue' continua na caixa", async () => {
  const storage = memStorage();
  const old = NOW - outbox.OUTBOX_MAX_AGE_MS - 1000;
  outbox.enqueueEnvelope("vx_bia", env("dm_old"), { storage, now: old });
  const d = {
    storage, now: () => NOW, isConnected: () => false, sendDirect: () => false,
    pushRelay: async () => { throw new Error("x"); },
    markStatus: async () => { throw new Error("db fechado"); },
  };
  const r = await outbox.flushOutbox(d);
  assert.equal(r.expired, 0);
  assert.equal(outbox.listOutbox(storage).length, 1);
});

test("dispatchSealedEnvelope - sem relay e sem espaço na caixa devolve 'failed', não 'pending-retry'", async () => {
  const realFetch = globalThis.fetch;
  const realSet = localStorage.setItem.bind(localStorage);
  globalThis.fetch = async () => { throw new Error("offline"); };
  localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
  try {
    assert.equal(await dispatchSealedEnvelope("vx_bia", env("dm_full")), "failed");
  } finally {
    globalThis.fetch = realFetch;
    localStorage.setItem = realSet;
  }
});
