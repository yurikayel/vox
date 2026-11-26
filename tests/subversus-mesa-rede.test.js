/**
 * @file SUB-08 fatia 1: transporte da Mesa sobre RTCDataChannel (cumpre o contrato do createVttSyncPeer, recusa o que
 * excede o canal, não usa TURN e prova que o conteúdo da mesa só passa por canal de dados).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCampaign } from "../client/js/dungeon/vtt-schema.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";
import { generateRoomKey, generateVttKeypair } from "../client/js/dungeon/vtt-sync-codec.js";
import { createVttSyncPeer } from "../client/js/dungeon/vtt-sync.js";
import { createRtcVttTransport, stunOnly, VTT_CHANNEL_LABEL } from "../client/js/dungeon/vtt-rtc-transport.js";
import { createFakeRtcNetwork, createFakeSignalingHub } from "./helpers/fake-rtc.js";
import { waitUntil } from "./helpers/wait-until.js";

function pair(extra = {}) {
  const rtc = createFakeRtcNetwork();
  const hub = createFakeSignalingHub();
  const events = [];
  const base = { createPeerConnection: rtc.createPeerConnection };
  const gm = createRtcVttTransport({ ...base, peerId: "gm", signaling: hub.connect("gm"), onStatus: (id, s) => events.push(["gm", id, s]), ...extra.gm });
  const ana = createRtcVttTransport({ ...base, peerId: "ana", initiate: true, signaling: hub.connect("ana"), onStatus: (id, s) => events.push(["ana", id, s]), ...extra.ana });
  return { rtc, hub, gm, ana, events };
}

const memoryStore = () => createVttStore(createMemoryVttBackend(), {
  requestPersistenceFn: async () => ({ persisted: true, isSupported: true }),
  estimateStorageFn: async () => ({ quota: 1e5, usage: 1, percentage: 0.1, isSupported: true }),
  checkPersistenceFn: async () => true,
});

test("contrato: o jogador abre o canal no primeiro envio, a mensagem chega ao Mestre e o `from` vem do canal", async () => {
  const { gm, ana, rtc } = pair();
  const got = [];
  gm.onMessage((m) => got.push(m));
  assert.equal(ana.peerId, "ana");
  ana.send("gm", { type: "HELLO_SYNC", from: "gm", n: 1 });
  ana.send("gm", { type: "HELLO_SYNC", n: 2 });
  await waitUntil(() => got.length === 2);
  assert.deepEqual(got.map((m) => [m.n, m.from]), [[1, "ana"], [2, "ana"]], "ordem preservada e `from` não forjável");
  rtc.log.channels[0].send(JSON.stringify({ type: "FORJADO", from: "gm" }));
  await waitUntil(() => got.length === 3);
  assert.equal(got[2].from, "ana", "o `from` no corpo do quadro não vale: o canal diz quem fala");
  const back = [];
  ana.onMessage((m) => back.push(m));
  gm.send("ana", { type: "PONG" });
  await waitUntil(() => back.length === 1);
  assert.equal(back[0].from, "gm");
});

test("mesa completa: HELLO_SYNC do jogador chega ao Mestre e o SNAPSHOT_FILTERED volta pelo canal de dados", async () => {
  const rtc = createFakeRtcNetwork();
  const hub = createFakeSignalingHub();
  const [gmKey, anaKey] = [await generateVttKeypair(), await generateVttKeypair()];
  const roomKey = generateRoomKey();
  const [gmStore, anaStore] = [memoryStore(), memoryStore()];
  await gmStore.saveCampaign(createCampaign({ id: "mesa-rede", name: "Mesa", gmRouteId: gmKey.routeId }));
  const tr = (key, initiate) => createRtcVttTransport({ peerId: key.routeId, initiate, signaling: hub.connect(key.routeId), createPeerConnection: rtc.createPeerConnection });
  const gm = createVttSyncPeer({ role: "gm", campaignId: "mesa-rede", keypair: gmKey, store: gmStore, transport: tr(gmKey, false), roomKey });
  const ana = createVttSyncPeer({ role: "player", campaignId: "mesa-rede", keypair: anaKey, store: anaStore, transport: tr(anaKey, true), roomKey, gmRouteId: gmKey.routeId });
  ana.join();
  await waitUntil(async () => Boolean(await anaStore.loadCampaign("mesa-rede")), 5000);
  assert.equal((await anaStore.loadCampaign("mesa-rede")).name, "Mesa");
  gm.close();
  ana.close();
});

test("recusa: mensagem acima do teto do canal não sai, avisa `oversize` e a mesa segue funcionando", async () => {
  const { gm, ana, rtc, events } = pair({ ana: { maxMessageBytes: 200 } });
  const got = [];
  gm.onMessage((m) => got.push(m));
  assert.equal(ana.send("gm", { type: "SNAPSHOT_FILTERED", blob: "x".repeat(500) }), false);
  assert.ok(events.some((e) => e[0] === "ana" && e[2] === "oversize"));
  assert.equal(rtc.log.sent.length, 0, "nada excedente foi ao canal");
  assert.equal(ana.send("gm", { type: "OK" }), true);
  await waitUntil(() => got.length === 1);
  assert.equal(got[0].type, "OK");
});

test("D3: o conteúdo da mesa passa só por RTCDataChannel; a sinalização leva apenas oferta, resposta e ICE", async () => {
  const traps = ["fetch", "WebSocket", "BroadcastChannel", "XMLHttpRequest"].map((k) => [k, globalThis[k]]);
  for (const [k] of traps) globalThis[k] = function trap() { throw new Error(`mesa usou ${k}`); };
  try {
    const { gm, ana, rtc, hub } = pair();
    const got = [];
    gm.onMessage((m) => got.push(m));
    ana.send("gm", { type: "COMMIT_OP", marker: "SEGREDO-DA-MESA" });
    await waitUntil(() => got.length === 1);
    assert.deepEqual([...new Set(rtc.log.labels)], [VTT_CHANNEL_LABEL]);
    assert.ok(rtc.log.sent.some((t) => t.includes("SEGREDO-DA-MESA")), "o conteúdo foi pelo canal de dados");
    assert.ok(hub.log.every((m) => ["offer", "answer", "ice"].includes(m.type)), "sinalização só negocia");
    assert.ok(!JSON.stringify(hub.log).includes("SEGREDO-DA-MESA"), "a sinalização nunca vê o conteúdo");
  } finally {
    for (const [k, v] of traps) globalThis[k] = v;
  }
});

test("recusa: sem WebRTC no navegador o transporte não nasce e diz o motivo em português", () => {
  const saved = globalThis.RTCPeerConnection;
  delete globalThis.RTCPeerConnection;
  try {
    assert.throws(() => createRtcVttTransport({ peerId: "a", signaling: createFakeSignalingHub().connect("a") }), /WebRTC indisponível neste navegador/);
  } finally {
    if (saved) globalThis.RTCPeerConnection = saved;
  }
});

test("D4: só STUN no v1; entradas turn:/turns: são descartadas e o padrão é STUN público", () => {
  const mixed = [{ urls: "stun:a.example:3478" }, { urls: "turn:t.example" }, { urls: ["stun:b.example", "turns:t.example"] }, { urls: ["stun:c.example"] }];
  assert.deepEqual(stunOnly(mixed).map((s) => s.urls), ["stun:a.example:3478", ["stun:c.example"]]);
  const seen = [];
  globalThis.RTCPeerConnection = function Fake(cfg) { seen.push(cfg); Object.assign(this, createFakeRtcNetwork().createPeerConnection()); };
  try {
    createRtcVttTransport({ peerId: "a", iceServers: [{ urls: "turn:t.example" }], signaling: createFakeSignalingHub().connect("a") }).connect("gm");
    assert.ok(seen[0].iceServers.length > 0 && seen[0].iceServers.every((s) => /^stun:/.test(s.urls)));
  } finally {
    delete globalThis.RTCPeerConnection;
  }
});

test("queda: fechar o canal avisa `closed` e o próximo envio reconecta", async () => {
  const { gm, ana, rtc, events } = pair();
  const got = [];
  gm.onMessage((m) => got.push(m));
  ana.send("gm", { type: "A" });
  await waitUntil(() => got.length === 1);
  rtc.log.channels.forEach((ch) => ch.close());
  assert.ok(await waitUntil(() => events.some((e) => e[0] === "ana" && e[2] === "closed")), "o jogador soube da queda");
  ana.send("gm", { type: "B" });
  await waitUntil(() => got.length === 2);
  assert.equal(got[1].type, "B");
  assert.equal(events.filter((e) => e[0] === "ana" && e[2] === "open").length, 2);
});

test("o módulo de rede carrega sob demanda: não está em SHELL_ASSETS", () => {
  const sw = readFileSync(new URL("../client/sw.js", import.meta.url), "utf8");
  const shell = sw.split("const SHELL_ASSETS")[1].split("const UNPLUGGED_MODULES")[0];
  assert.ok(!shell.includes("vtt-rtc-transport"));
});

test("o carregador sob demanda entrega o transporte (import dinâmico, não estático)", async () => {
  const join = readFileSync(new URL("../client/js/dungeon/dungeon-vtt-join.js", import.meta.url), "utf8");
  assert.ok(!/^import .*vtt-rtc-transport/m.test(join), "sem import estático no join");
  const { loadRtcVttTransport } = await import("../client/js/dungeon/dungeon-vtt-join.js");
  assert.equal(typeof (await loadRtcVttTransport()).createRtcVttTransport, "function");
});

const noSignaling = (onEmit) => ({ send() {}, onMessage(fn) { onEmit?.(fn); return () => {}; } });

test("entrada não confiável: lixo, JSON inválido, acima do teto, array, número e não-string não chegam ao ouvinte nem derrubam o elo", async () => {
  const { gm, ana, rtc, events } = pair();
  const got = [];
  gm.onMessage((m) => got.push(m));
  ana.send("gm", { type: "OK1" });
  await waitUntil(() => got.length === 1);
  const wire = rtc.log.channels[0];
  const huge = JSON.stringify({ type: "GRANDE", pad: "a".repeat(262144) });
  for (const raw of ["lixo", "{nao e json", huge, "[1,2]", "42", "null", "\"texto\"", 42, null, undefined, { type: "objeto-cru" }, ["a"]]) wire.send(raw);
  gm.onMessage(() => { throw new Error("ouvinte ruim"); });
  ana.send("gm", { type: "OK2" });
  await waitUntil(() => got.length === 2);
  assert.deepEqual(got.map((m) => m.type), ["OK1", "OK2"], "só mensagens válidas chegam");
  assert.equal(events.some((e) => e[2] === "closed"), false, "o elo não caiu");
});

test("sinalização não confiável: tipo desconhecido, forma errada e `from` absurdo não criam elo nem lançam", () => {
  let emit;
  let pcs = 0;
  createRtcVttTransport({ peerId: "gm", signaling: noSignaling((fn) => { emit = fn; }), createPeerConnection: () => { pcs += 1; return createFakeRtcNetwork().createPeerConnection(); } });
  const junk = [null, [], "x", 7, {}, { type: "evil", from: "x", sdp: {} }, { type: "offer", from: "x", sdp: "texto" }, { type: "offer", from: "x" }, { type: "ice", from: "x", candidate: "s" }, { type: "offer", from: "y".repeat(300), sdp: {} }, { type: "offer", from: "gm", sdp: {} }, { type: "offer", from: 5, sdp: {} }];
  for (const data of junk) assert.doesNotThrow(() => emit(data));
  assert.equal(pcs, 0, "nenhuma conexão nasceu de sinal inválido");
});

function slowRemote(network) {
  return () => {
    const pc = network.createPeerConnection();
    const original = pc.setRemoteDescription;
    pc.hasRemote = false;
    pc.setRemoteDescription = async (desc) => {
      for (let i = 0; i < 6; i += 1) await Promise.resolve();
      await original(desc);
      pc.hasRemote = true;
    };
    pc.addIceCandidate = async () => { if (!pc.hasRemote) throw new Error("sem remote description"); };
    return pc;
  };
}

test("corrida: ICE colado na oferta e na resposta espera a remote description (fake assíncrono) e o elo não cai", async () => {
  const rtc = createFakeRtcNetwork();
  const hub = createFakeSignalingHub();
  const events = [];
  const withIce = (sig) => ({ onMessage: sig.onMessage, send(data) { sig.send(data); if (data.type !== "ice") sig.send({ type: "ice", to: data.to, candidate: { candidate: "c" } }); } });
  const make = (peerId, initiate) => createRtcVttTransport({ peerId, initiate, signaling: withIce(hub.connect(peerId)), createPeerConnection: slowRemote(rtc), onStatus: (id, s) => events.push([peerId, id, s]) });
  const [gm, ana] = [make("gm", false), make("ana", true)];
  const got = [];
  gm.onMessage((m) => got.push(m));
  ana.send("gm", { type: "OI" });
  await waitUntil(() => got.length === 1);
  assert.ok(hub.log.filter((m) => m.type === "ice").length >= 2, "offer→ice e answer→ice foram enviados");
  assert.equal(events.some((e) => e[2] === "closed"), false, "nenhum elo caiu");
});

test("fila de espera cheia: a 65ª mensagem antes de o canal abrir devolve false e avisa `queue_full`", () => {
  const events = [];
  const ana = createRtcVttTransport({ peerId: "ana", initiate: true, signaling: noSignaling(), createPeerConnection: createFakeRtcNetwork().createPeerConnection, onStatus: (id, s) => events.push(s) });
  for (let i = 0; i < 64; i += 1) assert.equal(ana.send("gm", { n: i }), true);
  assert.equal(ana.send("gm", { n: 64 }), false);
  assert.ok(events.includes("queue_full"));
});

test("close(): depois de fechar, enviar, conectar e sinais não recriam o elo", async () => {
  let pcs = 0;
  const net = createFakeRtcNetwork();
  let emit;
  const ana = createRtcVttTransport({ peerId: "ana", initiate: true, signaling: noSignaling((fn) => { emit = fn; }), createPeerConnection: () => { pcs += 1; return net.createPeerConnection(); } });
  ana.close();
  assert.equal(ana.send("gm", { type: "X" }), false);
  ana.connect("gm");
  emit({ type: "offer", from: "gm", sdp: { type: "offer", pcId: 1 } });
  await Promise.resolve();
  assert.equal(pcs, 0);
});

test("falha ao esvaziar a fila no onopen derruba só esse elo, sem lançar", async () => {
  const { ana, rtc, events } = pair();
  ana.send("gm", { type: "A" });
  rtc.log.channels[0].send = () => { throw new Error("canal quebrou"); };
  assert.ok(await waitUntil(() => events.some((e) => e[0] === "ana" && e[2] === "closed")), "o elo foi descartado");
});

test("teto em BYTES: texto multibyte (é, emoji) com .length abaixo do teto mas bytes acima é recusado", async () => {
  const { gm, ana, rtc } = pair();
  const got = [];
  gm.onMessage((m) => got.push(m));
  ana.send("gm", { type: "OK1" });
  await waitUntil(() => got.length === 1);
  const wire = rtc.log.channels[0];
  const accents = JSON.stringify({ type: "ACENTOS", pad: "é".repeat(140000) });
  const emoji = JSON.stringify({ type: "EMOJI", pad: "😀".repeat(70000) });
  for (const raw of [accents, emoji]) {
    assert.ok(raw.length < 262144 && new TextEncoder().encode(raw).length > 262144, "a prova exige .length abaixo e bytes acima do teto");
    wire.send(raw);
  }
  ana.send("gm", { type: "OK2" });
  await waitUntil(() => got.length === 2);
  assert.deepEqual(got.map((m) => m.type), ["OK1", "OK2"]);
});

test("sinalização: `from` com 257 caracteres é recusado e com 256 é aceito", () => {
  let emit;
  let pcs = 0;
  const factory = () => { pcs += 1; return createFakeRtcNetwork().createPeerConnection(); };
  createRtcVttTransport({ peerId: "gm", signaling: noSignaling((fn) => { emit = fn; }), createPeerConnection: factory });
  emit({ type: "offer", from: "p".repeat(257), sdp: { type: "offer", pcId: 1 } });
  assert.equal(pcs, 0, "257 caracteres: recusado");
  emit({ type: "offer", from: "p".repeat(256), sdp: { type: "offer", pcId: 1 } });
  return waitUntil(() => pcs === 1).then((ok) => assert.ok(ok, "256 caracteres: aceito"));
});

test("teto de elos: o Mestre recusa a oferta acima do teto, libera a vaga de quem saiu e a recusada entra depois", async () => {
  const rtc = createFakeRtcNetwork();
  const hub = createFakeSignalingHub();
  const events = [];
  const gm = createRtcVttTransport({ peerId: "gm", maxLinks: 2, signaling: hub.connect("gm"), createPeerConnection: rtc.createPeerConnection, onStatus: (id, s) => events.push([id, s]) });
  const mk = (id) => createRtcVttTransport({ peerId: id, initiate: true, signaling: hub.connect(id), createPeerConnection: rtc.createPeerConnection });
  const [p1, p2, p3] = [mk("p1"), mk("p2"), mk("p3")];
  const got = [];
  gm.onMessage((m) => got.push(m.from));
  p1.send("gm", { n: 1 });
  p2.send("gm", { n: 2 });
  await waitUntil(() => got.length === 2);
  p3.send("gm", { n: 3 });
  assert.ok(await waitUntil(() => events.some((e) => e[0] === "p3" && e[1] === "link_limit")), "oferta acima do teto recusada");
  assert.deepEqual(got.sort(), ["p1", "p2"], "p3 não entrou");
  p1.close();
  assert.ok(await waitUntil(() => events.some((e) => e[0] === "p1" && e[1] === "closed")), "a vaga de quem saiu foi liberada");
  const p3b = mk("p3");
  p3b.send("gm", { n: 4 });
  assert.ok(await waitUntil(() => got.includes("p3")), "depois de liberar, p3 entra");
});

test("canal que falha ao enviar derruba só esse elo e send devolve false; o próximo envio reconecta", async () => {
  const { gm, ana, rtc, events } = pair();
  const got = [];
  gm.onMessage((m) => got.push(m));
  ana.send("gm", { type: "A" });
  await waitUntil(() => got.length === 1);
  rtc.log.channels[0].send = () => { throw new Error("canal quebrou"); };
  assert.equal(ana.send("gm", { type: "B" }), false);
  assert.ok(events.some((e) => e[0] === "ana" && e[2] === "closed"));
  assert.equal(ana.send("gm", { type: "C" }), true);
  await waitUntil(() => got.length === 2);
  assert.equal(got[1].type, "C");
});

test("cadeias de sinal: par recusado ou sem elo não deixa entrada, e a queda do elo poda a cadeia", async () => {
  const { gm, ana, rtc } = pair();
  let emit;
  const lone = createRtcVttTransport({ peerId: "x", signaling: noSignaling((fn) => { emit = fn; }), createPeerConnection: createFakeRtcNetwork().createPeerConnection });
  emit({ type: "offer", from: "p".repeat(257), sdp: { type: "offer" } });
  emit({ type: "bogus", from: "q", sdp: {} });
  emit({ type: "answer", from: "sem-elo", sdp: { type: "answer" } });
  emit({ type: "ice", from: "sem-elo", candidate: { c: 1 } });
  assert.ok(await waitUntil(() => lone.stats().chains === 0), "sinais recusados ou sem elo não guardam cadeia");
  const got = [];
  gm.onMessage((m) => got.push(m));
  ana.send("gm", { type: "A" });
  await waitUntil(() => got.length === 1);
  assert.deepEqual(gm.stats(), { links: 1, chains: 1 }, "com elo vivo a cadeia fica");
  rtc.log.channels.forEach((c) => c.close());
  assert.ok(await waitUntil(() => gm.stats().links === 0 && gm.stats().chains === 0), "elo caído: cadeia podada");
  lone.close();
});

test("queda por connectionstatechange failed também poda elo e cadeia", async () => {
  const { gm, ana, rtc } = pair();
  const got = [];
  gm.onMessage((m) => got.push(m));
  ana.send("gm", { type: "A" });
  await waitUntil(() => got.length === 1);
  const pc = rtc.last();
  pc.connectionState = "failed";
  pc.onconnectionstatechange();
  rtc.log.channels.forEach((c) => c.close());
  assert.ok(await waitUntil(() => gm.stats().chains === 0 && ana.stats().links === 0));
});

test("padrão de 16 elos; send sem elo: Mestre devolve true (nada a entregar), jogador no teto devolve false; entrada não-string é recusada", async () => {
  const rtc = createFakeRtcNetwork();
  const hub = createFakeSignalingHub();
  const events = [];
  const gm = createRtcVttTransport({ peerId: "gm", signaling: hub.connect("gm"), createPeerConnection: rtc.createPeerConnection, onStatus: (id, s) => events.push([id, s]) });
  const got = [];
  gm.onMessage((m) => got.push(m));
  const ps = Array.from({ length: 17 }, (_, i) => createRtcVttTransport({ peerId: `p${i}`, initiate: true, signaling: hub.connect(`p${i}`), createPeerConnection: rtc.createPeerConnection }));
  ps.forEach((p) => p.send("gm", { n: 1 }));
  assert.ok(await waitUntil(() => events.some((e) => e[1] === "link_limit")), "o 17º elo é recusado");
  assert.equal(gm.stats().links, 16);
  assert.equal(gm.send("ninguem", { type: "X" }), true);
  const capped = createRtcVttTransport({ peerId: "j", initiate: true, maxLinks: 0, signaling: hub.connect("j"), createPeerConnection: rtc.createPeerConnection });
  assert.equal(capped.send("gm", { type: "X" }), false);
  await waitUntil(() => got.length === 16);
  const before = got.length;
  rtc.log.channels.forEach((c) => { c.onmessage?.({ data: { type: "OBJ" } }); c.onmessage?.({ data: 42 }); });
  assert.equal(got.length, before, "dado que não é texto não vira mensagem");
});
