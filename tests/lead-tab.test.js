/**
 * Testes de eleição de aba líder, `withWebLock` e poll exclusivo em `dm-outbox`.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { drainMicrotasks, waitUntil } from "./helpers/wait-until.js";
import { createScope } from "../client/js/shared/signals.js";
import { createLeadTabSignal, leadTabSignal, withWebLock } from "../client/js/shared/lead-tab.js";
import { createOutboxLeadPoll, enqueueEnvelope, flushOutbox } from "../client/js/dm-outbox.js";

const flushMicrotasks = () => drainMicrotasks(50);

function makeMockLockManager() {
  const queues = new Map();
  return {
    async request(name, optsOrFn, maybeFn) {
      const fn = typeof optsOrFn === "function" ? optsOrFn : maybeFn;
      const prev = queues.get(name) || Promise.resolve();
      let release;
      const slot = new Promise((resolve) => {
        release = resolve;
      });
      queues.set(name, prev.then(() => slot));
      await prev;
      try {
        return await fn({ name, mode: optsOrFn?.mode || "exclusive" });
      } finally {
        release();
      }
    },
  };
}

function makeFakeWindow() {
  const timers = new Map();
  let nextId = 1;
  return {
    setInterval(fn) {
      const id = nextId++;
      timers.set(id, fn);
      return id;
    },
    clearInterval(id) {
      timers.delete(id);
    },
    tickAll() {
      for (const fn of timers.values()) fn();
    },
  };
}

test("lead-tab: apenas 1 aba vira líder e a segunda é promovida após stop()", async () => {
  globalThis.BroadcastChannel.channels.clear();
  const locks = makeMockLockManager();
  const peerEventsA = [];
  const peerEventsB = [];
  const tab1 = createLeadTabSignal({
    lockName: "vox-test-lead-1",
    tabId: "tab-1",
    locks,
    onPeerEvent: (ev) => peerEventsA.push(ev),
  });
  const tab2 = leadTabSignal({
    lockName: "vox-test-lead-1",
    tabId: "tab-2",
    locks,
    onPeerEvent: (ev) => peerEventsB.push(ev),
  });
  await waitUntil(() => tab1.isLead.get() && peerEventsB.some((e) => e.kind === "lead" && e.tabId === "tab-1"));

  assert.equal(tab1.isLead.get(), true);
  assert.equal(tab2.isLead.get(), false);
  assert.equal(peerEventsB.some((e) => e.kind === "lead" && e.tabId === "tab-1"), true);

  tab1.stop();
  await waitUntil(() => tab2.isLead.get() && peerEventsB.some((e) => e.kind === "release" && e.tabId === "tab-1"));

  assert.equal(tab1.isLead.get(), false);
  assert.equal(tab2.isLead.get(), true);
  assert.equal(peerEventsB.some((e) => e.kind === "release" && e.tabId === "tab-1"), true);
  assert.equal(peerEventsA.length, 0, "tab-1 fechou canal no stop()");
  tab2.stop();
});

test("lead-tab: seguidora parada antes da promoção não sequestra liderança", async () => {
  const locks = makeMockLockManager();
  const tab1 = createLeadTabSignal({ lockName: "vox-test-lead-2", locks, channelName: null });
  const tab2 = createLeadTabSignal({ lockName: "vox-test-lead-2", locks, channelName: null });
  const tab3 = createLeadTabSignal({ lockName: "vox-test-lead-2", locks, channelName: null });
  await waitUntil(() => tab1.isLead.get());

  assert.equal(tab1.isLead.get(), true);
  tab2.stop();
  tab1.stop();
  await waitUntil(() => tab3.isLead.get());

  assert.equal(tab2.isLead.get(), false);
  assert.equal(tab3.isLead.get(), true);
  tab3.stop();
});

test("lead-tab: fallback gracioso sem navigator.locks promove aba e reage ao scope.dispose()", () => {
  const scope = createScope();
  const states = [];
  const lead = createLeadTabSignal({
    lockName: "vox-test-fallback",
    locks: null,
    channelName: null,
    scope,
  });
  scope.effect(() => {
    states.push(lead.isLead.get());
  });
  assert.equal(lead.isLead.get(), true);
  scope.dispose();
  assert.equal(lead.isLead.peek(), false);
  assert.deepEqual(states, [true, false]);
});

test("withWebLock: serializa chamadas concorrentes e cai em execução direta sem API", async () => {
  const locks = makeMockLockManager();
  let active = 0;
  let maxActive = 0;
  const runJob = () => withWebLock("vox-test-job", async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await flushMicrotasks();
    active -= 1;
    return "ok";
  }, { locks });
  const res = await Promise.all([runJob(), runJob(), runJob()]);
  assert.deepEqual(res, ["ok", "ok", "ok"]);
  assert.equal(maxActive, 1);

  const direct = await withWebLock("vox-test-job", (lock) => ({ lock, ok: true }), { locks: null });
  assert.deepEqual(direct, { lock: null, ok: true });
});

test("dm-outbox: createOutboxLeadPoll dispara tick automático só na líder e mantém flushNow manual", async () => {
  const locks = makeMockLockManager();
  const win1 = makeFakeWindow();
  const win2 = makeFakeWindow();
  const ticks = [];
  const poll1 = createOutboxLeadPoll(() => ticks.push("tab1"), {
    lockName: "vox-test-outbox-poll",
    locks,
    channelName: null,
    win: win1,
  });
  const poll2 = createOutboxLeadPoll(() => ticks.push("tab2"), {
    lockName: "vox-test-outbox-poll",
    locks,
    channelName: null,
    win: win2,
  });
  await flushMicrotasks();

  win1.tickAll();
  win2.tickAll();
  assert.deepEqual(ticks, ["tab1"]);

  poll2.flushNow();
  assert.deepEqual(ticks, ["tab1", "tab2"], "envio/flush manual continua livre");

  poll1.stop();
  await flushMicrotasks();
  win1.tickAll();
  win2.tickAll();
  assert.deepEqual(ticks, ["tab1", "tab2", "tab2"]);
  poll2.stop();
});

test("dm-outbox: flushOutbox serializa passadas concorrentes via withWebLock", async () => {
  const locks = makeMockLockManager();
  const map = new Map();
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)) };
  enqueueEnvelope("vx_bia", { id: "dm_lock_1", ct: "c" }, { storage, now: 1_000_000 });
  let pushCount = 0;
  const deps = {
    locks,
    storage,
    now: () => 1_000_000,
    isConnected: () => true,
    sendDirect: () => {
      pushCount += 1;
      return true;
    },
    pushRelay: async () => {},
    markStatus: async () => true,
  };
  const [r1, r2] = await Promise.all([flushOutbox(deps), flushOutbox(deps)]);
  assert.equal(pushCount, 1, "segunda aba lê caixa já vazia após o lock");
  assert.equal(r1.sent + r2.sent, 1);
});
