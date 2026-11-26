/**
 * @file Pacote de sistema `t20` (SUB-10, spec pacote-t20-v0): formato válido, registrado, 6 atributos, 29 perícias,
 * PV e PM, matemática do modificador, derivados sem quebrar e nenhum texto de livro no pacote.
 */
import "./setup.js";
import assert from "node:assert/strict";
import test from "node:test";
import { getSystemPack, listSystemPackIds, validateSystemPack } from "../client/js/dungeon/system-pack.js";
import { T20_ATTRIBUTION, T20_PACK } from "../client/js/dungeon/system-pack-t20.js";
import { abilityModifier, deriveSheet, normalizeChoices } from "../client/js/dungeon/system-derive.js";
import { renderDerivedStrip } from "../client/js/dungeon/screen-sheet-derived.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { updateSheetBasicInfo } from "../client/js/dungeon/dungeon-persistence.js";

const BASIC_SKILLS = ["Acrobacia", "Adestramento", "Atletismo", "Atuação", "Cavalgar", "Conhecimento", "Cura", "Diplomacia", "Enganação", "Fortitude", "Furtividade", "Guerra", "Iniciativa", "Intimidação", "Intuição", "Investigação", "Jogatina", "Ladinagem", "Luta", "Misticismo", "Nobreza", "Ofício", "Percepção", "Pilotagem", "Pontaria", "Reflexos", "Religião", "Sobrevivência", "Vontade"];

test("t20: formato válido, registrado ao lado do D&D, resolução d20_vs_cd", () => {
  assert.deepEqual(validateSystemPack(T20_PACK), { ok: true, errors: [] });
  assert.equal(getSystemPack("t20"), T20_PACK);
  assert.deepEqual(listSystemPackIds(), ["dnd5e-2024", "t20"]);
  assert.equal(T20_PACK.testKind, "d20_vs_cd");
});

test("t20: seis atributos, 29 perícias básicas com atributo conhecido e ids únicos", () => {
  assert.deepEqual(T20_PACK.abilities.map((a) => a.short), ["FOR", "DES", "CON", "INT", "SAB", "CAR"]);
  assert.deepEqual(T20_PACK.skills.map((s) => s.label), BASIC_SKILLS);
  assert.equal(new Set(T20_PACK.skills.map((s) => s.id)).size, 29);
  const ids = new Set(T20_PACK.abilities.map((a) => a.id));
  assert.ok(T20_PACK.skills.every((s) => ids.has(s.ability)));
  for (const id of ["fortitude", "reflexos", "vontade", "luta", "pontaria", "iniciativa"]) assert.ok(T20_PACK.skills.some((s) => s.id === id), id);
});

test("t20: recursos PV e PM, ambos reservas com máximo e atual", () => {
  assert.deepEqual(T20_PACK.resources.map((r) => [r.id, r.label, r.kind]), [["hp", "PV", "pool"], ["mp", "PM", "pool"]]);
});

test("t20: o modificador é o valor guardado menos 10 (o cartão mostra só o modificador)", () => {
  for (const [score, mod] of [[10, 0], [11, 1], [14, 4], [9, -1], [8, -2], [1, -9], [30, 20]]) assert.equal(abilityModifier(T20_PACK, score), mod, String(score));
});

test("t20: derivados não quebram; Defesa é 10 mais o modificador de Destreza e o treino fica em zero", () => {
  const choices = normalizeChoices(T20_PACK, { level: 3, abilities: { dex: 14 }, proficientSkills: ["luta", "inexistente"] });
  assert.deepEqual(choices.proficientSkills, ["luta"]);
  const d = deriveSheet(T20_PACK, { level: 3, abilities: { dex: 14 } });
  assert.equal(d.armorClass, 14);
  assert.equal(d.initiative, 4);
  assert.equal(d.proficiency, 0);
  assert.equal(d.skills.length, 29);
  assert.equal(d.skills.find((s) => s.id === "pontaria").bonus, 4);
});

test("t20: uma ficha escolhida como Tormenta20 mostra a faixa com Defesa e os créditos sem alegar licença aberta", async () => {
  const state = createDungeonSessionState();
  await updateSheetBasicInfo(state, { name: "Kael", dex: 14, system: "t20" });
  assert.deepEqual(state.sheet.system, { id: "t20", version: 1 });
  const html = renderDerivedStrip(state.sheet);
  assert.match(html, /Tormenta20 \(estrutura\)/);
  assert.match(html, /<dt>Defesa sem armadura<\/dt><dd>14<\/dd>/);
  assert.match(html, /Nenhum texto do livro/);
  assert.ok(!/CC-BY|Creative Commons/.test(html));
});

test("t20: nenhum texto de livro no pacote (sem chaves de descrição, poderes, magias, classes) e textos curtos", () => {
  const keys = new Set(JSON.stringify(T20_PACK).match(/"[a-zA-Z]+":/g));
  for (const forbidden of ['"description":', '"text":', '"rules":', '"spells":', '"classes":', '"powers":', '"races":', '"deities":']) assert.equal(keys.has(forbidden), false, forbidden);
  const strings = [...JSON.stringify(T20_PACK).matchAll(/"([^"]{41,})"/g)].map((m) => m[1]);
  assert.deepEqual(strings.filter((t) => t !== T20_ATTRIBUTION && !t.startsWith("https://") && !t.startsWith("Estrutura e matemática")), []);
  assert.match(T20_PACK.license.attribution, /Nenhum texto do livro/);
  assert.notEqual(T20_PACK.license.spdx, "CC-BY-4.0");
});
