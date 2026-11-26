/**
 * @file Cobertura T7 de `webrtc-signaling-ws.js`: conexão, registro, reconexão com rodízio de URL,
 * despacho de mensagens de sinalização e desligamento, com `WebSocket`/`RTCPeerConnection` falsos.
 */
import "./setup.js";
import test, { beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import * as sig from "../client/js/webrtc-signaling-ws.js";
import * as state from "../client/js/webrtc-peer-state.js";
import { FakePc, FakeWebSocket, installRtcGlobals } from "./helpers/cov-t7-rtc-fakes.mjs";

const URLS = ["ws://um.test", "ws://dois.test"];
const CONFIG = { signalingUrls: URLS, nostrSignaling: { enabled: false }, stun: [], turn: [], maxRtcPeers: 2 };
let restore;
let savedEnv;

beforeEach(() => {
  restore = installRtcGlobals();
  savedEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "dev";
  state.setConfigCache({ ...CONFIG });
  localStorage.clear();
});
afterEach(() => {
  sig.disconnectWebRtc();
  state.setConfigCache(null);
  state.setCurrentPeerId(null);
  state.setCurrentAddress("");
  state.addressToPeer.clear();
  mock.timers.reset();
  process.env.NODE_ENV = savedEnv;
  restore();
});

/** Deixa as promessas pendentes (carga de config, criação de pares) terminarem. @returns {Promise<void>} */
const flush = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r));
};

/**
 * Liga o WebRTC e devolve o primeiro socket de sinalização criado.
 * @param {string} [peerId] Id local.
 * @returns {Promise<FakeWebSocket>} Socket falso ainda conectando.
 */
async function startAndGetSocket(peerId = "peer-m") {
  await sig.initWebRtc(peerId);
  await flush();
  return FakeWebSocket.all.at(-1);
}

test("initWebRtc - sem RTCPeerConnection devolve false e não abre socket", async () => {
  delete globalThis.RTCPeerConnection;
  assert.equal(await sig.initWebRtc("peer-m"), false);
  await flush();
  assert.equal(FakeWebSocket.all.length, 0);
  assert.equal(state.getIsWebRtcEnabled(), true);
});

test("initWebRtc - em ambiente de teste a conexão é pulada de propósito", async () => {
  process.env.NODE_ENV = "test";
  assert.equal(await sig.initWebRtc("peer-m"), true);
  await flush();
  assert.equal(FakeWebSocket.all.length, 0);
});

test("conexão - abre no primeiro candidato e registra o par ao abrir o socket", async () => {
  state.setCurrentAddress("vx_eu");
  const ws = await startAndGetSocket();
  assert.equal(ws.url, URLS[0]);
  assert.equal(state.getSignalingState(), "connecting");
  ws.open();
  assert.equal(state.getSignalingState(), "open");
  assert.deepEqual(ws.sent, [{ type: "register", peerId: "peer-m", address: "vx_eu", dmPub: null }]);
  assert.equal(state.getReconnectAttempts(), 0);
});

test("conexão - religar com a mesma URL viva reaproveita o socket; URL nova troca", async () => {
  const first = await startAndGetSocket();
  await sig.initWebRtc("peer-m");
  await flush();
  assert.equal(FakeWebSocket.all.length, 1);
  await sig.initWebRtc("peer-m", "ws://custom.test");
  await flush();
  assert.equal(FakeWebSocket.all.length, 2);
  assert.equal(first.readyState, FakeWebSocket.CLOSED);
  assert.equal(first.onopen, null);
  assert.equal(FakeWebSocket.all[1].url, "ws://custom.test");
});

test("conexão - erro do socket fecha; WebSocket que lança agenda nova tentativa imediata", async () => {
  const ws = await startAndGetSocket();
  ws.onerror();
  assert.equal(ws.readyState, FakeWebSocket.CLOSED);
  sig.disconnectWebRtc();
  mock.timers.enable({ apis: ["setTimeout"] });
  globalThis.WebSocket = Object.assign(function Boom() { throw new Error("sem rede"); }, { OPEN: 1, CONNECTING: 0 });
  await sig.initWebRtc("peer-m");
  await flush();
  assert.notEqual(state.getReconnectTimer(), null);
  assert.equal(state.getActiveSignalingIndex(), 1);
  assert.equal(state.getSignalingState(), "backoff");
});

test("reconexão - fechar antes de abrir gira para a próxima URL e tenta em 300 ms", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const ws = await startAndGetSocket();
  ws.onclose();
  assert.equal(state.getActiveSignalingIndex(), 1);
  assert.notEqual(state.getReconnectTimer(), null);
  mock.timers.tick(299);
  assert.equal(FakeWebSocket.all.length, 1);
  mock.timers.tick(1);
  await flush();
  assert.equal(FakeWebSocket.all.length, 2);
  assert.equal(FakeWebSocket.all[1].url, URLS[1]);
  assert.equal(state.getReconnectTimer(), null);
});

test("reconexão - volta ao início da lista, ou com uma só URL, usa recuo exponencial", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  state.setConfigCache({ ...CONFIG, signalingUrls: ["ws://solo.test"] });
  const ws = await startAndGetSocket();
  ws.open();
  ws.onclose();
  assert.equal(state.getReconnectAttempts(), 1);
  mock.timers.tick(1499);
  assert.equal(FakeWebSocket.all.length, 1);
  mock.timers.tick(1);
  await flush();
  assert.equal(FakeWebSocket.all.length, 2);
  assert.equal(FakeWebSocket.all[1].url, "ws://solo.test");
});

test("reconexão - desligado ou com timer pendente não agenda de novo", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const ws = await startAndGetSocket();
  ws.onclose();
  const timer = state.getReconnectTimer();
  ws.onclose();
  assert.equal(state.getReconnectTimer(), timer);
  sig.disconnectWebRtc();
  assert.equal(state.getReconnectTimer(), null);
  ws.onclose();
  assert.equal(state.getReconnectTimer(), null);
});

test("mensagens do socket - JSON inválido é ignorado; par registrado vem como transporte ws", async () => {
  const ws = await startAndGetSocket();
  ws.onmessage({ data: "{quebrado" });
  ws.onmessage({ data: JSON.stringify({ type: "peer-joined", peerId: "peer-z", address: "vx_z", dmPub: { k: 1 } }) });
  await flush();
  assert.equal(state.peerTransport.get("peer-z"), "ws");
  assert.equal(state.addressToPeer.has("vx_z"), false, "anúncio sem prova da conta não mapeia a rota");
  assert.equal(state.dmPubByAddress.has("vx_z"), false, "nem a chave");
});

test("registered - mapeia contas e conecta só aos pares válidos até o limite", async () => {
  state.setCurrentPeerId("peer-m");
  await sig.handleSignalingMessage({
    type: "registered",
    addressMap: { vx_a: { peerId: "pa", dmPub: { k: 1 } }, vx_b: { peerId: "pb" } },
    peers: ["peer-m", "peer_zero_memory_1", "", "pa", "pb", "pc"],
  });
  await flush();
  assert.deepEqual([...state.peerConnections.keys()], ["pa", "pb"]);
  assert.equal(state.addressToPeer.size, 0, "sem prova da conta, nenhuma rota é mapeada");
  assert.equal(FakePc.all.length, 2);
  await sig.handleSignalingMessage({ type: "registered", addressMap: "x" });
});

test("peer-joined - só o id menor inicia; beacon, repetido e lotação são ignorados", async () => {
  state.setCurrentPeerId("peer-m");
  state.setConfigCache({ ...CONFIG, maxRtcPeers: 1 });
  await sig.handleSignalingMessage({ type: "peer-joined", peerId: "peer-a" });
  await sig.handleSignalingMessage({ type: "peer-joined", peerId: "peer_zero_memory_x" });
  await sig.handleSignalingMessage({ type: "peer-joined", peerId: "" });
  await flush();
  assert.equal(state.peerConnections.size, 0);
  await sig.handleSignalingMessage({ type: "peer-joined", peerId: "peer-n" });
  await sig.handleSignalingMessage({ type: "peer-joined", peerId: "peer-n" });
  await sig.handleSignalingMessage({ type: "peer-joined", peerId: "peer-o" });
  await flush();
  assert.deepEqual([...state.peerConnections.keys()], ["peer-n"]);
});

test("offer/answer/ice/peer-left - cada tipo chega ao tratador da conexão", async () => {
  const ws = await startAndGetSocket();
  ws.open();
  await sig.handleSignalingMessage({ type: "offer", from: "peer-x", sdp: { sdp: "o" } });
  const pc = state.peerConnections.get("peer-x").pc;
  assert.equal(ws.sent.at(-1).type, "answer");
  await sig.handleSignalingMessage({ type: "ice", from: "peer-x", candidate: { c: 1 } });
  assert.equal(pc.added.length, 1);
  await sig.handleSignalingMessage({ type: "answer", from: "peer-x", sdp: { sdp: "a" } });
  assert.equal({ ...pc.remoteDescription }.sdp, "a");
  state.addressToPeer.set("vx_x", "peer-x");
  await sig.handleSignalingMessage({ type: "peer-left", peerId: "peer-x" });
  assert.equal(state.peerConnections.has("peer-x"), false);
  assert.equal(state.addressToPeer.has("vx_x"), false);
  await sig.handleSignalingMessage({ type: "desconhecido" });
});

test("disconnectWebRtc - fecha socket e pares, zera o rodízio e desliga o WebRTC", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const ws = await startAndGetSocket();
  ws.onclose();
  await sig.handleSignalingMessage({ type: "peer-joined", peerId: "peer-n" });
  await flush();
  const live = FakePc.all[0];
  state.setSignalingWs(ws);
  sig.disconnectWebRtc();
  assert.equal(state.getIsWebRtcEnabled(), false);
  assert.equal(state.getSignalingWs(), null);
  assert.equal(state.getReconnectTimer(), null);
  assert.equal(state.getActiveSignalingIndex(), 0);
  assert.equal(state.peerConnections.size, 0);
  assert.equal(live.closed, true);
  assert.equal(state.getSignalingState(), "idle");
});

test("sinalização Nostr - com relays habilitados cria o transporte e o desligamento o remove", async () => {
  state.setConfigCache({ ...CONFIG, nostrSignaling: { enabled: true, room: "sala-t7", maxRelays: 1 }, nostrRelays: ["wss://relay.t7.test"] });
  await sig.initWebRtc("peer-m");
  await flush();
  assert.notEqual(state.getNostrTransport(), null);
  assert.ok(FakeWebSocket.all.some((w) => w.url === "wss://relay.t7.test"));
  sig.disconnectWebRtc();
  assert.equal(state.getNostrTransport(), null);
});

test("initWebRtc - modo só TURN carrega a config e pré-busca credenciais", async () => {
  localStorage.setItem(state.TURN_ONLY_KEY, "1");
  let prefetched = 0;
  const orig = state.turn.prefetch;
  state.turn.prefetch = () => { prefetched += 1; };
  try {
    await sig.initWebRtc("peer-m");
    await flush();
  } finally {
    state.turn.prefetch = orig;
  }
  assert.equal(prefetched, 1);
});
