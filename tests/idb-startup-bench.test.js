/**
 * @file Testes unitários para scripts/idb-startup-bench.mjs (LAN-23).
 * Valida gerador sintético determinístico, parsing de flags CLI, contrato JSON com fator 3x
 * e formatação textual, sem jamais rotular dados sintéticos em RAM como latência de IndexedDB.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  BENCH_ENGINE,
  ANDROID_ENTRY_CPU_FACTOR,
  ANDROID_CPU_NOTE,
  DEFAULT_BENCH_OPTIONS,
  createSeededRng,
  generateSyntheticDataset,
  parseBenchArgs,
  buildBenchReport,
  formatBenchSummary,
} from "../scripts/idb-startup-bench.mjs";

test("createSeededRng produz sequência determinística em [0, 1) para semente fixa", () => {
  const rngA = createSeededRng(42);
  const rngB = createSeededRng(42);
  const rngC = createSeededRng(43);

  const seqA = Array.from({ length: 10 }, () => rngA());
  const seqB = Array.from({ length: 10 }, () => rngB());
  const seqC = Array.from({ length: 10 }, () => rngC());

  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, seqC);
  for (const val of seqA) {
    assert.ok(val >= 0 && val < 1, `Valor fora de [0, 1): ${val}`);
  }
  const defaultRng = createSeededRng();
  assert.equal(defaultRng(), createSeededRng(DEFAULT_BENCH_OPTIONS.seed)());
});

test("generateSyntheticDataset é 100% determinístico com semente fixa e respeita schema", () => {
  const dsA = generateSyntheticDataset({ authors: 4, perAuthor: 5, seed: 12345 });
  const dsB = generateSyntheticDataset({ authors: 4, perAuthor: 5, seed: 12345 });
  const dsOther = generateSyntheticDataset({ authors: 4, perAuthor: 5, seed: 99999 });

  assert.deepEqual(dsA, dsB);
  assert.notDeepEqual(dsA.posts, dsOther.posts);
  assert.equal(dsA.totalPosts, 20);
  assert.equal(dsA.posts.length, 20);
  assert.equal(dsA.seed, 12345);

  const topicIds = new Set();
  let prevTs = 0;
  for (const post of dsA.posts) {
    assert.ok(post.id.startsWith("bench-12345-"));
    assert.ok(post.type === "topic" || post.type === "reply");
    assert.ok(post.author.startsWith("vx_bench_"));
    assert.ok(post.ts > prevTs);
    assert.equal(post.sigv, 2);
    assert.ok(post.body.includes("#"));
    if (post.type === "topic") topicIds.add(post.id);
    if (post.type === "reply") assert.ok(topicIds.has(post.replyTo));
    prevTs = post.ts;
  }
});

test("generateSyntheticDataset usa defaults e rejeita parâmetros inválidos", () => {
  const def = generateSyntheticDataset();
  assert.equal(def.authors, DEFAULT_BENCH_OPTIONS.authors);
  assert.equal(def.perAuthor, DEFAULT_BENCH_OPTIONS.perAuthor);
  assert.equal(def.totalPosts, DEFAULT_BENCH_OPTIONS.authors * DEFAULT_BENCH_OPTIONS.perAuthor);

  assert.throws(() => generateSyntheticDataset({ authors: 0 }), RangeError);
  assert.throws(() => generateSyntheticDataset({ authors: 1.5 }), RangeError);
  assert.throws(() => generateSyntheticDataset({ perAuthor: 0 }), RangeError);
  assert.throws(() => generateSyntheticDataset({ perAuthor: -3 }), RangeError);
});

test("parseBenchArgs interpreta flags separadas, formato --flag=valor e defaults", () => {
  assert.deepEqual(parseBenchArgs(), DEFAULT_BENCH_OPTIONS);

  const spaced = parseBenchArgs([
    "--authors", "12",
    "--per-author", "8",
    "--seed", "77",
    "--verify-sample", "10",
    "--json",
  ]);
  assert.deepEqual(spaced, {
    authors: 12,
    perAuthor: 8,
    seed: 77,
    verifySampleSize: 10,
    json: true,
  });

  const equalsForm = parseBenchArgs([
    "--authors=5",
    "--per-author=4",
    "--seed=0",
    "--verify-sample=3",
  ]);
  assert.deepEqual(equalsForm, {
    authors: 5,
    perAuthor: 4,
    seed: 0,
    verifySampleSize: 3,
    json: false,
  });
});

test("parseBenchArgs rejeita flags desconhecidas e valores fora do intervalo", () => {
  assert.throws(() => parseBenchArgs(["--unknown", "1"]), RangeError);
  assert.throws(() => parseBenchArgs(["--authors"]), RangeError);
  assert.throws(() => parseBenchArgs(["--authors", "0"]), RangeError);
  assert.throws(() => parseBenchArgs(["--per-author", "abc"]), RangeError);
  assert.throws(() => parseBenchArgs(["--seed", "-1"]), RangeError);
  assert.throws(() => parseBenchArgs(["--verify-sample", "0"]), RangeError);
});

test("buildBenchReport valida contrato JSON, engine e estimativa Android 3x CPU", () => {
  const report = buildBenchReport({
    config: { authors: 10, perAuthor: 20, totalPosts: 200, seed: 20261124, verifySampleSize: 15 },
    metrics: {
      initialWriteMs: 42.126,
      coldOpenMs: 5.5,
      firstFeedReadMs: 12.334,
      warmFeedReadMs: 3.1,
      verifySampleMs: 18.2,
      sha256SampleMs: 1.45,
      feedPostCount: 200,
      verifiedCount: 15,
    },
    environment: {
      browserVersion: "131.0.0.0",
      platform: "linux",
      nodeVersion: "v22.0.0",
      recordedAt: "2026-11-24T20:00:00.000Z",
    },
  });

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.engine, BENCH_ENGINE);
  assert.equal(report.engine, "chromium-indexeddb");
  assert.equal(report.measurementType, "real-browser-indexeddb");
  assert.equal(report.recordedAt, "2026-11-24T20:00:00.000Z");
  assert.equal(report.metrics.initialWriteMs, 42.13);
  assert.equal(report.metrics.startupTotalMs, 36.03);
  assert.equal(report.metrics.feedPostCount, 200);
  assert.equal(report.metrics.verifiedCount, 15);

  const est = report.androidEntryEstimateMs;
  assert.equal(est.cpuFactor, ANDROID_ENTRY_CPU_FACTOR);
  assert.equal(est.cpuFactor, 3);
  assert.equal(est.note, ANDROID_CPU_NOTE);
  assert.match(est.note, /3x/);
  assert.equal(est.coldOpenMs, 16.5);
  assert.equal(est.firstFeedReadMs, 36.99);
  assert.equal(est.startupTotalMs, 108.09);
});

test("buildBenchReport aplica defaults de environment e rejeita métricas inválidas", () => {
  const minimal = buildBenchReport({
    config: { authors: 1, perAuthor: 1, totalPosts: 1, seed: 1, verifySampleSize: 1 },
    metrics: {
      initialWriteMs: 1,
      coldOpenMs: 1,
      firstFeedReadMs: 1,
      warmFeedReadMs: 1,
      verifySampleMs: 1,
      sha256SampleMs: 1,
    },
  });
  assert.equal(minimal.environment.browserVersion, "unknown");
  assert.equal(minimal.metrics.feedPostCount, 0);
  assert.equal(minimal.metrics.verifiedCount, 0);

  assert.throws(() => buildBenchReport({ config: {}, metrics: null }), TypeError);
  assert.throws(() => buildBenchReport({
    config: {},
    metrics: { initialWriteMs: -1, coldOpenMs: 1, firstFeedReadMs: 1, warmFeedReadMs: 1, verifySampleMs: 1, sha256SampleMs: 1 },
  }), TypeError);
  assert.throws(() => buildBenchReport({
    config: {},
    metrics: { initialWriteMs: Number.NaN, coldOpenMs: 1, firstFeedReadMs: 1, warmFeedReadMs: 1, verifySampleMs: 1, sha256SampleMs: 1 },
  }), TypeError);
});

test("formatBenchSummary exibe motor, dataset, tempos medidos e nota de fator 3x", () => {
  const report = buildBenchReport({
    config: { authors: 5, perAuthor: 10, totalPosts: 50, seed: 9, verifySampleSize: 5 },
    metrics: {
      initialWriteMs: 10,
      coldOpenMs: 2,
      firstFeedReadMs: 4,
      warmFeedReadMs: 1,
      verifySampleMs: 6,
      sha256SampleMs: 0.5,
      feedPostCount: 50,
      verifiedCount: 5,
    },
  });
  const text = formatBenchSummary(report);
  assert.match(text, /chromium-indexeddb/);
  assert.match(text, /5 autores x 10 posts = 50 posts \(seed=9\)/);
  assert.match(text, /Android 3x:/);
  assert.match(text, /5\/5 ECDSA/);
  assert.match(text, /Nota \(3x CPU\):/);
});
