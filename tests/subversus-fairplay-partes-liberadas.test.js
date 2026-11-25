/**
 * @file Fairplay (ADR-040): partes liberadas na recuperação ficam amarradas ao hash publicado em
 * `FAIRPLAY_SHARES`, viajam com `y` em hex e o condutor diz quando não consegue cifrar para um par.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { reduceCampaign } from "../client/js/dungeon/vtt-reducer.js";
import { createFairplayRollOffer } from "../client/js/dungeon/vtt-fairplay-roll.js";
import { fairplayQuorum, verifyFairplayRecord } from "../client/js/dungeon/vtt-fairplay-log.js";
import { createFairplayDriver } from "../client/js/dungeon/vtt-fairplay-driver.js";
import { createFairplaySessionKey, fairplayShareHash, isFairplayPublicKeyOnCurve, openFairplayShare, sealFairplayShare } from "../client/js/dungeon/vtt-fairplay-cipher.js";

const ROLL = "roll-h";
const PEERS = ["ana", "bia", "gm"];
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

async function tableAtReveal(stopBeforeShares = false) {
  let lamport = 0;
  const t = { state: createCampaign({ id: "m", name: "M", gmRouteId: "gm" }), keys: {}, offers: {} };
  t.push = (type, actor, payload, ts = 0) => {
    lamport += 1;
    const before = t.state;
    t.state = reduceCampaign(t.state, createVttOp({ type, actor, payload, lamport, ts }));
    return t.state !== before;
  };
  for (const p of PEERS) {
    t.keys[p] = await createFairplaySessionKey();
    t.push("FAIRPLAY_KEY", p, { publicKeyJwk: t.keys[p].publicKeyJwk });
  }
  t.push("FAIRPLAY_OPEN", "ana", { rollId: ROLL }, 1000);
  for (const p of PEERS) t.offers[p] = await createFairplayRollOffer({ peerId: p, rollId: ROLL, ...fairplayQuorum(3) });
  for (const p of PEERS) t.push("FAIRPLAY_COMMIT", p, { rollId: ROLL, commit: t.offers[p].commit });
  if (stopBeforeShares) return t;
  for (const p of PEERS) t.push("FAIRPLAY_SHARES", p, { rollId: ROLL, shares: await sealAll(t, p) });
  return t;
}

async function sealAll(t, p) {
  const others = PEERS.filter((o) => o !== p);
  const out = [];
  for (const [i, share] of t.offers[p].shares.entries()) {
    const to = others[i % others.length];
    const env = await sealFairplayShare({ share, rollId: ROLL, fromPeer: p, toPeer: to, privateKey: t.keys[p].privateKey, recipientJwk: t.keys[to].publicKeyJwk });
    out.push({ to, share: env, shareHash: await fairplayShareHash(share) });
  }
  return out;
}

async function openFor(t, holder, ofPeer) {
  const mine = t.state.fairplay.rolls[ROLL].shares[ofPeer].filter((s) => s.to === holder);
  return Promise.all(mine.map((s) => openFairplayShare({ envelope: s.share, rollId: ROLL, fromPeer: ofPeer, toPeer: holder, privateKey: t.keys[holder].privateKey, senderJwk: t.keys[ofPeer].publicKeyJwk })));
}

async function revealAllButBia(t) {
  for (const p of ["ana", "gm"]) t.push("FAIRPLAY_REVEAL", p, { rollId: ROLL, seedHex: hex(t.offers[p].secret.seedBytes) });
  assert.ok(t.push("FAIRPLAY_CLOSE", "ana", { rollId: ROLL, phase: "reveal" }, 60_000));
  assert.equal(t.state.fairplay.rolls[ROLL].phase, "recovery");
}

const asHex = (plain) => plain.map((s) => ({ splitId: s.splitId, x: s.x, y: hex(s.y) }));

test("fairplay partes: partes sem o hash publicado não entram no log", async () => {
  const t = await tableAtReveal(true);
  const full = await sealAll(t, "ana");
  const noHash = full.map(({ to, share }) => ({ to, share }));
  assert.equal(t.push("FAIRPLAY_SHARES", "ana", { rollId: ROLL, shares: noHash }), false);
  assert.ok(t.push("FAIRPLAY_SHARES", "ana", { rollId: ROLL, shares: full }));
  assert.ok(t.state.fairplay.rolls[ROLL].shares.ana.every((s) => /^[0-9a-f]{64}$/.test(s.shareHash)));
});

test("fairplay partes: a recuperação com partes que batem com o hash publicado fecha e verifica", async () => {
  const t = await tableAtReveal();
  await revealAllButBia(t);
  for (const h of ["ana", "gm"]) assert.ok(t.push("FAIRPLAY_SHARE", h, { rollId: ROLL, ofPeer: "bia", shares: asHex(await openFor(t, h, "bia")) }));
  assert.equal(t.state.fairplay.rolls[ROLL].phase, "done");
  const res = await verifyFairplayRecord(t.state, ROLL);
  assert.equal(res.status, "verified");
  assert.deepEqual(res.recoveredPeerIds, ["bia"]);
});

test("fairplay partes: parte liberada que não bate com o hash publicado não conta e a rolagem fica não verificada", async () => {
  const t = await tableAtReveal();
  await revealAllButBia(t);
  const forged = asHex(await openFor(t, "ana", "bia")).map((s) => ({ ...s, y: "00".repeat(s.y.length / 2) }));
  assert.ok(t.push("FAIRPLAY_SHARE", "ana", { rollId: ROLL, ofPeer: "bia", shares: forged }));
  assert.ok(t.push("FAIRPLAY_SHARE", "gm", { rollId: ROLL, ofPeer: "bia", shares: asHex(await openFor(t, "gm", "bia")) }));
  const res = await verifyFairplayRecord(t.state, ROLL);
  assert.equal(res.status, "unverified");
  assert.match(res.reason, /há 1./, "só a parte conferida com o hash conta");
});

test("fairplay partes: a parte liberada tem y em hex e sobrevive a JSON", async () => {
  const t = await tableAtReveal();
  await revealAllButBia(t);
  const plain = await openFor(t, "ana", "bia");
  assert.equal(t.push("FAIRPLAY_SHARE", "ana", { rollId: ROLL, ofPeer: "bia", shares: plain }), false, "Uint8Array não é aceito");
  const viaJson = JSON.parse(JSON.stringify({ shares: asHex(plain) })).shares;
  assert.ok(t.push("FAIRPLAY_SHARE", "ana", { rollId: ROLL, ofPeer: "bia", shares: viaJson }));
  assert.equal(typeof t.state.fairplay.rolls[ROLL].released.bia.ana[0].y, "string");
});

test("fairplay chave: a verificação de curva aceita chave real e recusa coordenada fora do corpo", async () => {
  const { publicKeyJwk } = await createFairplaySessionKey();
  assert.equal(isFairplayPublicKeyOnCurve(publicKeyJwk), true);
  assert.equal(isFairplayPublicKeyOnCurve({ ...publicKeyJwk, x: "_".repeat(43) }), false);
  assert.equal(isFairplayPublicKeyOnCurve({ x: "AAAA", y: "AAAA" }), false);
});

test("fairplay condutor: chave de par que não importa vira aviso e nenhuma parte parcial é enviada", async () => {
  const sent = [];
  const driver = createFairplayDriver({ peerId: "ana", dispatchOp: async (op) => { sent.push(op.type); return { opId: `o${sent.length}` }; }, loadCampaign: async () => ({}) });
  await driver.start();
  const good = await createFairplaySessionKey();
  const commit = (p) => ({ peerId: p, rollId: ROLL, commitO: p.repeat(64).slice(0, 64), threshold: 2, totalPeers: 2 });
  const roll = (phase) => ({ rollId: ROLL, opener: "gm", participants: ["ana", "bia"], phase, phaseMs: 60_000, phaseStartTs: Date.now(), commits: { ana: commit("ana"), bia: commit("bia") }, shares: {}, reveals: {}, released: {} });
  const camp = (phase) => ({ gmRouteId: "gm", fairplay: { keys: { ana: { publicKeyJwk: good.publicKeyJwk }, bia: { publicKeyJwk: { kty: "EC", crv: "P-256", x: "AA", y: "AA" } } }, rolls: { [ROLL]: roll(phase) } } });
  const first = camp("commit");
  first.fairplay.rolls[ROLL].commits = {};
  await driver.onUpdate(first);
  await driver.onUpdate(camp("shares"));
  assert.ok(!sent.includes("FAIRPLAY_SHARES"));
  assert.match(driver.warnings().join(" "), /bia/);
  driver.close();
});
