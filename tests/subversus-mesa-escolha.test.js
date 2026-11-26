/**
 * @file SUB-08, fatia 2c: escolha do transporte da Mesa (rede atrás da flag de laboratório, com queda para
 * `BroadcastChannel`), estado da conexão e seu texto acessível. WebSocket e RTC falsos: nenhum tráfego externo.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseVttTransport, summarizeConnection, connectionText, renderVttConnection, isMesaRedeLabEnabled, readMesaRedeUrl,
  MESA_REDE_LAB_KEY, MESA_REDE_URL_KEY, MESA_REDE_ICE_KEY, readMesaRedeIce,
} from "../client/js/dungeon/vtt-rede-escolha.js";
import { attachVttPlayerJoin } from "../client/js/dungeon/dungeon-vtt-join.js";
import * as scene from "../client/js/dungeon/dungeon-scene-actions.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";
import { buildRoomInviteHref, generateRoomKey, generateVttKeypair } from "../client/js/dungeon/vtt-sync-codec.js";
import { createFakeRtcNetwork } from "./helpers/fake-rtc.js";

const store = (flag, url) => ({
  getItem: (k) => (k === MESA_REDE_LAB_KEY ? flag : k === MESA_REDE_URL_KEY ? url : null),
});
const ON = store("1", "ws://127.0.0.1:1");

function fakeWs() {
  const sockets = [];
  class FakeWebSocket {
    constructor(url) { this.url = url; this.sent = []; this.closed = false; sockets.push(this); }
    send(text) { this.sent.push(JSON.parse(text)); }
    close() { this.closed = true; }
    receive(obj) { this.onmessage?.({ data: JSON.stringify(obj) }); }
  }
  return { FakeWebSocket, sockets };
}

const keypair = await generateVttKeypair();
const base = (extra = {}) => ({ tableId: "t", peerId: "me", keypair, initiate: true, BroadcastChannelImpl: class {}, createBroadcast: () => ({ marca: "bc" }), ...extra });

test("flag, endereço e leitura segura do armazenamento", () => {
  assert.equal(isMesaRedeLabEnabled(store("1", "")), true);
  assert.equal(isMesaRedeLabEnabled(store("0", "")), false);
  assert.equal(isMesaRedeLabEnabled({ getItem() { throw new Error("bloqueado"); } }), false);
  assert.equal(readMesaRedeUrl(store("1", "wss://no.exemplo/ws")), "wss://no.exemplo/ws");
  assert.equal(readMesaRedeUrl(store("1", "http://x")), "");
  assert.equal(readMesaRedeUrl(store("1", "javascript:alert(1)")), "");
  assert.equal(readMesaRedeUrl(store("1", `ws://${"a".repeat(600)}`)), "");
});

test("sem a flag: mesma origem, sem carregar nada da rede", async () => {
  const seen = [];
  const out = await chooseVttTransport(base({ storage: store(null, null), loadRtc: () => { throw new Error("nao devia carregar"); }, onConnection: (c) => seen.push(c) }));
  assert.equal(out.kind, "mesma_origem");
  assert.equal(out.fallback, false);
  assert.deepEqual(seen, [{ transport: "mesma_origem", status: "open", fallback: false }]);
});

test("queda para a mesma origem: sem endereço, endereço inválido ou módulo que não carrega", async () => {
  let loads = 0;
  const spy = () => { loads += 1; throw new Error("sem endereço válido não carrega a rede"); };
  const noWs = { createVttSignalingClient: () => { throw new Error("sem WebSocket"); } };
  for (const [storage, opts] of [
    [store("1", null), { loadRtc: spy }], [store("1", "http://x"), { loadRtc: spy }],
    [ON, { loadRtc: async () => { throw new Error("falhou"); } }],
    [ON, { loadSignaling: async () => noWs }],
  ]) {
    const out = await chooseVttTransport(base({ storage, ...opts }));
    assert.equal(out.kind, "mesma_origem");
    assert.equal(out.fallback, true);
  }
  assert.equal(loads, 0, "sem endereço válido nem tenta a rede");
  assert.equal(await chooseVttTransport(base({ storage: store(null, null), BroadcastChannelImpl: null })), null, "sem nenhum transporte possível");
});

test("rede: connecting, waiting_peer e error; o Mestre fica open quando o nó confirma; fechar fecha a sinalização", async () => {
  const { FakeWebSocket, sockets } = fakeWs();
  const rtc = createFakeRtcNetwork();
  const ana = [];
  const out = await chooseVttTransport(base({ storage: ON, WebSocketImpl: FakeWebSocket, createPeerConnection: rtc.createPeerConnection, onConnection: (c) => ana.push(c.status) }));
  assert.equal(out.kind, "rede");
  assert.equal(ana.at(-1), "connecting");
  sockets[0].onopen();
  sockets[0].receive({ type: "registered", peerId: "me", peers: [] });
  out.transport.send("gm", { type: "OLA" });
  assert.equal(ana.at(-1), "waiting_peer", "o Mestre ainda não está no nó");
  sockets[0].onclose();
  assert.equal(ana.at(-1), "error");
  out.transport.close();
  const gmSeen = [];
  const gmSock = fakeWs();
  const gm = await chooseVttTransport(base({ storage: ON, initiate: false, peerId: "gm", WebSocketImpl: gmSock.FakeWebSocket, createPeerConnection: rtc.createPeerConnection, onConnection: (c) => gmSeen.push(c.status) }));
  gmSock.sockets[0].onopen();
  gmSock.sockets[0].receive({ type: "registered", peerId: "gm", peers: [] });
  assert.equal(gmSeen.at(-1), "open");
  gm.transport.close();
  assert.equal(gmSock.sockets[0].closed, true, "fechar o transporte fecha também a sinalização");
});

test("resumo e texto: cada estado tem texto, o erro é dito com clareza e a região é aria-live", () => {
  const s = (signaling, links, initiate = true) => summarizeConnection({ signaling, links, initiate });
  assert.equal(s("connecting", {}), "connecting");
  assert.equal(s("error", {}), "error");
  assert.equal(s("closed", {}), "error");
  assert.equal(s("open", {}), "connecting");
  assert.equal(s("open", { gm: "waiting_peer" }), "waiting_peer");
  assert.equal(s("open", { gm: "open" }), "open");
  assert.equal(s("open", {}, false), "open");
  for (const status of ["connecting", "waiting_peer", "open", "error"]) assert.ok(connectionText({ transport: "rede", status }).length > 10);
  assert.match(connectionText({ transport: "rede", status: "error" }), /Sem conexão com o nó/);
  assert.equal(connectionText({ transport: "mesma_origem", fallback: false }), "");
  assert.match(connectionText({ transport: "mesma_origem", fallback: true }), /mesma origem/);
  const html = renderVttConnection({ vttConnection: { transport: "rede", status: "error" } });
  assert.match(html, /role="status" aria-live="polite"/);
  assert.equal(renderVttConnection({}), "");
  assert.equal(renderVttConnection({ vttConnection: { transport: "mesma_origem", fallback: false } }), "");
});

test("o jogador entra pela rede com a flag: estado na sessão e fechar o par fecha a sinalização", async () => {
  const { FakeWebSocket, sockets } = fakeWs();
  const state = createDungeonSessionState();
  const href = buildRoomInviteHref({ tableId: "mesa-rede", gmRouteId: "vx_gm", roomKey: generateRoomKey() });
  const rtc = createFakeRtcNetwork();
  const out = await attachVttPlayerJoin(state, href, { network: { storage: ON, WebSocketImpl: FakeWebSocket, createPeerConnection: rtc.createPeerConnection } });
  assert.equal(out.ok, true);
  assert.equal(state.vttConnection.transport, "rede");
  assert.equal(sockets.length, 1);
  state.syncPeer.close();
  assert.equal(sockets[0].closed, true);
});

test("o Mestre gera o convite pela rede com a flag e vê o estado open quando o nó confirma", async () => {
  const { FakeWebSocket, sockets } = fakeWs();
  const st = createDungeonSessionState({ viewerRole: "gm", campaignId: "", syncPeer: null });
  const rtc = createFakeRtcNetwork();
  const network = { storage: ON, WebSocketImpl: FakeWebSocket, createPeerConnection: rtc.createPeerConnection };
  await scene.generateTableInvite(st, { store: createVttStore(createMemoryVttBackend()), network });
  assert.equal(st.vttConnection.transport, "rede");
  sockets[0].onopen();
  sockets[0].receive({ type: "registered", peerId: st.vttKeypair.routeId, peers: [] });
  assert.equal(st.vttConnection.status, "open");
  st.syncPeer.close();
  assert.equal(sockets[0].closed, true);
});

test("endereço do nó: só ws/wss com host, sem credenciais, consulta ou fragmento; ws só em localhost", () => {
  const url = (v) => readMesaRedeUrl(store("1", v));
  for (const bad of [
    "wss://user@no.exemplo/", "wss://user:senha@no.exemplo/", "wss://no.exemplo\@outro.exemplo/", "wss://?", "wss://#x", "wss://:80",
    "wss://no%00.exemplo/", "wss://no.exemplo/?token=1", "wss://no.exemplo/#t", "wss://no.exemplo/?", "wss://no.exemplo/#",
    "ws://no.exemplo/ws", "ws://127.0.0.2/", "wss:", "ftp://no.exemplo/",
  ]) assert.equal(url(bad), "", bad);
  assert.equal(url("WSS://No.Exemplo/WS"), "wss://no.exemplo/WS", "protocolo e host em minúsculas");
  assert.equal(url("ws://localhost:3921"), "ws://localhost:3921/");
  assert.equal(url("ws://127.0.0.1:3921"), "ws://127.0.0.1:3921/");
  assert.equal(url("ws://[::1]:3921"), "ws://[::1]:3921/");
});

test("queda sem vazamento: o transporte que lança fecha a sinalização, cancela o prazo e não gera mais eventos de rede", async () => {
  const { FakeWebSocket, sockets } = fakeWs();
  const cancelled = [];
  const events = [];
  const sigMod = await import("../client/js/dungeon/vtt-signaling-client.js");
  const loadSignaling = async () => ({
    createVttSignalingClient: (o) => sigMod.createVttSignalingClient({ ...o, schedule: () => "prazo", cancel: (h) => cancelled.push(h) }),
  });
  const loadRtc = async () => ({ createRtcVttTransport: () => { throw new Error("sem RTCPeerConnection"); } });
  const out = await chooseVttTransport(base({ storage: ON, WebSocketImpl: FakeWebSocket, loadSignaling, loadRtc, onConnection: (c) => events.push(c) }));
  assert.equal(out.kind, "mesma_origem");
  assert.equal(out.fallback, true);
  assert.equal(sockets[0].closed, true, "sinalização fechada");
  assert.deepEqual(cancelled, ["prazo"], "prazo do registro cancelado");
  const after = events.length;
  sockets[0].onopen?.();
  sockets[0].receive({ type: "registered", peerId: "me", peers: [] });
  sockets[0].onclose?.();
  assert.equal(events.length, after, "o descartado não publica mais");
  assert.ok(events.every((e) => e.transport === "mesma_origem"), "nenhum evento de rede");
});

test("endereço do nó: barra invertida, %00 no caminho, senha sem usuário e o teto de 512 caracteres", () => {
  const url = (v) => readMesaRedeUrl(store("1", v));
  assert.equal(url("wss://evil.example\@good.example"), "");
  assert.equal(url("wss://a/%00"), "");
  assert.equal(url("wss://:senha@host"), "");
  const head = "wss://a.example/";
  assert.equal(url(head + "x".repeat(512 - head.length)).length, 512, "512 caracteres é aceito");
  assert.equal(url(head + "x".repeat(513 - head.length)), "", "513 caracteres é recusado");
});

test("STUN da Mesa em rede: ausente usa o padrão, vazio é só candidatos locais, inválido nunca abre tráfego externo", () => {
  const ice = (v) => readMesaRedeIce({ getItem: (k) => (k === MESA_REDE_ICE_KEY ? v : null) });
  assert.equal(ice(null), undefined);
  assert.deepEqual(ice(""), []);
  assert.deepEqual(ice("   "), []);
  assert.deepEqual(ice("stun:a.example:3478, stun:b.example"), [{ urls: "stun:a.example:3478" }, { urls: "stun:b.example" }]);
  assert.deepEqual(ice("stun:[::1]:3478"), [{ urls: "stun:[::1]:3478" }]);
  for (const bad of ["turn:t.example", "stun:a.example, turn:t.example", "http://x", "stun:", "stun:a b", "stun:a.example:99999x", "s1,s2,s3,s4,s5".replace(/s/g, "stun:a")]) {
    assert.deepEqual(ice(bad), [], bad);
  }
});

test("a rede monta o RTC só com candidatos locais quando a lista de STUN está vazia", async () => {
  const seen = [];
  const { FakeWebSocket } = fakeWs();
  const real = globalThis.RTCPeerConnection;
  globalThis.RTCPeerConnection = function Fake(cfg) { seen.push(cfg); Object.assign(this, createFakeRtcNetwork().createPeerConnection()); };
  try {
    const st = { getItem: (k) => (k === MESA_REDE_LAB_KEY ? "1" : k === MESA_REDE_URL_KEY ? "ws://127.0.0.1:1" : k === MESA_REDE_ICE_KEY ? "" : null) };
    const out = await chooseVttTransport(base({ storage: st, WebSocketImpl: FakeWebSocket }));
    out.transport.connect("gm");
    assert.deepEqual(seen.map((c) => c.iceServers), [[]]);
    out.transport.close();
    const dflt = await chooseVttTransport(base({ storage: ON, WebSocketImpl: FakeWebSocket }));
    dflt.transport.connect("gm");
    assert.ok(seen[1].iceServers.length > 0, "sem a chave, o padrão do produto continua (spec mesa-rede-v0)");
    dflt.transport.close();
  } finally {
    globalThis.RTCPeerConnection = real;
  }
});
