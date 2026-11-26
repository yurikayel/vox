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
