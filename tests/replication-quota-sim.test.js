/**
 * REV-11 & PM-74 — Testes do simulador de replicação por grau e cota efêmera.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_QUOTA_POLICY,
  formatQuotaReportMarkdown,
  normalizeReplicaItem,
  runCli,
  simulateQuotaEviction,
} from "../scripts/replication-quota-sim.mjs";

const SCRIPT_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts/replication-quota-sim.mjs");
const DAY_MS = 86_400 * 1000;
const BASE_MS = Date.UTC(2026, 10, 10, 12, 0, 0);

test("REV-11/PM-74: política padrão respeita teto de 500 MiB, subcota de 150 MiB, grau 2 e TTL 30d", () => {
  assert.equal(Object.isFrozen(DEFAULT_QUOTA_POLICY), true);
  assert.equal(DEFAULT_QUOTA_POLICY.maxBytes, 500 * 1024 * 1024);
  assert.equal(DEFAULT_QUOTA_POLICY.videoMaxBytes, 150 * 1024 * 1024);
  assert.equal(DEFAULT_QUOTA_POLICY.maxDegree, 2);
  assert.equal(DEFAULT_QUOTA_POLICY.defaultTtlMs, 30 * DAY_MS);
});

test("REV-11/PM-74: grau 0 e grau 1 sobrevivem antes de grau 2 sob pressão da cota global", () => {
  const items = [
    { id: "own", degree: 0, mediaType: "image", bytes: 400, createdAt: BASE_MS },
    { id: "friend-old", degree: 1, mediaType: "image", bytes: 300, createdAt: BASE_MS + 1000 },
    { id: "friend-new", degree: 1, mediaType: "text", bytes: 200, createdAt: BASE_MS + 2000 },
    { id: "hop2-old", degree: 2, mediaType: "audio", bytes: 300, createdAt: BASE_MS + 500 },
    { id: "hop2-new", degree: 2, mediaType: "text", bytes: 250, createdAt: BASE_MS + 3000 },
  ];
  const res = simulateQuotaEviction(items, { maxBytes: 900, videoMaxBytes: 900, now: BASE_MS + DAY_MS });
  assert.equal(res.ok, true);
  assert.deepEqual(res.kept.map((i) => i.id), ["own", "friend-old", "friend-new"]);
  assert.deepEqual(res.evicted.map((i) => i.id), ["hop2-old", "hop2-new"]);
  assert.equal(res.stats.totalBytes, 900);
  assert.equal(res.stats.utilizationPct, 100);
});

test("PM-74: subcota de vídeo despeja vídeos mais antigos/distantes preservando texto e imagem", () => {
  const items = [
    { id: "img-hop2", degree: 2, mediaType: "image", bytes: 250, createdAt: BASE_MS },
    { id: "txt-hop2", degree: 2, mediaType: "text", bytes: 100, createdAt: BASE_MS },
    { id: "vid-hop2", degree: 2, mediaType: "video", bytes: 200, createdAt: BASE_MS + 5000 },
    { id: "vid-hop1-old", degree: 1, mediaType: "video", bytes: 200, createdAt: BASE_MS + 1000 },
    { id: "vid-hop1-new", degree: 1, mediaType: "video", bytes: 200, createdAt: BASE_MS + 3000 },
  ];
  const res = simulateQuotaEviction(items, { maxBytes: 1200, videoMaxBytes: 300, now: BASE_MS + DAY_MS });
  assert.equal(res.ok, true);
  assert.deepEqual(res.kept.map((i) => i.id), ["img-hop2", "txt-hop2", "vid-hop1-new"]);
  assert.deepEqual(res.evicted.map((i) => i.id), ["vid-hop2", "vid-hop1-old"]);
  assert.equal(res.evicted[0].reason, "video_quota");
  assert.equal(res.stats.videoBytes, 200);
  assert.equal(res.stats.videoUtilizationPct, 66.67);
});

test("REV-11: itens efêmeros expirados são podados, mas grau 0 e pinned permanecem", () => {
  const now = BASE_MS + 30 * DAY_MS;
  const items = [
    { id: "own-old", degree: 0, mediaType: "text", bytes: 100, createdAt: BASE_MS - 10 * DAY_MS },
    { id: "pinned-old", degree: 2, mediaType: "image", bytes: 150, createdAt: BASE_MS - 10 * DAY_MS, pinned: true },
    { id: "expired-default", degree: 1, mediaType: "text", bytes: 100, createdAt: BASE_MS },
    { id: "expired-custom", degree: 1, mediaType: "audio", bytes: 100, createdAt: now - 5000, ttlMs: 5000 },
    { id: "fresh", degree: 2, mediaType: "text", bytes: 120, createdAt: now - 1000, ttlMs: 10_000 },
  ];
  const res = simulateQuotaEviction(items, { maxBytes: 1000, videoMaxBytes: 500, now });
  assert.deepEqual(res.kept.map((i) => i.id), ["own-old", "pinned-old", "fresh"]);
  assert.deepEqual(res.evicted.map((i) => i.id), ["expired-default", "expired-custom"]);
  assert.ok(res.evicted.every((i) => i.reason === "expired"));
});

test("REV-11/PM-74: despeja grau > maxDegree (exceto fixado), trata vazio sem NaN e remove arestas de grafo social", () => {
  const normalized = normalizeReplicaItem({
    id: "safe-1",
    degree: 1,
    mediaType: "image",
    bytes: 512,
    createdAt: BASE_MS,
    friends: ["alice", "bob"],
  });
  assert.equal("friends" in normalized, false);

  const overDegree = simulateQuotaEviction([
    { id: "d3", degree: 3, mediaType: "text", bytes: 100, createdAt: BASE_MS },
    { id: "d3-pin", degree: 3, mediaType: "text", bytes: 100, createdAt: BASE_MS, pinned: true },
  ], { maxBytes: 1000, videoMaxBytes: 500, maxDegree: 2, now: BASE_MS + 1000 });
  assert.deepEqual(overDegree.kept.map((i) => i.id), ["d3-pin"]);
  assert.equal(overDegree.evicted[0].reason, "degree_exceeded");

  const empty = simulateQuotaEviction([], { maxBytes: 0, videoMaxBytes: 0, now: BASE_MS });
  assert.equal(empty.ok, true);
  assert.equal(empty.stats.utilizationPct, 0);
  assert.equal(empty.stats.videoUtilizationPct, 0);
  assert.equal(Number.isNaN(empty.stats.utilizationPct), false);
  const md = formatQuotaReportMarkdown(empty);
  assert.equal(md.includes("NaN"), false);
  assert.ok(md.includes("0.00%"));
});

test("REV-11/PM-74: validações rejeitam bytes negativos, grau inválido, duplicatas e entradas malformadas", () => {
  assert.throws(() => normalizeReplicaItem(null), TypeError);
  assert.throws(() => normalizeReplicaItem({ id: "a", degree: 0, mediaType: "text", bytes: -1, createdAt: BASE_MS }), RangeError);
  assert.throws(() => normalizeReplicaItem({ id: "a", degree: -1, mediaType: "text", bytes: 10, createdAt: BASE_MS }), RangeError);
  assert.throws(() => normalizeReplicaItem({ id: "a", degree: 1.5, mediaType: "text", bytes: 10, createdAt: BASE_MS }), RangeError);
  assert.throws(() => normalizeReplicaItem({ id: "a", degree: 0, mediaType: "exe", bytes: 10, createdAt: BASE_MS }), RangeError);
  assert.throws(() => normalizeReplicaItem({ id: "__proto__", degree: 0, mediaType: "text", bytes: 10, createdAt: BASE_MS }), RangeError);
  assert.throws(() => simulateQuotaEviction([
    { id: "dup", degree: 0, mediaType: "text", bytes: 10, createdAt: BASE_MS },
    { id: "dup", degree: 1, mediaType: "text", bytes: 10, createdAt: BASE_MS },
  ], { now: BASE_MS }), RangeError);
});

test("REV-11/PM-74: roundtrip CLI com --input, --max-bytes, --video-max-bytes, --now e --json", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vox-rev11-pm74-"));
  const inputPath = path.join(tmpDir, "items.json");
  const outPath = path.join(tmpDir, "report.md");
  const payload = [
    { id: "own", degree: 0, mediaType: "text", bytes: 200, createdAt: BASE_MS },
    { id: "vid1", degree: 1, mediaType: "video", bytes: 400, createdAt: BASE_MS + 1000 },
    { id: "vid2", degree: 2, mediaType: "video", bytes: 400, createdAt: BASE_MS + 2000 },
  ];
  try {
    fs.writeFileSync(inputPath, JSON.stringify(payload), "utf8");
    const stdout = execFileSync(
      process.execPath,
      [SCRIPT_PATH, "--input", inputPath, "--max-bytes", "800", "--video-max-bytes", "500", "--now", String(BASE_MS + 5000), "--json"],
      { encoding: "utf8" },
    );
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.kept.map((i) => i.id), ["own", "vid1"]);
    assert.deepEqual(parsed.evicted.map((i) => i.id), ["vid2"]);

    const mdRun = runCli(["--input", inputPath, "--max-bytes", "800", "--video-max-bytes", "500", "--now", String(BASE_MS + 5000), "--out", outPath]);
    assert.equal(mdRun.outputPath, outPath);
    assert.ok(fs.readFileSync(outPath, "utf8").includes("Relatório de Cota e Replicação por Grau"));
    assert.throws(() => runCli(["--input", path.join(tmpDir, "missing.json")]), /Não foi possível ler/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("REV-11/PM-74: pinned não isenta de cota: grau 0 é protegido por último, fixado de grau 1 é despejado antes", () => {
  const items = [
    { id: "own-old", degree: 0, mediaType: "text", bytes: 400, createdAt: BASE_MS },
    { id: "own-new", degree: 0, mediaType: "text", bytes: 400, createdAt: BASE_MS + 1000 },
    { id: "pinned-hop1", degree: 1, mediaType: "text", bytes: 300, createdAt: BASE_MS + 2000, pinned: true },
  ];
  const res = simulateQuotaEviction(items, { maxBytes: 500, videoMaxBytes: 500, now: BASE_MS + 5000 });
  assert.equal(res.ok, true);
  assert.deepEqual(res.kept.map((i) => i.id), ["own-new"]);
  assert.deepEqual(res.evicted.map((i) => i.id), ["pinned-hop1", "own-old"]);
});


test("REV-11/PM-74: rejeita ttlMs <= 0 no item e defaultTtlMs <= 0 na política", () => {
  const base = { id: "t", degree: 1, mediaType: "text", bytes: 1, createdAt: BASE_MS };
  assert.throws(() => normalizeReplicaItem({ ...base, ttlMs: 0 }), RangeError);
  assert.throws(() => normalizeReplicaItem({ ...base, ttlMs: -1 }), RangeError);
  assert.equal(normalizeReplicaItem({ ...base, ttlMs: 1 }).ttlMs, 1);
  assert.throws(() => simulateQuotaEviction([], { defaultTtlMs: 0, now: BASE_MS }), RangeError);
});
