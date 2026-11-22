import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  aggregateFieldReports,
  renderFieldReportMarkdown,
  runCli,
  sanitizeFieldReport,
} from "../scripts/mobile-field-report.mjs";

const SAMPLE_REPORTS = [
  {
    deviceModel: "Moto G22",
    os: "Android 12",
    browser: "Chrome 130",
    ramGb: 4,
    networkType: "4G",
    steps: [
      { id: "open_pwa", ok: true, durationMs: 1800 },
      { id: "offline_reload", ok: true, durationMs: 400 },
    ],
    signaling: { wsAttempts: 2, wsSuccess: 2, nostrAttempts: 2, nostrSuccess: 1, connectMs: 1200 },
    readOrigins: { cache: 10, p2p: 5, relay: 5, gateway: 0, unknown: 0 },
  },
  {
    deviceModel: "iPhone SE",
    os: "iOS 17",
    browser: "Safari 17",
    ramGb: 3,
    networkType: "wifi",
    steps: [
      { id: "open_pwa", ok: true, durationMs: 1200 },
      { id: "offline_reload", ok: false, durationMs: 900 },
    ],
    signaling: { wsAttempts: 2, wsSuccess: 1, nostrAttempts: 2, nostrSuccess: 2, connectMs: 2000 },
    readOrigins: { cache: 6, p2p: 4, relay: 0, gateway: 10, unknown: 0 },
  },
];

test("PM-73 + CODE-02: agrega taxas por passo, sinalização e read_origin corretamente", () => {
  const summary = aggregateFieldReports(SAMPLE_REPORTS);
  assert.equal(summary.totalReports, 2);
  const open = summary.steps.find((s) => s.id === "open_pwa");
  const off = summary.steps.find((s) => s.id === "offline_reload");
  assert.equal(open.passRatePct, 100);
  assert.equal(open.medianDurationMs, 1500);
  assert.equal(off.passRatePct, 50);
  assert.equal(summary.signaling.wsSuccessPct, 75);
  assert.equal(summary.signaling.nostrSuccessPct, 75);
  assert.equal(summary.signaling.medianConnectMs, 1600);
  assert.equal(summary.readOrigins.totalReads, 40);
  assert.equal(summary.readOrigins.breakdown.cache.pct, 40);
  assert.equal(summary.readOrigins.breakdown.gateway.pct, 25);
});

test("PM-73: não vaza nenhum campo PII injetado na entrada nem no Markdown", () => {
  const tainted = {
    ...SAMPLE_REPORTS[0],
    name: "Maria Silva",
    email: "maria.silva@example.org",
    phone: "+55 11 99999-8888",
    ip: "203.0.113.42",
    pubkey: "vx_segredo_pessoal",
    notes: "Rua das Flores 123",
  };
  const sanitized = sanitizeFieldReport(tainted);
  const summary = aggregateFieldReports([tainted]);
  const md = renderFieldReportMarkdown(summary);
  const combined = `${JSON.stringify(sanitized)}\n${JSON.stringify(summary)}\n${md}`;
  for (const secret of ["Maria Silva", "maria.silva@example.org", "99999-8888", "203.0.113.42", "vx_segredo", "Rua das Flores"]) {
    assert.equal(combined.includes(secret), false, `PII vazado: ${secret}`);
  }
});

test("PM-73 + CODE-02: lida com lista vazia e zero leituras sem NaN e rejeita malformados", () => {
  const summary = aggregateFieldReports([]);
  assert.equal(summary.totalReports, 0);
  assert.equal(summary.readOrigins.totalReads, 0);
  assert.equal(summary.readOrigins.breakdown.p2p.pct, null);
  assert.equal(summary.signaling.wsSuccessPct, null);
  assert.equal(summary.signaling.medianConnectMs, null);
  assert.equal(renderFieldReportMarkdown(summary).includes("NaN"), false);
  assert.throws(() => aggregateFieldReports({}), /array/);
  assert.throws(() => sanitizeFieldReport(null), /objeto/);
});

test("PM-73 + CODE-02: executa CLI ponta a ponta nos formatos md e json", () => {
  const dir = mkdtempSync(join(tmpdir(), "vox-pm73-"));
  try {
    const inPath = join(dir, "in.json");
    const mdPath = join(dir, "out.md");
    const jsonPath = join(dir, "out.json");
    writeFileSync(inPath, JSON.stringify(SAMPLE_REPORTS), "utf8");
    const r1 = runCli(["--input", inPath, "--format", "md", "--out", mdPath]);
    assert.equal(r1.code, 0);
    assert.match(readFileSync(mdPath, "utf8"), /PM-73.*CODE-02/);
    const r2 = runCli(["--input", inPath, "--format", "json", "--out", jsonPath]);
    assert.equal(r2.code, 0);
    assert.equal(JSON.parse(readFileSync(jsonPath, "utf8")).totalReports, 2);
    assert.equal(runCli(["--input", join(dir, "ausente.json")]).code, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
