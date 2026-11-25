/**
 * @file Selo Fairplay na Crônica (ADR-040 §5, PR-3b): selo só pela conta local, textos leigos,
 * contagem de rolagens que não fecharam por pessoa e flag `vox.lab.fairplay` desligada por padrão.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { reduceCampaign } from "../client/js/dungeon/vtt-reducer.js";
import { createFairplayRollOffer } from "../client/js/dungeon/vtt-fairplay-roll.js";
import { fairplayQuorum, verifyFairplayRecord } from "../client/js/dungeon/vtt-fairplay-log.js";
import { renderChronicleColumn } from "../client/js/dungeon/screen-table-layout.js";
import {
  FAIRPLAY_LAB_KEY, computeFairplaySeals, countUnclosedRolls, isFairplayLabEnabled,
  refreshFairplaySeals, renderEntrySeal, renderFairplayUnclosed,
} from "../client/js/dungeon/vtt-fairplay-selo.js";

const ROLL = "roll-a";
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const fakeStorage = (value) => ({ getItem: (k) => (k === FAIRPLAY_LAB_KEY ? value : null) });

function makeTable(peers) {
  let lamport = 0;
  const box = { doc: createCampaign({ id: "mesa-fp", name: "Mesa", gmRouteId: "gm" }) };
  const push = (type, actor, payload, ts = 0) => {
    lamport += 1;
    box.doc = reduceCampaign(box.doc, createVttOp({ type, actor, payload, lamport, ts }));
  };
  for (const p of peers) push("FAIRPLAY_KEY", p, { publicKeyJwk: { kty: "EC", x: p } });
  return { box, push };
}

async function openAndCommit(peers, committing = peers) {
  const t = makeTable(peers);
  const q = fairplayQuorum(peers.length);
  const offers = {};
  for (const p of peers) offers[p] = await createFairplayRollOffer({ peerId: p, rollId: ROLL, ...q });
  t.push("FAIRPLAY_OPEN", peers[0], { rollId: ROLL, sides: 20, formula: "1d20" }, 1000);
  for (const p of committing) t.push("FAIRPLAY_COMMIT", p, { rollId: ROLL, commit: offers[p].commit });
  return { ...t, offers, peers };
}

async function toReveal(peers) {
  const t = await openAndCommit(peers);
  for (const p of peers) {
    const others = peers.filter((o) => o !== p);
    t.push("FAIRPLAY_SHARES", p, { rollId: ROLL, shares: t.offers[p].shares.map((share, i) => ({ to: others[i % others.length], share })) });
  }
  return t;
}

async function closed(peers) {
  const t = await toReveal(peers);
  for (const p of peers) t.push("FAIRPLAY_REVEAL", p, { rollId: ROLL, seedHex: hex(t.offers[p].secret.seedBytes) });
  return t;
}

/** Registra a rolagem na crônica como o app faz, com campos extras que um par malicioso poderia mandar. */
function record(t, fairplay) {
  const rollResult = { formula: "1d20", total: 7, rolls: [], visibility: "public", fairplay };
  t.box.doc = reduceCampaign(t.box.doc, createVttOp({ type: "ROLL_RECORDED", actor: "ana", payload: { id: "roll-1", speaker: "Ana", rollResult }, lamport: 99 }));
  return t.box.doc;
}

const forState = (doc, extra = {}) => ({ ...doc, fairplayLabEnabled: true, ...extra });

test("selo: rolagem fechada ganha '✓ Verificada' com resumo leigo, só pela conta local", async () => {
  const t = await closed(["ana", "bia", "gm"]);
  const value = (await verifyFairplayRecord(t.box.doc, ROLL)).value;
  const doc = record(t, { rollId: ROLL, value });
  const state = forState(doc);
  assert.equal(await refreshFairplaySeals(state), true);
  const html = renderEntrySeal(doc.chronicle[0], state);
  assert.match(html, /<details/);
  assert.match(html, /✓ Verificada/);
  assert.match(html, /refez a conta/);
  assert.doesNotMatch(html, /hash|commit|shamir|criptograf|ECDH|SHA/i);
  assert.equal(await refreshFairplaySeals(state), false, "segunda passada não muda nada");
});

test("selo: 'verified' vindo de outro par e valor forjado nunca viram selo", async () => {
  const t = await closed(["ana", "bia", "gm"]);
  const value = (await verifyFairplayRecord(t.box.doc, ROLL)).value;
  const doc = record(t, { rollId: ROLL, value: (value % 20) + 1, verified: true });
  assert.equal("verified" in doc.chronicle[0], false, "o campo do outro par nem entra na crônica");
  const seals = await computeFairplaySeals(doc);
  assert.equal(seals[doc.chronicle[0].id].status, "unverified");
  assert.match(seals[doc.chronicle[0].id].detail, /não confere/);
});

test("selo: rolagem ainda em andamento mostra 'rolando com a mesa…'", async () => {
  const t = await toReveal(["ana", "bia", "gm"]);
  const doc = record(t, { rollId: ROLL });
  const state = forState(doc);
  await refreshFairplaySeals(state);
  assert.match(renderEntrySeal(doc.chronicle[0], state), /rolando com a mesa…/);
});

test("selo: rolagem abortada fica 'não verificada' com o motivo e conta por pessoa quem não fechou", async () => {
  const t = await openAndCommit(["ana", "bia", "cris"], ["ana"]);
  t.push("FAIRPLAY_CLOSE", "ana", { rollId: ROLL, phase: "commit" }, 60_000);
  assert.equal(t.box.doc.fairplay.rolls[ROLL].phase, "aborted");
  const doc = record(t, { rollId: ROLL });
  const state = forState(doc, { fairplayNames: { bia: "Bia" } });
  await refreshFairplaySeals(state);
  const html = renderEntrySeal(doc.chronicle[0], state);
  assert.match(html, /não verificada/);
  assert.match(html, /faltaram compromissos/);
  assert.deepEqual(countUnclosedRolls(doc.fairplay), { bia: 1, cris: 1 });
  const unclosed = renderFairplayUnclosed(state);
  assert.match(unclosed, /Bia: 1/);
  assert.match(unclosed, /cris: 1/);
  assert.match(unclosed, /de novo/);
});

test("selo: motivo desconhecido vira texto leigo genérico", async () => {
  const t = await closed(["ana", "bia", "gm"]);
  t.box.doc.fairplay.rolls[ROLL].reveals.ana = "ff".repeat(32);
  const doc = record(t, { rollId: ROLL });
  const seals = await computeFairplaySeals(doc);
  assert.equal(seals[doc.chronicle[0].id].status, "unverified");
  assert.match(seals[doc.chronicle[0].id].detail, /a conta não fechou neste aparelho/);
});

test("flag: desligada por padrão; só o valor '1' liga", async () => {
  assert.equal(isFairplayLabEnabled(fakeStorage(null)), false);
  assert.equal(isFairplayLabEnabled(fakeStorage("0")), false);
  assert.equal(isFairplayLabEnabled(fakeStorage("1")), true);
  assert.equal(isFairplayLabEnabled({ getItem() { throw new Error("bloqueado"); } }), false);
  const t = await closed(["ana", "bia", "gm"]);
  const doc = record(t, { rollId: ROLL });
  const state = { ...doc, fairplaySeals: { [doc.chronicle[0].id]: { status: "verified", label: "✓ Verificada", detail: "x" } } };
  assert.equal(renderEntrySeal(doc.chronicle[0], state, fakeStorage(null)), "");
  assert.equal(await refreshFairplaySeals(state, fakeStorage(null)), false);
  assert.match(renderEntrySeal(doc.chronicle[0], state, fakeStorage("1")), /✓ Verificada/);
});

test("crônica: com a flag ligada o selo aparece no cartão; desligada, a tela não muda", async () => {
  const t = await closed(["ana", "bia", "gm"]);
  const doc = record(t, { rollId: ROLL });
  const on = forState(doc);
  await refreshFairplaySeals(on);
  assert.match(renderChronicleColumn(on), /dungeon-fairplay-seal/);
  const off = { ...doc, fairplaySeals: on.fairplaySeals };
  globalThis.localStorage?.removeItem?.(FAIRPLAY_LAB_KEY);
  assert.doesNotMatch(renderChronicleColumn(off), /fairplay/);
});

test("crônica: entrada sem rolagem Fairplay não ganha selo e id inválido é descartado", () => {
  const plain = record(makeTable(["ana", "bia"]), undefined);
  assert.equal("fairplayRollId" in plain.chronicle[0], false);
  const bad = record(makeTable(["ana"]), { rollId: "../x y" });
  assert.equal("fairplayRollId" in bad.chronicle[0], false);
  assert.equal(renderEntrySeal(plain.chronicle[0], forState(plain)), "");
});
