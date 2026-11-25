/**
 * @file Ops assinadas do Fairplay guardadas na campanha: o limite mantém as rolagens mais NOVAS e nunca as chaves vigentes.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { reduceCampaign } from "../client/js/dungeon/vtt-reducer.js";
import { createFairplaySessionKey } from "../client/js/dungeon/vtt-fairplay-cipher.js";
import { MAX_LOGGED_ROLLS, collectFairplayOps } from "../client/js/dungeon/vtt-fairplay-log.js";

async function tableWithRolls(count) {
  let lamport = 0;
  let doc = createCampaign({ id: "mesa-p", name: "Mesa", gmRouteId: "gm" });
  const push = (type, actor, payload) => {
    lamport += 1;
    doc = reduceCampaign(doc, createVttOp({ type, actor, payload, lamport, ts: 1000 }));
  };
  for (const p of ["ana", "bia"]) {
    push("FAIRPLAY_ADMIT", "gm", { actor: p });
    push("FAIRPLAY_KEY", p, { publicKeyJwk: (await createFairplaySessionKey()).publicKeyJwk });
  }
  for (let i = 0; i < count; i += 1) push("FAIRPLAY_OPEN", "ana", { rollId: `roll-${i}`, sides: 20 });
  return doc;
}

test("persistência: ao passar do limite ficam as rolagens mais novas, com admissões e chaves intactas", async () => {
  const total = MAX_LOGGED_ROLLS + 5;
  const doc = await tableWithRolls(total);
  const ops = collectFairplayOps(doc.fairplay);
  const rollIds = ops.filter((o) => o.type === "FAIRPLAY_OPEN").map((o) => o.payload.rollId);
  assert.equal(rollIds.length, MAX_LOGGED_ROLLS);
  assert.equal(rollIds.includes("roll-0"), false, "a mais antiga saiu");
  assert.equal(rollIds.includes(`roll-${total - 1}`), true, "a mais nova ficou");
  assert.equal(ops.filter((o) => o.type === "FAIRPLAY_KEY").length, 2);
  assert.equal(ops.filter((o) => o.type === "FAIRPLAY_ADMIT").length, 2);
  assert.equal(Object.keys(doc.fairplay.rolls).length, total, "o estado em si não perde rolagens");
});

test("persistência: as ops saem na ordem de aplicação e sobrevivem a backup em JSON", async () => {
  const doc = await tableWithRolls(3);
  const restored = createCampaign(JSON.parse(JSON.stringify(doc)));
  const ops = collectFairplayOps(restored.fairplay);
  assert.deepEqual(ops.map((o) => o.lamport), [...ops.map((o) => o.lamport)].sort((a, b) => a - b));
  assert.equal(ops.length, 4 + 3);
});
