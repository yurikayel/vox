/**
 * @file SUB-08, fatia 2: cliente de sinalização da Mesa. Com WebSocket falso (registro, fila, filtros, fechamento) e contra o
 * relay de sinalização real (`relay/signaling.py`, processo local em loopback) levando o `createRtcVttTransport` de ponta a ponta
 * com RTC falso: nenhum tráfego externo.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import { createVttSignalingClient, VTT_MAX_SIGNAL_CHARS } from "../client/js/dungeon/vtt-signaling-client.js";
import { createRtcVttTransport } from "../client/js/dungeon/vtt-rtc-transport.js";
import { loadVttSignalingClient } from "../client/js/dungeon/dungeon-vtt-join.js";
import { createFakeRtcNetwork, createFakeSignalingHub } from "./helpers/fake-rtc.js";
import { waitUntil } from "./helpers/wait-until.js";

/** WebSocket falso: guarda o que foi enviado e deixa o teste abrir, fechar e injetar quadros. */
function fakeWebSocketClass() {
  const sockets = [];
  class FakeWebSocket {
    constructor(url) { this.url = url; this.sent = []; this.closed = false; sockets.push(this); }
    send(text) { this.sent.push(JSON.parse(text)); }
    close() { this.closed = true; }
    open() { this.onopen?.(); }
    confirm(peerId) { this.receive(JSON.stringify({ type: "registered", peerId, peers: [] })); }
    receive(raw) { this.onmessage?.({ data: raw }); }
  }
  return { FakeWebSocket, sockets };
}

test("registra o routeId ao abrir, guarda o envio até abrir e só aceita oferta, resposta e ICE", () => {
  const { FakeWebSocket, sockets } = fakeWebSocketClass();
  const states = [];
  const client = createVttSignalingClient({ url: "ws://127.0.0.1:1", peerId: "gm", WebSocketImpl: FakeWebSocket, onStatus: (s) => states.push(s) });
  assert.equal(client.state(), "connecting");
  assert.equal(client.send({ type: "offer", to: "ana", sdp: {} }), true, "antes de abrir, fica na fila");
  assert.equal(client.send({ type: "hello", to: "ana" }), false, "tipo que não é de sinalização é recusado");
  assert.equal(client.send({ type: "ice" }), false, "sem destino é recusado");
  assert.deepEqual(sockets[0].sent, []);
  sockets[0].open();
  assert.deepEqual(sockets[0].sent, [{ type: "register", peerId: "gm" }], "só registra; a fila espera a confirmação do nó");
  assert.equal(client.state(), "connecting");
  sockets[0].confirm("gm");
  assert.deepEqual(sockets[0].sent, [{ type: "register", peerId: "gm" }, { type: "offer", to: "ana", sdp: {} }]);
  assert.deepEqual(states, ["open"]);
  client.send({ type: "ice", to: "ana", candidate: {} });
  assert.equal(sockets[0].sent.length, 3, "aberto: envia na hora");
});

test("entrada não confiável: texto fora do formato, grande demais ou de outro tipo não chega ao ouvinte", () => {
  const { FakeWebSocket, sockets } = fakeWebSocketClass();
  const client = createVttSignalingClient({ url: "ws://x", peerId: "gm", WebSocketImpl: FakeWebSocket });
  const got = [];
  client.onMessage((m) => got.push(m));
  const ws = sockets[0];
  ws.open();
  ws.confirm("gm");
  const huge = JSON.stringify({ type: "offer", from: "a", pad: "x".repeat(VTT_MAX_SIGNAL_CHARS) });
  [42, null, "não é json", "[1,2]", JSON.stringify({ type: "registered" }), JSON.stringify({ type: "peer-joined" }), huge].forEach((raw) => ws.receive(raw));
  ws.receive(JSON.stringify({ type: "answer", from: "ana", sdp: { type: "answer" } }));
  assert.deepEqual(got, [{ type: "answer", from: "ana", sdp: { type: "answer" } }]);
});

test("a fila antes de abrir tem teto; close() esvazia, avisa e uma abertura tardia não registra nada", () => {
  const { FakeWebSocket, sockets } = fakeWebSocketClass();
  const states = [];
  const client = createVttSignalingClient({ url: "ws://x", peerId: "gm", WebSocketImpl: FakeWebSocket, onStatus: (s) => states.push(s) });
  const results = Array.from({ length: 34 }, () => client.send({ type: "ice", to: "p", candidate: {} }));
  assert.equal(results.filter(Boolean).length, 32, "fila limitada a 32");
  client.close();
  assert.equal(sockets[0].closed, true);
  assert.deepEqual(states, ["closed"]);
  assert.equal(client.send({ type: "offer", to: "p", sdp: {} }), false, "fechado não envia");
  sockets[0].open();
  sockets[0].confirm("gm");
  assert.deepEqual(sockets[0].sent, [], "abertura tardia não registra o par nem solta a fila");
  assert.equal(sockets[0].closed, true);
});

test("queda do enlace e erro viram estado closed", () => {
  const { FakeWebSocket, sockets } = fakeWebSocketClass();
  const states = [];
  createVttSignalingClient({ url: "ws://x", peerId: "gm", WebSocketImpl: FakeWebSocket, onStatus: (s) => states.push(s) });
  sockets[0].open();
  sockets[0].confirm("gm");
  sockets[0].onclose();
  sockets[0].onerror();
  assert.deepEqual(states, ["open", "closed"]);
});

test("sem WebSocket no navegador o cliente avisa em vez de quebrar na primeira chamada", () => {
  const real = globalThis.WebSocket;
  try {
    delete globalThis.WebSocket;
    assert.throws(() => createVttSignalingClient({ url: "ws://x", peerId: "gm" }), /WebSocket indisponível/);
  } finally {
    globalThis.WebSocket = real;
  }
});

test("o cliente é carregado sob demanda pelo join (fora do shell)", async () => {
  const mod = await loadVttSignalingClient();
  assert.equal(typeof mod.createVttSignalingClient, "function");
});

function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}

async function startRelay() {
  const port = await freePort();
  const child = spawn("python", ["relay/signaling.py", "--port", String(port), "--host", "127.0.0.1"], { stdio: "ignore" });
  const ready = await waitUntil(async () => {
    try { return (await fetch(`http://127.0.0.1:${port}/health`)).ok; } catch { return false; }
  }, 15000);
  assert.ok(ready, "o relay de sinalização local subiu");
  return { port, stop: () => child.kill() };
}

test("contra o relay real: oferta, resposta e ICE passam pela sinalização e a mesa só no canal de dados", async (t) => {
  const relay = await startRelay();
  t.after(relay.stop);
  const url = `ws://127.0.0.1:${relay.port}`;
  const rtc = createFakeRtcNetwork();
  const seen = [];
  const wrap = (peerId) => {
    const sig = createVttSignalingClient({ url, peerId });
    return { onMessage: sig.onMessage, state: sig.state, send: (d) => { seen.push(d.type); return sig.send(d); }, close: sig.close };
  };
  const gmSig = wrap("gm");
  const anaSig = wrap("ana");
  const gm = createRtcVttTransport({ peerId: "gm", signaling: gmSig, createPeerConnection: rtc.createPeerConnection });
  const ana = createRtcVttTransport({ peerId: "ana", initiate: true, signaling: anaSig, createPeerConnection: rtc.createPeerConnection });
  t.after(() => { ana.close(); gm.close(); anaSig.close(); gmSig.close(); });
  assert.ok(await waitUntil(() => gmSig.state() === "open" && anaSig.state() === "open", 15000), "os dois pares registrados no nó");
  const got = [];
  gm.onMessage((m) => got.push(m));
  ana.send("gm", { type: "OLA", n: 1 });
  assert.ok(await waitUntil(() => got.length > 0, 15000), "a mensagem chegou ao Mestre");
  assert.equal(got[0].type, "OLA");
  assert.equal(got[0].from, "ana", "o remetente vem do canal");
  assert.ok(seen.every((type) => ["offer", "answer", "ice"].includes(type)), `sinalização só levou oferta/resposta/ICE: ${seen}`);
  assert.ok(seen.includes("offer") && seen.includes("answer"));
  assert.ok(rtc.log.sent.some((text) => text.includes("OLA")), "o conteúdo foi pelo canal de dados");
});

test("só o `registered` do próprio routeId abre o enlace (confirmação de outro par não vale)", () => {
  const { FakeWebSocket, sockets } = fakeWebSocketClass();
  const client = createVttSignalingClient({ url: "ws://x", peerId: "gm", WebSocketImpl: FakeWebSocket });
  sockets[0].open();
  sockets[0].confirm("outro");
  assert.equal(client.state(), "connecting");
  sockets[0].confirm("gm");
  assert.equal(client.state(), "open");
});

test("prazo do `registered`: nó mudo vira erro visível, fecha o socket e recusa envio", () => {
  const { FakeWebSocket, sockets } = fakeWebSocketClass();
  const states = [];
  let fire = null;
  const client = createVttSignalingClient({
    url: "ws://x", peerId: "gm", WebSocketImpl: FakeWebSocket, onStatus: (s) => states.push(s),
    registerTimeoutMs: 7, schedule: (fn, ms) => { fire = { fn, ms }; return 1; }, cancel: () => {},
  });
  assert.equal(fire.ms, 7);
  client.send({ type: "offer", to: "ana", sdp: {} });
  sockets[0].open();
  fire.fn();
  assert.equal(client.state(), "error");
  assert.deepEqual(states, ["error"]);
  assert.equal(sockets[0].closed, true);
  assert.equal(client.send({ type: "offer", to: "ana", sdp: {} }), false);
  sockets[0].confirm("gm");
  assert.equal(client.state(), "error", "confirmação tardia não ressuscita o enlace");
});

test("registrado a tempo cancela o prazo; falha antes do registro é erro, depois dele é closed", () => {
  const { FakeWebSocket, sockets } = fakeWebSocketClass();
  const cancelled = [];
  const a = createVttSignalingClient({ url: "ws://x", peerId: "a", WebSocketImpl: FakeWebSocket, schedule: () => "t", cancel: (h) => cancelled.push(h) });
  sockets[0].open();
  sockets[0].confirm("a");
  assert.deepEqual(cancelled, ["t"]);
  sockets[0].onclose();
  assert.equal(a.state(), "closed");
  const b = createVttSignalingClient({ url: "ws://x", peerId: "b", WebSocketImpl: FakeWebSocket, schedule: () => "t", cancel: () => {} });
  sockets[1].onerror();
  assert.equal(b.state(), "error");
});

test("lista fechada no send: só type, to e sdp/candidate saem para o nó", () => {
  const { FakeWebSocket, sockets } = fakeWebSocketClass();
  const client = createVttSignalingClient({ url: "ws://x", peerId: "gm", WebSocketImpl: FakeWebSocket });
  sockets[0].open();
  sockets[0].confirm("gm");
  client.send({ type: "offer", to: "ana", sdp: { type: "offer" }, ficha: { hp: 9 }, from: "falso" });
  client.send({ type: "ice", to: "ana", candidate: { c: 1 }, mesa: "segredo", sdp: {} });
  assert.deepEqual(sockets[0].sent.slice(1), [
    { type: "offer", to: "ana", sdp: { type: "offer" } },
    { type: "ice", to: "ana", candidate: { c: 1 } },
  ]);
});

test("presença: registered lista quem está, peer-joined avisa os ouvintes, peer-left tira", () => {
  const { FakeWebSocket, sockets } = fakeWebSocketClass();
  const client = createVttSignalingClient({ url: "ws://x", peerId: "ana", WebSocketImpl: FakeWebSocket });
  const joined = [];
  const off = client.onPeerJoined((id) => joined.push(id));
  sockets[0].open();
  sockets[0].receive(JSON.stringify({ type: "registered", peerId: "ana", peers: ["gm", 7, ""] }));
  assert.equal(client.isPeerOnline("gm"), true);
  assert.equal(client.isPeerOnline("7"), false);
  sockets[0].receive(JSON.stringify({ type: "peer-left", peerId: "gm" }));
  assert.equal(client.isPeerOnline("gm"), false);
  sockets[0].receive(JSON.stringify({ type: "peer-joined", peerId: "gm" }));
  sockets[0].receive(JSON.stringify({ type: "peer-joined", peerId: 5 }));
  assert.deepEqual(joined, ["gm", "gm"], "o registered avisa quem já estava e o peer-joined avisa quem entrou");
  assert.equal(client.isPeerOnline("gm"), true);
  off();
  sockets[0].receive(JSON.stringify({ type: "peer-joined", peerId: "x" }));
  assert.deepEqual(joined, ["gm", "gm"]);
});

test("transporte: jogador espera o Mestre aparecer (waiting_peer) e só então oferta", async () => {
  const rtc = createFakeRtcNetwork();
  const sent = [];
  let joinFn = null;
  let online = false;
  const statuses = [];
  const signaling = {
    send: (d) => { sent.push(d); return true; }, onMessage: () => () => {},
    isPeerOnline: () => online, onPeerJoined: (fn) => { joinFn = fn; return () => { joinFn = null; }; },
  };
  const ana = createRtcVttTransport({ peerId: "ana", initiate: true, signaling, createPeerConnection: rtc.createPeerConnection, onStatus: (id, s) => statuses.push(s) });
  ana.send("gm", { type: "OLA" });
  assert.ok(statuses.includes("waiting_peer"));
  assert.deepEqual(sent, [], "nenhuma oferta antes de o Mestre estar no nó");
  online = true;
  joinFn("gm");
  assert.ok(await waitUntil(() => sent.some((d) => d.type === "offer" && d.to === "gm"), 15000));
  ana.close();
  assert.equal(joinFn, null, "close() solta a assinatura de presença");
});

test("contra o relay real: o jogador entra antes do Mestre e a conexão fecha quando o Mestre registra", async (t) => {
  const relay = await startRelay();
  t.after(relay.stop);
  const url = `ws://127.0.0.1:${relay.port}`;
  const rtc = createFakeRtcNetwork();
  const anaSig = createVttSignalingClient({ url, peerId: "ana" });
  const ana = createRtcVttTransport({ peerId: "ana", initiate: true, signaling: anaSig, createPeerConnection: rtc.createPeerConnection });
  t.after(() => { ana.close(); anaSig.close(); });
  assert.ok(await waitUntil(() => anaSig.state() === "open", 15000));
  ana.send("gm", { type: "OLA", n: 1 });
  const gmSig = createVttSignalingClient({ url, peerId: "gm" });
  const gm = createRtcVttTransport({ peerId: "gm", signaling: gmSig, createPeerConnection: rtc.createPeerConnection });
  t.after(() => { gm.close(); gmSig.close(); });
  const got = [];
  gm.onMessage((m) => got.push(m));
  assert.ok(await waitUntil(() => got.length > 0, 15000), "a oferta não se perdeu: o jogador reofertou quando o Mestre entrou");
  assert.equal(got[0].type, "OLA");
});

const flush = async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); };
const offersIn = (sock) => sock.sent.filter((m) => m.type === "offer");

test("corrida: envio em connecting e `registered` já com o Mestre na lista geram exatamente uma oferta", async () => {
  const { FakeWebSocket, sockets } = fakeWebSocketClass();
  const rtc = createFakeRtcNetwork();
  const sig = createVttSignalingClient({ url: "ws://x", peerId: "ana", WebSocketImpl: FakeWebSocket });
  const ana = createRtcVttTransport({ peerId: "ana", initiate: true, signaling: sig, createPeerConnection: rtc.createPeerConnection });
  ana.send("gm", { type: "OLA" });
  sockets[0].open();
  await flush();
  assert.equal(offersIn(sockets[0]).length, 0, "ainda não se sabe que o Mestre está no nó");
  sockets[0].receive(JSON.stringify({ type: "registered", peerId: "ana", peers: ["gm"] }));
  assert.ok(await waitUntil(() => offersIn(sockets[0]).length > 0, 15000));
  await flush();
  assert.equal(offersIn(sockets[0]).length, 1);
  ana.close();
});

function reofferRig(opts = {}) {
  const rtc = createFakeRtcNetwork();
  const sent = [];
  let joinFn = null;
  let deliver = null;
  const signaling = {
    send: (d) => { sent.push(d); return true; }, onMessage: (fn) => { deliver = fn; return () => {}; },
    isPeerOnline: () => false, onPeerJoined: (fn) => { joinFn = fn; return () => { joinFn = null; }; },
  };
  const t = createRtcVttTransport({ peerId: "ana", initiate: true, signaling, createPeerConnection: rtc.createPeerConnection, ...opts });
  return { t, sent, deliver: (m) => deliver(m), join: (id) => joinFn?.(id), offers: () => sent.filter((d) => d.type === "offer").length };
}

test("freio de reoferta: 50 avisos de entrada do mesmo par dão uma oferta em voo e, passado o prazo, no máximo 4 no total", async () => {
  let now = 1000;
  const rig = reofferRig({ now: () => now });
  rig.t.send("gm", { type: "OLA" });
  for (let i = 0; i < 50; i += 1) rig.join("gm");
  assert.ok(await waitUntil(() => rig.offers() > 0, 15000));
  await flush();
  assert.equal(rig.offers(), 1, "uma só oferta em voo");
  now += 14_000;
  rig.join("gm");
  await flush();
  assert.equal(rig.offers(), 1, "aos 14 s a oferta ainda está em voo");
  now += 2_000;
  rig.join("gm");
  assert.ok(await waitUntil(() => rig.offers() === 2, 15000), "aos 16 s a oferta expirou e a reoferta sai");
  for (let i = 0; i < 20; i += 1) {
    now += 20_000;
    for (let j = 0; j < 50; j += 1) rig.join("gm");
    await flush();
  }
  assert.equal(rig.offers(), 4, "teto de ofertas por par");
  rig.t.close();
});

test("o Mestre nunca oferta e canal aberto não reoferta", async () => {
  const rtc = createFakeRtcNetwork();
  const hub = createFakeSignalingHub();
  let joinGm = null;
  let joinAna = null;
  const gmBase = hub.connect("gm");
  const anaBase = hub.connect("ana");
  const gm = createRtcVttTransport({ peerId: "gm", signaling: { ...gmBase, onPeerJoined: (fn) => { joinGm = fn; return () => {}; } }, createPeerConnection: rtc.createPeerConnection });
  const ana = createRtcVttTransport({ peerId: "ana", initiate: true, signaling: { ...anaBase, isPeerOnline: () => true, onPeerJoined: (fn) => { joinAna = fn; return () => {}; } }, createPeerConnection: rtc.createPeerConnection });
  const got = [];
  gm.onMessage((m) => got.push(m));
  ana.send("gm", { type: "OLA" });
  assert.ok(await waitUntil(() => got.length > 0, 15000));
  await flush();
  const before = hub.log.filter((m) => m.type === "offer").length;
  joinGm("ana");
  joinAna("gm");
  await flush();
  assert.equal(hub.log.filter((m) => m.type === "offer").length, before, "ninguém reofertou");
  ana.close();
  gm.close();
});

test("`registered` malformado, par com o próprio id e teto de presença", () => {
  const { FakeWebSocket, sockets } = fakeWebSocketClass();
  const client = createVttSignalingClient({ url: "ws://x", peerId: "ana", WebSocketImpl: FakeWebSocket });
  const joined = [];
  client.onPeerJoined((id) => joined.push(id));
  sockets[0].open();
  sockets[0].receive(JSON.stringify({ type: "registered", peerId: "ana", peers: "gm" }));
  assert.deepEqual(joined, []);
  const many = Array.from({ length: 200 }, (_, i) => `p${i}`);
  sockets[0].receive(JSON.stringify({ type: "registered", peerId: "ana", peers: ["ana", "x".repeat(257), ...many] }));
  assert.equal(joined.length, 64, "teto de presença");
  assert.equal(client.isPeerOnline("ana"), false);
  assert.equal(client.isPeerOnline("x".repeat(257)), false);
  sockets[0].receive(JSON.stringify({ type: "peer-joined", peerId: "ana" }));
  sockets[0].receive(JSON.stringify({ type: "peer-joined", peerId: "novo" }));
  assert.equal(joined.length, 64);
  assert.equal(client.isPeerOnline("novo"), false, "cheio: par novo não entra");
});

test("prazo cancelado em erro e em close; closed e error são terminais e não notificam mais", () => {
  const { FakeWebSocket, sockets } = fakeWebSocketClass();
  const cancelled = [];
  const mk = (id) => createVttSignalingClient({ url: "ws://x", peerId: id, WebSocketImpl: FakeWebSocket, schedule: () => id, cancel: (h) => cancelled.push(h) });
  const a = mk("a");
  const joined = [];
  a.onPeerJoined((id) => joined.push(id));
  sockets[0].onerror();
  assert.deepEqual(cancelled, ["a"], "erro cancela o prazo");
  sockets[0].open();
  sockets[0].receive(JSON.stringify({ type: "registered", peerId: "a", peers: ["gm"] }));
  assert.equal(a.state(), "error", "error é terminal");
  const b = mk("b");
  const heard = [];
  b.onPeerJoined((id) => heard.push(id));
  b.close();
  assert.deepEqual(cancelled, ["a", "b"], "close cancela o prazo");
  sockets[1].receive(JSON.stringify({ type: "registered", peerId: "b", peers: ["gm"] }));
  sockets[1].receive(JSON.stringify({ type: "peer-joined", peerId: "gm" }));
  assert.equal(b.state(), "closed");
  assert.deepEqual(heard, []);
  assert.deepEqual(joined, []);
});

test("contra o relay real: o jogador envia ainda conectando, com o Mestre já no nó, e a oferta sai uma vez", async (t) => {
  const relay = await startRelay();
  t.after(relay.stop);
  const url = `ws://127.0.0.1:${relay.port}`;
  const rtc = createFakeRtcNetwork();
  const gmSig = createVttSignalingClient({ url, peerId: "gm" });
  const gm = createRtcVttTransport({ peerId: "gm", signaling: gmSig, createPeerConnection: rtc.createPeerConnection });
  const offers = [];
  const anaBase = createVttSignalingClient({ url, peerId: "ana" });
  const anaSig = { ...anaBase, send: (d) => { if (d.type === "offer") offers.push(d); return anaBase.send(d); } };
  const ana = createRtcVttTransport({ peerId: "ana", initiate: true, signaling: anaSig, createPeerConnection: rtc.createPeerConnection });
  t.after(() => { ana.close(); gm.close(); anaBase.close(); gmSig.close(); });
  assert.ok(await waitUntil(() => gmSig.state() === "open", 15000));
  const got = [];
  gm.onMessage((m) => got.push(m));
  ana.send("gm", { type: "OLA", n: 2 });
  assert.ok(await waitUntil(() => got.length > 0, 15000));
  assert.equal(offers.length, 1, "uma oferta só");
});

test("par com o próprio id em peer-joined é ignorado mesmo com a lista vazia", () => {
  const { FakeWebSocket, sockets } = fakeWebSocketClass();
  const client = createVttSignalingClient({ url: "ws://x", peerId: "ana", WebSocketImpl: FakeWebSocket });
  const joined = [];
  client.onPeerJoined((id) => joined.push(id));
  sockets[0].open();
  sockets[0].confirm("ana");
  sockets[0].receive(JSON.stringify({ type: "peer-joined", peerId: "ana" }));
  assert.deepEqual(joined, []);
  assert.equal(client.isPeerOnline("ana"), false);
});

test("o Mestre com elo ainda fechado não oferta quando o jogador reaparece", async () => {
  const sent = [];
  let joinFn = null;
  let deliver = null;
  const stubPc = () => ({
    localDescription: { type: "answer", sdp: "s" },
    createAnswer: async () => ({ type: "answer", sdp: "s" }), setLocalDescription: async () => {}, setRemoteDescription: async () => {},
    createOffer: async () => ({ type: "offer", sdp: "s" }), createDataChannel: () => ({ readyState: "connecting" }), close() {},
  });
  const signaling = {
    send: (d) => { sent.push(d); return true; }, onMessage: (fn) => { deliver = fn; return () => {}; },
    onPeerJoined: (fn) => { joinFn = fn; return () => {}; },
  };
  const gm = createRtcVttTransport({ peerId: "gm", signaling, createPeerConnection: stubPc });
  deliver({ type: "offer", from: "ana", sdp: { type: "offer", sdp: "x" } });
  assert.ok(await waitUntil(() => sent.some((d) => d.type === "answer"), 15000));
  joinFn("ana");
  await flush();
  assert.equal(sent.filter((d) => d.type === "offer").length, 0, "só quem inicia oferta");
  gm.close();
});

test("resposta recebida encerra a oferta em voo: nova entrada do par reoferta na hora", async () => {
  const stubPc = () => ({
    localDescription: { type: "offer", sdp: "s" }, createOffer: async () => ({ type: "offer", sdp: "s" }), setLocalDescription: async () => {},
    setRemoteDescription: async () => {}, createDataChannel: () => ({ readyState: "connecting" }), close() {},
  });
  const rig = reofferRig({ now: () => 1000, createPeerConnection: stubPc });
  rig.t.send("gm", { type: "OLA" });
  rig.join("gm");
  assert.ok(await waitUntil(() => rig.offers() === 1, 15000));
  rig.join("gm");
  await flush();
  assert.equal(rig.offers(), 1);
  rig.deliver({ type: "answer", from: "gm", sdp: { type: "answer", sdp: "x" } });
  await flush();
  rig.join("gm");
  assert.ok(await waitUntil(() => rig.offers() === 2, 15000), "sem oferta em voo, reoferta sem esperar o prazo");
  rig.t.close();
});

test("o cancelamento padrão do prazo não depende de `this` (clearTimeout do navegador lança com receptor errado)", () => {
  const real = globalThis.clearTimeout;
  let calls = 0;
  globalThis.clearTimeout = function strictClear(handle) {
    if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
    calls += 1;
    return real(handle);
  };
  try {
    const { FakeWebSocket, sockets } = fakeWebSocketClass();
    const client = createVttSignalingClient({ url: "ws://x", peerId: "gm", WebSocketImpl: FakeWebSocket });
    sockets[0].open();
    sockets[0].confirm("gm");
    assert.equal(client.state(), "open");
    client.close();
    assert.ok(calls >= 1, "o prazo foi cancelado");
  } finally {
    globalThis.clearTimeout = real;
  }
});
