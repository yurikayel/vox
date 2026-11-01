import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createNodeHealthRecord, validateNodeHealthRecord, NODE_STATUS } from "../client/js/node-health-model.js";
import { classifyNodeStatus, selectBestHealthyNode, LATENCY_THRESHOLDS } from "../client/js/node-health-evaluator.js";
import { getNodeHealthLabelPtBr, getNodeHealthAriaLabel, formatLatency } from "../client/js/node-health-ux.js";
import { renderNodeHealthBadgeHtml, renderNodeHealthListHtml } from "../client/js/render/node-health-badge.js";
import { getNodeHealthState, updateNodeHealthRecord, updateBatchNodeHealth, subscribeNodeHealth, clearNodeHealthState } from "../client/js/node-health-state.js";

test("node-health-model - createNodeHealthRecord gera modelo válido e sanitizado", () => {
  const rec = createNodeHealthRecord({
    url: "  https://relay.vox.org  ",
    latencyMs: 120.4,
    status: NODE_STATUS.HEALTHY,
  });

  assert.equal(rec.url, "https://relay.vox.org");
  assert.equal(rec.latencyMs, 120);
  assert.equal(rec.status, NODE_STATUS.HEALTHY);
  assert.equal(rec.error, null);
  assert.ok(typeof rec.timestamp === "number");
  assert.equal(validateNodeHealthRecord(rec), true);
});

test("node-health-model - validateNodeHealthRecord rejeita registros inválidos", () => {
  assert.equal(validateNodeHealthRecord(null), false);
  assert.equal(validateNodeHealthRecord({}), false);
  assert.equal(validateNodeHealthRecord({ url: "" }), false);
  assert.equal(validateNodeHealthRecord({ url: "https://test.io", status: "invalid_status", timestamp: 12345 }), false);
});

test("node-health-evaluator - classifyNodeStatus aplica thresholds semafóricos com rigor", () => {
  assert.equal(classifyNodeStatus(150), NODE_STATUS.HEALTHY);
  assert.equal(classifyNodeStatus(LATENCY_THRESHOLDS.HEALTHY_MAX_MS - 1), NODE_STATUS.HEALTHY);
  assert.equal(classifyNodeStatus(300), NODE_STATUS.DEGRADED);
  assert.equal(classifyNodeStatus(1199), NODE_STATUS.DEGRADED);
  assert.equal(classifyNodeStatus(1200), NODE_STATUS.OFFLINE);
  assert.equal(classifyNodeStatus(150, "network_failure"), NODE_STATUS.OFFLINE);
  assert.equal(classifyNodeStatus(null), NODE_STATUS.OFFLINE);
});

test("node-health-evaluator - selectBestHealthyNode elege nó com menor latência", () => {
  const n1 = createNodeHealthRecord({ url: "n1", latencyMs: 500, status: NODE_STATUS.DEGRADED });
  const n2 = createNodeHealthRecord({ url: "n2", latencyMs: 80, status: NODE_STATUS.HEALTHY });
  const n3 = createNodeHealthRecord({ url: "n3", latencyMs: 25, status: NODE_STATUS.OFFLINE });

  const best = selectBestHealthyNode([n1, n2, n3]);
  assert.equal(best.url, "n2");
  assert.equal(selectBestHealthyNode([]), null);
  assert.equal(selectBestHealthyNode([n3]), null);
});

test("node-health-ux - formatação amigável e acessibilidade", () => {
  assert.equal(getNodeHealthLabelPtBr(NODE_STATUS.HEALTHY), "Ótima conexão");
  assert.equal(getNodeHealthLabelPtBr(NODE_STATUS.DEGRADED), "Conexão lenta");
  assert.equal(getNodeHealthLabelPtBr(NODE_STATUS.OFFLINE), "Indisponível");

  assert.equal(formatLatency(42.3), "42ms");
  assert.equal(formatLatency(null), "--");

  const aria = getNodeHealthAriaLabel({ url: "wss://node.io", status: NODE_STATUS.HEALTHY, latencyMs: 45 });
  assert.equal(aria, "Nó wss://node.io: Ótima conexão (45ms)");
});

test("node-health-render - renderNodeHealthBadgeHtml e listagem visual", () => {
  const rec = createNodeHealthRecord({ url: "https://node.io", status: NODE_STATUS.HEALTHY, latencyMs: 40 });
  const badgeHtml = renderNodeHealthBadgeHtml(rec);

  assert.ok(badgeHtml.includes("status-healthy"));
  assert.ok(badgeHtml.includes("40ms"));
  assert.ok(badgeHtml.includes("Ótima conexão"));

  const listHtml = renderNodeHealthListHtml([rec]);
  assert.ok(listHtml.includes("node-health-list"));
  assert.ok(listHtml.includes("https://node.io"));

  const emptyHtml = renderNodeHealthListHtml([]);
  assert.ok(emptyHtml.includes("node-health-empty"));
});

test("node-health-state - reatividade e assinaturas em memória", () => {
  clearNodeHealthState();
  let calls = 0;
  const unsub = subscribeNodeHealth((list) => {
    calls++;
  });

  const recA = createNodeHealthRecord({ url: "https://a.org", status: NODE_STATUS.HEALTHY, latencyMs: 50 });
  const recB = createNodeHealthRecord({ url: "https://b.org", status: NODE_STATUS.DEGRADED, latencyMs: 400 });

  updateNodeHealthRecord(recA);
  assert.equal(calls, 1);
  assert.equal(getNodeHealthState().length, 1);

  updateBatchNodeHealth([recA, recB]);
  assert.equal(calls, 2);
  assert.equal(getNodeHealthState().length, 2);

  unsub();
  updateNodeHealthRecord(recB);
  assert.equal(calls, 2);
});
