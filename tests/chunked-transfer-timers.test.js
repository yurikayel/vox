import "../tests/setup.js";
import { test, mock } from "node:test";
import assert from "node:assert/strict";

async function chunkedTransfer() {
  return import("../client/js/labs/parado/chunked-transfer.js");
}

function trackIntervals() {
  const active = new Set();
  const origSet = globalThis.setInterval;
  const origClear = globalThis.clearInterval;
  globalThis.setInterval = (...args) => {
    const id = origSet(...args);
    active.add(id);
    return id;
  };
  globalThis.clearInterval = (id) => {
    active.delete(id);
    origClear(id);
  };
  return {
    size: () => active.size,
    restore() {
      globalThis.setInterval = origSet;
      globalThis.clearInterval = origClear;
    },
  };
}

function stuckChannel(extra = {}) {
  const listeners = new Map();
  return {
    bufferedAmount: 200000,
    send() {},
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    emit(type) {
      for (const fn of listeners.get(type) ?? []) fn();
    },
    ...extra,
  };
}

test("chunked-transfer: BACKPRESSURE_POLL_MS (RED na base)", async () => {
  const { BACKPRESSURE_POLL_MS } = await chunkedTransfer();
  assert.equal(BACKPRESSURE_POLL_MS, 20);
});

test("chunked-transfer timers - abort limpa setInterval pendente", async () => {
  const mod = await chunkedTransfer();
  if (mod.BACKPRESSURE_POLL_MS == null) return;
  const { waitForBackpressure, BACKPRESSURE_POLL_MS } = mod;
  mock.timers.enable({ apis: ["setInterval"] });
  const intervals = trackIntervals();
  const ac = new AbortController();
  try {
    const channel = stuckChannel();
    const wait = waitForBackpressure(channel, { signal: ac.signal });
    assert.equal(intervals.size(), 1);
    ac.abort();
    await assert.rejects(wait, (err) => err?.name === "AbortError");
    assert.equal(intervals.size(), 0);
    mock.timers.tick(BACKPRESSURE_POLL_MS * 50);
    assert.equal(intervals.size(), 0);
  } finally {
    intervals.restore();
    mock.timers.reset();
  }
});

test("chunked-transfer timers - fecha o poll ao fechar o canal", async () => {
  const mod = await chunkedTransfer();
  if (mod.BACKPRESSURE_POLL_MS == null) return;
  const { waitForBackpressure } = mod;
  mock.timers.enable({ apis: ["setInterval"] });
  const intervals = trackIntervals();
  try {
    const channel = stuckChannel();
    const wait = waitForBackpressure(channel);
    assert.equal(intervals.size(), 1);
    channel.emit("close");
    await assert.rejects(wait, /fechado/);
    assert.equal(intervals.size(), 0);
  } finally {
    intervals.restore();
    mock.timers.reset();
  }
});

test("chunked-transfer timers - poll resolve e remove listener bufferedamountlow", async () => {
  const mod = await chunkedTransfer();
  if (mod.BACKPRESSURE_POLL_MS == null) return;
  const { waitForBackpressure, BACKPRESSURE_POLL_MS } = mod;
  mock.timers.enable({ apis: ["setInterval"] });
  const intervals = trackIntervals();
  try {
    const channel = stuckChannel();
    let lowHooks = 0;
    const origAdd = channel.addEventListener.bind(channel);
    channel.addEventListener = (type, fn) => {
      if (type === "bufferedamountlow") lowHooks += 1;
      origAdd(type, fn);
    };
    const wait = waitForBackpressure(channel);
    channel.bufferedAmount = 0;
    mock.timers.tick(BACKPRESSURE_POLL_MS);
    await wait;
    assert.equal(intervals.size(), 0);
    assert.equal(lowHooks, 1);
    channel.emit("bufferedamountlow");
    assert.equal(lowHooks, 1, "listener removido após resolver");
  } finally {
    intervals.restore();
    mock.timers.reset();
  }
});

test("chunked-transfer timers - sendChunksWithBackpressure aborta entre chunks", async () => {
  const mod = await chunkedTransfer();
  if (mod.BACKPRESSURE_POLL_MS == null) return;
  const { sendChunksWithBackpressure, slicePayloadIntoChunks } = mod;
  mock.timers.enable({ apis: ["setInterval"] });
  const sent = [];
  const channel = stuckChannel({ bufferedAmount: 0 });
  const origSend = channel.send.bind(channel);
  channel.send = (msg) => {
    sent.push(msg);
    if (sent.length === 1) channel.bufferedAmount = 200000;
    origSend(msg);
  };
  const chunks = slicePayloadIntoChunks("A".repeat(30000), 10000, "xfer_abort");
  const ac = new AbortController();
  const task = sendChunksWithBackpressure(channel, chunks, null, { signal: ac.signal });
  await new Promise((r) => setImmediate(r));
  assert.equal(sent.length, 1);
  ac.abort();
  await assert.rejects(task, (err) => err?.name === "AbortError");
  assert.equal(sent.length, 1);
  mock.timers.reset();
});

test("chunked-transfer timers - ChunkReassembler dispose libera estado", async () => {
  const mod = await chunkedTransfer();
  if (mod.BACKPRESSURE_POLL_MS == null) return;
  const { ChunkReassembler, slicePayloadIntoChunks } = mod;
  const reassembler = new ChunkReassembler();
  const chunks = slicePayloadIntoChunks("A".repeat(25000), 10000, "xfer_dispose");
  reassembler.addChunk(chunks[0]);
  assert.deepEqual(reassembler.getMissingIndices("xfer_dispose"), [1, 2]);
  reassembler.dispose();
  assert.deepEqual(reassembler.getMissingIndices("xfer_dispose"), []);
});