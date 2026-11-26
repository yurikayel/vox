/**
 * @file SUB-08, fatia 3: o Fairplay (HELLO_SYNC, admissão e chave) passa pelo transporte RTC igual ao `BroadcastChannel`:
 * os pares de sincronização usam `createRtcVttTransport` com RTC e sinalização falsos, e nada da mesa vai pela sinalização.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign } from "../client/js/dungeon/vtt-schema.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";
import { generateRoomKey, generateVttKeypair } from "../client/js/dungeon/vtt-sync-codec.js";
import { createVttSyncPeer } from "../client/js/dungeon/vtt-sync.js";
import { createRtcVttTransport } from "../client/js/dungeon/vtt-rtc-transport.js";
import { createFakeRtcNetwork, createFakeSignalingHub } from "./helpers/fake-rtc.js";
import { waitUntil } from "./helpers/wait-until.js";

const ID = "mesa-fp-rede";
const makeStore = () => createVttStore(createMemoryVttBackend(), {
  requestPersistenceFn: async () => ({ persisted: true, isSupported: true }),
  estimateStorageFn: async () => ({ quota: 100000, usage: 100, percentage: 0.1, isSupported: true }),
  checkPersistenceFn: async () => true,
});

test("HELLO_SYNC, snapshot e chave do Fairplay do jogador chegam ao Mestre pelo canal de dados", async () => {
  const [gm, player] = [await generateVttKeypair(), await generateVttKeypair()];
  const roomKey = generateRoomKey();
  const [gmStore, playerStore] = [makeStore(), makeStore()];
  await gmStore.saveCampaign(createCampaign({ id: ID, name: "Mesa", gmRouteId: gm.routeId }));
  const rtc = createFakeRtcNetwork();
  const hub = createFakeSignalingHub();
  const mk = (kp, initiate) => createRtcVttTransport({ peerId: kp.routeId, initiate, signaling: hub.connect(kp.routeId), createPeerConnection: rtc.createPeerConnection });
  const gmPeer = createVttSyncPeer({ role: "gm", campaignId: ID, keypair: gm, store: gmStore, transport: mk(gm, false), roomKey });
  let snapshots = 0;
  const peer = createVttSyncPeer({
    role: "player", campaignId: ID, keypair: player, store: playerStore, transport: mk(player, true), roomKey, gmRouteId: gm.routeId,
    onUpdate: () => { snapshots += 1; },
  });
  peer.join();
  assert.ok(await waitUntil(() => snapshots > 0, 15000), "o snapshot do Mestre chegou ao jogador");
  await peer.dispatchOp({ type: "FAIRPLAY_KEY", payload: { publicKeyJwk: player.publicJwk } });
  assert.ok(await waitUntil(async () => Object.keys((await gmStore.loadCampaign(ID)).fairplay.keys).includes(player.routeId), 15000), "chave admitida pelo Mestre");
  assert.ok(hub.log.every((m) => ["offer", "answer", "ice"].includes(m.type)), "a sinalização só levou oferta, resposta e ICE");
  const wire = rtc.log.sent.join("");
  assert.ok(wire.includes("HELLO_SYNC") && wire.includes("FAIRPLAY_KEY"), "a mesa foi pelo canal de dados");
  gmPeer.close();
  peer.close();
});
