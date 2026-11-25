/**
 * @file Pacote de sistema da ficha multi-sistema (spec brainstorm v0, §4/§9): formato, pacote `dnd5e-2024`
 * (nomes e matemática, com a atribuição CC-BY-4.0), derivados puros e migração da Lyra a partir de uma ficha
 * legada real (`tests/fixtures/ficha-lyra-legado.json`, gerada pelo `createCampaign` antes dos pacotes).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RESOURCE_KINDS, TEST_KINDS, getSystemPack, listSystemPackIds, registerSystemPack, validateSystemPack } from "../client/js/dungeon/system-pack.js";
import { DND5E_2024_ATTRIBUTION, DND5E_2024_PACK } from "../client/js/dungeon/system-pack-dnd5e-2024.js";
import { abilityModifier, deriveSheet, normalizeChoices, proficiencyBonus } from "../client/js/dungeon/system-derive.js";
import { hasSystemPack, migrateLegacySheet } from "../client/js/dungeon/system-migrate.js";
import { createCampaign } from "../client/js/dungeon/vtt-schema.js";

const legacy = () => JSON.parse(readFileSync(new URL("./fixtures/ficha-lyra-legado.json", import.meta.url), "utf8"));
const pack = DND5E_2024_PACK;
const clone = (o) => JSON.parse(JSON.stringify(o));

test("pacote: dnd5e-2024 é válido, está registrado e traz 6 atributos, 18 perícias e os recursos da spec", () => {
  assert.deepEqual(validateSystemPack(pack), { ok: true, errors: [] });
  assert.equal(getSystemPack("dnd5e-2024"), pack);
  assert.deepEqual(listSystemPackIds(), ["dnd5e-2024"]);
  assert.equal(pack.abilities.length, 6);
  assert.equal(pack.skills.length, 18);
  assert.deepEqual(pack.resources.map((r) => r.id), ["hp", "hit-dice", "spell-slots", "heroic-inspiration"]);
  assert.equal(pack.testKind, "d20_vs_cd");
  assert.ok(TEST_KINDS.includes(pack.testKind) && pack.resources.every((r) => RESOURCE_KINDS.includes(r.kind)));
});

test("pacote: licença CC-BY-4.0 com atribuição ao SRD 5.2 e sem texto de regra no pacote", () => {
  assert.equal(pack.license.spdx, "CC-BY-4.0");
  assert.equal(pack.license.attribution, DND5E_2024_ATTRIBUTION);
  assert.match(pack.license.attribution, /System Reference Document 5\.2/);
  assert.match(pack.license.attribution, /Creative Commons Attribution 4\.0/);
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  assert.ok(readme.includes(DND5E_2024_ATTRIBUTION), "o README repete a atribuição exata do pacote");
  const keys = new Set(JSON.stringify(pack).match(/"[a-zA-Z]+":/g));
  for (const forbidden of ['"description":', '"text":', '"rules":', '"spells":', '"classes":']) assert.equal(keys.has(forbidden), false, forbidden);
});

test("pacote: formato recusa o que está faltando, com o motivo", () => {
  assert.equal(validateSystemPack(null).ok, false);
  const bad = clone(pack);
  bad.id = "D&D";
  bad.license = { spdx: "CC-BY-4.0" };
  bad.abilities.push({ ...bad.abilities[0] });
  bad.skills[0].ability = "xyz";
  bad.resources[0].kind = "orbe";
  bad.formulas.modifier.step = 0;
  bad.testKind = "d100";
  const { ok, errors } = validateSystemPack(bad);
  assert.equal(ok, false);
  for (const part of ["id inválido", "licença", "ids repetidos", "perícias", "recursos", "modifier", "testKind"]) assert.ok(errors.some((e) => e.includes(part)), part);
  assert.throws(() => registerSystemPack(bad), /inválido/);
  assert.throws(() => registerSystemPack(clone(pack)), /repetido/);
});

test("derivados: modificador e bônus de proficiência seguem a matemática do pacote", () => {
  const mods = [[1, -5], [8, -1], [9, -1], [10, 0], [11, 0], [12, 1], [15, 2], [20, 5], [30, 10]];
  for (const [score, mod] of mods) assert.equal(abilityModifier(pack, score), mod, `atributo ${score}`);
  const prof = [[1, 2], [4, 2], [5, 3], [8, 3], [9, 4], [12, 4], [13, 5], [16, 5], [17, 6], [20, 6]];
  for (const [level, bonus] of prof) assert.equal(proficiencyBonus(pack, level), bonus, `nível ${level}`);
  assert.equal(proficiencyBonus(pack, 99), 6);
  assert.equal(proficiencyBonus(pack, "x"), 2);
});

test("derivados: perícias, salvaguardas, CA base, iniciativa e percepção passiva saem das escolhas", () => {
  const out = deriveSheet(pack, {
    level: 5,
    abilities: { str: 16, dex: 14, con: 12, int: 8, wis: 15, cha: 10 },
    proficientSkills: ["perception", "athletics", "stealth"],
    expertSkills: ["stealth", "arcana"],
    proficientSaves: ["wis", "str"],
  });
  const skill = (id) => out.skills.find((s) => s.id === id);
  assert.equal(out.proficiency, 3);
  assert.equal(skill("athletics").bonus, 3 + 3);
  assert.equal(skill("perception").bonus, 2 + 3);
  assert.equal(skill("stealth").bonus, 2 + 3 + 3, "especialista soma o bônus duas vezes");
  assert.equal(skill("arcana").expert, false, "especialização sem treino é descartada");
  assert.equal(skill("arcana").bonus, -1);
  assert.equal(out.saves.find((s) => s.id === "wis").bonus, 2 + 3);
  assert.equal(out.saves.find((s) => s.id === "con").bonus, 1);
  assert.equal(out.armorClass, 12);
  assert.equal(out.initiative, 2);
  assert.equal(out.passivePerception, 10 + 5);
});

test("derivados: escolhas sujas viram valores seguros e o derivado nunca vira campo gravado", () => {
  const c = normalizeChoices(pack, { level: "abc", abilities: { str: 99, dex: "x", foo: 5 }, proficientSkills: ["perception", "perception", "dragonlore"], proficientSaves: ["str", "zzz"] });
  assert.equal(c.level, 1);
  assert.deepEqual(c.abilities, { str: 30, dex: 10, con: 10, int: 10, wis: 10, cha: 10 });
  assert.deepEqual(c.proficientSkills, ["perception"]);
  assert.deepEqual(c.proficientSaves, ["str"]);
  const before = clone(legacy());
  deriveSheet(pack, migrateLegacySheet(before).system_choices);
  assert.deepEqual(before, legacy(), "derivar não altera a ficha");
});

test("migração: a Lyra legada vira dnd5e-2024 sem perder nenhum campo antigo", () => {
  const old = legacy();
  const frozen = clone(old);
  const lyra = migrateLegacySheet(old);
  assert.deepEqual(old, frozen, "a entrada não é alterada");
  assert.deepEqual(lyra.system, { id: "dnd5e-2024", version: 1 });
  for (const key of Object.keys(frozen)) assert.deepEqual(lyra[key], frozen[key], `campo legado ${key} preservado`);
  assert.equal(lyra.system_choices.level, 1);
  assert.deepEqual(lyra.system_choices.abilities, { str: 16, dex: 12, con: 14, int: 11, wis: 14, cha: 15 });
  assert.deepEqual(lyra.system_choices.proficientSkills.sort(), ["investigation", "perception"], "só as perícias que somam @prof; Furtividade não");
  assert.deepEqual(lyra.system_choices.proficientSaves, [], "salvaguardas não existem na ficha legada e não são inventadas");
  assert.deepEqual(lyra.system_choices.unmappedSkillRefs, []);
});

test("migração: derivados da Lyra batem com as rolagens que a ficha legada já tinha", () => {
  const lyra = migrateLegacySheet(legacy());
  const out = deriveSheet(getSystemPack(lyra.system.id), lyra.system_choices);
  const skill = (id) => out.skills.find((s) => s.id === id);
  assert.equal(out.proficiency, 2);
  assert.equal(skill("investigation").bonus, 0 + 2, "1d20+@int+@prof com INT 11");
  assert.equal(skill("perception").bonus, 2 + 2, "1d20+@sab+@prof com SAB 14");
  assert.equal(skill("stealth").bonus, 1, "1d20+@des com DES 12, sem @prof");
  assert.equal(out.abilities.find((a) => a.id === "str").modifier, 3, "1d20+@for com FOR 16");
  assert.equal(out.passivePerception, 14);
});

test("migração: é idempotente, reconhece pacote existente e guarda o que não casa, sem adivinhar", () => {
  const once = migrateLegacySheet(legacy());
  assert.equal(hasSystemPack(once), true);
  assert.equal(hasSystemPack(legacy()), false);
  assert.equal(migrateLegacySheet(once), once);
  const odd = legacy();
  odd.sheet_meta.skill_refs = ["PERCEPÇÃO", "Prestidigitação", "Lábia"];
  odd.attributes_lww.level = 9;
  const out = migrateLegacySheet(odd);
  assert.deepEqual(out.system_choices.proficientSkills.sort(), ["investigation", "perception", "sleight-of-hand"]);
  assert.deepEqual(out.system_choices.unmappedSkillRefs, ["Lábia"]);
  assert.equal(deriveSheet(pack, out.system_choices).proficiency, 4);
  assert.equal(migrateLegacySheet(null), null);
});

test("migração: a campanha nova ainda cria a Lyra no formato legado, que migra sem erro", () => {
  const sheet = createCampaign({ id: "mesa-x", name: "Mesa", gmRouteId: "gm" }).sheetsById.lyra;
  assert.equal(hasSystemPack(sheet), false);
  assert.deepEqual(migrateLegacySheet(sheet).system, { id: "dnd5e-2024", version: 1 });
});
