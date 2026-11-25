/**
 * @file Entrada tarde ponta a ponta pelo hub em memória: depois de rolagens fechadas e várias trocas de chave,
 * o estado Fairplay de quem entra é igual ao do Mestre. Espera por condição, sem pausas fixas.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign } from "../client/js/dungeon/vtt-schema.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";
import { generateRoomKey, generateVttKeypair } from "../client/js/dungeon/vtt-sync-codec.js";
import { createInMemorySyncHub, createVttSyncPeer } from "../client/js/dungeon/vtt-sync.js";
import { createFairplayDriver } from "../client/js/dungeon/vtt-fairplay-driver.js";
import { verifyFairplayRecord } from "../client/js/dungeon/vtt-fairplay-log.js";

const ID = "mesa-tarde";

async function until(check, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 15));
  }
  throw new Error("condição não atendida a tempo");
}

function makeStore() {
  return createVttStore(createMemoryVttBackend(), {
    requestPersistenceFn: async () => ({ persisted: true, isSupported: true }),
    estimateStorageFn: async () => ({ quota: 100000, usage: 100, percentage: 0.1, isSupported: true }),
    checkPersistenceFn: async () => true,
  });
}

const core = (doc) => JSON.parse(JSON.stringify({ keys: doc.fairplay.keys, rolls: doc.fairplay.rolls, admitted: doc.fairplay.admitted }));

function member(env, role, kp, store) {
  const holder = { driver: null };
  const peer = createVttSyncPeer({
    role, campaignId: ID, keypair: kp, store, transport: env.hub.connect(kp.routeId), roomKey: env.roomKey, gmRouteId: env.gm.routeId,
    onUpdate: (camp) => holder.driver?.onUpdate(camp),
    onRejected: (msg) => holder.driver?.onRejected(msg),
  });
  const attach = () => {
    holder.driver?.close();
    holder.driver = createFairplayDriver({ peerId: kp.routeId, dispatchOp: (op) => peer.dispatchOp(op), loadCampaign: () => store.loadCampaign(ID) });
    return holder.driver;
  };
  return { peer, holder, attach, store, kp };
}

test("entrada tarde: depois de rolagens fechadas e 10 trocas de chave, o receptor tem o mesmo estado do Mestre", async () => {
  const [gm, a, b, c] = [await generateVttKeypair(), await generateVttKeypair(), await generateVttKeypair(), await generateVttKeypair()];
  const env = { gm, hub: createInMemorySyncHub(), roomKey: generateRoomKey() };
  const gmStore = makeStore();
  await gmStore.saveCampaign(createCampaign({ id: ID, name: "Mesa", gmRouteId: gm.routeId }));
  const members = [member(env, "gm", gm, gmStore), member(env, "player", a, makeStore()), member(env, "player", b, makeStore())];
  const [, ma, mb] = members;
  const gmDoc = () => gmStore.loadCampaign(ID);
  try {
    for (const m of [ma, mb]) {
      m.peer.join();
      await until(async () => Object.hasOwn((await m.store.loadCampaign(ID))?.fairplay?.admitted || {}, m.kp.routeId));
    }
    for (const m of members) await m.attach().start();
    await until(async () => Object.keys((await gmDoc()).fairplay.keys).length === 3);

    await ma.holder.driver.openRoll({ rollId: "r1", sides: 20 });
    await until(async () => (await gmDoc()).fairplay.rolls.r1?.phase === "done");

    for (let i = 0; i < 10; i += 1) {
      await mb.attach().start();
      await until(async () => (await gmDoc()).fairplay.ops.keys[b.routeId].length === i + 2);
    }
    await ma.holder.driver.openRoll({ rollId: "r2", sides: 20 });
    await until(async () => (await gmDoc()).fairplay.rolls.r2?.phase === "done");

    const lateStore = makeStore();
    const late = member(env, "player", c, lateStore);
    late.peer.join();
    await until(async () => Object.keys((await lateStore.loadCampaign(ID))?.fairplay?.rolls || {}).length === 2);
    const live = await gmDoc();
    const seen = await lateStore.loadCampaign(ID);
    assert.deepEqual(core(seen), core(live));
    assert.equal((await verifyFairplayRecord(seen, "r1")).status, "verified", "a rolagem anterior às trocas continua verificável");
    assert.equal((await verifyFairplayRecord(seen, "r2")).status, "verified");
    late.peer.close();
  } finally {
    for (const m of members) { m.holder.driver?.close(); m.peer.close(); }
  }
});
