/**
 * @file Fairplay pela rede da mesa (ADR-040): Mestre-hub e 2 jogadores assinam as fases no hub em
 * memória; os três aparelhos refazem a conta e chegam ao mesmo número; op fora de fase volta recusada.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign } from "../client/js/dungeon/vtt-schema.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";
import { generateRoomKey, generateVttKeypair } from "../client/js/dungeon/vtt-sync-codec.js";
import { createInMemorySyncHub, createVttSyncPeer } from "../client/js/dungeon/vtt-sync.js";
import { createFairplayRollOffer } from "../client/js/dungeon/vtt-fairplay-roll.js";
import { fairplayQuorum, verifyFairplayRecord } from "../client/js/dungeon/vtt-fairplay-log.js";

const ROLL = "roll-rede";
const CAMP = "mesa-rede";
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const tick = () => new Promise((r) => setTimeout(r, 30));

function makeStore() {
  return createVttStore(createMemoryVttBackend(), {
    requestPersistenceFn: async () => ({ persisted: true, isSupported: true }),
    estimateStorageFn: async () => ({ quota: 100000, usage: 100, percentage: 0.1, isSupported: true }),
    checkPersistenceFn: async () => true,
  });
}

async function setupTable() {
  const hub = createInMemorySyncHub();
  const roomKey = generateRoomKey();
  const keys = [await generateVttKeypair(), await generateVttKeypair(), await generateVttKeypair()];
  const gmId = keys[0].routeId;
  const rejected = [];
  const peers = [];
  for (const [i, kp] of keys.entries()) {
    const store = makeStore();
    if (i === 0) await store.saveCampaign(createCampaign({ id: CAMP, name: "Mesa", gmRouteId: gmId }));
    const peer = createVttSyncPeer({ role: i === 0 ? "gm" : "player", campaignId: CAMP, keypair: kp, store, transport: hub.connect(kp.routeId), roomKey, gmRouteId: gmId, onRejected: (m) => rejected.push(m) });
    peers.push({ id: kp.routeId, peer, store });
  }
  for (const p of peers.slice(1)) p.peer.join();
  await tick();
  return { peers, rejected };
}

async function step(table, who, type, payload) {
  await who.peer.dispatchOp({ type, payload });
  await tick();
}

test("fairplay rede: Mestre e 2 jogadores fecham a rolagem e os três aparelhos refazem a mesma conta", async () => {
  const table = await setupTable();
  const { peers } = table;
  for (const p of peers) await step(table, p, "FAIRPLAY_KEY", { publicKeyJwk: { kty: "EC", x: p.id } });
  const ids = peers.map((p) => p.id).sort();
  const offers = {};
  for (const p of peers) offers[p.id] = await createFairplayRollOffer({ peerId: p.id, rollId: ROLL, ...fairplayQuorum(3) });
  await step(table, peers[1], "FAIRPLAY_OPEN", { rollId: ROLL, sides: 20, formula: "1d20" });
  for (const p of peers) await step(table, p, "FAIRPLAY_COMMIT", { rollId: ROLL, commit: offers[p.id].commit });
  for (const p of peers) {
    const others = ids.filter((o) => o !== p.id);
    await step(table, p, "FAIRPLAY_SHARES", { rollId: ROLL, shares: offers[p.id].shares.map((share, i) => ({ to: others[i], share })) });
  }
  await step(table, peers[2], "FAIRPLAY_REVEAL", { rollId: ROLL, seedHex: hex(offers[peers[2].id].secret.seedBytes) });
  await step(table, peers[2], "FAIRPLAY_REVEAL", { rollId: ROLL, seedHex: "ab" });
  for (const p of peers.slice(0, 2)) await step(table, p, "FAIRPLAY_REVEAL", { rollId: ROLL, seedHex: hex(offers[p.id].secret.seedBytes) });
  const results = [];
  for (const p of peers) results.push(await verifyFairplayRecord(await p.store.loadCampaign(CAMP), ROLL));
  assert.deepEqual(results.map((r) => r.status), ["verified", "verified", "verified"]);
  assert.equal(new Set(results.map((r) => r.value)).size, 1, "todos os aparelhos chegam ao mesmo número");
  assert.equal(table.rejected.length, 1, "a segunda revelação do mesmo par volta recusada");
  assert.equal(table.rejected[0].reason, "out_of_phase");
});
