/**
 * @file Admissão registrada no log (FAIRPLAY_ADMIT) e estado Fairplay que sobrevive ao recarregar do Mestre.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { reduceCampaign, replayCampaignOps } from "../client/js/dungeon/vtt-reducer.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";
import { createFairplaySessionKey } from "../client/js/dungeon/vtt-fairplay-cipher.js";
import { generateRoomKey, generateVttKeypair } from "../client/js/dungeon/vtt-sync-codec.js";
import { createInMemorySyncHub, createVttSyncPeer } from "../client/js/dungeon/vtt-sync.js";

const wait = (ms = 200) => new Promise((r) => setTimeout(r, ms));
const ID = "mesa-admit";

function makeStore() {
  return createVttStore(createMemoryVttBackend(), {
    requestPersistenceFn: async () => ({ persisted: true, isSupported: true }),
    estimateStorageFn: async () => ({ quota: 100000, usage: 100, percentage: 0.1, isSupported: true }),
    checkPersistenceFn: async () => true,
  });
}

const op = (type, actor, payload, lamport) => createVttOp({ type, actor, payload, lamport });

test("admissão: chave só vale de quem o Mestre admitiu no log; ADMIT de outro ator é ignorado", async () => {
  const { publicKeyJwk } = await createFairplaySessionKey();
  let doc = createCampaign({ id: ID, name: "Mesa", gmRouteId: "gm" });
  doc = reduceCampaign(doc, op("FAIRPLAY_KEY", "ana", { publicKeyJwk }, 1));
  assert.deepEqual(doc.fairplay.keys, {}, "sem admissão a chave não entra");
  doc = reduceCampaign(doc, op("FAIRPLAY_ADMIT", "ana", { actor: "ana" }, 2));
  doc = reduceCampaign(doc, op("FAIRPLAY_KEY", "ana", { publicKeyJwk }, 3));
  assert.deepEqual(doc.fairplay.keys, {}, "quem não é o Mestre não admite");
  doc = reduceCampaign(doc, op("FAIRPLAY_ADMIT", "gm", { actor: "ana" }, 4));
  doc = reduceCampaign(doc, op("FAIRPLAY_KEY", "ana", { publicKeyJwk }, 5));
  assert.deepEqual(Object.keys(doc.fairplay.keys), ["ana"]);
  assert.deepEqual(Object.keys(doc.fairplay.admitted), ["ana"]);
});

test("admissão: vale no replay, no backup e para o próprio Mestre sem admitir a si", async () => {
  const [ana, gm] = [await createFairplaySessionKey(), await createFairplaySessionKey()];
  const ops = [
    op("FAIRPLAY_KEY", "gm", { publicKeyJwk: gm.publicKeyJwk }, 1),
    op("FAIRPLAY_ADMIT", "gm", { actor: "ana" }, 2),
    op("FAIRPLAY_KEY", "ana", { publicKeyJwk: ana.publicKeyJwk }, 3),
  ];
  const base = createCampaign({ id: ID, name: "Mesa", gmRouteId: "gm" });
  const replayed = replayCampaignOps(base, [...ops].reverse());
  assert.deepEqual(Object.keys(replayed.fairplay.keys).sort(), ["ana", "gm"]);
  const restored = createCampaign(structuredClone(replayed));
  assert.deepEqual(Object.keys(restored.fairplay.admitted), ["ana"]);
  assert.deepEqual(Object.keys(restored.fairplay.keys).sort(), ["ana", "gm"]);
});

async function setupTable() {
  const [gm, a, b] = [await generateVttKeypair(), await generateVttKeypair(), await generateVttKeypair()];
  const env = { gm, a, b, roomKey: generateRoomKey(), hub: createInMemorySyncHub(), gmStore: makeStore() };
  await env.gmStore.saveCampaign(createCampaign({ id: ID, name: "Mesa", gmRouteId: gm.routeId }));
  return env;
}

function gmPeer(env) {
  return createVttSyncPeer({ role: "gm", campaignId: ID, keypair: env.gm, store: env.gmStore, transport: env.hub.connect(env.gm.routeId), roomKey: env.roomKey });
}

function player(env, kp, store) {
  return createVttSyncPeer({ role: "player", campaignId: ID, keypair: kp, store, transport: env.hub.connect(kp.routeId), roomKey: env.roomKey, gmRouteId: env.gm.routeId });
}

async function joinWithKey(env, kp) {
  const store = makeStore();
  const peer = player(env, kp, store);
  peer.join();
  await wait();
  await peer.dispatchOp({ type: "FAIRPLAY_KEY", payload: { publicKeyJwk: (await createFairplaySessionKey()).publicKeyJwk } });
  await wait();
  return { peer, store };
}

test("persistência: quem entra tarde, depois de o Mestre recarregar, recebe as chaves e a admissão", async () => {
  const env = await setupTable();
  const gm1 = gmPeer(env);
  const first = await joinWithKey(env, env.a);
  assert.deepEqual(Object.keys((await env.gmStore.loadCampaign(ID)).fairplay.keys), [env.a.routeId]);
  gm1.close();
  first.peer.close();
  const gm2 = gmPeer(env);
  const late = makeStore();
  const peerB = player(env, env.b, late);
  peerB.join();
  await wait(120);
  const seen = await late.loadCampaign(ID);
  assert.deepEqual(Object.keys(seen.fairplay.keys), [env.a.routeId]);
  assert.deepEqual(Object.keys(seen.fairplay.admitted).sort(), [env.a.routeId, env.b.routeId].sort(), "quem entra também é admitido no log");
  gm2.close();
  peerB.close();
});

test("persistência: refazer o estado do snapshot grava uma vez, sem reaplicar op por op no armazenamento", async () => {
  const env = await setupTable();
  const gm = gmPeer(env);
  const first = await joinWithKey(env, env.a);
  const second = await joinWithKey(env, env.b);
  const lateStore = makeStore();
  let appends = 0;
  const counting = { ...lateStore, appendOp: (...args) => { appends += 1; return lateStore.appendOp(...args); } };
  const late = player(env, await generateVttKeypair(), counting);
  late.join();
  await wait(150);
  assert.equal(appends, 0);
  assert.equal(Object.keys((await lateStore.loadCampaign(ID)).fairplay.keys).length, 2);
  for (const p of [gm, first.peer, second.peer, late]) p.close();
});
