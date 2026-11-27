/**
 * @file Iniciativa do T20: o pacote declara a perícia `iniciativa`, então o derivado usa o bônus dela (não só o
 * modificador do atributo). Testes de caracterização: passam na base e travam a regra. No T20 real a proficiência
 * é 0, então o caso que separa perícia de atributo usa uma cópia do pacote com proficiência não nula.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { deriveSheet } from "../client/js/dungeon/system-derive.js";
import { T20_PACK } from "../client/js/dungeon/system-pack-t20.js";

const skillOf = (d) => d.skills.find((s) => s.id === "iniciativa");
const withProficiency = { ...T20_PACK, formulas: { ...T20_PACK.formulas, proficiency: { base: 3, every: 20 } } };
const withInitiativeOn = (ability) => ({ ...withProficiency, formulas: { ...withProficiency.formulas, initiative: { skill: "iniciativa", ability } } });

test("T20: a iniciativa é o bônus da perícia, não o do atributo (perícia treinada, Destreza 10)", () => {
  const d = deriveSheet(withProficiency, { level: 1, abilities: { dex: 10 }, proficientSkills: ["iniciativa"] });
  assert.equal(d.abilities.find((a) => a.id === "dex").modifier, 0);
  assert.equal(skillOf(d).bonus, 3);
  assert.equal(d.initiative, 3);
});

test("T20: com a perícia declarada, o atributo de reserva não manda (Força ≠ Destreza)", () => {
  const d = deriveSheet(withInitiativeOn("str"), { level: 1, abilities: { dex: 14, str: 10 }, proficientSkills: ["iniciativa"] });
  assert.equal(d.initiative, 7, "Des +4 e treino +3, não o Força +0");
});

test("T20 real: sem treino a iniciativa é o modificador de Destreza", () => {
  const d = deriveSheet(T20_PACK, { level: 1, abilities: { dex: 14 } });
  assert.equal(d.initiative, 4);
  assert.equal(d.initiative, skillOf(d).bonus);
});
