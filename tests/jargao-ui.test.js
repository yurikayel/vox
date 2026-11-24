import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as i18n from "../client/js/i18n-pt-br.js";
import { renderStatusPage } from "../client/js/render/status.js";
import { renderPactModalHtml } from "../client/js/render/welcome-pact.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const statusScreenSrc = fs.readFileSync(path.join(here, "../client/js/app/screens-status-view.js"), "utf8");

const JARGON = [
  /\bgossip\b/i,
  /GOSSIP_/,
  /verifyPayload/i,
  /\bIndexedDB\b/i,
  /\bService Worker\b/i,
  /\bWebRTC\b/i,
  /PM-18/,
  /\bRelay HTTP\b/i,
];

function flatUserCopy(text) {
  return JARGON.every((re) => !re.test(text));
}

function fakeMain() {
  return {
    _html: "",
    set innerHTML(v) {
      this._html = v;
    },
    get innerHTML() {
      return this._html || "";
    },
  };
}

test("jargão UI — i18n sem termos internos de malha", () => {
  const blob = Object.values(i18n).filter((v) => typeof v === "string").join("\n");
  assert.ok(flatUserCopy(blob), "microcopy i18n não deve citar gossip, verifyPayload ou códigos de protocolo");
  assert.match(i18n.listingVerifiedBadgeTitle, /conferida neste aparelho/i);
  assert.match(i18n.localMutateEditDeleteTooltip, /aparelhos online/i);
  assert.doesNotMatch(i18n.meshDiscoverableHint, /opt-in/i);
});

test("jargão UI — pacto de boas-vindas sem infra na superfície", () => {
  const html = renderPactModalHtml();
  assert.ok(flatUserCopy(html));
  assert.match(html, /limite diário de internet/i);
});

test("jargão UI — tela de status em português claro", () => {
  const main = fakeMain();
  renderStatusPage(main, {
    gatewayHealth: { state: "all_ok", gateways: {} },
    relayStatus: { online: true },
    rtcStatus: { remotePeersConnected: 2 },
    signalingStats: {
      channels: { ws: { attempts: 1, ok: 1, fail: 0 }, nostr: { attempts: 0, ok: 0, fail: 0 } },
      peers: { ws: { attempts: 1, ok: 1, fail: 0 }, nostr: { attempts: 0, ok: 0, fail: 0 } },
      firstPeer: { count: 1, lastMs: 120, avgMs: 120, medianMs: 120 },
    },
  });
  const html = main.innerHTML;
  assert.ok(flatUserCopy(html), "HTML de #/status sem jargão de implementação na superfície");
  assert.ok(html.includes("Como está este aparelho na rede"));
  assert.ok(html.includes("2 aparelhos"));
  assert.ok(html.includes("P-256 (ECDSA)"), "algoritmo honesto continua visível");
  assert.ok(html.includes("Canal WebSocket"), "rótulo técnico de diagnóstico permanece na tabela");
});

test("jargão UI — loading de status sem nó", () => {
  assert.match(statusScreenSrc, /Medindo como este aparelho está na rede/);
  assert.doesNotMatch(statusScreenSrc, /saúde do nó/i);
});