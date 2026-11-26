/**
 * @file SUB-03 (ADR-040 §3.1): o Mestre recusa quem pede para entrar no Fairplay; o jogador recusado recebe o motivo
 * `revoked`, para de reenviar o HELLO e vê o estado certo; a interface de aprovação usa só a API do par.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign } from "../client/js/dungeon/vtt-schema.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";
import { generateRoomKey, generateVttKeypair } from "../client/js/dungeon/vtt-sync-codec.js";
import { createInMemorySyncHub, createVttSyncPeer } from "../client/js/dungeon/vtt-sync.js";
import { createFairplayDriver } from "../client/js/dungeon/vtt-fairplay-driver.js";
import { renderFairplayAccess, handleFairplayRequest, handleFairplayRetry } from "../client/js/dungeon/vtt-fairplay-acesso.js";
import { settlePeers } from "./helpers/wait-until.js";

const ID = "mesa-recusa";
const FLAG_ON = { getItem: () => "1" };

function makeStore() {
  return createVttStore(createMemoryVttBackend(), {
    requestPersistenceFn: async () => ({ persisted: true, isSupported: true }),
    estimateStorageFn: async () => ({ quota: 100000, usage: 100, percentage: 0.1, isSupported: true }),
    checkPersistenceFn: async () => true,
  });
}

async function setup() {
  const [gm, player] = [await generateVttKeypair(), await generateVttKeypair()];
  const env = { gm, player, roomKey: generateRoomKey(), hub: createInMemorySyncHub(), gmStore: makeStore(), playerStore: makeStore(), rejected: [] };
  await env.gmStore.saveCampaign(createCampaign({ id: ID, name: "Mesa", gmRouteId: gm.routeId }));
  env.gmPeer = createVttSyncPeer({ role: "gm", campaignId: ID, keypair: gm, store: env.gmStore, transport: env.hub.connect(gm.routeId), roomKey: env.roomKey, storage: FLAG_ON });
  env.peer = createVttSyncPeer({
    role: "player", campaignId: ID, keypair: player, store: env.playerStore, transport: env.hub.connect(player.routeId),
    roomKey: env.roomKey, gmRouteId: gm.routeId, onRejected: (m) => env.rejected.push(m),
  });
  env.peer.join();
  await settlePeers(env.gmPeer, env.peer);
  return env;
}

async function sendKey(env) {
  const res = await env.peer.dispatchOp({ type: "FAIRPLAY_KEY", payload: { publicKeyJwk: env.player.publicJwk } });
  await settlePeers(env.gmPeer, env.peer);
  return res;
}

test("recusar o pendente: sai da fila e o pedido de chave dele volta com motivo revoked", async () => {
  const env = await setup();
  const { opId } = await sendKey(env);
  assert.deepEqual(env.rejected.map((m) => m.reason), ["not_admitted"], "pendente: ainda não admitido");
  assert.deepEqual(env.gmPeer.getPendingFairplayPeers(), [env.player.routeId]);
  assert.equal(await env.gmPeer.refuseFairplayPeer(env.player.routeId), true);
  await settlePeers(env.gmPeer, env.peer);
  assert.deepEqual(env.gmPeer.getPendingFairplayPeers(), []);
  const last = env.rejected.at(-1);
  assert.deepEqual([last.opId, last.reason], [opId, "revoked"]);
});

test("recusar duas vezes (ou quem não está pendente) não muda nada", async () => {
  const env = await setup();
  assert.equal(await env.gmPeer.refuseFairplayPeer("vx_desconhecido"), false);
  await sendKey(env);
  await env.gmPeer.refuseFairplayPeer(env.player.routeId);
  await settlePeers(env.gmPeer, env.peer);
  const seen = env.rejected.length;
  assert.equal(await env.gmPeer.refuseFairplayPeer(env.player.routeId), false);
  await settlePeers(env.gmPeer, env.peer);
  assert.equal(env.rejected.length, seen, "nenhum aviso repetido");
});

test("aprovar depois de recusar não admite; um novo pedido de entrada também não volta à fila", async () => {
  const env = await setup();
  await env.gmPeer.refuseFairplayPeer(env.player.routeId);
  assert.equal(await env.gmPeer.approveFairplayPeer(env.player.routeId), false);
  env.peer.join();
  await settlePeers(env.gmPeer, env.peer);
  assert.deepEqual(env.gmPeer.getPendingFairplayPeers(), []);
  const camp = await env.gmStore.loadCampaign(ID);
  assert.deepEqual(Object.keys(camp.fairplay.admitted), []);
  await sendKey(env);
  assert.equal(env.rejected.at(-1).reason, "revoked", "a chave seguinte também é recusada");
});

test("só o Mestre, e só com a flag ligada, recusa", async () => {
  const env = await setup();
  assert.equal(await env.peer.refuseFairplayPeer(env.player.routeId), false);
  const off = createVttSyncPeer({ role: "gm", campaignId: ID, keypair: env.gm, store: env.gmStore, transport: env.hub.connect("outro"), roomKey: env.roomKey });
  assert.equal(await off.refuseFairplayPeer(env.player.routeId), false);
  off.close();
});

test("flag desligada depois do pedido: recusar devolve false e o par continua pendente", async () => {
  const flag = { value: "1", getItem() { return this.value; } };
  const env = await setup();
  const gm = createVttSyncPeer({ role: "gm", campaignId: ID, keypair: env.gm, store: env.gmStore, transport: env.hub.connect("gm2"), roomKey: env.roomKey, storage: flag });
  const wire = env.hub.connect(env.player.routeId);
  wire.send("gm2", { kind: "HELLO_SYNC", roomKey: env.roomKey });
  await settlePeers(gm);
  assert.deepEqual(gm.getPendingFairplayPeers(), [env.player.routeId]);
  flag.value = "0";
  assert.equal(await gm.refuseFairplayPeer(env.player.routeId), false);
  assert.deepEqual(gm.getPendingFairplayPeers(), [env.player.routeId], "continua pendente");
  gm.close();
});

test("ctx de jogador com fila forçada: recusar devolve false e a fila fica como está", async () => {
  const env = await setup();
  const forced = createVttSyncPeer({
    role: "player", campaignId: ID, keypair: env.player, store: env.playerStore, transport: env.hub.connect("forcado"),
    roomKey: env.roomKey, gmRouteId: env.gm.routeId, storage: FLAG_ON, pendingFairplay: ["vx_x"],
  });
  assert.equal(await forced.refuseFairplayPeer("vx_x"), false);
  assert.deepEqual(forced.getPendingFairplayPeers(), ["vx_x"]);
  forced.close();
});

test("o recusado para de reenviar o HELLO", async () => {
  const env = await setup();
  const pending = [];
  const wire = createVttSyncPeer({
    role: "player", campaignId: ID, keypair: env.player, store: env.playerStore, transport: env.hub.connect("p2"),
    roomKey: env.roomKey, gmRouteId: "ninguem", schedule: (fn) => pending.push(fn), cancel: () => { pending.length = 0; },
  });
  wire.join();
  assert.equal(pending.length, 1, "reenvio agendado");
  env.hub.connect("ninguem").send("p2", { kind: "OP_REJECTED", roomKey: env.roomKey, opId: "x", reason: "revoked" });
  await settlePeers(wire);
  assert.equal(pending.length, 0, "recusa final: nada mais é agendado");
  wire.close();
});

function makeDriver() {
  const statuses = [];
  const sent = [];
  const driver = createFairplayDriver({
    peerId: "vx_player", dispatchOp: async (op) => { sent.push(op); return { opId: `op-${sent.length}` }; },
    loadCampaign: async () => ({}), onStatus: (s) => statuses.push(s),
  });
  return { driver, statuses };
}

test("status do jogador: aguardando, recusado e ok", async () => {
  const { driver, statuses } = makeDriver();
  await driver.start();
  assert.equal(driver.getStatus(), "ok");
  await driver.onRejected({ opId: "op-1", reason: "not_admitted" });
  assert.equal(driver.getStatus(), "waiting");
  await driver.onRejected({ opId: "op-1", reason: "revoked" });
  assert.equal(driver.getStatus(), "refused");
  assert.deepEqual(statuses, ["waiting", "refused"]);
  driver.close();
});

test("interface do Mestre: Aprovar e Recusar com rótulo, e a ação chama a API do par", async () => {
  const calls = [];
  const syncPeer = {
    approveFairplayPeer: async (id) => { calls.push(["approve", id]); return true; },
    refuseFairplayPeer: async (id) => { calls.push(["refuse", id]); return true; },
    getPendingFairplayPeers: () => [],
  };
  const state = { fairplayPendingPeers: ["vx_ana"], fairplayNames: { vx_ana: "Ana" }, syncPeer };
  const html = renderFairplayAccess(state);
  assert.match(html, /aria-label="Aprovar a entrada de Ana \[ana\]"/);
  assert.match(html, /aria-label="Recusar a entrada de Ana \[ana\]"/);
  assert.match(html, /id="dungeon-fairplay-access"[^>]*tabindex="-1"/);
  const btn = (kind) => ({ dataset: { dungeon: kind, peer: "vx_ana" } });
  await handleFairplayRequest(state, btn("fairplay-approve"));
  await handleFairplayRequest(state, btn("fairplay-refuse"));
  assert.deepEqual(calls, [["approve", "vx_ana"], ["refuse", "vx_ana"]]);
  assert.deepEqual(state.fairplayPendingPeers, []);
  assert.doesNotMatch(renderFairplayAccess({ fairplayPendingPeers: [] }), /button|role="status"/, "sem pedidos nem estado, o bloco fica vazio por dentro");
});

test("interface do jogador: mensagens com role=status e Tentar de novo refaz a entrada", () => {
  assert.match(renderFairplayAccess({ fairplayAccess: "waiting" }), /role="status">Aguardando aprovação do Mestre</);
  assert.match(renderFairplayAccess({ fairplayAccess: "refused" }), /role="status">Entrada recusada</);
  assert.doesNotMatch(renderFairplayAccess({ fairplayAccess: "ok" }), /role="status"/);
  const offline = renderFairplayAccess({ fairplayHelloGaveUp: true });
  assert.match(offline, /role="status">Não deu para falar com o Mestre\./);
  assert.match(offline, /data-dungeon="fairplay-retry"[^>]*>Tentar de novo</);
  let joins = 0;
  const state = { fairplayHelloGaveUp: true, syncPeer: { join: () => { joins += 1; } } };
  assert.equal(handleFairplayRetry(state), true);
  assert.deepEqual([state.fairplayHelloGaveUp, joins], [false, 1]);
});
