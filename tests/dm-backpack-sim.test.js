/**
 * PM-79 — Testes do simulador de cota, rate-limit e purga por recibo da mochila DM cega.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BACKPACK_LIMITS,
  MAX_FUTURE_SKEW_MS,
  admitEnvelope,
  applyDeliveryReceipt,
  createBackpackState,
  runCli,
  simulateBackpackEvents,
} from "../scripts/dm-backpack-sim.mjs";

const SCRIPT_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts/dm-backpack-sim.mjs");
const DAY_MS = 86_400_000;
const BASE_MS = Date.UTC(2026, 10, 10, 12, 0, 0);

function makeEnv(id, overrides = {}) {
  return {
    id,
    carrierPeerId: "peer-a",
    bytes: 256,
    copies: 0,
    ts: BASE_MS,
    ...overrides,
  };
}

test("PM-79: constantes canônicas BACKPACK_LIMITS correspondem à spec e são congeladas", () => {
  assert.equal(Object.isFrozen(BACKPACK_LIMITS), true);
  assert.deepEqual(BACKPACK_LIMITS, {
    standardCap: 50,
    guardianCap: 200,
    maxBytes: 4096,
    ttlMs: 7 * 86400 * 1000,
    maxCopies: 3,
    maxPerPeerPerDay: 20,
  });
});

test("PM-79: rejeita envelopes > 4096 B, expirados > 7d e copies >= 3", () => {
  const state = createBackpackState();

  assert.deepEqual(admitEnvelope(state, makeEnv("ok-max", { bytes: 4096, copies: 2 }), BASE_MS), { accepted: true });
  assert.deepEqual(admitEnvelope(state, makeEnv("too-big", { bytes: 4097 }), BASE_MS), {
    accepted: false,
    reason: "oversize",
  });
  assert.deepEqual(admitEnvelope(state, makeEnv("too-many-copies", { copies: 3 }), BASE_MS), {
    accepted: false,
    reason: "max_copies",
  });
  assert.deepEqual(
    admitEnvelope(state, makeEnv("at-ttl-edge", { ts: BASE_MS }), BASE_MS + BACKPACK_LIMITS.ttlMs),
    { accepted: true },
  );
  assert.deepEqual(
    admitEnvelope(state, makeEnv("expired", { ts: BASE_MS }), BASE_MS + BACKPACK_LIMITS.ttlMs + 1),
    { accepted: false, reason: "expired" },
  );
});

test("PM-79: limita ingresso diário a 20 envelopes por peer e renova no dia seguinte", () => {
  const state = createBackpackState();
  for (let i = 0; i < 20; i++) {
    const res = admitEnvelope(state, makeEnv(`day0-${i}`, { carrierPeerId: "peer-1" }), BASE_MS);
    assert.equal(res.accepted, true);
  }
  assert.deepEqual(admitEnvelope(state, makeEnv("day0-21", { carrierPeerId: "peer-1" }), BASE_MS), {
    accepted: false,
    reason: "peer_daily_limit",
  });
  assert.deepEqual(admitEnvelope(state, makeEnv("other-peer", { carrierPeerId: "peer-2" }), BASE_MS), {
    accepted: true,
  });
  assert.deepEqual(
    admitEnvelope(state, makeEnv("day1-0", { carrierPeerId: "peer-1", ts: BASE_MS + DAY_MS }), BASE_MS + DAY_MS),
    { accepted: true },
  );
});

test("PM-79: cota padrão (50) vs modo guardião (200) evicta mais antigo ao atingir limite", () => {
  const stdState = createBackpackState();
  for (let i = 0; i < 55; i++) {
    const peer = `peer-${Math.floor(i / 20)}`;
    assert.equal(admitEnvelope(stdState, makeEnv(`s-${i}`, { carrierPeerId: peer }), BASE_MS).accepted, true);
  }
  assert.equal(stdState.envelopes.size, 50);
  assert.equal(stdState.stats.evicted, 5);
  assert.equal(stdState.envelopes.has("s-0"), false);
  assert.equal(stdState.envelopes.has("s-54"), true);

  const guardState = createBackpackState({ guardian: true });
  for (let i = 0; i < 205; i++) {
    const peer = `peer-${Math.floor(i / 20)}`;
    assert.equal(admitEnvelope(guardState, makeEnv(`g-${i}`, { carrierPeerId: peer }), BASE_MS).accepted, true);
  }
  assert.equal(guardState.envelopes.size, 200);
  assert.equal(guardState.stats.evicted, 5);
  assert.equal(guardState.envelopes.has("g-0"), false);
  assert.equal(guardState.envelopes.has("g-204"), true);
});

test("PM-79: recibo de entrega purga cópia imediatamente e bloqueia readmissão", () => {
  const state = createBackpackState();
  assert.equal(admitEnvelope(state, makeEnv("env-1"), BASE_MS).accepted, true);
  assert.deepEqual(applyDeliveryReceipt(state, { envelopeId: "env-1" }), { envelopeId: "env-1", removed: true });
  assert.equal(state.envelopes.size, 0);
  assert.equal(state.purgedIds.has("env-1"), true);

  assert.deepEqual(admitEnvelope(state, makeEnv("env-1", { carrierPeerId: "peer-b" }), BASE_MS + 1000), {
    accepted: false,
    reason: "already_purged",
  });
});

test("PM-79: invariante de envelope cego nunca exige nem inspeciona from/to em claro", () => {
  const state = createBackpackState();
  const blindEnvelope = {
    v: 2,
    id: "blind-1",
    carrierPeerId: "peer-blind",
    bytes: 120,
    copies: 1,
    ts: BASE_MS,
  };
  Object.defineProperty(blindEnvelope, "from", {
    enumerable: true,
    get() {
      throw new Error("from não deve ser lido pelo carregador cego");
    },
  });
  Object.defineProperty(blindEnvelope, "to", {
    enumerable: true,
    get() {
      throw new Error("to não deve ser lido pelo carregador cego");
    },
  });

  const res = admitEnvelope(state, blindEnvelope, BASE_MS);
  assert.deepEqual(res, { accepted: true });
  const stored = state.envelopes.get("blind-1");
  assert.equal("from" in stored, false);
  assert.equal("to" in stored, false);
});

test("PM-79: simulateBackpackEvents reproduz eventos cronológicos e resume estado determinístico", () => {
  const events = [
    { type: "admit", nowMs: BASE_MS, envelope: makeEnv("e1", { bytes: 100 }) },
    { type: "admit", nowMs: BASE_MS + 1000, envelope: makeEnv("e2", { bytes: 200 }) },
    { type: "admit", nowMs: BASE_MS + 2000, envelope: makeEnv("e3", { bytes: 5000 }) },
    { type: "receipt", envelopeId: "e1" },
    { type: "admit", nowMs: BASE_MS + 3000, envelope: makeEnv("e1", { carrierPeerId: "peer-b", bytes: 100 }) },
    { type: "prune", nowMs: BASE_MS + 3000 },
  ];
  const summary = simulateBackpackEvents(events);
  assert.deepEqual(summary, {
    carriedCount: 1,
    capacity: 50,
    purgedCount: 1,
    rejectedByReason: { oversize: 1, already_purged: 1 },
    totalBytes: 200,
  });
});

test("PM-79: CLI executa roundtrip (--input, --guardian, --now, --json) e falha em entrada ausente", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vox-pm79-"));
  const inputPath = path.join(tmpDir, "events.json");
  const events = [
    { type: "admit", nowMs: BASE_MS, envelope: makeEnv("cli-1", { bytes: 300, ts: BASE_MS }) },
    { type: "admit", nowMs: BASE_MS + 500, envelope: makeEnv("cli-2", { bytes: 400, ts: BASE_MS }) },
    { type: "receipt", envelopeId: "cli-1" },
  ];
  try {
    fs.writeFileSync(inputPath, JSON.stringify(events), "utf8");
    const stdout = execFileSync(
      process.execPath,
      [SCRIPT_PATH, "--input", inputPath, "--guardian", "--now", String(BASE_MS + 1000), "--json"],
      { encoding: "utf8" },
    );
    const parsed = JSON.parse(stdout);
    assert.deepEqual(parsed, {
      carriedCount: 1,
      capacity: 200,
      purgedCount: 1,
      rejectedByReason: {},
      totalBytes: 400,
    });

    const expiredRun = runCli(["--input", inputPath, "--now", String(BASE_MS + BACKPACK_LIMITS.ttlMs + 10), "--json"]);
    assert.equal(expiredRun.summary.carriedCount, 0);
    assert.equal(expiredRun.summary.totalBytes, 0);
    assert.throws(() => runCli(["--input", path.join(tmpDir, "missing.json")]), /Não foi possível ler/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("PM-79: rejeita ts no futuro além da tolerância e aceita dentro dela", () => {
  const state = createBackpackState();
  assert.deepEqual(admitEnvelope(state, makeEnv("fut-ok", { ts: BASE_MS + MAX_FUTURE_SKEW_MS }), BASE_MS), {
    accepted: true,
  });
  assert.deepEqual(admitEnvelope(state, makeEnv("fut-bad", { ts: BASE_MS + MAX_FUTURE_SKEW_MS + 1 }), BASE_MS), {
    accepted: false,
    reason: "future_ts",
  });
  assert.deepEqual(admitEnvelope(state, makeEnv("fut-far", { ts: BASE_MS + 365 * DAY_MS }), BASE_MS), {
    accepted: false,
    reason: "future_ts",
  });
  assert.equal(state.envelopes.has("fut-far"), false);
});

test("PM-79: evento sem nowMs/at e sem opts.nowMs falha em vez de cair em epoch 0", () => {
  const events = [{ type: "admit", envelope: makeEnv("sem-relogio") }];
  assert.throws(() => simulateBackpackEvents(events), /exige nowMs\/at/);
  assert.throws(() => simulateBackpackEvents([{ type: "prune" }]), /exige nowMs\/at/);
  const summary = simulateBackpackEvents(events, { nowMs: BASE_MS });
  assert.equal(summary.carriedCount, 1);
});

test("PM-79: rejeita invalid_envelope e invalid_peer", () => {
  const state = createBackpackState();
  const invalid = { accepted: false, reason: "invalid_envelope" };
  assert.deepEqual(admitEnvelope(state, null, BASE_MS), invalid);
  assert.deepEqual(admitEnvelope(state, makeEnv("  "), BASE_MS), invalid);
  assert.deepEqual(admitEnvelope(state, makeEnv("__proto__"), BASE_MS), invalid);
  assert.deepEqual(admitEnvelope(state, makeEnv("b1", { bytes: -1 }), BASE_MS), invalid);
  assert.deepEqual(admitEnvelope(state, makeEnv("c1", { copies: 1.5 }), BASE_MS), invalid);
  assert.deepEqual(admitEnvelope(state, makeEnv("t1", { ts: "não-é-data" }), BASE_MS), invalid);
  const noPeer = { accepted: false, reason: "invalid_peer" };
  assert.deepEqual(admitEnvelope(state, makeEnv("p1", { carrierPeerId: "" }), BASE_MS), noPeer);
  assert.deepEqual(admitEnvelope(state, makeEnv("p2", { carrierPeerId: "constructor" }), BASE_MS), noPeer);
  assert.deepEqual(admitEnvelope(state, makeEnv("p3", { carrierPeerId: 7 }), BASE_MS), noPeer);
  assert.equal(state.stats.rejectedByReason.invalid_envelope, 6);
  assert.equal(state.stats.rejectedByReason.invalid_peer, 3);
});
