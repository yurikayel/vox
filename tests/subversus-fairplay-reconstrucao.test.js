/**
 * @file Estado Fairplay refeito das ops assinadas == estado ao vivo (rolagem fechada, em andamento, troca de chave,
 * muitas rolagens), em tempo linear, sem o estado pronto do snapshot e sem importar o de arquivos de fora.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { reduceCampaign } from "../client/js/dungeon/vtt-reducer.js";
import { createFairplayRollOffer } from "../client/js/dungeon/vtt-fairplay-roll.js";
import { createFairplaySessionKey, fairplayShareHash, sealFairplayShare } from "../client/js/dungeon/vtt-fairplay-cipher.js";
import { MAX_LOGGED_ROLLS, collectFairplayOps, fairplayQuorum, limitFairplayOps, verifyFairplayRecord } from "../client/js/dungeon/vtt-fairplay-log.js";
import { rebuildFairplayState } from "../client/js/dungeon/vtt-fairplay-rebuild.js";
import { packVoxRpg, unpackVoxRpg } from "../client/js/dungeon/vtt-portable.js";

const ROLL = "roll-a";
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const fresh = () => createCampaign({ id: "mesa-rb", name: "Mesa", gmRouteId: "gm" });

async function makeTable(peers = ["ana", "bia", "gm"]) {
  const t = { doc: fresh(), lamport: 0, keys: {}, offers: {}, peers };
  t.push = (type, actor, payload, ts = 0) => {
    t.lamport += 1;
    const before = t.doc;
    t.doc = reduceCampaign(t.doc, createVttOp({ type, actor, payload, lamport: t.lamport, ts }));
    return t.doc !== before;
  };
  for (const p of peers) {
    t.keys[p] = await createFairplaySessionKey();
    t.push("FAIRPLAY_ADMIT", "gm", { actor: p });
    t.push("FAIRPLAY_KEY", p, { publicKeyJwk: t.keys[p].publicKeyJwk });
  }
  return t;
}

async function runRoll(t, stage, rollId = ROLL) {
  const q = fairplayQuorum(t.peers.length);
  for (const p of t.peers) t.offers[p] = await createFairplayRollOffer({ peerId: p, rollId, ...q });
  t.push("FAIRPLAY_OPEN", t.peers[0], { rollId, sides: 20, formula: "1d20" }, 1000);
  for (const p of t.peers) t.push("FAIRPLAY_COMMIT", p, { rollId, commit: t.offers[p].commit });
  for (const p of t.peers) {
    const others = t.peers.filter((o) => o !== p);
    const shares = [];
    for (const [i, share] of t.offers[p].shares.entries()) {
      const to = others[i % others.length];
      shares.push({ to, share: await sealFairplayShare({ share, rollId, fromPeer: p, toPeer: to, privateKey: t.keys[p].privateKey, recipientJwk: t.keys[to].publicKeyJwk }), shareHash: await fairplayShareHash(share) });
    }
    t.push("FAIRPLAY_SHARES", p, { rollId, shares });
  }
  if (stage === "reveal") return;
  for (const p of t.peers) t.push("FAIRPLAY_REVEAL", p, { rollId, seedHex: hex(t.offers[p].secret.seedBytes) });
}

const rebuilt = (t) => rebuildFairplayState(fresh(), collectFairplayOps(t.doc.fairplay));
const core = (fp) => ({ keys: fp.keys, rolls: fp.rolls, admitted: fp.admitted });

test("reconstrução: rolagem fechada refeita das ops é igual à ao vivo e continua verificada", async () => {
  const t = await makeTable();
  await runRoll(t, "done");
  const doc = rebuilt(t);
  assert.deepEqual(core(doc.fairplay), core(t.doc.fairplay));
  assert.equal((await verifyFairplayRecord(doc, ROLL)).status, "verified");
});

test("reconstrução: rolagem em andamento é igual à ao vivo", async () => {
  const t = await makeTable();
  await runRoll(t, "reveal");
  assert.equal(t.doc.fairplay.rolls[ROLL].phase, "reveal");
  assert.deepEqual(core(rebuilt(t).fairplay), core(t.doc.fairplay));
});

test("reconstrução: troca de chave depois da abertura não muda os participantes da rolagem", async () => {
  const t = await makeTable();
  await runRoll(t, "reveal");
  const before = t.doc.fairplay.rolls[ROLL].participants;
  t.keys.bia = await createFairplaySessionKey();
  assert.ok(t.push("FAIRPLAY_KEY", "bia", { publicKeyJwk: t.keys.bia.publicKeyJwk }));
  const doc = rebuilt(t);
  assert.deepEqual(doc.fairplay.rolls[ROLL].participants, before);
  assert.deepEqual(core(doc.fairplay), core(t.doc.fairplay));
});

test("reconstrução: chave com lamport menor ou igual ao da admissão é recusada ao vivo e na reconstrução", async () => {
  const doc0 = fresh();
  const { publicKeyJwk } = await createFairplaySessionKey();
  const apply = (d, type, actor, payload, lamport) => reduceCampaign(d, createVttOp({ type, actor, payload, lamport }));
  let doc = apply(doc0, "FAIRPLAY_ADMIT", "gm", { actor: "ana" }, 5);
  doc = apply(doc, "FAIRPLAY_KEY", "ana", { publicKeyJwk }, 5);
  doc = apply(doc, "FAIRPLAY_KEY", "ana", { publicKeyJwk }, 3);
  assert.deepEqual(doc.fairplay.keys, {});
  const again = rebuildFairplayState(fresh(), collectFairplayOps(doc.fairplay));
  assert.deepEqual(core(again.fairplay), core(doc.fairplay));
});

test("reconstrução: com mais de 5000 ops ficam admissões, chaves e as rolagens mais novas, inteiras", async () => {
  const t = await makeTable();
  const base = collectFairplayOps(t.doc.fairplay);
  const total = 5200;
  const opens = Array.from({ length: total }, (_, i) => createVttOp({ type: "FAIRPLAY_OPEN", actor: "ana", payload: { rollId: `r${i}`, sides: 20 }, lamport: t.lamport + 1 + i, ts: 1000 }));
  assert.ok(base.length + opens.length > 5000);
  const doc = rebuildFairplayState(fresh(), limitFairplayOps([...base, ...opens]));
  assert.deepEqual(Object.keys(doc.fairplay.keys).sort(), ["ana", "bia", "gm"]);
  assert.deepEqual(Object.keys(doc.fairplay.admitted).sort(), ["ana", "bia", "gm"]);
  assert.equal(Object.keys(doc.fairplay.rolls).length, MAX_LOGGED_ROLLS);
  assert.deepEqual(doc.fairplay.rolls[`r${total - 1}`].participants, ["ana", "bia", "gm"]);
  assert.equal(doc.fairplay.rolls.r0, undefined);
});

test("reconstrução: ids de rolagem numéricos não embaralham quais são as mais novas", async () => {
  const t = await makeTable();
  for (const id of ["30", "20", "10"]) t.push("FAIRPLAY_OPEN", "ana", { rollId: id, sides: 20 }, 1000);
  for (let i = 0; i < MAX_LOGGED_ROLLS - 2; i += 1) t.push("FAIRPLAY_OPEN", "ana", { rollId: `n${i}`, sides: 20 }, 1000);
  const kept = new Set(collectFairplayOps(t.doc.fairplay).filter((o) => o.type === "FAIRPLAY_OPEN").map((o) => o.payload.rollId));
  assert.equal(kept.has("30"), false, "a mais antiga (aberta primeiro) saiu, mesmo com id numérico maior");
  assert.equal(kept.has("10"), true);
});

test("escala: aplicar uma op não recopia as ops já guardadas de outras rolagens", async () => {
  const t = await makeTable();
  t.push("FAIRPLAY_OPEN", "ana", { rollId: "ra", sides: 20 }, 1000);
  const before = t.doc.fairplay.ops.rolls.ra;
  t.push("FAIRPLAY_OPEN", "ana", { rollId: "rb", sides: 20 }, 1000);
  assert.equal(t.doc.fairplay.ops.rolls.ra, before);
});

async function tableWithOpenRolls(n) {
  const t = await makeTable();
  for (let i = 0; i < n; i += 1) {
    const rollId = `s${i}`;
    const q = fairplayQuorum(t.peers.length);
    t.push("FAIRPLAY_OPEN", "ana", { rollId, sides: 20 }, 1000);
    for (const p of t.peers) t.push("FAIRPLAY_COMMIT", p, { rollId, commit: (await createFairplayRollOffer({ peerId: p, rollId, ...q })).commit });
  }
  return collectFairplayOps(t.doc.fairplay);
}

test("escala: refazer 10, 20 e 40 rolagens (abaixo do teto) cresce de forma linear, não quadrática", async () => {
  assert.ok(40 <= MAX_LOGGED_ROLLS);
  const timings = [];
  for (const n of [10, 20, 40]) {
    const ops = await tableWithOpenRolls(n);
    assert.ok(ops.filter((o) => o.type === "FAIRPLAY_OPEN").length === n, "nenhuma rolagem cortada");
    const runs = [0, 1, 2, 3, 4].map(() => { const t0 = performance.now(); rebuildFairplayState(fresh(), ops); return performance.now() - t0; });
    timings.push(Math.max(Math.min(...runs), 0.5));
  }
  const [t10, t20, t40] = timings;
  assert.ok(t40 / t10 < 9, `10:${t10.toFixed(1)}ms 20:${t20.toFixed(1)}ms 40:${t40.toFixed(1)}ms (linear ~4x, quadrático ~16x)`);
});

test("reconstrução: mais de 8 trocas de chave do mesmo par, antes e durante a rolagem, não mudam o estado refeito", async () => {
  const t = await makeTable();
  const swap = async () => {
    t.keys.bia = await createFairplaySessionKey();
    assert.ok(t.push("FAIRPLAY_KEY", "bia", { publicKeyJwk: t.keys.bia.publicKeyJwk }));
  };
  for (let i = 0; i < 9; i += 1) await swap();
  await runRoll(t, "reveal");
  for (let i = 0; i < 10; i += 1) await swap();
  const doc = rebuilt(t);
  assert.deepEqual(doc.fairplay.rolls[ROLL].participants, ["ana", "bia", "gm"]);
  assert.equal(doc.fairplay.rolls[ROLL].phase, t.doc.fairplay.rolls[ROLL].phase);
  assert.deepEqual(core(doc.fairplay), core(t.doc.fairplay));
});

const SNAPSHOT_OPS_BUDGET_BYTES = 500_000;

test("snapshot: com o teto de rolagens cheias e 4 pares, as ops cabem no orçamento de tamanho", async () => {
  const t = await makeTable(["ana", "bia", "cris", "gm"]);
  for (let i = 0; i < MAX_LOGGED_ROLLS + 5; i += 1) await runRoll(t, "done", `roll-${i}`);
  const ops = collectFairplayOps(t.doc.fairplay);
  const bytes = JSON.stringify(ops).length;
  assert.equal(new Set(ops.filter((o) => o.type === "FAIRPLAY_OPEN").map((o) => o.payload.rollId)).size, MAX_LOGGED_ROLLS);
  assert.ok(bytes <= SNAPSHOT_OPS_BUDGET_BYTES, `${bytes} bytes (orçamento ${SNAPSHOT_OPS_BUDGET_BYTES})`);
});

test("importação: o estado Fairplay de um backup de fora é descartado", async () => {
  const t = await makeTable();
  await runRoll(t, "done");
  assert.ok(Object.keys(t.doc.fairplay.rolls).length > 0);
  const bytes = await packVoxRpg(t.doc);
  const { campaign } = await unpackVoxRpg(bytes);
  assert.deepEqual(campaign.fairplay.rolls, {});
  assert.deepEqual(campaign.fairplay.keys, {});
});
