/**
 * @file PM-111 do selo Fairplay amarrado (ADR-040 §5): o selo só vale para o autor que abriu a rolagem, uma vez,
 * com a mesma fórmula e o número refeito neste aparelho; o jogador confere a assinatura das rolagens da mesa
 * e recusa estado de uma mesa com outro Mestre.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { reduceCampaign } from "../client/js/dungeon/vtt-reducer.js";
import { createFairplayRollOffer } from "../client/js/dungeon/vtt-fairplay-roll.js";
import { fairplayQuorum, verifyFairplayRecord } from "../client/js/dungeon/vtt-fairplay-log.js";
import { createFairplaySessionKey, fairplayShareHash, sealFairplayShare } from "../client/js/dungeon/vtt-fairplay-cipher.js";
import { rollDiceFormula } from "../client/js/dungeon/dice-engine.js";
import { computeFairplaySeals } from "../client/js/dungeon/vtt-fairplay-selo.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";
import { generateRoomKey, generateVttKeypair, signVttOp } from "../client/js/dungeon/vtt-sync-codec.js";
import { createInMemorySyncHub, createVttSyncPeer } from "../client/js/dungeon/vtt-sync.js";
import { settlePeers } from "./helpers/wait-until.js";

const ROLL = "roll-a";
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

async function closedTable(peers) {
  let lamport = 0;
  const box = { doc: createCampaign({ id: "mesa-fp", name: "Mesa", gmRouteId: "gm" }) };
  const push = (type, actor, payload, ts = 0) => {
    lamport += 1;
    box.doc = reduceCampaign(box.doc, createVttOp({ type, actor, payload, lamport, ts }));
  };
  const keys = {};
  for (const p of peers) keys[p] = await createFairplaySessionKey();
  for (const p of peers) {
    push("FAIRPLAY_ADMIT", "gm", { actor: p });
    push("FAIRPLAY_KEY", p, { publicKeyJwk: keys[p].publicKeyJwk });
  }
  const q = fairplayQuorum(peers.length);
  const offers = {};
  for (const p of peers) offers[p] = await createFairplayRollOffer({ peerId: p, rollId: ROLL, ...q });
  push("FAIRPLAY_OPEN", peers[0], { rollId: ROLL, sides: 20, formula: "1d20" }, 1000);
  for (const p of peers) push("FAIRPLAY_COMMIT", p, { rollId: ROLL, commit: offers[p].commit });
  for (const p of peers) {
    const others = peers.filter((o) => o !== p);
    const shares = [];
    for (const [i, share] of offers[p].shares.entries()) {
      const to = others[i % others.length];
      const sealed = await sealFairplayShare({ share, rollId: ROLL, fromPeer: p, toPeer: to, privateKey: keys[p].privateKey, recipientJwk: keys[to].publicKeyJwk });
      shares.push({ to, share: sealed, shareHash: await fairplayShareHash(share) });
    }
    push("FAIRPLAY_SHARES", p, { rollId: ROLL, shares });
  }
  for (const p of peers) push("FAIRPLAY_REVEAL", p, { rollId: ROLL, seedHex: hex(offers[p].secret.seedBytes) });
  return { box, value: (await verifyFairplayRecord(box.doc, ROLL)).value };
}

/** Registra uma rolagem na crônica como o app faz (`vtt-fairplay-roll-flow.js`), com `over` para forjar campos. */
function recordAs(t, actor, id, over = {}) {
  const result = rollDiceFormula("1d20", { fairplayValue: t.value });
  const rollResult = { ...result, fairplay: { rollId: ROLL, value: t.value }, ...over };
  t.box.doc = reduceCampaign(t.box.doc, createVttOp({ type: "ROLL_RECORDED", actor, payload: { id, speaker: actor, rollResult }, lamport: 99 + t.box.doc.chronicle.length }));
}

const sealsOf = (t) => computeFairplaySeals({ ...t.box.doc, fairplayViewerId: "ana" });

test("a) número forjado com o valor certo do veredito não ganha selo", async () => {
  const t = await closedTable(["ana", "bia", "gm"]);
  recordAs(t, "ana", "roll-1", { rolls: [{ value: 20, kept: true }], total: 20 });
  const seals = await sealsOf(t);
  assert.notEqual(seals[t.box.doc.chronicle[0].id].status, "verified");
});

test("b) quem não abriu a rolagem não a registra com fórmula trocada", async () => {
  const t = await closedTable(["ana", "bia", "gm"]);
  recordAs(t, "bia", "roll-1", { formula: "1d20+15" });
  const seals = await sealsOf(t);
  assert.equal(seals[t.box.doc.chronicle[0].id].status, "unverified");
});

test("c) a mesma rolagem registrada duas vezes: só a primeira é verificada", async () => {
  const t = await closedTable(["ana", "bia", "gm"]);
  recordAs(t, "ana", "roll-1");
  recordAs(t, "ana", "roll-2");
  const [first, second] = t.box.doc.chronicle;
  const seals = await sealsOf(t);
  assert.equal(seals[first.id].status, "verified");
  assert.equal(seals[second.id].status, "unverified");
  assert.match(seals[second.id].detail, /já foi registrada/);
});

test("d) controle: o registro honesto de quem abriu é verificado", async () => {
  const t = await closedTable(["ana", "bia", "gm"]);
  recordAs(t, "ana", "roll-1");
  const seals = await sealsOf(t);
  assert.equal(seals[t.box.doc.chronicle[0].id].status, "verified");
});

function pushOp(t, type, actor, payload) {
  t.box.doc = reduceCampaign(t.box.doc, createVttOp({ type, actor, payload, lamport: 500 + t.box.doc.chronicle.length }));
}

test("g) entrada de CHRONICLE_APPEND não cria vínculo Fairplay nem herda autor do payload", async () => {
  const t = await closedTable(["ana", "bia", "gm"]);
  recordAs(t, "bia", "roll-z", { fairplay: undefined });
  const forged = { id: "turn-roll-z", author: "ana", text: "ana: 1d20 → [20] = 20", fairplayRollId: ROLL, fairplayValue: t.value };
  pushOp(t, "CHRONICLE_APPEND", "bia", forged);
  assert.equal(t.box.doc.chronicle.at(-1).fairplayRollId, undefined);
  recordAs(t, "ana", "roll-1");
  const seals = await sealsOf(t);
  assert.equal(seals[t.box.doc.chronicle.at(-1).id].status, "verified");
});

test("h) id de registro repetido não empresta o selo ao número forjado", async () => {
  const t = await closedTable(["ana", "bia", "gm"]);
  recordAs(t, "ana", "roll-1", { visibility: "gm", fairplay: undefined });
  recordAs(t, "ana", "roll-1", { rolls: [{ value: 20, kept: true }], total: 20, crits: 1 });
  const seals = await sealsOf(t);
  const linked = t.box.doc.chronicle.filter((e) => e.fairplayRollId);
  assert.ok(linked.length > 0);
  for (const e of linked) assert.notEqual(seals[e.id].status, "verified");
});

test("i) sem @ na fórmula, a conta resolvida não pode trazer bônus inventado", async () => {
  const t = await closedTable(["ana", "bia", "gm"]);
  recordAs(t, "ana", "roll-1", { ...rollDiceFormula("1d20+15", { fairplayValue: t.value }), formula: "1d20" });
  const seals = await sealsOf(t);
  assert.equal(seals[t.box.doc.chronicle[0].id].status, "unverified");
});

test("j) o que aparece na entrada (dados, críticos e total) tem de bater com a conta refeita", async () => {
  const t = await closedTable(["ana", "bia", "gm"]);
  const honestCrits = rollDiceFormula("1d20", { fairplayValue: t.value }).crits;
  recordAs(t, "ana", "roll-1", { crits: honestCrits + 1 });
  const seals = await sealsOf(t);
  assert.equal(seals[t.box.doc.chronicle[0].id].status, "unverified");
});

test("k) registro de quem não abriu a rolagem não gasta o 'uma vez só' de quem abriu", async () => {
  const t = await closedTable(["ana", "bia", "gm"]);
  recordAs(t, "bia", "roll-b");
  recordAs(t, "ana", "roll-1");
  const [fromBia, fromAna] = t.box.doc.chronicle;
  const seals = await sealsOf(t);
  assert.equal(seals[fromBia.id].status, "unverified");
  assert.equal(seals[fromAna.id].status, "verified");
});

function makeStore() {
  return createVttStore(createMemoryVttBackend(), {
    requestPersistenceFn: async () => ({ persisted: true, isSupported: true }),
    estimateStorageFn: async () => ({ quota: 100000, usage: 100, percentage: 0.1, isSupported: true }),
    checkPersistenceFn: async () => true,
  });
}

async function joinedTable() {
  const [gm, player, other] = [await generateVttKeypair(), await generateVttKeypair(), await generateVttKeypair()];
  const env = { gm, player, other, roomKey: generateRoomKey(), hub: createInMemorySyncHub(), gmStore: makeStore(), playerStore: makeStore() };
  await env.gmStore.saveCampaign(createCampaign({ id: "mesa-sel", name: "Mesa", gmRouteId: gm.routeId }));
  const common = { campaignId: "mesa-sel", roomKey: env.roomKey };
  const gmPeer = createVttSyncPeer({ ...common, role: "gm", keypair: gm, store: env.gmStore, transport: env.hub.connect(gm.routeId) });
  const peer = createVttSyncPeer({ ...common, role: "player", keypair: player, store: env.playerStore, transport: env.hub.connect(player.routeId), gmRouteId: gm.routeId });
  peer.join();
  await settlePeers(gmPeer, peer);
  return { ...env, gmPeer, peer };
}

test("e) snapshot do Mestre com outro Mestre na campanha não é aplicado pelo jogador", async () => {
  const env = await joinedTable();
  const forged = createCampaign({ id: "mesa-sel", name: "Outra mesa", gmRouteId: env.other.routeId });
  env.hub.connect(env.gm.routeId).send(env.player.routeId, { kind: "SNAPSHOT_FILTERED", roomKey: env.roomKey, campaign: forged });
  await settlePeers(env.gmPeer, env.peer);
  assert.equal((await env.playerStore.loadCampaign("mesa-sel")).name, "Mesa");
  env.gmPeer.close();
  env.peer.close();
});

test("f) rolagem Fairplay com assinatura inválida não entra na crônica do jogador", async () => {
  const env = await joinedTable();
  const rollResult = { formula: "1d20", total: 7, rolls: [], visibility: "public", fairplay: { rollId: "roll-x", value: 7 } };
  const op = createVttOp({ type: "ROLL_RECORDED", actor: env.gm.routeId, payload: { id: "roll-1", speaker: "Mestre", rollResult }, lamport: 50 });
  const signed = await signVttOp(op, env.gm);
  signed.payload.rollResult.total = 20;
  env.hub.connect(env.gm.routeId).send(env.player.routeId, { kind: "COMMIT_OP", roomKey: env.roomKey, op: signed });
  await settlePeers(env.gmPeer, env.peer);
  assert.equal((await env.playerStore.loadCampaign("mesa-sel")).chronicle.length, 0);
  env.gmPeer.close();
  env.peer.close();
});
