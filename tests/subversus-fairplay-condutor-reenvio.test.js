/**
 * @file Condutor do Fairplay (ADR-040): reenvio do compromisso sem trocar a semente, parada em recusa que
 * não é de fase e conferência do hash da parte antes de liberá-la.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { reduceCampaign } from "../client/js/dungeon/vtt-reducer.js";
import { createFairplayDriver } from "../client/js/dungeon/vtt-fairplay-driver.js";
import { verifyFairplayRecord } from "../client/js/dungeon/vtt-fairplay-log.js";
import { createFairplaySessionKey, fairplayShareHash, sealFairplayShare } from "../client/js/dungeon/vtt-fairplay-cipher.js";

const noTimers = { schedule: () => 0, cancel: () => {} };
const HEX64 = "a".repeat(64);
const commitOf = (p) => ({ peerId: p, rollId: "r1", commitO: p.repeat(64).slice(0, 64), threshold: 2, totalPeers: 2 });

function makeLocalTable(ids) {
  const table = { state: createCampaign({ id: "m", name: "M", gmRouteId: "gm" }), lamport: 0, drivers: {} };
  for (const id of ids) {
    // Como o Mestre: a resposta é o estado da campanha, sem `opId`.
    const dispatchOp = async (op) => {
      table.lamport += 1;
      table.state = reduceCampaign(table.state, createVttOp({ ...op, actor: id, lamport: table.lamport }));
      return table.state;
    };
    table.drivers[id] = createFairplayDriver({ peerId: id, dispatchOp, loadCampaign: async () => table.state, ...noTimers });
  }
  return table;
}

async function settle(table) {
  for (let i = 0; i < 12; i += 1) await Promise.all(Object.values(table.drivers).map((d) => d.onUpdate(table.state)));
}

test("fairplay condutor: reenviar o compromisso mantém a semente e a rolagem fecha verificada", async () => {
  const table = makeLocalTable(["ana", "bia", "gm"]);
  for (const d of Object.values(table.drivers)) await d.start();
  const rollId = await table.drivers.ana.openRoll({ rollId: "r1", sides: 20, phaseMs: 5000 });
  const stale = table.state;
  await table.drivers.ana.onUpdate(stale);
  await table.drivers.ana.onUpdate(stale);
  await settle(table);
  assert.equal(table.state.fairplay.rolls[rollId].phase, "done");
  assert.equal((await verifyFairplayRecord(table.state, rollId)).status, "verified");
});

function rejectionHarness() {
  const types = [];
  const stops = [];
  const campaign = { gmRouteId: "gm", fairplay: { keys: {}, rolls: { r1: { rollId: "r1", opener: "gm", participants: ["ana", "bia"], phase: "commit", phaseMs: 5000, phaseStartTs: 0, commits: { bia: commitOf("bia") }, shares: {}, reveals: {}, released: {} } } } };
  const dispatchOp = async (op) => { types.push(op.type); return { opId: `op-${types.length}` }; };
  const driver = createFairplayDriver({ peerId: "ana", dispatchOp, loadCampaign: async () => campaign, onStopped: (i) => stops.push(i), ...noTimers });
  return { types, stops, driver, campaign };
}

test("fairplay condutor: recusa por relógio fora da faixa para o passo e avisa a interface", async () => {
  const h = rejectionHarness();
  await h.driver.start();
  await h.driver.onUpdate(h.campaign);
  await h.driver.onRejected({ opId: "op-2", reason: "ts_out_of_range" });
  await h.driver.onUpdate(h.campaign);
  assert.equal(h.types.filter((t) => t === "FAIRPLAY_COMMIT").length, 1);
  assert.equal(h.stops[0].reason, "ts_out_of_range");
  assert.equal(h.driver.lastRejection().reason, "ts_out_of_range");
});

test("fairplay condutor: recusa por fora de fase reenvia o passo com o estado atual", async () => {
  const h = rejectionHarness();
  await h.driver.start();
  await h.driver.onUpdate(h.campaign);
  await h.driver.onRejected({ opId: "op-2", reason: "out_of_phase" });
  assert.equal(h.types.filter((t) => t === "FAIRPLAY_COMMIT").length, 2);
  assert.deepEqual(h.stops, []);
});

async function recoveryCampaign(publishRealHash) {
  const sent = [];
  let jwk = null;
  const dispatchOp = async (op) => {
    if (op.type === "FAIRPLAY_KEY") jwk = op.payload.publicKeyJwk;
    sent.push(op);
    return { opId: `o${sent.length}` };
  };
  const driver = createFairplayDriver({ peerId: "ana", dispatchOp, loadCampaign: async () => ({}), ...noTimers });
  await driver.start();
  const bia = await createFairplaySessionKey();
  const share = { splitId: "sp", x: 1, y: new Uint8Array(32).fill(7) };
  const envelope = await sealFairplayShare({ share, rollId: "r1", fromPeer: "bia", toPeer: "ana", privateKey: bia.privateKey, recipientJwk: jwk });
  const shareHash = publishRealHash ? await fairplayShareHash(share) : HEX64;
  const roll = { rollId: "r1", opener: "gm", participants: ["ana", "bia"], phase: "recovery", phaseMs: 5000, phaseStartTs: 0, commits: { ana: commitOf("ana"), bia: commitOf("bia") }, shares: { bia: [{ to: "ana", share: envelope, shareHash }] }, reveals: { ana: HEX64 }, released: {} };
  const campaign = { gmRouteId: "gm", fairplay: { keys: { bia: { publicKeyJwk: bia.publicKeyJwk } }, rolls: { r1: roll } } };
  return { driver, sent, campaign };
}

test("fairplay condutor: libera a parte (y em hex) quando o hash publicado confere", async () => {
  const { driver, sent, campaign } = await recoveryCampaign(true);
  await driver.onUpdate(campaign);
  const release = sent.find((o) => o.type === "FAIRPLAY_SHARE");
  assert.equal(release.payload.shares[0].y, "07".repeat(32));
});

test("fairplay condutor: não libera a parte cujo hash publicado não confere", async () => {
  const { driver, sent, campaign } = await recoveryCampaign(false);
  await driver.onUpdate(campaign);
  assert.ok(!sent.some((o) => o.type === "FAIRPLAY_SHARE"));
  assert.match(driver.warnings().join(" "), /hash/);
});
