/**
 * @file Cobertura T7 de `webrtc-connection.js`: ciclo de vida da conexão, canais de dados, ICE, offer/answer
 * e fechamento, com `RTCPeerConnection` e `WebSocket` falsos (sem rede).
 */
import "./setup.js";
import test, { beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import * as conn from "../client/js/webrtc-connection.js";
import * as state from "../client/js/webrtc-peer-state.js";
import { onVoxMessage, onDmMessage, onPeerConnect } from "../client/js/webrtc-messaging.js";
import { FakePc, FakeWebSocket, installRtcGlobals } from "./helpers/cov-t7-rtc-fakes.mjs";

let restore;
let ws;

beforeEach(() => {
  restore = installRtcGlobals();
  ws = new FakeWebSocket("ws://sinal.test");
  ws.readyState = FakeWebSocket.OPEN;
  state.setSignalingWs(ws);
  state.setCurrentPeerId("peer-m");
  state.setConfigCache({ stun: ["stun:s.test"], turn: ["turn:t.test"] });
});
afterEach(() => {
  for (const id of [...state.peerConnections.keys()]) conn.closePeerConnection(id, true);
  state.setSignalingWs(null);
  state.setConfigCache(null);
  state.peerTransport.clear();
  onVoxMessage(null);
  onDmMessage(null);
  onPeerConnect(null);
  mock.timers.reset();
  restore();
});

test("createPeerConnection - iniciador cria os dois canais, anuncia a offer e é reaproveitado", async () => {
  state.peerTransport.set("peer-z", "nostr");
  const entry = await conn.createPeerConnection("peer-z", true);
  assert.deepEqual(entry.pc.channels.map((c) => c.label), ["vox-peer-v0", "vox-dm-v0"]);
  assert.equal(entry.transport, "nostr");
  assert.equal(entry.withTurn, true);
  assert.equal(entry.makingOffer, false);
  assert.deepEqual(ws.sent, [{ type: "offer", to: "peer-z", sdp: { type: "offer", sdp: "offer-sdp" } }]);
  assert.equal(await conn.createPeerConnection("peer-z", true), entry);
  assert.equal(FakePc.all.length, 1);
});

test("createPeerConnection - sem TURN na config marca withTurn=false e transporte padrão ws", async () => {
  state.setConfigCache({ stun: ["stun:s.test"], turn: [] });
  const entry = await conn.createPeerConnection("peer-a", false);
  assert.equal(entry.withTurn, false);
  assert.equal(entry.transport, "ws");
  assert.equal(entry.dc, null);
  assert.deepEqual(ws.sent, []);
});

test("createPeerConnection - falha ao criar a offer fecha a conexão", async () => {
  const origCreate = FakePc.prototype.createOffer;
  FakePc.prototype.createOffer = async () => { throw new Error("sem offer"); };
  try {
    await conn.createPeerConnection("peer-f", true);
  } finally {
    FakePc.prototype.createOffer = origCreate;
  }
  assert.equal(state.peerConnections.has("peer-f"), false);
  assert.equal(FakePc.all[0].closed, true);
});

test("canal de dados - abrir dispara onPeerConnect e a mensagem chega ao handler com resposta", async () => {
  const connected = [];
  const received = [];
  onPeerConnect((id, send) => connected.push([id, send]));
  onVoxMessage((msg, reply, source) => received.push({ msg, reply, source }));
  const entry = await conn.createPeerConnection("peer-b", true);
  const dc = entry.dc;
  dc.readyState = "open";
  dc.onopen();
  assert.equal(connected[0][0], "peer-b");
  assert.equal(entry.outcomeRecorded, true);
  assert.equal(connected[0][1]({ hello: 1 }), true);
  dc.onmessage({ data: JSON.stringify({ type: "PING" }) });
  dc.onmessage({ data: "{não é json" });
  assert.equal(received.length, 1);
  assert.deepEqual([received[0].msg, received[0].source], [{ type: "PING" }, "rtc"]);
  received[0].reply({ type: "PONG" });
  assert.deepEqual(dc.sent.map((s) => JSON.parse(s)), [{ hello: 1 }, { type: "PONG" }]);
});

test("canal de dados - eventos de uma conexão substituída são ignorados", async () => {
  const received = [];
  onVoxMessage((msg) => received.push(msg));
  onPeerConnect(() => received.push("conectou"));
  const entry = await conn.createPeerConnection("peer-c", true);
  const staleDc = entry.dc;
  conn.closePeerConnection("peer-c", true);
  staleDc.onopen?.();
  staleDc.onmessage?.({ data: "{}" });
  assert.deepEqual(received, []);
  const fresh = await conn.createPeerConnection("peer-c", true);
  fresh.dc.onclose();
  assert.equal(state.peerConnections.has("peer-c"), false);
});

test("canal de DM - só envelope DM chega ao handler", async () => {
  const got = [];
  onDmMessage((env, from) => got.push([env, from]));
  const entry = await conn.createPeerConnection("peer-d", true);
  const send = (obj) => entry.dmDc.onmessage({ data: JSON.stringify(obj) });
  send({ type: "DM", envelope: { c: "x" } });
  send({ type: "DM" });
  send({ type: "OUTRO", envelope: {} });
  entry.dmDc.onmessage({ data: "lixo" });
  assert.deepEqual(got, [[{ c: "x" }, "peer-d"]]);
});

test("ondatachannel - receptor associa canal de DM e de dados e ignora conexão antiga", async () => {
  const entry = await conn.createPeerConnection("peer-e", false);
  const dmCh = { label: "vox-dm-v0" };
  const dataCh = { label: "vox-peer-v0" };
  entry.pc.ondatachannel({ channel: dmCh });
  entry.pc.ondatachannel({ channel: dataCh });
  assert.equal(entry.dmDc, dmCh);
  assert.equal(entry.dc, dataCh);
  assert.equal(typeof dataCh.onopen, "function");
  const oldPc = entry.pc;
  conn.closePeerConnection("peer-e", true);
  oldPc.ondatachannel = null;
  assert.equal(state.peerConnections.has("peer-e"), false);
});

test("eventos do pc - candidato ICE vai para a sinalização e falha de estado fecha", async () => {
  const entry = await conn.createPeerConnection("peer-g", false);
  entry.pc.onicecandidate({ candidate: null });
  entry.pc.onicecandidate({ candidate: { c: "cand" } });
  assert.deepEqual(ws.sent, [{ type: "ice", to: "peer-g", candidate: { c: "cand" } }]);
  entry.pc.connectionState = "connected";
  entry.pc.onconnectionstatechange();
  assert.equal(state.peerConnections.has("peer-g"), true);
  entry.pc.connectionState = "failed";
  entry.pc.onconnectionstatechange();
  assert.equal(state.peerConnections.has("peer-g"), false);
  assert.equal(entry.pc.closed, true);
});

test("handleIncomingOffer - responde com answer e entrega candidatos ICE que chegaram antes", async () => {
  await conn.handleIncomingOffer("peer-h", { sdp: "remote-offer" });
  const entry = state.peerConnections.get("peer-h");
  assert.deepEqual({ ...entry.pc.remoteDescription }, { sdp: "remote-offer" });
  assert.deepEqual(ws.sent, [{ type: "answer", to: "peer-h", sdp: { type: "answer", sdp: "answer-sdp" } }]);
  await conn.handleIncomingIce("peer-h", { c: "depois" });
  assert.deepEqual(entry.pc.added.map((c) => ({ ...c })), [{ c: "depois" }]);
});

test("handleIncomingIce - sem descrição remota enfileira e a offer descarrega a fila", async () => {
  const entry = await conn.createPeerConnection("peer-i", true);
  await conn.handleIncomingIce("peer-i", { c: "cedo" });
  await conn.handleIncomingIce("peer-i", null);
  await conn.handleIncomingIce("desconhecido", { c: "x" });
  assert.deepEqual(entry.pendingIceCandidates, [{ c: "cedo" }]);
  await conn.handleIncomingAnswer("peer-i", { sdp: "ans" });
  assert.deepEqual(entry.pc.added.map((c) => ({ ...c })), [{ c: "cedo" }]);
  assert.deepEqual(entry.pendingIceCandidates, []);
});

test("handleIncomingOffer - ignora a si mesmo e resolve colisão pela ordem dos ids", async () => {
  await conn.handleIncomingOffer("peer-m", { sdp: "eu" });
  await conn.handleIncomingOffer("", { sdp: "vazio" });
  assert.equal(state.peerConnections.size, 0);
  const mine = await conn.createPeerConnection("peer-z", false);
  mine.makingOffer = true;
  await conn.handleIncomingOffer("peer-z", { sdp: "z" });
  assert.equal(state.peerConnections.get("peer-z"), mine);
  state.setCurrentPeerId("peer-zz");
  await conn.handleIncomingOffer("peer-z", { sdp: "z2" });
  assert.notEqual(state.peerConnections.get("peer-z"), mine);
  assert.equal(mine.pc.closed, true);
});

test("handleIncomingOffer/Answer - falha ao aplicar descrição fecha a conexão", async () => {
  const orig = FakePc.prototype.setRemoteDescription;
  FakePc.prototype.setRemoteDescription = async () => { throw new Error("sdp ruim"); };
  try {
    await conn.handleIncomingOffer("peer-j", { sdp: "x" });
    assert.equal(state.peerConnections.has("peer-j"), false);
    await conn.createPeerConnection("peer-k", true);
    await conn.handleIncomingAnswer("peer-k", { sdp: "y" });
    assert.equal(state.peerConnections.has("peer-k"), false);
    await conn.handleIncomingAnswer("nunca-existiu", { sdp: "y" });
  } finally {
    FakePc.prototype.setRemoteDescription = orig;
  }
});

test("candidato ICE inválido é ignorado sem derrubar a conexão", async () => {
  const entry = await conn.createPeerConnection("peer-l", true);
  entry.pc.remoteDescription = { sdp: "ok" };
  entry.pc.failOn.add("addIceCandidate");
  await conn.handleIncomingIce("peer-l", { c: "ruim" });
  assert.equal(state.peerConnections.has("peer-l"), true);
  assert.deepEqual(entry.pc.added, []);
});

test("timer de negociação - fecha o par que não abriu o canal em 15 s", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  await conn.createPeerConnection("peer-n", true);
  mock.timers.tick(state.NEGOTIATION_TIMEOUT_MS - 1);
  assert.equal(state.peerConnections.has("peer-n"), true);
  mock.timers.tick(1);
  assert.equal(state.peerConnections.has("peer-n"), false);
  const entry = await conn.createPeerConnection("peer-o", true);
  entry.dc.readyState = "open";
  mock.timers.tick(state.NEGOTIATION_TIMEOUT_MS);
  assert.equal(state.peerConnections.has("peer-o"), true);
});

test("closePeerConnection - zera handlers, fecha canais e pc; id desconhecido é no-op", async () => {
  const entry = await conn.createPeerConnection("peer-p", true);
  const { dc, dmDc, pc } = entry;
  conn.closePeerConnection("peer-p");
  assert.deepEqual([dc.closed, dmDc.closed, pc.closed], [true, true, true]);
  assert.deepEqual([dc.onopen, dmDc.onmessage, pc.onicecandidate], [null, null, null]);
  assert.equal(entry.outcomeRecorded, true);
  assert.equal(state.peerConnections.has("peer-p"), false);
  assert.doesNotThrow(() => conn.closePeerConnection("peer-p"));
});

test("closePeerConnection - erro ao fechar um canal não impede remover o par", async () => {
  const entry = await conn.createPeerConnection("peer-q", true);
  entry.dc.close = () => { throw new Error("falha ao fechar"); };
  conn.closePeerConnection("peer-q", true);
  assert.equal(state.peerConnections.has("peer-q"), false);
});

test("primeiro par aberto registra a latência da sessão uma única vez", async () => {
  state.setSessionStartedAt(Date.now() - 250);
  state.setRecordedFirstPeer(false);
  const first = await conn.createPeerConnection("peer-r1", true);
  first.dc.onopen();
  assert.equal(state.getRecordedFirstPeer(), true);
  const second = await conn.createPeerConnection("peer-r2", true);
  state.setSessionStartedAt(0);
  second.dc.onopen();
  assert.equal(second.outcomeRecorded, true);
  assert.equal(second.timeoutId, null);
});
