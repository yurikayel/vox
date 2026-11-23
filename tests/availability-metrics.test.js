/**
 * PM-75 — Testes da calculadora offline de disponibilidade de posts (1h / 6h / 24h).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeAvailabilityMetrics,
  formatAvailabilityMarkdown,
  runCli,
  validateAvailabilityInput,
} from "../scripts/availability-metrics.mjs";

const SCRIPT_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts/availability-metrics.mjs");
const HOUR_MS = 3_600_000;
const BASE_MS = Date.UTC(2026, 10, 1, 12, 0, 0);

function makeSampleObservations() {
  return {
    posts: [
      { id: "p1", authorOfflineAt: BASE_MS },
      { id: "p2", authorOfflineAt: new Date(BASE_MS).toISOString() },
      { id: "p3", authorOfflineAt: BASE_MS },
    ],
    probes: [
      { postId: "p1", observedAt: BASE_MS + 0.5 * HOUR_MS, available: false, replicaCount: 0 },
      { postId: "p1", observedAt: BASE_MS + 1 * HOUR_MS, available: true, replicaCount: 4 },
      { postId: "p1", observedAt: BASE_MS + 6 * HOUR_MS, available: true, replicaCount: 2 },
      { postId: "p1", observedAt: BASE_MS + 24 * HOUR_MS, available: false, replicaCount: 0 },
      { postId: "p2", observedAt: BASE_MS + 1 * HOUR_MS, available: true, replicaCount: 2 },
      { postId: "p2", observedAt: BASE_MS + 6 * HOUR_MS, available: false, replicaCount: 0 },
      { postId: "p3", observedAt: BASE_MS + 2 * HOUR_MS, available: true, replicaCount: 3 },
      { postId: "unknown_post", observedAt: BASE_MS + 1 * HOUR_MS, available: true, replicaCount: 1 },
    ],
  };
}

test("PM-75: bucketing nas janelas 1h, 6h e 24h ignora sondas precoces e mede decaimento", () => {
  const report = computeAvailabilityMetrics(makeSampleObservations());
  assert.equal(report.totalPosts, 3);
  assert.equal(report.totalProbes, 8);
  assert.equal(report.unmatchedProbes, 1);

  const [w1, w6, w24] = report.windows;
  assert.deepEqual(w1, { windowHours: 1, eligiblePosts: 3, availablePosts: 3, availabilityPct: 100, avgReplicas: 3 });
  assert.deepEqual(w6, { windowHours: 6, eligiblePosts: 2, availablePosts: 1, availabilityPct: 50, avgReplicas: 1 });
  assert.deepEqual(w24, { windowHours: 24, eligiblePosts: 1, availablePosts: 0, availabilityPct: 0, avgReplicas: 0 });
  assert.equal(report.summary.totalEligibleEvaluations, 6);
  assert.equal(report.summary.totalAvailableEvaluations, 4);
  assert.equal(report.summary.overallAvailabilityPct, 66.67);
});

test("PM-75: decaimento temporal usa a primeira sonda a partir do marco W*3600000", () => {
  const data = {
    posts: [{ id: "decay", authorOfflineAt: BASE_MS }],
    probes: [
      { postId: "decay", observedAt: BASE_MS + 25 * HOUR_MS, available: false, replicaCount: 0 },
      { postId: "decay", observedAt: BASE_MS + 6 * HOUR_MS, available: true, replicaCount: 2 },
      { postId: "decay", observedAt: BASE_MS + 1 * HOUR_MS, available: true, replicaCount: 5 },
    ],
  };
  const report = computeAvailabilityMetrics(data);
  assert.equal(report.windows[0].availabilityPct, 100);
  assert.equal(report.windows[0].avgReplicas, 5);
  assert.equal(report.windows[1].availabilityPct, 100);
  assert.equal(report.windows[1].avgReplicas, 2);
  assert.equal(report.windows[2].availabilityPct, 0);
  assert.equal(report.windows[2].avgReplicas, 0);
});

test("PM-75: trata zero posts elegíveis sem NaN e renderiza N/A em Markdown", () => {
  const emptyReport = computeAvailabilityMetrics({ posts: [], probes: [] });
  for (const w of emptyReport.windows) {
    assert.equal(w.eligiblePosts, 0);
    assert.equal(w.availablePosts, 0);
    assert.equal(w.availabilityPct, null);
    assert.equal(w.avgReplicas, null);
    assert.equal(Number.isNaN(w.availabilityPct), false);
    assert.equal(Number.isNaN(w.avgReplicas), false);
  }
  assert.equal(emptyReport.summary.overallAvailabilityPct, null);
  assert.equal(emptyReport.summary.overallAvgReplicas, null);

  const earlyOnly = computeAvailabilityMetrics({
    posts: [{ id: "p1", authorOfflineAt: BASE_MS }],
    probes: [{ postId: "p1", observedAt: BASE_MS + 1000, available: true, replicaCount: 1 }],
  });
  assert.equal(earlyOnly.windows[0].eligiblePosts, 0);
  const md = formatAvailabilityMarkdown(earlyOnly);
  assert.equal(md.includes("NaN"), false);
  assert.ok(md.includes("| 1h | 0 | 0 | N/A | N/A |"));
});

test("PM-75: rejeita entradas malformadas, IDs duplicados e chaves reservadas", () => {
  assert.throws(() => validateAvailabilityInput(null), TypeError);
  assert.throws(() => validateAvailabilityInput({ posts: "bad", probes: [] }), TypeError);
  assert.throws(() => validateAvailabilityInput({ posts: [], probes: null }), TypeError);
  assert.throws(() => validateAvailabilityInput({
    posts: [{ id: "dup", authorOfflineAt: BASE_MS }, { id: "dup", authorOfflineAt: BASE_MS }],
    probes: [],
  }), RangeError);
  assert.throws(() => validateAvailabilityInput({
    posts: [{ id: "__proto__", authorOfflineAt: BASE_MS }],
    probes: [],
  }), RangeError);
  assert.throws(() => validateAvailabilityInput({
    posts: [{ id: "p1", authorOfflineAt: "invalid-date" }],
    probes: [],
  }), TypeError);
  assert.throws(() => validateAvailabilityInput({
    posts: [{ id: "p1", authorOfflineAt: BASE_MS }],
    probes: [{ postId: "p1", observedAt: BASE_MS + HOUR_MS, available: "yes" }],
  }), TypeError);
  assert.throws(() => validateAvailabilityInput({
    posts: [{ id: "p1", authorOfflineAt: BASE_MS }],
    probes: [{ postId: "p1", observedAt: BASE_MS + HOUR_MS, available: true, replicaCount: -1 }],
  }), RangeError);
  assert.throws(() => computeAvailabilityMetrics({ posts: [], probes: [] }, []), TypeError);
});

test("PM-75: formatAvailabilityMarkdown gera tabela auditável e nota zero-telemetria", () => {
  const report = computeAvailabilityMetrics(makeSampleObservations());
  const md = formatAvailabilityMarkdown(report);
  assert.ok(md.includes("# Métricas de Disponibilidade Offline (PM-75)"));
  assert.ok(md.includes("| 1h | 3 | 3 | 100.00% | 3.00 |"));
  assert.ok(md.includes("| 6h | 2 | 1 | 50.00% | 1.00 |"));
  assert.ok(md.includes("| 24h | 1 | 0 | 0.00% | 0.00 |"));
  assert.ok(md.includes("Zero telemetria central"));
});

test("PM-75: CLI executa roundtrip em arquivos temporários (json e md) e falha em entrada ausente", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vox-pm75-"));
  const inputPath = path.join(tmpDir, "obs.json");
  const outJsonPath = path.join(tmpDir, "report.json");
  const outMdPath = path.join(tmpDir, "report.md");
  try {
    fs.writeFileSync(inputPath, JSON.stringify(makeSampleObservations()), "utf8");
    execFileSync(process.execPath, [SCRIPT_PATH, "--input", inputPath, "--format", "json", "--out", outJsonPath], { encoding: "utf8" });
    const parsed = JSON.parse(fs.readFileSync(outJsonPath, "utf8"));
    assert.equal(parsed.windows[0].availabilityPct, 100);
    assert.equal(parsed.windows[1].availabilityPct, 50);

    const cliResult = runCli(["--input", inputPath, "--format", "md", "--out", outMdPath]);
    assert.equal(cliResult.outputPath, outMdPath);
    const md = fs.readFileSync(outMdPath, "utf8");
    assert.ok(md.includes("| 24h | 1 | 0 | 0.00% | 0.00 |"));
    assert.throws(() => runCli(["--input", path.join(tmpDir, "missing.json")]), /Não foi possível ler/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
