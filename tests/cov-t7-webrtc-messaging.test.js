/**
 * @file Cobertura T7 de `webrtc-messaging.js`: handlers, identidade dos pares, contagem de canais abertos
 * e envio de mensagens/DM por canais falsos.
 */
import "./setup.js";
import test, { beforeEach, afterEach, mock } from "node:test";
import { SIGNALING_DOWN_GRACE_MS } from "../client/js/honest-errors.js";
import assert from "node:assert/strict";
import * as msg from "../client/js/webrtc-messaging.js";
import * as state from "../client/js/webrtc-peer-state.js";
import { FakeChannel, FakeWebSocket, installRtcGlobals } from "./helpers/cov-t7-rtc-fakes.mjs";

let restore;

beforeEach(() => {
  restore = installRtcGlobals();
});
afterEach(() => {
  state.peerConnections.clear();
  state.addressToPeer.clear();
  state.dmPubByAddress.clear();
  state.setSignalingWs(null);
  state.setCurrentPeerId(null);
  state.setCurrentAddress("");
  msg.onPeerIdentity(null);
  restore();
});

/**
 * Registra um par com canais abertos ou fechados.
 * @param {string} id Id do par.
 * @param {{ dc?: string, dm?: string }} [states] `readyState` de cada canal.
 * @returns {{ dc: FakeChannel, dmDc: FakeChannel }} Canais registrados.
 */
function addPeer(id, { dc = "open", dm = "open" } = {}) {
  const entry = { dc: new FakeChannel("vox-peer-v0"), dmDc: new FakeChannel("vox-dm-v0") };
  entry.dc.readyState = dc;
  entry.dmDc.readyState = dm;
  state.peerConnections.set(id, entry);
  return entry;
}

test("isBeaconIdentity - reconhece o beacon de memória pelo endereço ou pelo id", () => {
  assert.equal(msg.isBeaconIdentity("vx_zero_memory_beacon", "p1"), true);
  assert.equal(msg.isBeaconIdentity("vx_a", "peer_zero_memory_9"), true);
  assert.equal(msg.isBeaconIdentity("vx_a", "peer_normal"), false);
  assert.equal(msg.isBeaconIdentity("", undefined), false);
});

test("onVoxMessage/onDmMessage/onPeerConnect guardam o handler no estado compartilhado", () => {
  const fns = [() => 1, () => 2, () => 3];
  msg.onVoxMessage(fns[0]);
  msg.onDmMessage(fns[1]);
  msg.onPeerConnect(fns[2]);
  assert.equal(state.getMessageHandler(), fns[0]);
  assert.equal(state.getDmMessageHandler(), fns[1]);
  assert.equal(state.getPeerConnectHandler(), fns[2]);
});

test("onSignalingHealth - handler recebe a virada após a tolerância e isSignalingDown acompanha", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const seen = [];
  msg.onSignalingHealth((down) => seen.push(down));
  try {
    assert.equal(msg.isSignalingDown(), false);
    state.getSignalingHealth().update({ wsOpen: false, wsGaveUp: true, nostrOpen: false, nostrPending: false });
    assert.equal(msg.isSignalingDown(), false);
    mock.timers.tick(SIGNALING_DOWN_GRACE_MS);
    assert.equal(msg.isSignalingDown(), true);
    assert.deepEqual(seen, [true]);
    state.getSignalingHealth().update({ wsOpen: true, wsGaveUp: false });
    assert.equal(msg.isSignalingDown(), false);
    assert.deepEqual(seen, [true, false]);
  } finally {
    state.getSignalingHealth().reset();
    msg.onSignalingHealth(null);
    mock.timers.reset();
  }
});

test("announceIdentity - guarda conta e chave e registra na sinalização aberta", () => {
  const ws = new FakeWebSocket("ws://s.test");
  ws.readyState = FakeWebSocket.OPEN;
  state.setSignalingWs(ws);
  state.setCurrentPeerId("peer-1");
  msg.announceIdentity("vx_ana", { kty: "EC" });
  assert.deepEqual(ws.sent, [{ type: "register", peerId: "peer-1", address: "vx_ana", dmPub: { kty: "EC" } }]);
  assert.equal(state.getCurrentAddress(), "vx_ana");
  msg.announceIdentity("vx_ana");
  assert.equal(ws.sent.length, 2);
  assert.deepEqual(state.getCurrentDmPub(), { kty: "EC" });
});

test("announceIdentity - sem socket aberto só guarda a identidade", () => {
  const ws = new FakeWebSocket("ws://s.test");
  state.setSignalingWs(ws);
  state.setCurrentPeerId("peer-1");
  msg.announceIdentity("vx_bia", null);
  assert.deepEqual(ws.sent, []);
  assert.equal(state.getCurrentAddress(), "vx_bia");
});

test("registerAddressMapping - sem prova não mapeia chave; beacon repassa a identidade e não mapeia", async () => {
  const got = [];
  msg.onPeerIdentity((address, dmPub) => got.push([address, dmPub]));
  await msg.registerAddressMapping("", "p1");
  await msg.registerAddressMapping("vx_a", "");
  await msg.registerAddressMapping("vx_a", "p1", { kty: "EC" });
  await msg.registerAddressMapping("vx_zero_memory_beacon", "peer_zero_memory_1", { kty: "OKP" });
  await msg.registerAddressMapping("vx_b", "p2");
  assert.equal(msg.getPeerDmPub("vx_a"), null);
  assert.equal(msg.getPeerDmPub("vx_b"), null);
  assert.equal(state.addressToPeer.has("vx_zero_memory_beacon"), false);
  assert.deepEqual(got.map((g) => g[0]), ["vx_zero_memory_beacon"]);
  assert.deepEqual(msg.listKnownPeerAddresses(), []);
});

test("isAddressConnectedRtc - exige conta conhecida e canal de DM aberto", () => {
  addPeer("p1");
  addPeer("p2", { dm: "closed" });
  state.addressToPeer.set("vx_1", "p1");
  state.addressToPeer.set("vx_2", "p2");
  assert.equal(msg.isAddressConnectedRtc("vx_1"), true);
  assert.equal(msg.isAddressConnectedRtc("vx_2"), false);
  assert.equal(msg.isAddressConnectedRtc("vx_x"), false);
});

test("contagem e lista de pares com canal de dados aberto", () => {
  addPeer("p1");
  addPeer("p2", { dc: "connecting" });
  addPeer("p3");
  assert.equal(msg.getConnectedRtcPeersCount(), 2);
  assert.deepEqual(msg.listOpenRtcPeerIds(), ["p1", "p3"]);
});

test("sendDmRtc - envia envelope DM só com canal aberto e trata falha de envio", () => {
  const p = addPeer("p1");
  state.addressToPeer.set("vx_1", "p1");
  assert.equal(msg.sendDmRtc("vx_1", { c: "cifra" }), true);
  assert.deepEqual(JSON.parse(p.dmDc.sent[0]), { type: "DM", envelope: { c: "cifra" } });
  p.dmDc.throwOnSend = true;
  assert.equal(msg.sendDmRtc("vx_1", {}), false);
  p.dmDc.readyState = "closed";
  assert.equal(msg.sendDmRtc("vx_1", {}), false);
  assert.equal(msg.sendDmRtc("vx_desconhecido", {}), false);
});

test("sendVoxMessage - entrega pelo canal aberto e devolve false se fechado ou quebrado", () => {
  const p = addPeer("p1");
  assert.equal(msg.sendVoxMessage("p1", { a: 1 }), true);
  assert.deepEqual(p.dc.sent, ['{"a":1}']);
  p.dc.throwOnSend = true;
  assert.equal(msg.sendVoxMessage("p1", { a: 2 }), false);
  assert.equal(msg.sendVoxMessage("nao-existe", {}), false);
  p.dc.throwOnSend = false;
  p.dc.readyState = "closing";
  assert.equal(msg.sendVoxMessage("p1", { a: 3 }), false);
});

test("broadcastRtcMessage - conta só quem recebeu", () => {
  const p1 = addPeer("p1");
  const p2 = addPeer("p2");
  const p3 = addPeer("p3", { dc: "closed" });
  p2.dc.throwOnSend = true;
  assert.equal(msg.broadcastRtcMessage({ t: "x" }), 1);
  assert.deepEqual([p1.dc.sent, p2.dc.sent, p3.dc.sent], [['{"t":"x"}'], [], []]);
});
