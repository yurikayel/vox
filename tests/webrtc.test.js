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

test("webrtc - getSignalingCandidates extrai lista e descarta vazios com fallback", () => {
  localStorage.clear();
  webrtcPeer.resetSignalingIndex();

  const cfgMultiple = {
    signalingUrls: [
      "wss://node1.hf.space",
      "",
      "  wss://node2.koyeb.app  ",
      null,
      "wss://node3.onrender.com",
    ],
  };

  const candidates = webrtcPeer.getSignalingCandidates(cfgMultiple);
  assert.equal(candidates.length, 3);
  assert.equal(candidates[0], "wss://node1.hf.space");
  assert.equal(candidates[1], "wss://node2.koyeb.app");
  assert.equal(candidates[2], "wss://node3.onrender.com");

  const cfgEmpty = { signalingUrls: [] };
  const fallback = webrtcPeer.getSignalingCandidates(cfgEmpty);
  assert.deepEqual(fallback, ["ws://127.0.0.1:3921"]);
});

test("webrtc - rotateSignalingUrl alterna sequencialmente entre os nós base", () => {
  localStorage.clear();
  webrtcPeer.resetSignalingIndex();

  const cfg = {
    signalingUrls: [
      "wss://node1.hf.space",
      "wss://node2.koyeb.app",
      "wss://node3.onrender.com",
    ],
  };

  assert.equal(webrtcPeer.getSignalingUrl(cfg), "wss://node1.hf.space");
  assert.equal(webrtcPeer.getActiveSignalingIndex(), 0);

  const next1 = webrtcPeer.rotateSignalingUrl(cfg);
  assert.equal(next1, "wss://node2.koyeb.app");
  assert.equal(webrtcPeer.getActiveSignalingIndex(), 1);

  const next2 = webrtcPeer.rotateSignalingUrl(cfg);
  assert.equal(next2, "wss://node3.onrender.com");
  assert.equal(webrtcPeer.getActiveSignalingIndex(), 2);

  const next3 = webrtcPeer.rotateSignalingUrl(cfg);
  assert.equal(next3, "wss://node1.hf.space");
  assert.equal(webrtcPeer.getActiveSignalingIndex(), 0);

  webrtcPeer.resetSignalingIndex();
  assert.equal(webrtcPeer.getActiveSignalingIndex(), 0);
  assert.equal(webrtcPeer.getSignalingUrl(cfg), "wss://node1.hf.space");
});

test("webrtc - createRtcConfig combina STUN, TURN estático e TURN customizado", () => {
  localStorage.clear();
  const baseCfg = {
    stun: ["stun:stun.l.google.com:19302"],
    turn: [{ urls: "turn:static.org:3478", username: "u1", credential: "p1" }],
  };

  let rtcCfg = webrtcPeer.createRtcConfig(baseCfg);
  assert.equal(rtcCfg.iceServers.length, 2);
  assert.equal(rtcCfg.iceServers[1].urls, "turn:static.org:3478");

  webrtcPeer.saveCustomTurnConfig({
    urls: "turn:comunidade.br:3478",
    username: "vox_user",
    credential: "segredo_123",
  });

  const savedTurn = webrtcPeer.getCustomTurnConfig();
  assert.equal(savedTurn.urls, "turn:comunidade.br:3478");
  assert.equal(savedTurn.username, "vox_user");

  rtcCfg = webrtcPeer.createRtcConfig(baseCfg);
  assert.equal(rtcCfg.iceServers.length, 3);
  assert.deepEqual(rtcCfg.iceServers[2], {
    urls: "turn:comunidade.br:3478",
    username: "vox_user",
    credential: "segredo_123",
  });
});
