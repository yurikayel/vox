/**
 * @file Admissão de chaves Fairplay pelo Mestre, snapshot refeito a partir de ops assinadas e selo só para quem participou.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";
import { generateRoomKey, generateVttKeypair, signVttOp } from "../client/js/dungeon/vtt-sync-codec.js";
import { createInMemorySyncHub, createVttSyncPeer } from "../client/js/dungeon/vtt-sync.js";

const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const ID = "mesa-fp-adm";

function makeStore() {
  return createVttStore(createMemoryVttBackend(), {
    requestPersistenceFn: async () => ({ persisted: true, isSupported: true }),
    estimateStorageFn: async () => ({ quota: 100000, usage: 100, percentage: 0.1, isSupported: true }),
    checkPersistenceFn: async () => true,
  });
}

async function setup() {
  const [gm, player, stranger] = [await generateVttKeypair(), await generateVttKeypair(), await generateVttKeypair()];
  const env = { gm, player, stranger, roomKey: generateRoomKey(), hub: createInMemorySyncHub(), gmStore: makeStore(), playerStore: makeStore() };
  await env.gmStore.saveCampaign(createCampaign({ id: ID, name: "Mesa", gmRouteId: gm.routeId }));
  return env;
}

function peers(env, playerOpts = {}) {
  const gmPeer = createVttSyncPeer({ role: "gm", campaignId: ID, keypair: env.gm, store: env.gmStore, transport: env.hub.connect(env.gm.routeId), roomKey: env.roomKey });
  const peer = createVttSyncPeer({ role: "player", campaignId: ID, keypair: env.player, store: env.playerStore, transport: env.hub.connect(env.player.routeId), roomKey: env.roomKey, gmRouteId: env.gm.routeId, ...playerOpts });
  return { gmPeer, peer };
}

test("admissão: o Mestre recusa chave de quem não entrou na mesa, com motivo próprio", async () => {
  const env = await setup();
  const rejected = [];
  const { gmPeer, peer } = peers(env);
  const wire = env.hub.connect(env.stranger.routeId);
  wire.onMessage((m) => { if (m.kind === "OP_REJECTED") rejected.push(m.reason); });
  const op = await signVttOp(createVttOp({ type: "FAIRPLAY_KEY", payload: { publicKeyJwk: env.stranger.publicJwk }, lamport: 3 }), env.stranger);
  wire.send(env.gm.routeId, { kind: "ACTION_OP", roomKey: env.roomKey, op });
  await wait();
  assert.deepEqual(rejected, ["not_admitted"]);
  assert.deepEqual((await env.gmStore.loadCampaign(ID)).fairplay.keys, {});
  peer.join();
  await wait();
  await peer.dispatchOp({ type: "FAIRPLAY_KEY", payload: { publicKeyJwk: env.player.publicJwk } });
  await wait();
  assert.deepEqual(Object.keys((await env.gmStore.loadCampaign(ID)).fairplay.keys), [env.player.routeId], "quem entrou na mesa é aceito");
  gmPeer.close();
  peer.close();
});

test("admissão: o jogador não aplica chave de quem o Mestre não admitiu", async () => {
  const env = await setup();
  const { gmPeer, peer } = peers(env);
  peer.join();
  await wait();
  const signed = await signVttOp(createVttOp({ type: "FAIRPLAY_KEY", payload: { publicKeyJwk: env.stranger.publicJwk }, lamport: 4 }), env.stranger);
  gmPeer.close();
  const gmWire = env.hub.connect(env.gm.routeId);
  gmWire.send(env.player.routeId, { kind: "COMMIT_OP", roomKey: env.roomKey, op: signed });
  await wait();
  assert.deepEqual((await env.playerStore.loadCampaign(ID)).fairplay.keys, {});
  peer.close();
});

test("snapshot: o estado Fairplay pronto do snapshot é descartado e refeito das ops assinadas", async () => {
  const env = await setup();
  const { gmPeer, peer } = peers(env);
  const wire = env.hub.connect("fio-do-mestre");
  peer.join();
  await wait();
  gmPeer.close();
  const gmWire = env.hub.connect(env.gm.routeId);
  const forged = createCampaign({ id: ID, name: "Mesa", gmRouteId: env.gm.routeId });
  forged.fairplay = { keys: { [env.stranger.routeId]: { alg: "x", publicKeyJwk: env.stranger.publicJwk, lamport: 1 } }, rolls: {} };
  const admit = (who) => signVttOp(createVttOp({ type: "FAIRPLAY_ADMIT", actor: env.gm.routeId, payload: { actor: who.routeId }, lamport: 1 }), env.gm);
  const admits = [await admit(env.player), await admit(env.stranger)];
  const real = await signVttOp(createVttOp({ type: "FAIRPLAY_KEY", payload: { publicKeyJwk: env.player.publicJwk }, lamport: 2 }), env.player);
  const bad = { ...(await signVttOp(createVttOp({ type: "FAIRPLAY_KEY", payload: { publicKeyJwk: env.stranger.publicJwk }, lamport: 3 }), env.stranger)), sig: "AAAA" };
  gmWire.send(env.player.routeId, { kind: "SNAPSHOT_FILTERED", roomKey: env.roomKey, campaign: forged, fairplayOps: [...admits, real, bad], admitted: [env.gm.routeId, env.player.routeId, env.stranger.routeId] });
  await wait();
  assert.deepEqual(Object.keys((await env.playerStore.loadCampaign(ID)).fairplay.keys), [env.player.routeId]);
  wire.close?.();
  peer.close();
});
