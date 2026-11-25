/**
 * @file Endurecimento da sincronização da mesa para o Fairplay: remetente e assinatura na chegada,
 * relógio do autor dentro de tolerância no Mestre e op recusada na chegada vira pedido de snapshot.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";
import { generateRoomKey, generateVttKeypair, signVttOp } from "../client/js/dungeon/vtt-sync-codec.js";
import { createInMemorySyncHub, createVttSyncPeer } from "../client/js/dungeon/vtt-sync.js";

const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const ID = "mesa-fp-sync";

function makeStore() {
  return createVttStore(createMemoryVttBackend(), {
    requestPersistenceFn: async () => ({ persisted: true, isSupported: true }),
    estimateStorageFn: async () => ({ quota: 100000, usage: 100, percentage: 0.1, isSupported: true }),
    checkPersistenceFn: async () => true,
  });
}

async function setup() {
  const [gm, player, other] = [await generateVttKeypair(), await generateVttKeypair(), await generateVttKeypair()];
  const roomKey = generateRoomKey();
  const hub = createInMemorySyncHub();
  const gmStore = makeStore();
  const playerStore = makeStore();
  await gmStore.saveCampaign(createCampaign({ id: ID, name: "Mesa", gmRouteId: gm.routeId }));
  return { gm, player, other, roomKey, hub, gmStore, playerStore };
}

async function joinedPlayer(env, extra = {}) {
  const gmPeer = createVttSyncPeer({ role: "gm", campaignId: ID, keypair: env.gm, store: env.gmStore, transport: env.hub.connect(env.gm.routeId), roomKey: env.roomKey, ...extra.gm });
  const peer = createVttSyncPeer({ role: "player", campaignId: ID, keypair: env.player, store: env.playerStore, transport: env.hub.connect(env.player.routeId), roomKey: env.roomKey, gmRouteId: env.gm.routeId, ...extra.player });
  peer.join();
  await wait();
  return { gmPeer, peer };
}

const keyOp = (kp, over = {}) => createVttOp({ type: "FAIRPLAY_KEY", actor: kp.routeId, payload: { publicKeyJwk: kp.publicJwk }, lamport: 5, ...over });

test("sync: snapshot de quem não é o Mestre não substitui a campanha do jogador", async () => {
  const env = await setup();
  const { gmPeer, peer } = await joinedPlayer(env);
  const forged = createCampaign({ id: ID, name: "Falsa", gmRouteId: env.other.routeId });
  forged.fairplay = { keys: { [env.other.routeId]: { alg: "x", publicKeyJwk: env.other.publicJwk, lamport: 1 } }, rolls: {} };
  env.hub.connect(env.other.routeId).send(env.player.routeId, { kind: "SNAPSHOT_FILTERED", roomKey: env.roomKey, campaign: forged });
  await wait();
  const saved = await env.playerStore.loadCampaign(ID);
  assert.equal(saved.name, "Mesa");
  assert.deepEqual(saved.fairplay.keys, {});
  gmPeer.close();
  peer.close();
});

test("sync: COMMIT_OP de quem não é o Mestre não chega ao log do jogador", async () => {
  const env = await setup();
  const { gmPeer, peer } = await joinedPlayer(env);
  const signed = await signVttOp(keyOp(env.other), env.other);
  env.hub.connect(env.other.routeId).send(env.player.routeId, { kind: "COMMIT_OP", roomKey: env.roomKey, op: signed });
  await wait();
  assert.deepEqual((await env.playerStore.loadCampaign(ID)).fairplay.keys, {});
  gmPeer.close();
  peer.close();
});

test("sync: op Fairplay do Mestre sem assinatura válida ou com autor trocado é recusada", async () => {
  const env = await setup();
  const { gmPeer, peer } = await joinedPlayer(env);
  const gmWire = env.hub.connect(`${env.gm.routeId}`);
  const send = (op) => gmWire.send(env.player.routeId, { kind: "COMMIT_OP", roomKey: env.roomKey, op });
  const signed = await signVttOp(keyOp(env.other), env.other);
  const { sig: _sig, ...unsigned } = signed;
  send(unsigned);
  send({ ...signed, actor: env.player.routeId });
  await wait();
  assert.deepEqual((await env.playerStore.loadCampaign(ID)).fairplay.keys, {});
  gmWire.send(env.player.routeId, { kind: "COMMIT_OP", roomKey: env.roomKey, op: signed, admitted: [env.gm.routeId, env.other.routeId] });
  await wait();
  assert.deepEqual(Object.keys((await env.playerStore.loadCampaign(ID)).fairplay.keys), [env.other.routeId], "op íntegra do Mestre entra");
  gmPeer.close();
  peer.close();
});

test("sync: o Mestre recusa op Fairplay com relógio do autor fora da tolerância", async () => {
  const env = await setup();
  const rejected = [];
  const { gmPeer, peer } = await joinedPlayer(env, { player: { onRejected: (m) => rejected.push(m) } });
  await peer.dispatchOp({ type: "FAIRPLAY_KEY", payload: { publicKeyJwk: env.player.publicJwk }, ts: Date.now() + 60_000 });
  await wait();
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason, "ts_out_of_range");
  assert.deepEqual((await env.gmStore.loadCampaign(ID)).fairplay.keys, {});
  await peer.dispatchOp({ type: "FAIRPLAY_KEY", payload: { publicKeyJwk: env.player.publicJwk }, ts: Date.now() });
  await wait();
  assert.deepEqual(Object.keys((await env.gmStore.loadCampaign(ID)).fairplay.keys), [env.player.routeId]);
  gmPeer.close();
  peer.close();
});

test("sync: op recusada na chegada ao jogador vira pedido de novo snapshot, sem descartar em silêncio", async () => {
  const env = await setup();
  const { gmPeer, peer } = await joinedPlayer(env);
  gmPeer.close();
  const asked = [];
  const gmWire = env.hub.connect(env.gm.routeId);
  gmWire.onMessage((m) => asked.push(m.kind));
  const open = await signVttOp(createVttOp({ type: "FAIRPLAY_OPEN", payload: { rollId: "roll-x", sides: 20 }, lamport: 9 }), env.other);
  gmWire.send(env.player.routeId, { kind: "COMMIT_OP", roomKey: env.roomKey, op: open });
  await wait();
  assert.deepEqual(asked, ["HELLO_SYNC"]);
  peer.close();
});
