/**
 * @file Quem pode falar com quem no VTT sync: o jogador só aceita estado vindo do Mestre, mensagens de outra sala são
 * ignoradas, e o relógio de uma op Fairplay tem tolerância exata de 5 s.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";
import { generateRoomKey, generateVttKeypair, signVttOp } from "../client/js/dungeon/vtt-sync-codec.js";
import { createInMemorySyncHub, createVttSyncPeer, FAIRPLAY_TS_TOLERANCE_MS } from "../client/js/dungeon/vtt-sync.js";
import { settlePeers } from "./helpers/wait-until.js";

const ID = "mesa-mensagens";
const FLAG_ON = { getItem: () => "1" };
const NOW = 1_000_000;

function makeStore() {
  return createVttStore(createMemoryVttBackend(), {
    requestPersistenceFn: async () => ({ persisted: true, isSupported: true }),
    estimateStorageFn: async () => ({ quota: 100000, usage: 100, percentage: 0.1, isSupported: true }),
    checkPersistenceFn: async () => true,
  });
}

async function setupPlayer() {
  const [gm, player] = [await generateVttKeypair(), await generateVttKeypair()];
  const env = { gm, player, roomKey: generateRoomKey(), hub: createInMemorySyncHub(), store: makeStore() };
  env.peer = createVttSyncPeer({ role: "player", campaignId: ID, keypair: player, store: env.store, transport: env.hub.connect(player.routeId), roomKey: env.roomKey, gmRouteId: gm.routeId });
  env.fromGm = env.hub.connect(gm.routeId);
  env.fromIntruder = env.hub.connect("vx_intruso");
  env.snapshot = (roomKey = env.roomKey) => ({ kind: "SNAPSHOT_FILTERED", roomKey, campaign: createCampaign({ id: ID, name: "Mesa", gmRouteId: gm.routeId }), fairplayOps: [] });
  env.noteOp = () => ({ kind: "COMMIT_OP", roomKey: env.roomKey, op: createVttOp({ type: "NOTE_UPSERT", actor: gm.routeId, lamport: 1, payload: { note: { id: "n1", title: "Pista", publicMarkdown: "porta sul" } } }) });
  return env;
}

test("jogador: snapshot de quem não é o Mestre é ignorado; o do Mestre é aplicado", async () => {
  const env = await setupPlayer();
  env.fromIntruder.send(env.player.routeId, env.snapshot());
  await settlePeers(env.peer);
  assert.equal(await env.store.loadCampaign(ID), null, "intruso não planta estado");
  env.fromGm.send(env.player.routeId, env.snapshot());
  await settlePeers(env.peer);
  assert.equal((await env.store.loadCampaign(ID)).id, ID);
  env.peer.close();
});

test("jogador: op confirmada por quem não é o Mestre é ignorada; a do Mestre é aplicada", async () => {
  const env = await setupPlayer();
  env.fromGm.send(env.player.routeId, env.snapshot());
  await settlePeers(env.peer);
  env.fromIntruder.send(env.player.routeId, env.noteOp());
  await settlePeers(env.peer);
  assert.equal((await env.store.loadCampaign(ID)).notesById.n1, undefined, "op forjada não entra");
  env.fromGm.send(env.player.routeId, env.noteOp());
  await settlePeers(env.peer);
  assert.equal((await env.store.loadCampaign(ID)).notesById.n1.title, "Pista");
  env.peer.close();
});

test("mensagem de outra sala (roomKey diferente) é ignorada", async () => {
  const env = await setupPlayer();
  env.fromGm.send(env.player.routeId, env.snapshot("outra-sala"));
  await settlePeers(env.peer);
  assert.equal(await env.store.loadCampaign(ID), null);
  env.peer.close();
});

async function rejectionFor(ts) {
  const [gm, player] = [await generateVttKeypair(), await generateVttKeypair()];
  const hub = createInMemorySyncHub();
  const roomKey = generateRoomKey();
  const store = makeStore();
  await store.saveCampaign(createCampaign({ id: ID, name: "Mesa", gmRouteId: gm.routeId }));
  const gmPeer = createVttSyncPeer({ role: "gm", campaignId: ID, keypair: gm, store, transport: hub.connect(gm.routeId), roomKey, storage: FLAG_ON, now: () => NOW });
  const wire = hub.connect(player.routeId);
  const replies = [];
  wire.onMessage((m) => replies.push(m));
  const op = await signVttOp(createVttOp({ type: "FAIRPLAY_KEY", actor: player.routeId, ts, payload: { publicKeyJwk: player.publicJwk } }), player);
  wire.send(gm.routeId, { kind: "ACTION_OP", roomKey, op });
  await settlePeers(gmPeer);
  gmPeer.close();
  return replies.find((m) => m.kind === "OP_REJECTED")?.reason;
}

test("op Fairplay: o relógio vale com 5 s de folga, para os dois lados, e não além", async () => {
  assert.equal(FAIRPLAY_TS_TOLERANCE_MS, 5000);
  assert.equal(await rejectionFor(NOW + 5000), "not_admitted", "no limite de cima: passa pela checagem do relógio");
  assert.equal(await rejectionFor(NOW - 5000), "not_admitted", "no limite de baixo");
  assert.equal(await rejectionFor(NOW + 5001), "ts_out_of_range");
  assert.equal(await rejectionFor(NOW - 5001), "ts_out_of_range");
  assert.equal(await rejectionFor(Number.NaN), "ts_out_of_range", "ts inválido vira o relógio real, longe do injetado");
});

async function gmTable({ flag } = {}) {
  const [gm, player] = [await generateVttKeypair(), await generateVttKeypair()];
  const env = { gm, player, roomKey: generateRoomKey(), hub: createInMemorySyncHub(), store: makeStore(), got: [] };
  const camp = createCampaign({ id: ID, name: "Mesa", gmRouteId: gm.routeId });
  env.bytes = new Uint8Array(64).fill(5);
  env.avatar = (await env.store.putBlob(env.bytes, "image/png")).sha256;
  camp.scenesById[camp.activeSceneId].tokens = [{ tokenId: "t1", ownerRouteId: player.routeId, layer: "player", floorZ: 0, x: 1, y: 1, avatarBlobHash: env.avatar }];
  await env.store.saveCampaign(camp);
  env.gmPeer = createVttSyncPeer({ role: "gm", campaignId: ID, keypair: gm, store: env.store, transport: env.hub.connect(gm.routeId), roomKey: env.roomKey, storage: flag, now: () => NOW });
  env.wire = env.hub.connect(player.routeId);
  env.wire.onMessage((m) => env.got.push(m));
  env.send = async (msg) => { env.wire.send(gm.routeId, { roomKey: env.roomKey, ...msg }); await settlePeers(env.gmPeer); };
  return env;
}

test("Mestre serve o blob de avatar de token do jogador a quem pede", async () => {
  const env = await gmTable();
  await env.send({ kind: "WANT_BLOB", sha256: env.avatar });
  assert.ok(env.got.some((m) => m.kind === "BLOB_CHUNK"), "avatar de token visível é servido");
  env.gmPeer.close();
});

test("op que muda a visão vai como novo snapshot; op comum vai como COMMIT_OP já filtrada", async () => {
  const env = await gmTable();
  await env.send({ kind: "HELLO_SYNC" });
  env.got.length = 0;
  await env.gmPeer.dispatchOp({ type: "TOKEN_REMOVE", payload: { tokenId: "t1" } });
  assert.deepEqual(env.got.map((m) => m.kind), ["SNAPSHOT_FILTERED"], "só o snapshot, nunca o marcador de atualização como op");
  env.got.length = 0;
  const note = { id: "n1", title: "Pista", publicMarkdown: "p", gmSecretMarkdown: "SEGREDO" };
  await env.gmPeer.dispatchOp({ type: "NOTE_UPSERT", payload: { note } });
  assert.deepEqual(env.got.map((m) => m.kind), ["COMMIT_OP"]);
  assert.equal(env.got[0].op.payload.note.gmSecretMarkdown, "", "o segredo do Mestre não vai");
  env.gmPeer.close();
});

test("aprovar: só o Mestre, só com a flag ligada e só quem está pendente", async () => {
  const flag = { value: "1", getItem() { return this.value; } };
  const env = await gmTable({ flag });
  await env.send({ kind: "HELLO_SYNC" });
  assert.deepEqual(env.gmPeer.getPendingFairplayPeers(), [env.player.routeId]);
  assert.equal(await env.gmPeer.approveFairplayPeer("vx_desconhecido"), false);
  flag.value = "0";
  assert.equal(await env.gmPeer.approveFairplayPeer(env.player.routeId), false, "flag desligada");
  assert.deepEqual(env.gmPeer.getPendingFairplayPeers(), [env.player.routeId]);
  const asPlayer = createVttSyncPeer({ role: "player", campaignId: ID, keypair: env.player, store: makeStore(), transport: env.hub.connect("vx_p2"), roomKey: env.roomKey, gmRouteId: env.gm.routeId, storage: { getItem: () => "1" }, pendingFairplay: [env.player.routeId] });
  assert.equal(await asPlayer.approveFairplayPeer(env.player.routeId), false, "jogador não aprova");
  flag.value = "1";
  assert.equal(await env.gmPeer.approveFairplayPeer(env.player.routeId), true);
  assert.deepEqual(env.gmPeer.getPendingFairplayPeers(), []);
  asPlayer.close();
  env.gmPeer.close();
});

test("ACTION_OP sem op não derruba a fila de mensagens do Mestre", async () => {
  const env = await gmTable({ flag: FLAG_ON });
  await env.send({ kind: "ACTION_OP" });
  const op = await signVttOp(createVttOp({ type: "FAIRPLAY_KEY", actor: env.player.routeId, ts: NOW, payload: { publicKeyJwk: env.player.publicJwk } }), env.player);
  await env.send({ kind: "ACTION_OP", op });
  assert.equal(env.got.find((m) => m.kind === "OP_REJECTED")?.reason, "not_admitted", "a mensagem seguinte ainda é tratada");
  env.gmPeer.close();
});

test("op recusada na chegada pede o estado ao Mestre uma vez só", async () => {
  const [gm, player] = [await generateVttKeypair(), await generateVttKeypair()];
  const hub = createInMemorySyncHub();
  const roomKey = generateRoomKey();
  const hellos = [];
  const gmWire = hub.connect(gm.routeId);
  gmWire.onMessage((m) => { if (m.kind === "HELLO_SYNC") hellos.push(m); });
  const peer = createVttSyncPeer({ role: "player", campaignId: ID, keypair: player, store: makeStore(), transport: hub.connect(player.routeId), roomKey, gmRouteId: gm.routeId });
  gmWire.send(player.routeId, { kind: "SNAPSHOT_FILTERED", roomKey, campaign: createCampaign({ id: ID, name: "Mesa", gmRouteId: gm.routeId }), fairplayOps: [] });
  await settlePeers(peer);
  for (let i = 0; i < 2; i += 1) {
    const ignored = createVttOp({ type: "TIPO_QUE_O_REDUTOR_IGNORA", actor: gm.routeId, lamport: 1 + i, payload: {} });
    gmWire.send(player.routeId, { kind: "COMMIT_OP", roomKey, op: ignored });
    await settlePeers(peer);
  }
  assert.equal(hellos.length, 1, "pede uma vez, não zero nem duas");
  peer.close();
});
