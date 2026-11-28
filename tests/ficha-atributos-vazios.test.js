/**
 * `mergePatchedAbilities`: campo vazio, nulo ou que não é número mantém o atributo atual (nunca vira 1).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { mergePatchedAbilities } from "../client/js/dungeon/dungeon-persistence-sheet-system.js";

const base = { str: 10, dex: 12, con: 14, int: 8, wis: 9, cha: 11 };

test("campo vazio, em branco ou nulo mantém o atributo atual", () => {
  const out = mergePatchedAbilities(base, { str: "", dex: "   ", con: null, int: "\t\n" });
  assert.deepEqual(out, base);
});

test("booleano e lista não são número: mantêm o atual", () => {
  const out = mergePatchedAbilities(base, { str: true, dex: false, con: [], int: [5], wis: {} });
  assert.deepEqual(out, base);
});

test("número e texto numérico (com espaços) continuam valendo, e o zero digitado vai ao mínimo 1", () => {
  const out = mergePatchedAbilities(base, { str: 18, dex: " 16 ", con: "0", int: 0, wis: "-3" });
  assert.deepEqual(out, { ...base, str: 18, dex: 16, con: 1, int: 1, wis: 1 });
});

test("um campo vazio não atrapalha os preenchidos", () => {
  const out = mergePatchedAbilities(base, { str: "", dex: "20" });
  assert.equal(out.str, 10);
  assert.equal(out.dex, 20);
});
