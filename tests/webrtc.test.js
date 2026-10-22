import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as webrtcPeer from "../client/js/webrtc-peer.js";

test("webrtc - loadSignalingConfig carrega fallback se fetch falhar", async () => {
  const cfg = await webrtcPeer.loadSignalingConfig();
  assert.ok(cfg);
  assert.ok(Array.isArray(cfg.stun));
  assert.ok(Array.isArray(cfg.signalingUrls));
  assert.ok(cfg.maxRtcPeers >= 1);
});

test("webrtc - getSignalingUrl prioriza localStorage customizado", () => {
  localStorage.clear();
  const cfg = { signalingUrls: ["ws://127.0.0.1:3921"] };

  assert.equal(webrtcPeer.getSignalingUrl(cfg), "ws://127.0.0.1:3921");

  localStorage.setItem("vox-custom-signaling-url", "wss://comunidade.br/signal");
  assert.equal(webrtcPeer.getSignalingUrl(cfg), "wss://comunidade.br/signal");
});

test("webrtc - contagem de pares remotos e broadcast seguro", () => {
  webrtcPeer.disconnectWebRtc();
  assert.equal(webrtcPeer.getConnectedRtcPeersCount(), 0);

  // Sem pares conectados, envio direto retorna false e broadcast retorna 0
  const sent = webrtcPeer.sendVoxMessage("peer_desconhecido", { type: "WANT" });
  assert.equal(sent, false);

  const broadcastCount = webrtcPeer.broadcastRtcMessage({ type: "WANT", txId: "tx1" });
  assert.equal(broadcastCount, 0);
});
