/**
 * @file Fairplay (ADR-040): admissão de chaves, limites de campos, fechamento do compromisso com menos
 * participantes e condutor que só avança quando o log mostra a fase completa.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { reduceCampaign } from "../client/js/dungeon/vtt-reducer.js";
import { createFairplayDriver } from "../client/js/dungeon/vtt-fairplay-driver.js";
import { createFairplaySessionKey } from "../client/js/dungeon/vtt-fairplay-cipher.js";

const HEX64 = "a".repeat(64);
const apply = (state, type, actor, payload, lamport = 100, ts = 0) => {
  const admitted = type === "FAIRPLAY_KEY" ? reduceCampaign(state, createVttOp({ type: "FAIRPLAY_ADMIT", actor: "gm", payload: { actor }, lamport, ts })) : state;
  const lam = type === "FAIRPLAY_KEY" ? lamport + 1 : lamport; // a admissão tem lamport menor que a chave
  return reduceCampaign(admitted, createVttOp({ type, actor, payload, lamport: lam, ts }));
};

function rollDoc(over = {}) {
  const commit = (p, n) => ({ peerId: p, rollId: "r1", commitO: String(n).repeat(64), commitV: "", splitId: "s", threshold: 2, totalPeers: 2 });
  return {
    rollId: "r1", opener: "ana", sides: 20, formula: "", participants: ["ana", "bia"], phase: "reveal", phaseMs: 1000, phaseStartTs: 0,
    lastLamport: 1, commits: { ana: commit("ana", 1), bia: commit("bia", 2) }, shares: {}, reveals: {}, released: {}, ...over,
  };
}

const withRoll = (over) => createCampaign({ id: "m", name: "M", gmRouteId: "gm", fairplay: { keys: {}, rolls: { r1: rollDoc(over) } } });

test("fairplay endurecimento: chave pública fora da curva P-256 não entra no log", async () => {
  const key = await createFairplaySessionKey();
  const off = { ...key.publicKeyJwk, y: key.publicKeyJwk.y.slice(0, -2) + (key.publicKeyJwk.y.endsWith("AA") ? "BB" : "AA") };
  const base = createCampaign({ id: "m", name: "M", gmRouteId: "gm" });
  assert.equal(Object.keys(apply(base, "FAIRPLAY_KEY", "ana", { publicKeyJwk: off }).fairplay.keys).length, 0);
  assert.equal(Object.keys(apply(base, "FAIRPLAY_KEY", "ana", { publicKeyJwk: key.publicKeyJwk }).fairplay.keys).length, 1);
});

test("fairplay endurecimento: o número de chaves por campanha tem teto", async () => {
  const key = await createFairplaySessionKey();
  let state = createCampaign({ id: "m", name: "M", gmRouteId: "gm" });
  for (let i = 0; i < 80; i += 1) state = apply(state, "FAIRPLAY_KEY", `peer-${i}`, { publicKeyJwk: key.publicKeyJwk }, i + 1);
  assert.equal(Object.keys(state.fairplay.keys).length, 64);
});

test("fairplay endurecimento: abertura só admite quem tinha chave antes dela e limita os lados do dado", async () => {
  const key = await createFairplaySessionKey();
  let state = createCampaign({ id: "m", name: "M", gmRouteId: "gm" });
  for (const [peer, lamport] of [["ana", 1], ["bia", 2], ["cai", 50]]) state = apply(state, "FAIRPLAY_KEY", peer, { publicKeyJwk: key.publicKeyJwk }, lamport);
  assert.equal(apply(state, "FAIRPLAY_OPEN", "ana", { rollId: "big", sides: 5000 }, 10).fairplay.rolls.big, undefined);
  const opened = apply(state, "FAIRPLAY_OPEN", "ana", { rollId: "r1", sides: 1000 }, 10);
  assert.deepEqual(opened.fairplay.rolls.r1.participants, ["ana", "bia"]);
  assert.equal(apply(state, "FAIRPLAY_OPEN", "ana", { rollId: "r2" }, 1).fairplay.rolls.r2, undefined);
});

test("fairplay endurecimento: a semente revelada tem exatamente 32 bytes em hex", () => {
  const state = withRoll();
  assert.equal(apply(state, "FAIRPLAY_REVEAL", "ana", { rollId: "r1", seedHex: "ab".repeat(31) }).fairplay.rolls.r1.reveals.ana, undefined);
  assert.equal(apply(state, "FAIRPLAY_REVEAL", "ana", { rollId: "r1", seedHex: HEX64 }).fairplay.rolls.r1.reveals.ana, HEX64);
});

test("fairplay endurecimento: envelope de parte acima do tamanho máximo é recusado", () => {
  const state = withRoll({ phase: "shares" });
  const env = (bytes) => ({ alg: "ecdh-p256+hkdf-sha256+aes-256-gcm", iv: "00".repeat(12), ct: "ab".repeat(bytes) });
  const send = (bytes) => apply(state, "FAIRPLAY_SHARES", "ana", { rollId: "r1", shares: [{ to: "bia", share: env(bytes), shareHash: HEX64 }, { to: "bia", share: env(bytes), shareHash: HEX64 }] });
  assert.ok(send(40).fairplay.rolls.r1.shares.ana);
  assert.equal(send(4000).fairplay.rolls.r1.shares.ana, undefined);
});

function closeCommit(commitsOf, participants) {
  const commit = (p) => ({ peerId: p, rollId: "r1", commitO: p.repeat(64).slice(0, 64), commitV: "", splitId: "s", threshold: 3, totalPeers: 3 });
  const commits = Object.fromEntries(commitsOf.map((p) => [p, commit(p)]));
  const state = withRoll({ phase: "commit", participants, commits });
  return apply(state, "FAIRPLAY_CLOSE", "ana", { rollId: "r1", phase: "commit" }, 5, 5000).fairplay.rolls.r1;
}

test("fairplay endurecimento: fechar o compromisso com 2 de 4 não deixa um par com partes para abrir a semente do outro", () => {
  const roll = closeCommit(["a", "b"], ["a", "b", "c", "d"]);
  assert.equal(roll.phase, "aborted");
});

test("fairplay endurecimento: fechar o compromisso com 3 de 4 segue para as partes", () => {
  const roll = closeCommit(["a", "b", "c"], ["a", "b", "c", "d"]);
  assert.equal(roll.phase, "shares");
  assert.deepEqual(roll.participants, ["a", "b", "c"]);
});

async function startedDriver(over = {}) {
  const sent = [];
  const dispatchOp = over.dispatchOp || (async (op) => { sent.push(op.type); return { opId: `op-${sent.length}` }; });
  const driver = createFairplayDriver({ peerId: "ana", dispatchOp: (op) => { if (over.log) over.log.push(op.type); return dispatchOp(op); }, loadCampaign: async () => ({}) });
  await driver.start();
  return { driver, sent };
}

const campaignOf = (roll) => ({ gmRouteId: "gm", fairplay: { keys: {}, rolls: { r1: roll } } });

test("fairplay endurecimento: o condutor não revela sem as partes de todos no log", async () => {
  const types = [];
  const { driver } = await startedDriver({ log: types });
  const commitPhase = rollDoc({ phase: "commit", commits: {} });
  await driver.onUpdate(campaignOf(commitPhase));
  assert.ok(types.includes("FAIRPLAY_COMMIT"));
  await driver.onUpdate(campaignOf(rollDoc({ phase: "reveal", shares: { bia: [] } })));
  assert.ok(!types.includes("FAIRPLAY_REVEAL"));
  await driver.onUpdate(campaignOf(rollDoc({ phase: "reveal", shares: { ana: [], bia: [] } })));
  assert.ok(types.includes("FAIRPLAY_REVEAL"));
  driver.close();
});

test("fairplay endurecimento: o condutor tenta de novo o passo quando o envio lança erro", async () => {
  let calls = 0;
  const dispatchOp = async (op) => {
    if (op.type !== "FAIRPLAY_COMMIT") return { opId: "k" };
    calls += 1;
    if (calls === 1) throw new Error("rede caiu");
    return { opId: "c" };
  };
  const { driver } = await startedDriver({ dispatchOp });
  const campaign = campaignOf(rollDoc({ phase: "commit", commits: {} }));
  await driver.onUpdate(campaign);
  await driver.onUpdate(campaign);
  assert.equal(calls, 2);
  driver.close();
});

test("fairplay endurecimento: sem opId na resposta o Mestre pode reenviar o passo", async () => {
  let calls = 0;
  const dispatchOp = async (op) => (op.type !== "FAIRPLAY_COMMIT" ? { opId: "k" } : (calls += 1, {}));
  const { driver } = await startedDriver({ dispatchOp });
  const campaign = campaignOf(rollDoc({ phase: "commit", commits: {} }));
  await driver.onUpdate(campaign);
  await driver.onUpdate(campaign);
  assert.equal(calls, 2);
  driver.close();
});

test("fairplay endurecimento: a recuperação não fecha por contagem de partes, só pelo fechamento", () => {
  const env = { alg: "ecdh-p256+hkdf-sha256+aes-256-gcm", iv: "00".repeat(12), ct: "ab".repeat(40) };
  const held = (to) => ({ to, share: env, shareHash: HEX64 });
  const state = withRoll({
    phase: "recovery", participants: ["ana", "bia", "gm"], reveals: { ana: HEX64, gm: HEX64 },
    commits: { ana: { threshold: 2 }, bia: { threshold: 2 }, gm: { threshold: 2 } }, shares: { bia: [held("ana"), held("gm")] },
  });
  const part = [{ splitId: "s", x: 1, y: "ab".repeat(32) }];
  const after = apply(apply(state, "FAIRPLAY_SHARE", "ana", { rollId: "r1", ofPeer: "bia", shares: part }, 10), "FAIRPLAY_SHARE", "gm", { rollId: "r1", ofPeer: "bia", shares: part }, 11);
  assert.equal(Object.keys(after.fairplay.rolls.r1.released.bia).length, 2);
  assert.equal(after.fairplay.rolls.r1.phase, "recovery");
});

test("fairplay endurecimento: o prazo de fase tem mínimo de 5 s", async () => {
  const key = await createFairplaySessionKey();
  let state = createCampaign({ id: "m", name: "M", gmRouteId: "gm" });
  for (const [peer, lamport] of [["ana", 1], ["bia", 2]]) state = apply(state, "FAIRPLAY_KEY", peer, { publicKeyJwk: key.publicKeyJwk }, lamport);
  assert.equal(apply(state, "FAIRPLAY_OPEN", "ana", { rollId: "r1", phaseMs: 100 }, 10).fairplay.rolls.r1.phaseMs, 5000);
});

test("fairplay endurecimento: coordenada da chave em base64url não canônico é recusada", async () => {
  const { publicKeyJwk } = await createFairplaySessionKey();
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const twin = alphabet[alphabet.indexOf(publicKeyJwk.x.at(-1)) ^ 1];
  const base = createCampaign({ id: "m", name: "M", gmRouteId: "gm" });
  const sent = (jwk) => Object.keys(apply(base, "FAIRPLAY_KEY", "ana", { publicKeyJwk: jwk }).fairplay.keys).length;
  assert.equal(sent(publicKeyJwk), 1);
  assert.equal(sent({ ...publicKeyJwk, x: publicKeyJwk.x.slice(0, -1) + twin }), 0);
});
