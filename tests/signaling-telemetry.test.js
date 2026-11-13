import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SIGNALING_TELEMETRY_KEY,
  recordSignalingDial,
  recordPeerPathOutcome,
  recordFirstPeerLatency,
  getSignalingTelemetrySummary,
  formatSignalingReport,
  resetSignalingTelemetry,
} from "../client/js/signaling-telemetry.js";
import { createNostrTransport } from "../client/js/nostr-transport.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("PM-18: registra canais ws/nostr, ignora caminho desconhecido e calcula média", () => {
  resetSignalingTelemetry();
  assert.equal(recordSignalingDial("ws", { ok: true, durationMs: 120 }), true);
  assert.equal(recordSignalingDial("ws", { ok: false }), true);
  assert.equal(recordSignalingDial("nostr", { ok: true, durationMs: 300 }), true);
  assert.equal(recordSignalingDial("carrier-pigeon", { ok: true }), false);

  const summary = getSignalingTelemetrySummary();
  assert.deepEqual(summary.channels.ws, {
    attempts: 2,
    ok: 1,
    fail: 1,
    successRatePct: 50,
    avgConnectMs: 120,
    lastConnectMs: 120,
  });
  assert.equal(summary.channels.nostr.ok, 1);
  assert.equal(summary.channels.nostr.successRatePct, 100);
});

test("PM-18: registra desfecho de pares WebRTC e latência/mediana do primeiro par", () => {
  resetSignalingTelemetry();
  recordPeerPathOutcome("nostr", { ok: true, durationMs: 420 });
  recordPeerPathOutcome("nostr", { ok: true, durationMs: 620 });
  recordPeerPathOutcome("ws", { ok: false });

  recordFirstPeerLatency(900);
  recordFirstPeerLatency(300);
  recordFirstPeerLatency(500);
  recordFirstPeerLatency(-10);

  const summary = getSignalingTelemetrySummary();
  assert.equal(summary.peers.nostr.ok, 2);
  assert.equal(summary.peers.nostr.avgConnectMs, 520);
  assert.equal(summary.peers.ws.fail, 1);
  assert.equal(summary.firstPeer.count, 3);
  assert.equal(summary.firstPeer.medianMs, 500);
  assert.equal(summary.firstPeer.lastMs, 500);
});

test("PM-18: formata relatório limpo sem IDs e tolera storage corrompido", () => {
  localStorage.setItem(SIGNALING_TELEMETRY_KEY, "{lixo-json");
  const clean = getSignalingTelemetrySummary();
  assert.equal(clean.channels.ws.attempts, 0);
  assert.equal(clean.firstPeer.count, 0);

  recordSignalingDial("ws", { ok: true, durationMs: 80 });
  recordFirstPeerLatency(250);
  const report = formatSignalingReport(getSignalingTelemetrySummary(), { swVersion: "vox-pwa-v7.103" });
  assert.ok(report.includes("Sinalização Vox (PM-18 · vox-pwa-v7.103)"));
  assert.ok(report.includes("Canal WebSocket: tentativas=1, sucessos=1"));
  assert.ok(report.includes("Primeiro par conectado: amostras=1, ultimo=250ms"));
  assert.ok(!report.includes("vx_"));

  resetSignalingTelemetry();
  assert.equal(localStorage.getItem(SIGNALING_TELEMETRY_KEY), null);
});

test("PM-18: createNostrTransport reporta onRelayAttempt em sucesso e falha antes de abrir", () => {
  const attempts = [];
  class FakeWS {
    constructor(url) {
      this.url = url;
      setTimeout(() => (url.includes("ok") ? this.onopen?.() : this.onclose?.()), 0);
    }
    send() {}
    close() {}
  }
  const t = createNostrTransport({
    relays: ["wss://relay-ok.example", "wss://relay-fail.example"],
    peerId: "peer_a",
    onMessage: () => {},
    onRelayAttempt: (ev) => attempts.push(ev),
    WebSocketImpl: FakeWS,
    reconnectBaseMs: 5000,
  });
  t.start();
  return new Promise((resolve) => {
    setTimeout(() => {
      t.stop();
      assert.equal(attempts.length, 2);
      assert.ok(attempts.some((a) => a.ok === true));
      assert.ok(attempts.some((a) => a.ok === false));
      resolve();
    }, 20);
  });
});

test("PM-18: módulo está no precache do SW e ligado ao webrtc-peer e screens-status", () => {
  const sw = fs.readFileSync(path.join(ROOT, "client", "sw.js"), "utf8");
  const peer = fs.readFileSync(path.join(ROOT, "client", "js", "webrtc-peer.js"), "utf8");
  const statusScreen = fs.readFileSync(path.join(ROOT, "client", "js", "app", "screens-status.js"), "utf8");
  assert.ok(sw.includes('"./js/signaling-telemetry.js"'));
  assert.ok(peer.includes("./signaling-telemetry.js"));
  assert.ok(statusScreen.includes("status-copy-signaling-btn"));
});
