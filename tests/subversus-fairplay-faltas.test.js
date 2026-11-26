/**
 * @file Fairplay: quando a rolagem é anulada porque alguém não revelou o número no prazo, a Crônica diz quem
 * foi; só o Mestre grava a falta no log; em mesa de dois, o guardião confere as partes antes de revelar.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { reduceCampaign } from "../client/js/dungeon/vtt-reducer.js";
import { createFairplayRollOffer } from "../client/js/dungeon/vtt-fairplay-roll.js";
import { createFairplayDriver } from "../client/js/dungeon/vtt-fairplay-driver.js";
import { fairplayQuorum } from "../client/js/dungeon/vtt-fairplay-log.js";
import { createFairplaySessionKey, fairplayShareHash, openFairplayShare, sealFairplayShare } from "../client/js/dungeon/vtt-fairplay-cipher.js";
import { countUnclosedRolls, refreshFairplaySeals, renderEntrySeal, renderFairplayStatus } from "../client/js/dungeon/vtt-fairplay-selo.js";

const ROLL = "roll-a";
const LATE = 10 ** 13;
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const drain = async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); };

async function makeTable(peers) {
  let lamport = 0;
  const box = { doc: createCampaign({ id: "mesa-faltas", name: "Mesa", gmRouteId: "gm" }) };
  const keys = {};
  const push = (type, actor, payload, ts = 0) => {
    lamport += 1;
    box.doc = reduceCampaign(box.doc, createVttOp({ type, actor, payload, lamport, ts }));
  };
  for (const p of peers) {
    keys[p] = await createFairplaySessionKey();
    push("FAIRPLAY_ADMIT", "gm", { actor: p });
    push("FAIRPLAY_KEY", p, { publicKeyJwk: keys[p].publicKeyJwk });
  }
  return { box, push, keys };
}

async function sealTo(t, from, to, share) {
  const envelope = await sealFairplayShare({ share, rollId: ROLL, fromPeer: from, toPeer: to, privateKey: t.keys[from].privateKey, recipientJwk: t.keys[to].publicKeyJwk });
  return { to, share: envelope, shareHash: await fairplayShareHash(share) };
}

/** Rolagem de `peers` até a fase de revelação, com todos os compromissos e partes no log. */
async function toReveal(peers) {
  const t = await makeTable(peers);
  const q = fairplayQuorum(peers.length);
  t.offers = {};
  for (const p of peers) t.offers[p] = await createFairplayRollOffer({ peerId: p, rollId: ROLL, ...q });
  t.push("FAIRPLAY_OPEN", peers[0], { rollId: ROLL, sides: 20, formula: "1d20" }, 1000);
  for (const p of peers) t.push("FAIRPLAY_COMMIT", p, { rollId: ROLL, commit: t.offers[p].commit });
  for (const p of peers) {
    const others = peers.filter((o) => o !== p);
    const shares = [];
    for (const [i, share] of t.offers[p].shares.entries()) shares.push(await sealTo(t, p, others[i % others.length], share));
    t.push("FAIRPLAY_SHARES", p, { rollId: ROLL, shares });
  }
  return t;
}

/** Fecha a rolagem: quem está em `revealers` revela; o prazo da revelação e o da recuperação vencem. */
async function closeRoll(peers, revealers) {
  const t = await toReveal(peers);
  for (const p of revealers) t.push("FAIRPLAY_REVEAL", p, { rollId: ROLL, seedHex: hex(t.offers[p].secret.seedBytes) });
  if (t.box.doc.fairplay.rolls[ROLL].phase === "reveal") t.push("FAIRPLAY_CLOSE", "gm", { rollId: ROLL, phase: "reveal" }, LATE);
  if (t.box.doc.fairplay.rolls[ROLL].phase === "recovery") t.push("FAIRPLAY_CLOSE", "gm", { rollId: ROLL, phase: "recovery" }, LATE * 2);
  return t;
}

async function release(t, holder, ofPeer) {
  const mine = t.box.doc.fairplay.rolls[ROLL].shares[ofPeer].filter((s) => s.to === holder);
  const shares = [];
  for (const s of mine) {
    const plain = await openFairplayShare({ envelope: s.share, rollId: ROLL, fromPeer: ofPeer, toPeer: holder, privateKey: t.keys[holder].privateKey, senderJwk: t.keys[ofPeer].publicKeyJwk });
    shares.push({ splitId: plain.splitId, x: plain.x, y: hex(plain.y) });
  }
  t.push("FAIRPLAY_SHARE", holder, { rollId: ROLL, ofPeer, shares }, LATE + 1);
}

const viewState = (doc, extra = {}) => ({ ...doc, fairplayLabEnabled: true, fairplayViewerId: "ana", fairplayNames: { bia: "bia" }, ...extra });

test("faltas: N=3, bia não revelou e a recuperação falhou: a Crônica diz quem foi", async () => {
  const t = await closeRoll(["ana", "bia", "gm"], ["ana", "gm"]);
  assert.equal(t.box.doc.fairplay.rolls[ROLL].phase, "done");
  const state = viewState(t.box.doc);
  await refreshFairplaySeals(state);
  const html = renderFairplayStatus(state);
  assert.match(html, /bia não revelou o número a tempo; a rolagem foi anulada\./);
  assert.doesNotMatch(html, /não chegou/);
});

test("faltas: a falta de quem não revelou entra na contagem por pessoa", async () => {
  const t = await closeRoll(["ana", "bia", "gm"], ["ana", "gm"]);
  const state = viewState(t.box.doc);
  await refreshFairplaySeals(state);
  assert.equal(countUnclosedRolls(t.box.doc.fairplay, state.fairplayVerdicts).bia, 1);
});

test("faltas: rolagem recuperada com sucesso não gera falta e segue verificada", async () => {
  const t = await toReveal(["ana", "bia", "gm"]);
  for (const p of ["ana", "gm"]) t.push("FAIRPLAY_REVEAL", p, { rollId: ROLL, seedHex: hex(t.offers[p].secret.seedBytes) });
  t.push("FAIRPLAY_CLOSE", "gm", { rollId: ROLL, phase: "reveal" }, LATE);
  await release(t, "ana", "bia");
  await release(t, "gm", "bia");
  t.push("FAIRPLAY_CLOSE", "gm", { rollId: ROLL, phase: "recovery" }, LATE * 2);
  const state = viewState(t.box.doc);
  await refreshFairplaySeals(state);
  assert.equal(state.fairplayVerdicts?.[ROLL]?.status, "verified");
  assert.doesNotMatch(renderFairplayStatus(state), /revelou|não chegou/);
  assert.deepEqual(countUnclosedRolls(t.box.doc.fairplay, state.fairplayVerdicts), {});
});

test("faltas: 'segurada no caminho' só quando este aparelho enviou a revelação; senão, 'você não revelou'", async () => {
  const t = await closeRoll(["ana", "bia", "gm"], ["bia", "gm"]);
  const state = viewState(t.box.doc);
  await refreshFairplaySeals(state);
  assert.match(renderFairplayStatus(state), /Você não revelou o seu número a tempo; a rolagem foi anulada\./);
  const sent = { ...state, fairplayDriver: { revealSent: () => true, invalidShares: () => "" } };
  assert.match(renderFairplayStatus(sent), /segurada no caminho/);
});

function chronicleOp(actor, lamport) {
  const payload = { id: "fault-roll-a", speaker: "Mesa", badge: "Falta", text: "bia sumiu", fairplayRollId: ROLL, fairplayFault: true };
  return createVttOp({ type: "CHRONICLE_APPEND", actor, payload, lamport });
}

test("faltas: o reducer ignora fairplayFault de quem não é o Mestre", () => {
  const doc = createCampaign({ id: "mesa-faltas", name: "Mesa", gmRouteId: "gm" });
  const entry = reduceCampaign(doc, chronicleOp("ana", 1)).chronicle.at(-1);
  assert.equal(entry.fairplayFault, undefined);
  assert.equal(entry.fairplayRollId, undefined);
});

test("faltas: o reducer guarda fairplayFault do Mestre só como booleano com o id da rolagem", () => {
  const doc = createCampaign({ id: "mesa-faltas", name: "Mesa", gmRouteId: "gm" });
  const entry = reduceCampaign(doc, chronicleOp("gm", 1)).chronicle.at(-1);
  assert.equal(entry.fairplayFault, true);
  assert.equal(entry.fairplayRollId, ROLL);
});

test("faltas: cada aparelho redesenha a entrada pela própria conta e ignora o texto do payload", async () => {
  const t = await closeRoll(["ana", "bia", "gm"], ["ana", "gm"]);
  t.box.doc = reduceCampaign(t.box.doc, chronicleOp("gm", 99));
  const entry = t.box.doc.chronicle.at(-1);
  const state = viewState(t.box.doc);
  await refreshFairplaySeals(state);
  const html = renderEntrySeal(entry, state);
  assert.match(html, /bia não revelou o número a tempo/);
  assert.doesNotMatch(html, /bia sumiu/);
  const unknown = renderEntrySeal(entry, viewState({ ...t.box.doc, fairplay: { rolls: {} } }));
  assert.match(unknown, /falta registrada pelo Mestre; este aparelho não pôde conferir/);
});

/** Mesa com condutores reais; `blocked[id]` lista os tipos de op que aquele aparelho "perde" no caminho. */
function makeDriverTable(ids, blocked = {}) {
  const table = { state: createCampaign({ id: "mesa-faltas", name: "Mesa", gmRouteId: "gm" }), lamport: 0, drivers: {}, ops: [] };
  const push = (op) => {
    table.lamport += 1;
    table.state = reduceCampaign(table.state, createVttOp({ ...op, lamport: table.lamport }));
  };
  table.push = push;
  for (const id of ids) {
    const dispatchOp = async (op) => {
      if (op.type === "FAIRPLAY_KEY") push({ type: "FAIRPLAY_ADMIT", actor: "gm", payload: { actor: id } });
      if (!(blocked[id] || []).includes(op.type)) push({ ...op, actor: id });
      table.ops.push({ actor: id, type: op.type });
      return table.state;
    };
    table.drivers[id] = createFairplayDriver({ peerId: id, dispatchOp, loadCampaign: async () => table.state, schedule: () => 0, cancel: () => {} });
  }
  return table;
}

async function settle(table) {
  for (let i = 0; i < 10; i += 1) {
    await Promise.all(Object.values(table.drivers).map((d) => d.onUpdate(table.state)));
    await drain();
  }
}

test("faltas: o Mestre grava a falta uma vez por rolagem, sem texto confiável", async () => {
  const table = makeDriverTable(["ana", "bia", "gm"], { bia: ["FAIRPLAY_REVEAL"], ana: ["FAIRPLAY_SHARE"], gm: ["FAIRPLAY_SHARE"] });
  for (const d of Object.values(table.drivers)) await d.start();
  const rollId = await table.drivers.ana.openRoll({ rollId: "roll-m", sides: 20, phaseMs: 5000 });
  await settle(table);
  table.push({ type: "FAIRPLAY_CLOSE", actor: "gm", payload: { rollId, phase: "reveal" }, ts: LATE });
  table.push({ type: "FAIRPLAY_CLOSE", actor: "gm", payload: { rollId, phase: "recovery" }, ts: LATE * 2 });
  await settle(table);
  await settle(table);
  const faults = table.state.chronicle.filter((e) => e.fairplayFault);
  assert.equal(faults.length, 1);
  assert.equal(faults[0].fairplayRollId, rollId);
  assert.equal(faults[0].text, "");
  assert.equal(table.ops.filter((o) => o.type === "CHRONICLE_APPEND" && o.actor !== "gm").length, 0);
});

/** Mesa de dois: bia entrega partes de OUTRA semente (não refazem o compromisso que ela publicou). */
async function twoPlayerTable() {
  const table = makeDriverTable(["ana"]);
  const ana = table.drivers.ana;
  await ana.start();
  const bia = await createFairplaySessionKey();
  table.push({ type: "FAIRPLAY_ADMIT", actor: "gm", payload: { actor: "bia" } });
  table.push({ type: "FAIRPLAY_KEY", actor: "bia", payload: { publicKeyJwk: bia.publicKeyJwk } });
  await ana.openRoll({ rollId: ROLL, sides: 20, phaseMs: 5000 });
  await settle(table);
  const q = fairplayQuorum(2);
  const real = await createFairplayRollOffer({ peerId: "bia", rollId: ROLL, ...q });
  const other = await createFairplayRollOffer({ peerId: "bia", rollId: ROLL, ...q });
  table.push({ type: "FAIRPLAY_COMMIT", actor: "bia", payload: { rollId: ROLL, commit: real.commit } });
  await settle(table);
  const anaKey = table.state.fairplay.keys.ana.publicKeyJwk;
  const list = [];
  for (const share of other.shares) {
    const envelope = await sealFairplayShare({ share, rollId: ROLL, fromPeer: "bia", toPeer: "ana", privateKey: bia.privateKey, recipientJwk: anaKey });
    list.push({ to: "ana", share: envelope, shareHash: await fairplayShareHash(share) });
  }
  table.push({ type: "FAIRPLAY_SHARES", actor: "bia", payload: { rollId: ROLL, shares: list } });
  await settle(table);
  return { table, ana, real };
}

test("faltas: N=2, partes ruins de bia: ana revela do mesmo jeito e só recebe um aviso local", async () => {
  const { table, ana } = await twoPlayerTable();
  const roll = table.state.fairplay.rolls[ROLL];
  assert.equal(Object.hasOwn(roll.reveals, "ana"), true, "quem é honesto revela sempre");
  assert.equal(ana.invalidShares(ROLL), "bia");
  const state = viewState(table.state, { fairplayDriver: ana });
  assert.match(renderFairplayStatus(state), /As partes de bia que ficaram comigo não refazem o número que ele escondeu/);
  assert.deepEqual(countUnclosedRolls(table.state.fairplay, {}), {});
});

test("faltas: N=2, bia revela e não libera as partes: a falta nunca cai em ana, vista de fora", async () => {
  const { table, real } = await twoPlayerTable();
  table.push({ type: "FAIRPLAY_REVEAL", actor: "bia", payload: { rollId: ROLL, seedHex: hex(real.secret.seedBytes) } });
  const phase = () => table.state.fairplay.rolls[ROLL].phase;
  if (phase() === "reveal") table.push({ type: "FAIRPLAY_CLOSE", actor: "gm", payload: { rollId: ROLL, phase: "reveal" }, ts: LATE });
  if (phase() === "recovery") table.push({ type: "FAIRPLAY_CLOSE", actor: "gm", payload: { rollId: ROLL, phase: "recovery" }, ts: LATE * 2 });
  assert.equal(phase(), "done");
  const gm = viewState(table.state, { fairplayViewerId: "gm", fairplayNames: { ana: "ana", bia: "bia" } });
  await refreshFairplaySeals(gm);
  assert.doesNotMatch(renderFairplayStatus(gm), /ana não revelou|anulada/);
  assert.deepEqual(countUnclosedRolls(table.state.fairplay, gm.fairplayVerdicts), {});
});

test("faltas: N=3, revelação que não bate com o compromisso gera falta para quem a mandou", async () => {
  const t = await toReveal(["ana", "bia", "gm"]);
  for (const p of ["ana", "gm"]) t.push("FAIRPLAY_REVEAL", p, { rollId: ROLL, seedHex: hex(t.offers[p].secret.seedBytes) });
  t.push("FAIRPLAY_REVEAL", "bia", { rollId: ROLL, seedHex: "ab".repeat(32) });
  assert.equal(t.box.doc.fairplay.rolls[ROLL].phase, "done");
  const state = viewState(t.box.doc);
  await refreshFairplaySeals(state);
  assert.match(renderFairplayStatus(state), /bia revelou um número que não bate com o que escondeu; a rolagem foi anulada\./);
  assert.equal(countUnclosedRolls(t.box.doc.fairplay, state.fairplayVerdicts).bia, 1);
});

test("faltas: o cartão da falta do Mestre sai com texto, orador e selo fixos, ignorando o payload", () => {
  const doc = createCampaign({ id: "mesa-faltas", name: "Mesa", gmRouteId: "gm" });
  const op = createVttOp({ type: "CHRONICLE_APPEND", actor: "gm", lamport: 1, payload: { id: "fault-roll-a", speaker: "Fulano", badge: "Aviso", text: "ana trapaceou", fairplayRollId: ROLL, fairplayFault: true } });
  const entry = reduceCampaign(doc, op).chronicle.at(-1);
  assert.deepEqual([entry.speaker, entry.badge, entry.text], ["Mesa", "Falta", ""]);
});
