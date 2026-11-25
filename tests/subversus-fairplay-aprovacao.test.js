/**
 * @file Fairplay: o Mestre aprova a admissão e pode revogar (ADR-040 §3.1, proposto); `peerId` amarrado ao
 * `routeId`. Só vale com `vox.lab.fairplay` ligada. Testes adversariais: admissão sem aprovação, op de revogado,
 * revogação por quem não é o Mestre, revogação repetida, readmissão, `peerId` trocado e replay.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { reduceCampaign } from "../client/js/dungeon/vtt-reducer.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";
import { generateRoomKey, generateVttKeypair, signVttOp } from "../client/js/dungeon/vtt-sync-codec.js";
import { createInMemorySyncHub, createVttSyncPeer } from "../client/js/dungeon/vtt-sync.js";
import { createFairplaySessionKey } from "../client/js/dungeon/vtt-fairplay-cipher.js";
import { collectFairplayOps, normalizeFairplayState } from "../client/js/dungeon/vtt-fairplay-log.js";
import { rebuildFairplayState } from "../client/js/dungeon/vtt-fairplay-rebuild.js";
import { wireFairplayDriver } from "../client/js/dungeon/vtt-fairplay-wire.js";
import { settlePeers } from "./helpers/wait-until.js";

const ID = "mesa-aprova";
const flag = (v) => ({ getItem: (k) => (k === "vox.lab.fairplay" ? v : null) });
const ON = flag("1");
const OFF = flag(null);

function makeStore() {
  return createVttStore(createMemoryVttBackend(), {
    requestPersistenceFn: async () => ({ persisted: true, isSupported: true }),
    estimateStorageFn: async () => ({ quota: 100000, usage: 100, percentage: 0.1, isSupported: true }),
    checkPersistenceFn: async () => true,
  });
}

async function table(storage) {
  const [gm, ana] = [await generateVttKeypair(), await generateVttKeypair()];
  const env = { gm, ana, roomKey: generateRoomKey(), hub: createInMemorySyncHub(), gmStore: makeStore(), anaStore: makeStore() };
  await env.gmStore.saveCampaign(createCampaign({ id: ID, name: "Mesa", gmRouteId: gm.routeId }));
  const rejected = [];
  env.gmPeer = createVttSyncPeer({ role: "gm", campaignId: ID, keypair: gm, store: env.gmStore, transport: env.hub.connect(gm.routeId), roomKey: env.roomKey, storage });
  env.anaPeer = createVttSyncPeer({ role: "player", campaignId: ID, keypair: ana, store: env.anaStore, transport: env.hub.connect(ana.routeId), roomKey: env.roomKey, gmRouteId: gm.routeId, storage, onRejected: (m) => rejected.push(m.reason) });
  env.rejected = rejected;
  return env;
}

const gmFairplay = async (env) => (await env.gmStore.loadCampaign(ID)).fairplay;
const keyOp = async () => (await createFairplaySessionKey()).publicKeyJwk;

async function sendKey(env) {
  await env.anaPeer.dispatchOp({ type: "FAIRPLAY_KEY", payload: { publicKeyJwk: await keyOp() }, ts: Date.now() });
  await settlePeers(env.gmPeer, env.anaPeer);
}

test("aprovação: com a flag desligada nada muda, o Mestre admite quem entra e a API não faz nada", async () => {
  const env = await table(OFF);
  env.anaPeer.join();
  await settlePeers(env.gmPeer, env.anaPeer);
  assert.ok(Object.hasOwn((await gmFairplay(env)).admitted, env.ana.routeId));
  assert.deepEqual(env.gmPeer.getPendingFairplayPeers(), []);
  assert.equal(await env.gmPeer.approveFairplayPeer(env.ana.routeId), false);
  assert.equal(await env.gmPeer.revokeFairplayPeer(env.ana.routeId), false);
});

test("aprovação: com a flag ligada, quem entra fica pendente e a chave dele é recusada até o Mestre aprovar", async () => {
  const env = await table(ON);
  env.anaPeer.join();
  await settlePeers(env.gmPeer, env.anaPeer);
  assert.deepEqual(env.gmPeer.getPendingFairplayPeers(), [env.ana.routeId]);
  assert.deepEqual((await gmFairplay(env)).admitted, {});
  await sendKey(env);
  assert.deepEqual(env.rejected, ["not_admitted"]);
  assert.deepEqual((await gmFairplay(env)).keys, {});
  assert.equal(await env.gmPeer.approveFairplayPeer("desconhecido"), false, "só aprova quem está pendente");
  assert.equal(await env.gmPeer.approveFairplayPeer(env.ana.routeId), true);
  await settlePeers(env.gmPeer, env.anaPeer);
  assert.deepEqual(env.gmPeer.getPendingFairplayPeers(), []);
  await sendKey(env);
  assert.deepEqual(Object.keys((await gmFairplay(env)).keys), [env.ana.routeId]);
});

test("aprovação: jogador não aprova nem revoga ninguém pela API", async () => {
  const env = await table(ON);
  assert.equal(await env.anaPeer.approveFairplayPeer(env.ana.routeId), false);
  assert.equal(await env.anaPeer.revokeFairplayPeer(env.gm.routeId), false);
});

test("revogação: o Mestre revoga, a chave sai e toda op Fairplay do revogado é recusada com motivo próprio", async () => {
  const env = await table(ON);
  env.anaPeer.join();
  await settlePeers(env.gmPeer, env.anaPeer);
  await env.gmPeer.approveFairplayPeer(env.ana.routeId);
  await sendKey(env);
  assert.equal(await env.gmPeer.revokeFairplayPeer(env.ana.routeId), true);
  await settlePeers(env.gmPeer, env.anaPeer);
  const fp = await gmFairplay(env);
  assert.deepEqual([fp.admitted, fp.keys], [{}, {}]);
  assert.ok(Object.hasOwn(fp.revoked, env.ana.routeId));
  env.rejected.length = 0;
  await sendKey(env);
  await env.anaPeer.dispatchOp({ type: "FAIRPLAY_OPEN", payload: { rollId: "r1", sides: 20 }, ts: Date.now() });
  await settlePeers(env.gmPeer, env.anaPeer);
  assert.deepEqual(env.rejected, ["revoked", "revoked"]);
  assert.deepEqual((await gmFairplay(env)).rolls, {});
});

test("revogação: quem não é o Mestre não revoga, nem pelo reducer nem pela rede", async () => {
  const env = await table(ON);
  env.anaPeer.join();
  await settlePeers(env.gmPeer, env.anaPeer);
  await env.gmPeer.approveFairplayPeer(env.ana.routeId);
  await settlePeers(env.gmPeer, env.anaPeer);
  await env.anaPeer.dispatchOp({ type: "FAIRPLAY_REVOKE", payload: { actor: env.ana.routeId }, ts: Date.now() });
  await settlePeers(env.gmPeer, env.anaPeer);
  assert.deepEqual(env.rejected, ["unauthorized"]);
  assert.ok(Object.hasOwn((await gmFairplay(env)).admitted, env.ana.routeId), "continua admitido");
  const forged = createVttOp({ type: "FAIRPLAY_REVOKE", actor: env.ana.routeId, payload: { actor: env.ana.routeId }, lamport: 99 });
  const doc = reduceCampaign(await env.gmStore.loadCampaign(ID), forged);
  assert.ok(Object.hasOwn(doc.fairplay.admitted, env.ana.routeId));
});

/** Estado sem rede: o Mestre `gm` admite `ana` e `bia` a lamport 1 e 2. */
function reducerTable() {
  const box = { lamport: 0, doc: createCampaign({ id: ID, name: "Mesa", gmRouteId: "gm" }) };
  box.push = (type, actor, payload, lamport = ++box.lamport) => {
    box.lamport = Math.max(box.lamport, lamport);
    const before = box.doc;
    box.doc = reduceCampaign(box.doc, createVttOp({ type, actor, payload, lamport, ts: 0 }));
    return box.doc !== before;
  };
  box.push("FAIRPLAY_ADMIT", "gm", { actor: "ana" });
  box.push("FAIRPLAY_ADMIT", "gm", { actor: "bia" });
  return box;
}

test("revogação: repetida, de par desconhecido, do próprio Mestre ou sem alvo não faz nada", () => {
  const t = reducerTable();
  assert.equal(t.push("FAIRPLAY_REVOKE", "gm", { actor: "ana" }), true);
  const after = t.doc;
  assert.equal(t.push("FAIRPLAY_REVOKE", "gm", { actor: "ana" }), false, "repetida");
  assert.equal(t.push("FAIRPLAY_REVOKE", "gm", { actor: "ninguem" }), false, "desconhecido");
  assert.equal(t.push("FAIRPLAY_REVOKE", "gm", { actor: "gm" }), false, "o Mestre não se revoga");
  assert.equal(t.push("FAIRPLAY_REVOKE", "gm", {}), false, "sem alvo");
  assert.equal(t.doc, after);
  assert.equal(t.doc.fairplay.ops.admit.ana.length, 2, "admissão e revogação guardadas; as recusadas, não");
});

test("revogação: readmitir só com um novo ADMIT de lamport maior que o da revogação", async () => {
  const t = reducerTable();
  t.push("FAIRPLAY_REVOKE", "gm", { actor: "ana" }, 10);
  assert.equal(t.push("FAIRPLAY_ADMIT", "gm", { actor: "ana" }, 5), false, "ADMIT antigo reaplicado não readmite");
  assert.equal(t.push("FAIRPLAY_ADMIT", "gm", { actor: "ana" }, 10), false, "lamport igual também não");
  assert.deepEqual(Object.keys(t.doc.fairplay.admitted), ["bia"]);
  assert.equal(t.push("FAIRPLAY_ADMIT", "gm", { actor: "ana" }, 11), true);
  assert.equal(Object.hasOwn(t.doc.fairplay.revoked, "ana"), false);
  const key = (await createFairplaySessionKey()).publicKeyJwk;
  assert.equal(t.push("FAIRPLAY_KEY", "ana", { publicKeyJwk: key }, 12), true, "readmitida volta a participar");
});

test("revogação: op de revogado só vale se for anterior à revogação (a ordem do replay manda)", async () => {
  const t = reducerTable();
  t.push("FAIRPLAY_ADMIT", "gm", { actor: "cris" }, 3);
  for (const [who, lamport] of [["ana", 5], ["bia", 6], ["cris", 7]]) t.push("FAIRPLAY_KEY", who, { publicKeyJwk: (await createFairplaySessionKey()).publicKeyJwk }, lamport);
  assert.equal(t.push("FAIRPLAY_OPEN", "ana", { rollId: "antes", sides: 20 }, 8), true, "controle: antes da revogação vale");
  t.push("FAIRPLAY_REVOKE", "gm", { actor: "ana" }, 10);
  assert.equal(t.push("FAIRPLAY_OPEN", "ana", { rollId: "depois", sides: 20 }, 11), false);
  assert.equal(t.push("FAIRPLAY_COMMIT", "ana", { rollId: "antes", commit: {} }, 12), false);
  assert.equal(Object.hasOwn(t.doc.fairplay.rolls, "depois"), false);
  assert.equal(t.push("FAIRPLAY_OPEN", "bia", { rollId: "outra", sides: 20 }, 13), true, "controle: quem não foi revogado segue");
  assert.deepEqual(t.doc.fairplay.rolls.outra.participants, ["bia", "cris"], "o revogado não entra em rolagem nova");
});

test("replay: refazer das ops guardadas dá o mesmo estado, inclusive revogações e readmissões, e é idempotente", async () => {
  const t = reducerTable();
  const key = (await createFairplaySessionKey()).publicKeyJwk;
  t.push("FAIRPLAY_KEY", "ana", { publicKeyJwk: key }, 5);
  t.push("FAIRPLAY_REVOKE", "gm", { actor: "ana" }, 10);
  t.push("FAIRPLAY_ADMIT", "gm", { actor: "ana" }, 11);
  const fresh = () => createCampaign({ id: ID, name: "Mesa", gmRouteId: "gm" });
  const ops = collectFairplayOps(t.doc.fairplay);
  const core = (fp) => ({ admitted: fp.admitted, revoked: fp.revoked, keys: fp.keys });
  const once = rebuildFairplayState(fresh(), ops);
  assert.deepEqual(core(once.fairplay), core(t.doc.fairplay));
  assert.deepEqual(core(rebuildFairplayState(fresh(), [...ops, ...ops].reverse()).fairplay), core(t.doc.fairplay), "duplicadas e fora de ordem");
  const revokedOnly = reducerTable();
  revokedOnly.push("FAIRPLAY_REVOKE", "gm", { actor: "ana" }, 10);
  const back = rebuildFairplayState(fresh(), collectFairplayOps(revokedOnly.doc.fairplay));
  assert.deepEqual(Object.keys(back.fairplay.revoked), ["ana"]);
  assert.deepEqual(Object.keys(back.fairplay.admitted), ["bia"]);
});

test("replay: log gravado antes da revogação (uma admissão por par, sem `revoked`) continua válido", () => {
  const legacy = { keys: {}, rolls: {}, admitted: { ana: { lamport: 1 } }, ops: { seq: 0, admit: { ana: { opId: "o1", type: "FAIRPLAY_ADMIT", payload: { actor: "ana" }, actor: "gm", lamport: 1, ts: 0 } }, keys: {}, rolls: {} } };
  const fp = normalizeFairplayState(legacy);
  assert.deepEqual(fp.revoked, {});
  assert.equal(Array.isArray(fp.ops.admit.ana), true);
  assert.equal(collectFairplayOps(legacy).length, 1);
});

test("peerId: o condutor só liga se o peerId for o routeId da chave que assina", async () => {
  const kp = await generateVttKeypair();
  const peer = createVttSyncPeer({ role: "player", campaignId: ID, keypair: kp, store: makeStore(), transport: createInMemorySyncHub().connect(kp.routeId), roomKey: generateRoomKey(), gmRouteId: "gm" });
  assert.equal(peer.routeId, kp.routeId);
  const store = makeStore();
  const state = {};
  const base = { peer, store, campaignId: ID, storage: ON };
  assert.equal(wireFairplayDriver(state, { ...base, peerId: "outro-par" }), null);
  assert.equal(state.fairplayDriver, null);
  const ok = wireFairplayDriver(state, { ...base, peerId: kp.routeId });
  assert.ok(ok);
  ok.close();
  peer.close();
});

test("peerId: op assinada por uma chave não vale em nome de outro routeId", async () => {
  const [a, b] = [await generateVttKeypair(), await generateVttKeypair()];
  const { verifyVttOpSignature } = await import("../client/js/dungeon/vtt-sync-codec.js");
  const op = await signVttOp(createVttOp({ type: "FAIRPLAY_KEY", actor: a.routeId, payload: {}, lamport: 1 }), a);
  assert.equal(await verifyVttOpSignature(op), true);
  assert.equal(await verifyVttOpSignature({ ...op, actor: b.routeId }), false);
  assert.equal(await verifyVttOpSignature({ ...op, pubKeyJwk: b.publicJwk }), false);
});
