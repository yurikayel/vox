/**
 * @file Fairplay pela rede da mesa (ADR-040): Mestre-hub e 2 jogadores, cada um com seu condutor,
 * fecham a rolagem com partes cifradas; quem some na revelação é recuperado; corrida de `lamport`
 * entre pares é resolvida pelo reenvio depois de `OP_REJECTED`.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign } from "../client/js/dungeon/vtt-schema.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";
import { generateRoomKey, generateVttKeypair } from "../client/js/dungeon/vtt-sync-codec.js";
import { createInMemorySyncHub, createVttSyncPeer } from "../client/js/dungeon/vtt-sync.js";
import { createFairplayDriver } from "../client/js/dungeon/vtt-fairplay-driver.js";
import { isFairplayShareEnvelope } from "../client/js/dungeon/vtt-fairplay-cipher.js";
import { verifyFairplayRecord } from "../client/js/dungeon/vtt-fairplay-log.js";

const CAMP = "mesa-rede";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeStore() {
  return createVttStore(createMemoryVttBackend(), {
    requestPersistenceFn: async () => ({ persisted: true, isSupported: true }),
    estimateStorageFn: async () => ({ quota: 100000, usage: 100, percentage: 0.1, isSupported: true }),
    checkPersistenceFn: async () => true,
  });
}

async function makeSeat(hub, roomKey, kp, gmId, dropTypes) {
  const store = makeStore();
  const seat = { id: kp.routeId, store, rejected: 0 };
  const isGm = kp.routeId === gmId;
  if (isGm) await store.saveCampaign(createCampaign({ id: CAMP, name: "Mesa", gmRouteId: gmId }));
  seat.peer = createVttSyncPeer({
    role: isGm ? "gm" : "player", campaignId: CAMP, keypair: kp, store, transport: hub.connect(kp.routeId), roomKey, gmRouteId: gmId,
    onUpdate: (c) => seat.driver?.onUpdate(c),
    onRejected: (m) => { seat.rejected += 1; seat.driver?.onRejected(m); },
  });
  const dispatchOp = (op) => (dropTypes.has(op.type) ? Promise.resolve(null) : seat.peer.dispatchOp(op));
  seat.driver = createFairplayDriver({ peerId: kp.routeId, dispatchOp, loadCampaign: () => store.loadCampaign(CAMP) });
  return seat;
}

async function setupTable(drop = {}) {
  const hub = createInMemorySyncHub();
  const roomKey = generateRoomKey();
  const keys = [await generateVttKeypair(), await generateVttKeypair(), await generateVttKeypair()];
  const seats = [];
  for (const kp of keys) seats.push(await makeSeat(hub, roomKey, kp, keys[0].routeId, new Set(drop[seats.length] || [])));
  for (const s of seats.slice(1)) s.peer.join();
  await sleep(40);
  for (const s of seats) await s.driver.start();
  await sleep(80);
  return seats;
}

async function waitAllDone(seats, rollId, timeoutMs = 6000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const camps = await Promise.all(seats.map((s) => s.store.loadCampaign(CAMP)));
    if (camps.every((c) => c?.fairplay?.rolls?.[rollId]?.phase === "done")) return camps;
    await sleep(40);
  }
  throw new Error("rolagem não fechou a tempo");
}

test("fairplay rede: 3 aparelhos com condutor fecham a rolagem e chegam ao mesmo número verificado", async () => {
  const seats = await setupTable();
  const rollId = await seats[1].driver.openRoll({ sides: 20, formula: "1d20", phaseMs: 1000 });
  const camps = await waitAllDone(seats, rollId);
  const results = await Promise.all(camps.map((c) => verifyFairplayRecord(c, rollId)));
  assert.deepEqual(results.map((r) => r.status), ["verified", "verified", "verified"]);
  assert.equal(new Set(results.map((r) => r.value)).size, 1, "todos os aparelhos chegam ao mesmo número");
  const shares = Object.values(camps[0].fairplay.rolls[rollId].shares).flat();
  assert.ok(shares.length > 0 && shares.every((s) => isFairplayShareEnvelope(s.share)), "partes passam cifradas pelo hub");
  assert.ok(seats.some((s) => s.rejected > 0), "a corrida de lamport aconteceu e foi resolvida pelo reenvio");
  for (const s of seats) s.driver.close();
});

test("fairplay rede: jogador que some na revelação é recuperado pelas partes dos outros", async () => {
  const seats = await setupTable({ 2: ["FAIRPLAY_REVEAL"] });
  const rollId = await seats[1].driver.openRoll({ sides: 6, formula: "1d6", phaseMs: 4000 });
  const camps = await waitAllDone(seats, rollId, 15000);
  const res = await verifyFairplayRecord(camps[1], rollId);
  assert.equal(res.status, "verified", `motivo: ${res.reason}`);
  assert.deepEqual(res.recoveredPeerIds, [seats[2].id]);
  for (const s of seats) s.driver.close();
});
