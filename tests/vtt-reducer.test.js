/**
 * Mesa Soberana E1 — testes do redutor determinístico (`vtt-reducer.js`) e projeção Zero-Spoiler.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { projectCharacterPools } from "../client/js/rpg-sheet-and-lore.js";
import { rollDiceFormula } from "../client/js/dungeon/dice-engine.js";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { projectStateForPlayer, reduceCampaign, replayCampaignOps } from "../client/js/dungeon/vtt-reducer.js";

test("vtt-reducer: aplica rolagem, delta CRDT da ficha e notas com idempotência e ordem determinística", () => {
  const base = createCampaign({ id: "camp-1", name: "Campanha 1" });
  const roll = rollDiceFormula("/gmroll 1d20+3 # Percepção", {
    randomBytesFn: () => new Uint8Array(32).fill(0x00),
  });
  const op1 = createVttOp({ opId: "op-a", type: "ROLL_RECORDED", lamport: 1, actor: "vx_gm", payload: { speaker: "Mestre", rollResult: roll } });
  const op2 = createVttOp({ opId: "op-b", type: "SHEET_DELTA", lamport: 2, actor: "vx_p1", payload: { sheetId: "lyra", target_pool: "hp_current", delta: -6, reason: "Goblin" } });
  const op3 = createVttOp({
    opId: "op-c",
    type: "NOTE_UPSERT",
    lamport: 3,
    actor: "vx_gm",
    payload: { note: { id: "altar", title: "Altar", publicMarkdown: "Pedra fria.", gmSecretMarkdown: "Armadilha CD 16." } },
  });

  const forward = replayCampaignOps(base, [op1, op2, op3]);
  const shuffled = replayCampaignOps(base, [op3, op1, op2, op2]);
  assert.deepEqual(shuffled, forward, "replay fora de ordem e com duplicata converge ao mesmo estado");
  assert.equal(forward.rolls.length, 1);
  assert.equal(forward.chronicle.length, 1);
  const pools = projectCharacterPools(forward.sheetsById.lyra.pools_base, forward.sheetsById.lyra.delta_ledger).pools;
  assert.equal(pools.hp_current, 18);
  assert.equal(reduceCampaign(forward, op1), forward, "opId repetido é no-op");
});

test("vtt-reducer: projectStateForPlayer oculta segredos GM e rolagens gm/blind de outros autores", () => {
  let state = createCampaign({ id: "camp-2", name: "Sigilo" });
  const gmRoll = rollDiceFormula("/gmroll 1d20 # Armadilha", { randomBytesFn: () => new Uint8Array(32).fill(0x05) });
  const blindRoll = rollDiceFormula("/blindroll 1d20 # Furtividade", { randomBytesFn: () => new Uint8Array(32).fill(0x09) });
  state = replayCampaignOps(state, [
    createVttOp({ opId: "op-1", type: "ROLL_RECORDED", lamport: 1, actor: "vx_gm", payload: { speaker: "Mestre", rollResult: gmRoll } }),
    createVttOp({ opId: "op-2", type: "ROLL_RECORDED", lamport: 2, actor: "vx_p1", payload: { speaker: "Lyra", rollResult: blindRoll } }),
    createVttOp({
      opId: "op-3",
      type: "NOTE_UPSERT",
      lamport: 3,
      actor: "vx_gm",
      payload: { note: { id: "seg", title: "Cripta", publicMarkdown: "Água escura", gmSecretMarkdown: "SEGREDO_MESTRE" } },
    }),
  ]);

  const gmView = projectStateForPlayer(state, "gm", "vx_gm");
  assert.equal(gmView.rolls.length, 2);
  assert.equal(gmView.notesById.seg.gmSecretMarkdown, "SEGREDO_MESTRE");

  const p1View = projectStateForPlayer(state, "player", "vx_p1");
  assert.equal(p1View.rolls.length, 0, "rolagem gm de outro e rolagem blind ficam fora da visão do jogador");
  assert.equal(p1View.notesById.seg.gmSecretMarkdown, "");
  assert.ok(!JSON.stringify(p1View).includes("SEGREDO_MESTRE"));
});
