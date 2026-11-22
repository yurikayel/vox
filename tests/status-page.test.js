import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  escapeHtml,
  mergeHistorySnapshot,
  computeServiceStats,
  renderStatusHtml,
  runCli,
} from "../scripts/generate-status-page.mjs";

function makeSnapshot(generatedAt, checks) {
  return { generatedAt, checks };
}

test("escapeHtml escapa &, <, >, aspas duplas e simples de forma determinística", () => {
  const raw = `<script>alert("xss" & 'test')</script>`;
  assert.equal(
    escapeHtml(raw),
    "&lt;script&gt;alert(&quot;xss&quot; &amp; &#39;test&#39;)&lt;/script&gt;"
  );
  assert.equal(escapeHtml(0), "0");
  assert.equal(escapeHtml(null), "");
});

test("mergeHistorySnapshot poda entradas >30d, deduplica timestamp e ordena", () => {
  const oldSnap = makeSnapshot("2026-10-01T00:00:00Z", [
    { id: "sig", name: "Signaling", group: "signaling", url: "wss://sig.example", ok: true, latencyMs: 40, detail: "" },
  ]);
  const keptSnap = makeSnapshot("2026-11-10T00:00:00Z", [
    { id: "sig", name: "Signaling", group: "signaling", url: "wss://sig.example", ok: false, latencyMs: null, detail: "timeout" },
  ]);
  const dupOlder = makeSnapshot("2026-11-22T00:00:00.000Z", [
    { id: "sig", name: "Signaling", group: "signaling", url: "wss://sig.example", ok: false, latencyMs: null, detail: "antigo" },
  ]);
  const newerSnap = makeSnapshot("2026-11-22T00:00:00Z", [
    { id: "sig", name: "Signaling", group: "signaling", url: "wss://sig.example", ok: true, latencyMs: 25, detail: "ok" },
  ]);
  const merged = mergeHistorySnapshot([keptSnap, oldSnap, dupOlder], newerSnap, 30);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].generatedAt, "2026-11-10T00:00:00.000Z");
  assert.equal(merged[1].generatedAt, "2026-11-22T00:00:00.000Z");
  assert.equal(merged[1].checks[0].detail, "ok");
});

test("computeServiceStats calcula uptime, p50/p95 apenas em ok e status operational", () => {
  const history = [
    makeSnapshot("2026-11-18T12:00:00Z", [
      { id: "gw-turbo", name: "Turbo Gateway", group: "gateway", url: "https://turbo-gateway.com/graphql", ok: true, latencyMs: 100, detail: "" },
    ]),
    makeSnapshot("2026-11-19T12:00:00Z", [
      { id: "gw-turbo", name: "Turbo Gateway", group: "gateway", url: "https://turbo-gateway.com/graphql", ok: true, latencyMs: 200, detail: "" },
    ]),
    makeSnapshot("2026-11-20T12:00:00Z", [
      { id: "gw-turbo", name: "Turbo Gateway", group: "gateway", url: "https://turbo-gateway.com/graphql", ok: false, latencyMs: 9999, detail: "502" },
    ]),
    makeSnapshot("2026-11-22T12:00:00Z", [
      { id: "gw-turbo", name: "Turbo Gateway", group: "gateway", url: "https://turbo-gateway.com/graphql", ok: true, latencyMs: 400, detail: "" },
    ]),
  ];
  const stats = computeServiceStats(history);
  assert.equal(stats.overallStatus, "operational");
  assert.equal(stats.services[0].uptimePct, 75);
  assert.equal(stats.services[0].okChecks, 3);
  assert.equal(stats.services[0].totalChecks, 4);
  assert.equal(stats.services[0].p50Ms, 200);
  assert.equal(stats.services[0].p95Ms, 400);
  assert.equal(stats.services[0].status, "operational");
});

test("computeServiceStats detecta partial_outage, degraded e major_outage", () => {
  const partialHistory = [
    makeSnapshot("2026-11-22T10:00:00Z", [
      { id: "sig", name: "Signaling", group: "signaling", url: "wss://vox-sentinel.onrender.com", ok: false, latencyMs: null, detail: "err" },
      { id: "nostr-1", name: "damus", group: "nostr", url: "wss://relay.damus.io", ok: true, latencyMs: 80, detail: "" },
      { id: "gw-1", name: "arweave.net", group: "gateway", url: "https://arweave.net/graphql", ok: true, latencyMs: 120, detail: "" },
    ]),
    makeSnapshot("2026-11-22T12:00:00Z", [
      { id: "sig", name: "Signaling", group: "signaling", url: "wss://vox-sentinel.onrender.com", ok: true, latencyMs: 55, detail: "" },
      { id: "nostr-1", name: "damus", group: "nostr", url: "wss://relay.damus.io", ok: true, latencyMs: 75, detail: "" },
      { id: "gw-1", name: "arweave.net", group: "gateway", url: "https://arweave.net/graphql", ok: false, latencyMs: null, detail: "503" },
    ]),
  ];
  const partial = computeServiceStats(partialHistory);
  assert.equal(partial.overallStatus, "partial_outage");
  assert.equal(partial.services.find((s) => s.id === "sig").status, "degraded");
  assert.equal(partial.services.find((s) => s.id === "gw-1").status, "outage");

  const major = computeServiceStats([
    makeSnapshot("2026-11-22T12:00:00Z", [
      { id: "sig", name: "Signaling", group: "signaling", url: "wss://sig.example", ok: false, latencyMs: null, detail: "down" },
      { id: "gw-1", name: "Gateway", group: "gateway", url: "https://gw.example", ok: false, latencyMs: null, detail: "down" },
    ]),
  ]);
  assert.equal(major.overallStatus, "major_outage");
});

test("renderStatusHtml escapa payloads XSS e não inclui scripts ou links externos", () => {
  const xssHistory = [
    makeSnapshot("2026-11-22T12:00:00Z", [
      {
        id: "evil-1",
        name: `<script>alert(1)</script>`,
        group: "nostr",
        url: `wss://relay.example/" onclick="alert('x')`,
        ok: false,
        latencyMs: null,
        detail: `'><img src=x onerror=alert(2)>`,
      },
    ]),
  ];
  const html = renderStatusHtml(computeServiceStats(xssHistory), {
    title: `Vox <script>evil()</script>`,
    days: 30,
  });
  assert.match(html, /^<!DOCTYPE html>\s*<html lang="pt-BR">/);
  assert.ok(!html.includes("<script"));
  assert.ok(!html.includes("<link "));
  assert.ok(!html.includes("<img "));
  assert.ok(!html.includes("onerror=alert(2)>"));
  assert.ok(!html.includes(`onclick="alert('x')"`));
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(html.includes("&quot; onclick=&quot;alert(&#39;x&#39;)"));
  assert.ok(html.includes("<header>") && html.includes("<main>") && html.includes("<table>"));
});

test("runCli cria e atualiza history JSON e gera status.html em diretório temporário", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vox-status-"));
  try {
    const probes1 = path.join(tmpDir, "probes1.json");
    const probes2 = path.join(tmpDir, "probes2.json");
    const historyPath = path.join(tmpDir, "nested", "history.json");
    const outPath = path.join(tmpDir, "out", "status.html");

    fs.writeFileSync(probes1, JSON.stringify({
      generatedAt: "2026-10-01T00:00:00Z",
      checks: [{ id: "sig", name: "Sentinel", group: "signaling", url: "wss://vox-sentinel.onrender.com", ok: true, latencyMs: 90, detail: "" }],
    }));
    fs.writeFileSync(probes2, JSON.stringify({
      generatedAt: "2026-11-22T12:00:00Z",
      checks: [
        { id: "sig", name: "Sentinel", group: "signaling", url: "wss://vox-sentinel.onrender.com", ok: true, latencyMs: 80, detail: "" },
        { id: "turbo", name: "Turbo Gateway", group: "gateway", url: "https://turbo-gateway.com/graphql", ok: true, latencyMs: 140, detail: "" },
      ],
    }));

    runCli(["--probes", probes1, "--history", historyPath, "--out", outPath, "--days", "30"]);
    const res2 = runCli(["--probes", probes2, "--history", historyPath, "--out", outPath, "--days", "30"]);

    const savedHistory = JSON.parse(fs.readFileSync(historyPath, "utf8"));
    const renderedHtml = fs.readFileSync(outPath, "utf8");
    assert.equal(savedHistory.length, 1);
    assert.equal(res2.stats.overallStatus, "operational");
    assert.ok(renderedHtml.includes("Turbo Gateway"));
    assert.ok(renderedHtml.includes("Sentinel"));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
