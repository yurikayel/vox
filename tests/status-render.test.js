import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as render from "../client/js/render.js";

function createContainer() {
  return { innerHTML: "" };
}

test("renderStatusPage - shows gateway state and relay", () => {
  const main = createContainer();
  Object.defineProperty(main, "innerHTML", {
    set(v) {
      this._html = v;
    },
    get() {
      return this._html || "";
    },
  });
  render.renderStatusPage(main, {
    gatewayHealth: { state: "degraded", gateways: { arweave_net: { ok: 1, fail: 3 } } },
    relayStatus: { online: false },
    relayHttpUrl: "http://127.0.0.1:8787",
  });
  assert.ok(main.innerHTML.includes("Instável"), "estado da leitura em palavras, não o código interno");
  assert.ok(!main.innerHTML.includes(">degraded<"));
  assert.ok(main.innerHTML.includes("arweave_net"));
  assert.ok(main.innerHTML.includes("Offline"));
  assert.ok(main.innerHTML.includes("Espelho relay"));
});

test("renderStatusPage - mirror_last_error exportável", () => {
  const main = createContainer();
  Object.defineProperty(main, "innerHTML", {
    set(v) {
      this._html = v;
    },
    get() {
      return this._html || "";
    },
  });
  render.renderStatusPage(main, {
    gatewayHealth: { state: "all_ok", gateways: {} },
    relayStatus: { online: true },
    relayHttpUrl: "http://127.0.0.1:3920",
    mirrorExport: {
      mirror_last_error: "mirror.community_id_invalid",
      mirror_last_error_at: "2026-10-25T12:00:00.000Z",
      mirror_last_error_community: "bad/id",
    },
  });
  assert.ok(main.innerHTML.includes("mirror.community_id_invalid"));
});

test("renderStatusPage - exibe tabela WebSocket vs Nostr e tempo até conectar (PM-18)", () => {
  const main = createContainer();
  Object.defineProperty(main, "innerHTML", {
    set(v) {
      this._html = v;
    },
    get() {
      return this._html || "";
    },
  });
  render.renderStatusPage(main, {
    gatewayHealth: { state: "all_ok", gateways: {} },
    relayStatus: { online: false },
    signalingStats: {
      channels: {
        ws: { attempts: 3, ok: 2, fail: 1, avgConnectMs: 110 },
        nostr: { attempts: 4, ok: 4, fail: 0, avgConnectMs: 240 },
      },
      peers: {
        ws: { attempts: 1, ok: 1, fail: 0, avgConnectMs: 310 },
        nostr: { attempts: 2, ok: 1, fail: 1, avgConnectMs: 450 },
      },
      firstPeer: { count: 2, lastMs: 450, avgMs: 380, medianMs: 380 },
    },
  });
  assert.ok(main.innerHTML.includes("Canal WebSocket"));
  assert.ok(main.innerHTML.includes("Canal Nostr"));
  assert.ok(main.innerHTML.includes("450 ms"));
  assert.ok(main.innerHTML.includes("status-copy-signaling-btn"));
});
