/**
 * @file Fases do Fairplay no log da campanha (ADR-040): ordem das fases, recálculo em cada aparelho,
 * recuperação por quórum, fechamento pelo log e ordem de chegada que não muda o número.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { reduceCampaign, replayCampaignOps } from "../client/js/dungeon/vtt-reducer.js";
import { createFairplayRollOffer } from "../client/js/dungeon/vtt-fairplay-roll.js";
import { fairplayQuorum, verifyFairplayRecord } from "../client/js/dungeon/vtt-fairplay-log.js";
import { createFairplaySessionKey, openFairplayShare, sealFairplayShare } from "../client/js/dungeon/vtt-fairplay-cipher.js";

const ROLL = "roll-a";
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

async function makeTable(peers) {
  let lamport = 0;
  const log = [];
  const state = { value: createCampaign({ id: "mesa-fp", name: "Mesa", gmRouteId: "gm" }) };
  const push = (type, actor, payload, ts = 0, lam = lamport + 1) => {
    const op = createVttOp({ type, actor, payload, lamport: lam, ts });
    lamport = Math.max(lamport, lam);
    const before = state.value;
    state.value = reduceCampaign(state.value, op);
    if (state.value !== before) log.push(op);
    return state.value !== before;
  };
  const keys = {};
  for (const p of peers) {
    keys[p] = await createFairplaySessionKey();
    push("FAIRPLAY_KEY", p, { publicKeyJwk: keys[p].publicKeyJwk });
  }
  const roll = () => state.value.fairplay.rolls[ROLL];
  const release = async (holder, ofPeer) => {
    const mine = (roll().shares[ofPeer] || []).filter((s) => s.to === holder);
    const shares = [];
    for (const s of mine) shares.push(await openFairplayShare({ envelope: s.share, rollId: ROLL, fromPeer: ofPeer, toPeer: holder, privateKey: keys[holder].privateKey, senderJwk: keys[ofPeer].publicKeyJwk }));
    return push("FAIRPLAY_SHARE", holder, { rollId: ROLL, ofPeer, shares });
  };
  return { state, log, push, roll, release, keys };
}

async function makeOffers(peers) {
  const q = fairplayQuorum(peers.length);
  const out = {};
  for (const p of peers) out[p] = await createFairplayRollOffer({ peerId: p, rollId: ROLL, ...q });
  return out;
}

async function sharesFor(t, peers, offers, p) {
  const others = peers.filter((o) => o !== p);
  const out = [];
  for (const [i, share] of offers[p].shares.entries()) {
    const to = others[i % others.length];
    out.push({ to, share: await sealFairplayShare({ share, rollId: ROLL, fromPeer: p, toPeer: to, privateKey: t.keys[p].privateKey, recipientJwk: t.keys[to].publicKeyJwk }) });
  }
  return out;
}

async function runToReveal(peers) {
  const t = await makeTable(peers);
  const offers = await makeOffers(peers);
  assert.ok(t.push("FAIRPLAY_OPEN", peers[0], { rollId: ROLL, sides: 20, formula: "1d20" }, 1000));
  for (const p of peers) assert.ok(t.push("FAIRPLAY_COMMIT", p, { rollId: ROLL, commit: offers[p].commit }));
  for (const p of peers) assert.ok(t.push("FAIRPLAY_SHARES", p, { rollId: ROLL, shares: await sharesFor(t, peers, offers, p) }));
  assert.equal(t.roll().phase, "reveal");
  return { ...t, offers };
}

test("fairplay log: 3 pares fecham a rolagem e cada aparelho refaz a mesma conta", async () => {
  const peers = ["ana", "bia", "gm"];
  const t = await runToReveal(peers);
  for (const p of peers) assert.ok(t.push("FAIRPLAY_REVEAL", p, { rollId: ROLL, seedHex: hex(t.offers[p].secret.seedBytes) }));
  assert.equal(t.roll().phase, "done");
  const res = await verifyFairplayRecord(t.state.value, ROLL);
  assert.equal(res.status, "verified");
  assert.ok(res.value >= 1 && res.value <= 20);
  assert.equal((await verifyFairplayRecord(t.state.value, ROLL, res.value)).status, "verified");
  const forged = await verifyFairplayRecord(t.state.value, ROLL, (res.value % 20) + 1);
  assert.equal(forged.status, "unverified", "valor anunciado por outro par não vira selo");
});

test("fairplay log: semente adulterada na revelação deixa a rolagem não verificada", async () => {
  const peers = ["ana", "bia", "gm"];
  const t = await runToReveal(peers);
  t.push("FAIRPLAY_REVEAL", "ana", { rollId: ROLL, seedHex: "ff".repeat(32) });
  for (const p of ["bia", "gm"]) t.push("FAIRPLAY_REVEAL", p, { rollId: ROLL, seedHex: hex(t.offers[p].secret.seedBytes) });
  const res = await verifyFairplayRecord(t.state.value, ROLL);
  assert.equal(res.status, "unverified");
  assert.match(res.reason, /inválida/);
});

test("fairplay log: quem some na revelação é recuperado pelo quórum de partes", async () => {
  const peers = ["ana", "bia", "cris", "gm"];
  const t = await runToReveal(peers);
  for (const p of ["ana", "bia", "gm"]) t.push("FAIRPLAY_REVEAL", p, { rollId: ROLL, seedHex: hex(t.offers[p].secret.seedBytes) });
  assert.equal(t.push("FAIRPLAY_CLOSE", "ana", { rollId: ROLL, phase: "reveal" }, 500), false, "antes do prazo não fecha");
  assert.ok(t.push("FAIRPLAY_CLOSE", "ana", { rollId: ROLL, phase: "reveal" }, 60_000));
  assert.equal(t.roll().phase, "recovery");
  assert.equal(await t.release("cris", "ana"), false, "só se recupera quem não revelou");
  const { threshold } = fairplayQuorum(peers.length);
  for (const holder of ["ana", "bia", "gm"].slice(0, threshold)) await t.release(holder, "cris");
  assert.equal(t.roll().phase, "done");
  const res = await verifyFairplayRecord(t.state.value, ROLL);
  assert.equal(res.status, "verified");
  assert.deepEqual(res.recoveredPeerIds, ["cris"]);
});

test("fairplay log: sem quórum de partes a rolagem não fecha nem ganha selo", async () => {
  const peers = ["ana", "bia", "cris", "gm"];
  const t = await runToReveal(peers);
  for (const p of ["ana", "bia", "gm"]) t.push("FAIRPLAY_REVEAL", p, { rollId: ROLL, seedHex: hex(t.offers[p].secret.seedBytes) });
  t.push("FAIRPLAY_CLOSE", "ana", { rollId: ROLL, phase: "reveal" }, 60_000);
  await t.release("ana", "cris");
  assert.equal((await verifyFairplayRecord(t.state.value, ROLL)).status, "pending");
  t.push("FAIRPLAY_CLOSE", "ana", { rollId: ROLL, phase: "recovery" }, 120_000);
  assert.equal((await verifyFairplayRecord(t.state.value, ROLL)).status, "unverified");
});

test("fairplay log: operações fora de fase, compromisso copiado e lamport atrasado são recusados", async () => {
  const peers = ["ana", "bia", "gm"];
  const t = await makeTable(peers);
  const offers = await makeOffers(peers);
  assert.equal(t.push("FAIRPLAY_OPEN", "intruso", { rollId: ROLL }), false, "quem não tem chave não abre");
  t.push("FAIRPLAY_OPEN", "ana", { rollId: ROLL, sides: 20 }, 1000);
  assert.equal(t.push("FAIRPLAY_REVEAL", "ana", { rollId: ROLL, seedHex: hex(offers.ana.secret.seedBytes) }), false);
  t.push("FAIRPLAY_COMMIT", "ana", { rollId: ROLL, commit: offers.ana.commit });
  assert.equal(t.push("FAIRPLAY_COMMIT", "bia", { rollId: ROLL, commit: offers.ana.commit }), false, "commitO repetido");
  assert.equal(t.push("FAIRPLAY_COMMIT", "bia", { rollId: ROLL, commit: { ...offers.bia.commit, commitO: "" } }), false, "sem commitO");
  assert.equal(t.push("FAIRPLAY_SHARES", "ana", { rollId: ROLL, shares: await sharesFor(t, peers, offers, "ana") }), false, "partes antes de todos os compromissos");
  assert.equal(t.push("FAIRPLAY_COMMIT", "bia", { rollId: ROLL, commit: offers.bia.commit }, 0, 1), false, "lamport atrasado");
  assert.ok(t.push("FAIRPLAY_COMMIT", "bia", { rollId: ROLL, commit: offers.bia.commit }));
  assert.equal(t.push("FAIRPLAY_CLOSE", "bia", { rollId: ROLL, phase: "commit" }, 60_000), false, "só quem abriu ou o Mestre fecha");
  assert.ok(t.push("FAIRPLAY_CLOSE", "gm", { rollId: ROLL, phase: "commit" }, 60_000));
  assert.deepEqual(t.roll().participants, ["ana", "bia"], "quem não se comprometeu sai da rolagem");
});

test("fairplay log: com 2 participantes e poucos compromissos a rolagem é abortada", async () => {
  const t = await makeTable(["ana", "bia"]);
  const offers = await makeOffers(["ana", "bia"]);
  t.push("FAIRPLAY_OPEN", "ana", { rollId: ROLL }, 1000);
  t.push("FAIRPLAY_COMMIT", "ana", { rollId: ROLL, commit: offers.ana.commit });
  t.push("FAIRPLAY_CLOSE", "ana", { rollId: ROLL, phase: "commit" }, 60_000);
  assert.equal(t.roll().phase, "aborted");
  assert.equal((await verifyFairplayRecord(t.state.value, ROLL)).status, "unverified");
});

test("fairplay log: reler o log em qualquer ordem de chegada dá o mesmo número", async () => {
  const peers = ["ana", "bia", "gm"];
  const t = await runToReveal(peers);
  for (const p of peers) t.push("FAIRPLAY_REVEAL", p, { rollId: ROLL, seedHex: hex(t.offers[p].secret.seedBytes) });
  const expected = (await verifyFairplayRecord(t.state.value, ROLL)).value;
  const base = createCampaign({ id: "mesa-fp", name: "Mesa", gmRouteId: "gm" });
  for (const shuffled of [[...t.log].reverse(), [...t.log].sort(() => 0.5 - Math.random())]) {
    const replayed = replayCampaignOps(base, shuffled);
    const res = await verifyFairplayRecord(createCampaign(structuredClone(replayed)), ROLL);
    assert.equal(res.status, "verified");
    assert.equal(res.value, expected);
  }
});

test("fairplay log: com 2 participantes quem some é recuperado pelas partes do outro", async () => {
  const t = await runToReveal(["ana", "bia"]);
  t.push("FAIRPLAY_REVEAL", "ana", { rollId: ROLL, seedHex: hex(t.offers.ana.secret.seedBytes) });
  t.push("FAIRPLAY_CLOSE", "ana", { rollId: ROLL, phase: "reveal" }, 60_000);
  assert.ok(await t.release("ana", "bia"));
  const res = await verifyFairplayRecord(t.state.value, ROLL);
  assert.equal(res.status, "verified");
  assert.deepEqual(res.recoveredPeerIds, ["bia"]);
});

test("fairplay log: partes em claro ou chave com parte privada são recusadas", async () => {
  const peers = ["ana", "bia", "gm"];
  const t = await makeTable(peers);
  const offers = await makeOffers(peers);
  assert.equal(t.push("FAIRPLAY_KEY", "ana", { publicKeyJwk: { ...t.keys.ana.publicKeyJwk, d: "segredo" } }), false);
  t.push("FAIRPLAY_OPEN", "ana", { rollId: ROLL }, 1000);
  for (const p of peers) t.push("FAIRPLAY_COMMIT", p, { rollId: ROLL, commit: offers[p].commit });
  const plain = offers.ana.shares.map((share, i) => ({ to: ["bia", "gm"][i], share }));
  assert.equal(t.push("FAIRPLAY_SHARES", "ana", { rollId: ROLL, shares: plain }), false, "parte sem cifra não passa pelo hub");
  assert.ok(t.push("FAIRPLAY_SHARES", "ana", { rollId: ROLL, shares: await sharesFor(t, peers, offers, "ana") }));
});

test("fairplay cifra: só o destinatário abre a parte, e só para aquela rolagem", async () => {
  const [a, b, c] = [await createFairplaySessionKey(), await createFairplaySessionKey(), await createFairplaySessionKey()];
  const share = { splitId: "sp", x: 1, y: new Uint8Array([1, 2, 3]) };
  const envelope = await sealFairplayShare({ share, rollId: ROLL, fromPeer: "a", toPeer: "b", privateKey: a.privateKey, recipientJwk: b.publicKeyJwk });
  const opened = await openFairplayShare({ envelope, rollId: ROLL, fromPeer: "a", toPeer: "b", privateKey: b.privateKey, senderJwk: a.publicKeyJwk });
  assert.deepEqual(opened, share);
  await assert.rejects(() => openFairplayShare({ envelope, rollId: ROLL, fromPeer: "a", toPeer: "b", privateKey: c.privateKey, senderJwk: a.publicKeyJwk }));
  await assert.rejects(() => openFairplayShare({ envelope, rollId: "outra", fromPeer: "a", toPeer: "b", privateKey: b.privateKey, senderJwk: a.publicKeyJwk }));
  await assert.rejects(() => openFairplayShare({ envelope, rollId: ROLL, fromPeer: "a", toPeer: "c", privateKey: b.privateKey, senderJwk: a.publicKeyJwk }));
});
