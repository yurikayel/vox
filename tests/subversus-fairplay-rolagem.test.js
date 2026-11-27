/**
 * @file Rolagem pública pela mesa (ADR-040 P1/P2): só com flag, condutor e 2+ pares; registra com
 * `fairplay: {rollId, value}` ao fechar; mostra "rolando com a mesa…", motivos por pessoa e o selo "sem você".
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { reduceCampaign } from "../client/js/dungeon/vtt-reducer.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";
import { createFairplaySessionKey, fairplayShareHash, sealFairplayShare } from "../client/js/dungeon/vtt-fairplay-cipher.js";
import { createFairplayRollOffer } from "../client/js/dungeon/vtt-fairplay-roll.js";
import { fairplayQuorum, verifyFairplayRecord } from "../client/js/dungeon/vtt-fairplay-log.js";
import { rollDiceFormula, singleDieSides } from "../client/js/dungeon/dice-engine.js";
import { recordFormulaRoll } from "../client/js/dungeon/dungeon-persistence.js";
import { tryStartFairplayRoll } from "../client/js/dungeon/vtt-fairplay-roll-flow.js";
import { FAIRPLAY_LAB_KEY, renderFairplaySeal, renderFairplayStatus } from "../client/js/dungeon/vtt-fairplay-selo.js";

const ROLL = "roll-a";
const ID = "mesa-rolagem";
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const flag = (value) => ({ getItem: (k) => (k === FAIRPLAY_LAB_KEY ? value : null) });

function makeStore() {
  return createVttStore(createMemoryVttBackend(), {
    requestPersistenceFn: async () => ({ persisted: true, isSupported: true }),
    estimateStorageFn: async () => ({ quota: 100000, usage: 100, percentage: 0.1, isSupported: true }),
    checkPersistenceFn: async () => true,
  });
}

/** Mesa com 3 pares; `stage` decide até onde a rolagem anda: "done", "aborted" ou "keys" (sem rolagem). */
async function buildDoc(stage, peers = ["ana", "bia", "gm"]) {
  let lamport = 0;
  let doc = createCampaign({ id: ID, name: "Mesa", gmRouteId: "gm" });
  const push = (type, actor, payload, ts = 0) => {
    lamport += 1;
    doc = reduceCampaign(doc, createVttOp({ type, actor, payload, lamport, ts }));
  };
  const keys = {};
  for (const p of peers) {
    keys[p] = await createFairplaySessionKey();
    push("FAIRPLAY_ADMIT", "gm", { actor: p });
    push("FAIRPLAY_KEY", p, { publicKeyJwk: keys[p].publicKeyJwk });
  }
  if (stage === "keys") return doc;
  const q = fairplayQuorum(peers.length);
  const offers = {};
  for (const p of peers) offers[p] = await createFairplayRollOffer({ peerId: p, rollId: ROLL, ...q });
  push("FAIRPLAY_OPEN", peers[0], { rollId: ROLL, sides: 20, formula: "1d20" }, 1000);
  if (stage === "aborted") {
    push("FAIRPLAY_COMMIT", "ana", { rollId: ROLL, commit: offers.ana.commit });
    push("FAIRPLAY_CLOSE", "ana", { rollId: ROLL, phase: "commit" }, 60_000);
    return doc;
  }
  for (const p of peers) push("FAIRPLAY_COMMIT", p, { rollId: ROLL, commit: offers[p].commit });
  for (const p of peers) {
    const others = peers.filter((o) => o !== p);
    const shares = [];
    for (const [i, share] of offers[p].shares.entries()) {
      const to = others[i % others.length];
      shares.push({ to, share: await sealFairplayShare({ share, rollId: ROLL, fromPeer: p, toPeer: to, privateKey: keys[p].privateKey, recipientJwk: keys[to].publicKeyJwk }), shareHash: await fairplayShareHash(share) });
    }
    push("FAIRPLAY_SHARES", p, { rollId: ROLL, shares });
  }
  for (const p of peers) push("FAIRPLAY_REVEAL", p, { rollId: ROLL, seedHex: hex(offers[p].secret.seedBytes) });
  return doc;
}

async function tableState(stage) {
  const store = makeStore();
  await store.saveCampaign(await buildDoc(stage));
  const opened = [];
  const driver = { openRoll: async (o) => { opened.push(o); return ROLL; } };
  const state = { campaignId: ID, fairplayDriver: driver, sheet: { name: "Ana" }, chronicle: [], rolls: [], localActor: "ana" };
  return { store, state, opened };
}

const settled = (state, store, extra = {}) => new Promise((resolve) => {
  tryStartFairplayRoll(state, "1d20+3 # Teste", { store, storage: flag("1"), sleep: async () => {}, maxWaitMs: 300, onSettled: resolve, ...extra });
});

test("dado: fórmula de um dado público serve ao Fairplay; várias, vantagem, explosão e /gmroll ficam fora", () => {
  assert.equal(singleDieSides("1d20+@for # Teste"), 20);
  assert.equal(singleDieSides("d6"), 6);
  assert.equal(singleDieSides("2d6"), 0);
  assert.equal(singleDieSides("1d20!"), 0);
  assert.equal(singleDieSides("/gmroll 1d20"), 0);
  assert.equal(singleDieSides("1d20", "advantage"), 0);
  assert.equal(singleDieSides("1d20 + 1d4"), 0);
  assert.equal(singleDieSides("lixo"), 0);
});

test("dado: o valor decidido pela mesa vira o dado e os modificadores seguem locais", () => {
  const res = rollDiceFormula("1d20+3", { fairplayValue: 7 });
  assert.equal(res.rolls[0].value, 7);
  assert.equal(res.total, 10);
});

test("rolagem: sem flag, sem condutor, com um par só ou com várias fórmulas, segue como hoje", async () => {
  const { store, state } = await tableState("done");
  assert.equal(await tryStartFairplayRoll(state, "1d20", { store, storage: flag(null) }), null);
  assert.equal(await tryStartFairplayRoll({ ...state, fairplayDriver: null }, "1d20", { store, storage: flag("1") }), null);
  assert.equal(await tryStartFairplayRoll(state, "2d6", { store, storage: flag("1") }), null);
  const lone = makeStore();
  await lone.saveCampaign(createCampaign({ id: ID, name: "Mesa", gmRouteId: "gm" }));
  assert.equal(await tryStartFairplayRoll(state, "1d20", { store: lone, storage: flag("1") }), null);
  const normal = await recordFormulaRoll(state, "1d20+3", { store, storage: flag(null) });
  assert.equal(normal.pending, undefined);
  assert.equal(normal.ok, true);
});

test("rolagem: com 2+ pares abre pela mesa, mostra 'rolando com a mesa…' e registra com rollId e valor ao fechar", async () => {
  const { store, state, opened } = await tableState("done");
  let release;
  const gate = new Promise((r) => { release = r; });
  const gated = { ...store, loadCampaign: async (id) => { await gate; return store.loadCampaign(id); } };
  let finished;
  const done = new Promise((r) => { finished = r; });
  const first = await tryStartFairplayRoll(state, "1d20+3 # Teste", { store: { ...store, loadCampaign: (id) => (state.fairplayPending ? gated.loadCampaign(id) : store.loadCampaign(id)) }, storage: flag("1"), sleep: async () => {}, onSettled: finished });
  assert.equal(first.pending, true);
  assert.deepEqual(opened.map((o) => o.sides), [20]);
  assert.match(renderFairplayStatus(state), /rolando com a mesa…/);
  release();
  await done;
  assert.equal(state.fairplayPending[ROLL], undefined);
  const campaign = await store.loadCampaign(ID);
  const entry = campaign.chronicle.find((e) => e.fairplayRollId === ROLL);
  const verdict = await verifyFairplayRecord(campaign, ROLL);
  assert.equal(entry.fairplayValue, verdict.value);
  assert.match(entry.rollNote, new RegExp(`= ${verdict.value + 3}$`));
});

test("rolagem: abortada não entra na Crônica e o aviso diz quem não entrou, por pessoa", async () => {
  const { store, state } = await tableState("aborted");
  await settled(state, store);
  assert.equal((await store.loadCampaign(ID)).chronicle.some((e) => e.fairplayRollId), false);
  state.fairplay = (await store.loadCampaign(ID)).fairplay;
  state.fairplayNames = { bia: "Bia" };
  const html = renderFairplayStatus({ ...state, fairplayViewerId: "ana" });
  assert.match(html, /Bia não entrou a tempo/);
  assert.match(html, /gm não entrou a tempo/);
  assert.match(html, /Bia: 1/);
});

test("rolagem: revelação que não aparece no log vira falta; 'segurada no caminho' só se este aparelho a enviou", async () => {
  const doc = await buildDoc("done");
  delete doc.fairplay.rolls[ROLL].reveals.ana;
  const base = { fairplay: doc.fairplay, fairplayViewerId: "ana", fairplayVerdicts: { [ROLL]: { status: "unverified" } } };
  assert.match(renderFairplayStatus(base), /Você não revelou o seu número a tempo/);
  const sent = { ...base, fairplayDriver: { revealSent: () => true } };
  assert.match(renderFairplayStatus(sent), /segurada no caminho/);
  const other = renderFairplayStatus({ ...base, fairplayViewerId: "bia", fairplayNames: { ana: "Ana" } });
  assert.match(other, /Ana não revelou o número a tempo; a rolagem foi anulada/);
  assert.doesNotMatch(other, /segurada no caminho|não chegou/);
});

test("selo: 'verificada pela mesa, sem você' tem classe e CSS próprios", () => {
  const html = renderFairplaySeal({ status: "table_only", label: "verificada pela mesa, sem você", detail: "x" });
  assert.match(html, /is-table_only/);
  assert.match(readFileSync(new URL("../client/css/dungeon-layout.css", import.meta.url), "utf8"), /\.dungeon-fairplay-seal\.is-table_only/);
});
