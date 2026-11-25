/**
 * @file PM-75 — Testes da métrica local-only de disponibilidade offline (1 h / 6 h / 24 h) em `#/status`.
 */
import "./setup.js";
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { installFakeDom } from "./helpers/cov-t1-dom.mjs";
import { computeAvailabilityMetrics as computeScriptMetrics } from "../scripts/availability-metrics.mjs";
import {
  AVAILABILITY_STORAGE_KEY,
  buildAvailabilityExportPayload,
  computeAvailabilityMetrics,
  formatAvailabilityReport,
  getAvailabilityMetricsSummary,
  loadAvailabilityObservations,
  resetAvailabilityObservations,
  saveAvailabilityObservations,
} from "../client/js/availability-metrics.js";
import * as render from "../client/js/render.js";
import * as localAccount from "../client/js/identity/index.js";
import { buildStatusDiagnosticReport, showStatus } from "../client/js/app/screens-status.js";
import { waitUntil } from "./helpers/wait-until.js";

const HOUR_MS = 3_600_000;
const BASE_MS = Date.UTC(2026, 10, 1, 12, 0, 0);

const dom = installFakeDom();
const realNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const realFetch = globalThis.fetch;

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

function setEnv({ clipboard } = {}) {
  Object.defineProperty(globalThis, "navigator", { value: { clipboard }, configurable: true, writable: true });
  globalThis.fetch = async () => {
    throw new Error("offline");
  };
  globalThis.caches = undefined;
}

function addStatusEls() {
  return {
    cache: dom.add("status-sw-cache"),
    copySignaling: dom.add("status-copy-signaling-btn"),
    resetSignaling: dom.add("status-reset-signaling-btn"),
    signalingFeedback: dom.add("status-signaling-feedback"),
    copyAvailability: dom.add("status-copy-availability-btn"),
    resetAvailability: dom.add("status-reset-availability-btn"),
    availabilityFeedback: dom.add("status-availability-feedback"),
    label: dom.add("status-storage-label"),
    bar: dom.add("status-storage-bar"),
  };
}

afterEach(() => {
  Object.defineProperty(globalThis, "navigator", realNavigator);
  globalThis.fetch = realFetch;
  delete globalThis.caches;
  resetAvailabilityObservations();
  dom.reset();
});

test("PM-75 UI: cálculo 1 h / 6 h / 24 h no cliente tem paridade exata com scripts/availability-metrics.mjs", () => {
  const sample = makeSampleObservations();
  const clientReport = computeAvailabilityMetrics(sample);
  const scriptReport = computeScriptMetrics(sample);
  assert.deepEqual(clientReport, scriptReport);

  const emptyClient = computeAvailabilityMetrics({ posts: [], probes: [] });
  const emptyScript = computeScriptMetrics({ posts: [], probes: [] });
  assert.deepEqual(emptyClient, emptyScript);
});

test("PM-75 UI: persistência local-only em localStorage tolera JSON corrompido e limpa no reset", () => {
  const sample = makeSampleObservations();
  assert.equal(saveAvailabilityObservations(sample), true);
  const summary = getAvailabilityMetricsSummary();
  assert.equal(summary.windows[0].availabilityPct, 100);
  assert.equal(summary.windows[1].availabilityPct, 50);
  assert.equal(summary.windows[2].availabilityPct, 0);

  globalThis.localStorage.setItem(AVAILABILITY_STORAGE_KEY, "{json-quebrado");
  assert.deepEqual(loadAvailabilityObservations(), { posts: [], probes: [] });

  saveAvailabilityObservations(sample);
  resetAvailabilityObservations();
  assert.equal(getAvailabilityMetricsSummary().totalPosts, 0);
});

test("PM-75 UI: renderStatusPage exibe 1 h / 6 h / 24 h com dados e escapa HTML", () => {
  const main = { innerHTML: "" };
  const report = computeAvailabilityMetrics(makeSampleObservations());
  render.renderStatusPage(main, {
    gatewayHealth: { state: "all_ok", gateways: {} },
    relayStatus: { online: false },
    availabilityReport: report,
  });

  assert.ok(main.innerHTML.includes("status-availability-card"));
  assert.ok(main.innerHTML.includes("zero telemetria central"));
  assert.ok(main.innerHTML.includes("1 h"));
  assert.ok(main.innerHTML.includes("6 h"));
  assert.ok(main.innerHTML.includes("24 h"));
  assert.ok(main.innerHTML.includes("100.00%"));
  assert.ok(main.innerHTML.includes("50.00%"));
  assert.ok(main.innerHTML.includes("0.00%"));
  assert.ok(main.innerHTML.includes("66.67%"));
});

test("PM-75 UI: renderStatusPage trata zero posts / sem dados sem NaN", () => {
  const main = { innerHTML: "" };
  render.renderStatusPage(main, {
    gatewayHealth: { state: "all_ok", gateways: {} },
    relayStatus: { online: false },
    availabilityReport: computeAvailabilityMetrics({ posts: [], probes: [] }),
  });

  assert.ok(main.innerHTML.includes("status-availability-card"));
  assert.ok(main.innerHTML.includes("Sem posts elegíveis medidos"));
  assert.ok(main.innerHTML.includes("1 h"));
  assert.ok(main.innerHTML.includes("6 h"));
  assert.ok(main.innerHTML.includes("24 h"));
  assert.ok(main.innerHTML.includes("N/A"));
  assert.equal(main.innerHTML.includes("NaN"), false);
});

test("PM-75 UI: export local-only e relatório de diagnóstico incluem janelas 1 h / 6 h / 24 h", () => {
  const report = computeAvailabilityMetrics(makeSampleObservations());
  const payload = buildAvailabilityExportPayload(report);
  assert.equal(payload.localOnly, true);
  assert.equal(payload.windows.length, 3);
  assert.equal(payload.windows[1].availabilityPct, 50);

  const text = formatAvailabilityReport(report);
  assert.match(text, /local-only, zero telemetria central/);
  assert.match(text, /Janela 1 h: 100\.00%/);
  assert.match(text, /Janela 6 h: 50\.00%/);
  assert.match(text, /Janela 24 h: 0\.00%/);

  const diagnostic = buildStatusDiagnosticReport({ swVersion: "vox-pwa-v9", availabilityReport: report });
  assert.match(diagnostic, /vox-pwa-v9/);
  assert.match(diagnostic, /PM-75/);
  assert.match(diagnostic, /Janela 6 h: 50\.00%/);
});

test("PM-75 UI: showStatus renderiza métricas, copia diagnóstico e zera observações locais", async () => {
  await localAccount.ensureLocalAccount();
  saveAvailabilityObservations(makeSampleObservations());
  const copied = [];
  setEnv({
    clipboard: {
      writeText: async (text) => {
        copied.push(text);
      },
    },
  });
  const els = addStatusEls();
  await showStatus();

  assert.match(dom.main.innerHTML, /100\.00%/);
  assert.match(dom.main.innerHTML, /50\.00%/);
  await els.copySignaling.onclick();
  assert.equal(copied.length, 1);
  assert.match(copied[0], /PM-75/);
  assert.match(copied[0], /Janela 1 h: 100\.00%/);

  await els.copyAvailability.onclick();
  assert.equal(copied.length, 2);
  assert.match(copied[1], /zero telemetria central/);
  assert.match(els.availabilityFeedback.textContent, /copiadas/i);

  els.resetAvailability.onclick();
  assert.equal(getAvailabilityMetricsSummary().totalPosts, 0);
  await waitUntil(()=> /Sem posts elegíveis medidos/.test(dom.main.innerHTML));
  assert.match(dom.main.innerHTML, /Sem posts elegíveis medidos/);
});
