/**
 * @file Regressão PM-111: o jogador envia o HELLO_SYNC ao entrar; se o Mestre ainda não escuta (sob carga), o envio
 * se perdia e o jogador ficava sem estado e sem admissão. Agora há reenvio limitado, com espera crescente, que para
 * quando o estado chega ou ao estourar o limite; no Mestre, repetir o HELLO não duplica nem reinicia nada.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign } from "../client/js/dungeon/vtt-schema.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";
import { generateRoomKey, generateVttKeypair } from "../client/js/dungeon/vtt-sync-codec.js";
import * as sync from "../client/js/dungeon/vtt-sync.js";
import { settlePeers, waitUntil } from "./helpers/wait-until.js";

const { createInMemorySyncHub, createVttSyncPeer } = sync;
const HELLO_RETRY_LIMIT = sync.HELLO_RETRY_LIMIT ?? 4;
const ID = "mesa-hello";

function makeStore() {
  return createVttStore(createMemoryVttBackend(), {
    requestPersistenceFn: async () => ({ persisted: true, isSupported: true }),
    estimateStorageFn: async () => ({ quota: 100000, usage: 100, percentage: 0.1, isSupported: true }),
    checkPersistenceFn: async () => true,
  });
}

/** Relógio manual: guarda os atrasos pedidos e dispara a próxima espera sob comando do teste. */
function manualClock() {
  const pending = [];
  return { delays: [], schedule(fn, ms) { this.delays.push(ms); pending.push(fn); return pending.length; }, cancel() { pending.length = 0; }, fire() { pending.shift()?.(); }, count: () => pending.length };
}

async function setup() {
  const [gm, player] = [await generateVttKeypair(), await generateVttKeypair()];
  const env = { gm, player, roomKey: generateRoomKey(), hub: createInMemorySyncHub(), gmStore: makeStore(), playerStore: makeStore() };
  await env.gmStore.saveCampaign(createCampaign({ id: ID, name: "Mesa", gmRouteId: gm.routeId }));
  return env;
}

function makeGm(env) {
  return createVttSyncPeer({ role: "gm", campaignId: ID, keypair: env.gm, store: env.gmStore, transport: env.hub.connect(env.gm.routeId), roomKey: env.roomKey });
}

function makePlayer(env, extra) {
  return createVttSyncPeer({ role: "player", campaignId: ID, keypair: env.player, store: env.playerStore, transport: env.hub.connect(env.player.routeId), roomKey: env.roomKey, gmRouteId: env.gm.routeId, ...extra });
}

test("o Mestre começa a escutar depois: o reenvio do HELLO sincroniza o jogador", async () => {
  const env = await setup();
  const clock = manualClock();
  const player = makePlayer(env, { schedule: (fn, ms) => clock.schedule(fn, ms), cancel: () => clock.cancel() });
  player.join();
  assert.equal(await env.playerStore.loadCampaign(ID), null, "o primeiro envio se perdeu");
  const gm = makeGm(env);
  clock.fire();
  await waitUntil(async () => (await env.playerStore.loadCampaign(ID)) != null);
  await settlePeers(gm, player);
  assert.ok(await env.playerStore.loadCampaign(ID), "o jogador recebeu o estado da mesa");
  assert.equal(clock.count(), 0, "chegou o estado: nada mais é reagendado");
  gm.close();
  player.close();
});

test("o Mestre nunca responde: os envios ficam no limite e há uma única parada limpa", async () => {
  const env = await setup();
  const clock = manualClock();
  const sends = [];
  const wire = env.hub.connect(env.gm.routeId);
  wire.onMessage((m) => { if (m.kind === "HELLO_SYNC") sends.push(m); });
  const stops = [];
  const player = makePlayer(env, { schedule: (fn, ms) => clock.schedule(fn, ms), cancel: () => clock.cancel(), onHelloGaveUp: (info) => stops.push(info) });
  player.join();
  for (let i = 0; i < 30; i += 1) clock.fire();
  assert.equal(sends.length, 1 + HELLO_RETRY_LIMIT);
  assert.deepEqual(stops, [{ reason: "no_response" }]);
  assert.ok(clock.delays.every((d, i) => i === 0 || d > clock.delays[i - 1]), "a espera cresce a cada reenvio");
  player.close();
});

test("HELLO repetido no Mestre não duplica o par nem muda o estado", async () => {
  const env = await setup();
  const counts = [];
  const gm = createVttSyncPeer({ role: "gm", campaignId: ID, keypair: env.gm, store: env.gmStore, transport: env.hub.connect(env.gm.routeId), roomKey: env.roomKey, onPeerCountChange: (n) => counts.push(n) });
  const player = makePlayer(env);
  for (let i = 0; i < 4; i += 1) player.join();
  await settlePeers(gm, player);
  assert.deepEqual(counts, [1], "o par entra uma vez só");
  assert.equal(gm.getPeerCount(), 1);
  const first = await env.gmStore.loadCampaign(ID);
  player.join();
  await settlePeers(gm, player);
  assert.deepEqual(await env.gmStore.loadCampaign(ID), first, "o estado do Mestre ficou igual");
  gm.close();
  player.close();
});
