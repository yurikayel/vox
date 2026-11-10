import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const outbox = await import("../client/js/dm-outbox.js");
const wire = await import("../client/js/app/dm-wire.js");

const MIN = 60 * 1000;
const NOW = 1_800_000_000_000;

function memStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

const env = (id, extra = {}) => ({ v: 1, id, from: "vx_ana", to: "vx_bia", ts: NOW, ephPub: {}, iv: "i", ct: "c", ...extra });

function deps(storage, over = {}) {
  const calls = { direct: [], relay: [], marks: [] };
  const d = {
    storage,
    now: () => NOW,
    isConnected: () => false,
    sendDirect: (addr, e) => (calls.direct.push(e.id), true),
    pushRelay: async (addr, e) => { calls.relay.push(e.id); throw new Error("sem relay"); },
    markStatus: async (addr, id, status) => calls.marks.push([addr, id, status]),
    ...over,
  };
  return { d, calls };
}

test("dm-outbox - enfileira, não duplica e espera 1 min antes de tentar o relay de novo", async () => {
  const storage = memStorage();
  assert.equal(outbox.enqueueEnvelope("vx_bia", env("dm_1"), { storage, now: NOW }).queued, true);
  outbox.enqueueEnvelope("vx_bia", env("dm_1"), { storage, now: NOW });
  assert.equal(outbox.listOutbox(storage).length, 1);
  assert.equal(outbox.enqueueEnvelope("", env("dm_2"), { storage }).queued, false);
  const { d, calls } = deps(storage);
  const r = await outbox.flushOutbox(d);
  assert.deepEqual(r, { sent: 0, expired: 0, waiting: 1 });
  assert.equal(calls.relay.length, 0, "dentro da espera não bate no relay");
});

test("dm-outbox - entrega direto quando a pessoa conecta e marca o fio", async () => {
  const storage = memStorage();
  outbox.enqueueEnvelope("vx_bia", env("dm_1"), { storage, now: NOW });
  outbox.enqueueEnvelope("vx_caio", env("dm_2", { to: "vx_caio" }), { storage, now: NOW });
  const { d, calls } = deps(storage, { isConnected: (a) => a === "vx_bia" });
  const r = await outbox.flushOutbox(d);
  assert.equal(r.sent, 1);
  assert.deepEqual(calls.marks, [["vx_bia", "dm_1", "delivered"]]);
  assert.deepEqual(outbox.listOutbox(storage).map((e) => e.envelope.id), ["dm_2"]);
});

test("dm-outbox - relay com espera crescente; quando aceita, sai como caixa postal", async () => {
  const storage = memStorage();
  outbox.enqueueEnvelope("vx_bia", env("dm_1"), { storage, now: NOW });
  const later = NOW + 2 * MIN;
  const failing = deps(storage, { now: () => later });
  await outbox.flushOutbox(failing.d);
  assert.deepEqual(failing.calls.relay, ["dm_1"]);
  const [entry] = outbox.listOutbox(storage);
  assert.equal(entry.relayAttempts, 2);
  assert.equal(entry.nextRelayAt, later + 2 * MIN);
  assert.equal(outbox.relayBackoffMs(10), 30 * MIN, "teto de 30 min");
  const ok = deps(storage, { now: () => later + 3 * MIN, pushRelay: async () => ({ ok: true }) });
  assert.equal((await outbox.flushOutbox(ok.d)).sent, 1);
  assert.deepEqual(ok.calls.marks, [["vx_bia", "dm_1", "queued-relay"]]);
  assert.equal(outbox.listOutbox(storage).length, 0);
});

test("dm-outbox - vence em 7 dias e vira Não entregue; limite de espaço tira o mais antigo", async () => {
  const storage = memStorage();
  outbox.enqueueEnvelope("vx_bia", env("dm_old"), { storage, now: NOW });
  const { d, calls } = deps(storage, { now: () => NOW + outbox.OUTBOX_MAX_AGE_MS + 1 });
  assert.equal((await outbox.flushOutbox(d)).expired, 1);
  assert.deepEqual(calls.marks, [["vx_bia", "dm_old", "failed"]]);
  const list = Array.from({ length: outbox.OUTBOX_MAX_ITEMS + 1 }, (_, i) => ({ to: "vx_bia", envelope: env(`dm_${i}`), queuedAt: NOW + i }));
  const { kept, dropped } = outbox.trimOutbox(list);
  assert.equal(kept.length, outbox.OUTBOX_MAX_ITEMS);
  assert.equal(dropped[0].envelope.id, "dm_0");
  const big = [{ to: "vx_bia", envelope: env("dm_big", { ct: "x".repeat(outbox.OUTBOX_MAX_BYTES) }), queuedAt: NOW }];
  assert.equal(outbox.trimOutbox(big).kept.length, 0);
});

test("dm-outbox - caixa corrompida não quebra o envio", async () => {
  const storage = memStorage();
  storage.setItem(outbox.OUTBOX_KEY, "{quebrado");
  assert.deepEqual(outbox.listOutbox(storage), []);
  storage.setItem(outbox.OUTBOX_KEY, JSON.stringify([{ to: "vx_bia" }, null]));
  assert.deepEqual(outbox.listOutbox(storage), []);
});

test("dm-wire - flushDmOutbox ignora uma segunda passada simultânea", async () => {
  const storage = memStorage();
  outbox.enqueueEnvelope("vx_bia", env("dm_1"), { storage, now: NOW });
  let release;
  const gate = new Promise((r) => { release = r; });
  const { d } = deps(storage, { isConnected: () => true, markStatus: () => gate });
  const first = wire.flushDmOutbox(d);
  assert.equal(await wire.flushDmOutbox(d), null);
  release();
  assert.equal((await first).sent, 1);
});
