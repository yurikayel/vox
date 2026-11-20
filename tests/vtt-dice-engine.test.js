/**
 * Mesa Soberana E1 — testes do motor de dados (`dice-engine.js`).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_EXPLOSIONS,
  abilityModifier,
  applyRollMode,
  parseDiceCommand,
  resolveSheetVars,
  rollDiceFormula,
} from "../client/js/dungeon/dice-engine.js";
import { createCharacterSheetDoc } from "../client/js/rpg-sheet-and-lore.js";

function bytesSeq(values) {
  let idx = 0;
  return () => {
    const v = values[idx % values.length] >>> 0;
    idx += 1;
    const out = new Uint8Array(32);
    new DataView(out.buffer).setUint32(0, v, false);
    return out;
  };
}

test("dice-engine: parseia comandos /roll, /gmroll, /blindroll e rótulos #", () => {
  const pub = parseDiceCommand("/roll 2d20kh1+@des+2 # Furtividade");
  assert.equal(pub.visibility, "public");
  assert.equal(pub.label, "Furtividade");
  assert.equal(pub.terms.length, 3);
  assert.deepEqual(pub.terms[0], { kind: "dice", sign: 1, count: 2, sides: 20, keepMode: "kh", keepCount: 1, explode: false });
  assert.equal(parseDiceCommand("/gmroll 1d20+3").visibility, "gm");
  assert.equal(parseDiceCommand("/blindroll 1d20").visibility, "blind");
  assert.throws(() => parseDiceCommand(""), /fórmula/i);
  assert.throws(() => parseDiceCommand("2d20kh5"), /excede/i);
  assert.throws(() => parseDiceCommand("1d1"), /faixa/i);
  assert.throws(() => parseDiceCommand("process.exit(1)"), /inválido/i);
});

test("dice-engine: resolve aliases PT-BR da ficha, vantagem/desvantagem e kh/kl/dl", () => {
  const sheet = createCharacterSheetDoc({ abilities: { str: 16, dex: 14, int: 8 }, level: 5, armor_class: 17 });
  const vars = resolveSheetVars(sheet);
  assert.equal(abilityModifier(16), 3);
  assert.equal(vars.for, 3);
  assert.equal(vars.des, 2);
  assert.equal(vars.int, -1);
  assert.equal(vars.prof, 3);
  assert.equal(applyRollMode("1d20+@for", "advantage"), "2d20kh1+@for");
  assert.equal(applyRollMode("1d20+@for", "disadvantage"), "2d20kl1+@for");

  const adv = rollDiceFormula("1d20+@for+@prof", { sheet, mode: "advantage", randomBytesFn: bytesSeq([4, 17]) });
  assert.equal(adv.ok, true);
  assert.equal(adv.total, 18 + 3 + 3);
  assert.equal(adv.rolls.filter((r) => r.kept).length, 1);

  const stat = rollDiceFormula("4d6dl1", { randomBytesFn: bytesSeq([0, 2, 4, 5]) });
  assert.equal(stat.ok, true);
  assert.equal(stat.total, 3 + 5 + 6);
});

test("dice-engine: explosão ! respeita MAX_EXPLOSIONS e marca críticos/falhas em d20", () => {
  const boom = rollDiceFormula("1d6!", { randomBytesFn: bytesSeq([5]) });
  assert.equal(boom.ok, true);
  assert.equal(boom.rolls.length, 1 + MAX_EXPLOSIONS);
  assert.equal(boom.total, (1 + MAX_EXPLOSIONS) * 6);

  const crit = rollDiceFormula("/gmroll 1d20 # Ataque", { randomBytesFn: bytesSeq([19]) });
  assert.equal(crit.ok, true);
  assert.equal(crit.visibility, "gm");
  assert.equal(crit.crits, 1);
  assert.equal(crit.fumbles, 0);

  const bad = rollDiceFormula("1d20++5");
  assert.equal(bad.ok, false);
});
