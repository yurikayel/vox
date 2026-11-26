/**
 * @file Pacote de sistema `gurps4e` (SUB-11, spec pacote-gurps4e-v0): formato, registro, secundários, níveis de carga,
 * resolução 3d6 sob NH, derivados sem quebrar e nenhum texto de livro no pacote.
 */
import "./setup.js";
import assert from "node:assert/strict";
import test from "node:test";
import { getSystemPack, listSystemPackIds, validateSystemPack } from "../client/js/dungeon/system-pack.js";
import { GURPS4E_ATTRIBUTION, GURPS4E_PACK } from "../client/js/dungeon/system-pack-gurps4e.js";
import { GURPS_LOAD_LEVELS, basicLift, encumbrance, gurpsScore, gurpsSecondaries, resolve3d6 } from "../client/js/dungeon/system-gurps-math.js";
import { deriveSheet } from "../client/js/dungeon/system-derive.js";
import { renderDerivedStrip } from "../client/js/dungeon/screen-sheet-derived.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { updateSheetBasicInfo } from "../client/js/dungeon/dungeon-persistence.js";

test("gurps4e: formato válido, registrado, 3d6 sob NH, quatro atributos e recursos PV e PF", () => {
  assert.deepEqual(validateSystemPack(GURPS4E_PACK), { ok: true, errors: [] });
  assert.equal(getSystemPack("gurps4e"), GURPS4E_PACK);
  assert.ok(listSystemPackIds().includes("gurps4e"));
  assert.equal(GURPS4E_PACK.testKind, "3d6_sob_nh");
  assert.deepEqual(GURPS4E_PACK.abilities.map((a) => a.short), ["ST", "DX", "IQ", "HT"]);
  assert.deepEqual(GURPS4E_PACK.resources.map((r) => [r.id, r.label, r.kind]), [["hp", "PV", "pool"], ["fp", "PF", "pool"]]);
  assert.deepEqual(GURPS4E_PACK.skills, []);
});

test("gurps4e: secundários — PV=ST, Vontade e Percepção=IQ, PF=HT, Velocidade (DX+HT)/4, Esquiva = Deslocamento+3", () => {
  assert.deepEqual(gurpsSecondaries({ st: 12, dx: 11, iq: 13, ht: 10 }), { hp: 12, will: 13, per: 13, fp: 10, basicSpeed: 5.25, basicMove: 5, dodge: 8, basicLift: 29 });
  assert.deepEqual(gurpsSecondaries({}), { hp: 10, will: 10, per: 10, fp: 10, basicSpeed: 5, basicMove: 5, dodge: 8, basicLift: 20 });
  assert.equal(gurpsSecondaries({ dx: 9, ht: 10 }).basicMove, 4);
});

test("gurps4e: Carga Básica = ST²/5, com uma casa abaixo de 10 e inteiro de 10 em diante; atributo inválido vira 10", () => {
  assert.equal(basicLift(6), 7.2);
  assert.equal(basicLift(10), 20);
  assert.equal(basicLift(12), 29);
  assert.equal(gurpsScore("abc"), 10);
  assert.equal(gurpsScore(null), 10);
  assert.equal(gurpsScore(0), 1);
  assert.equal(gurpsScore(99), 40);
});

test("gurps4e: níveis de carga nos limites 1, 2, 3, 6 e 10 vezes a Carga Básica, com Deslocamento e Esquiva ajustados", () => {
  const s = { st: 10, dx: 10, ht: 10 };
  assert.deepEqual(GURPS_LOAD_LEVELS.map((l) => l.maxBl), [1, 2, 3, 6, 10]);
  assert.deepEqual(encumbrance(s, 20), { level: "nenhuma", index: 0, move: 5, dodge: 8, overloaded: false });
  assert.deepEqual(encumbrance(s, 21), { level: "leve", index: 1, move: 4, dodge: 7, overloaded: false });
  assert.deepEqual(encumbrance(s, 60), { level: "media", index: 2, move: 3, dodge: 6, overloaded: false });
  assert.equal(encumbrance(s, 120).level, "pesada");
  assert.equal(encumbrance(s, 200).level, "muito-pesada");
  assert.deepEqual(encumbrance(s, 201), { level: "muito-pesada", index: 4, move: 1, dodge: 4, overloaded: true });
  assert.equal(encumbrance(s, -5).level, "nenhuma");
  assert.equal(encumbrance(s, "x").level, "nenhuma");
});

test("gurps4e: 3d6 sob NH — sucesso até o NH, 3 e 4 sempre passam, 17 e 18 nunca", () => {
  assert.deepEqual(resolve3d6(10, 10), { success: true, critical: false, margin: 0 });
  assert.deepEqual(resolve3d6(10, 11), { success: false, critical: false, margin: -1 });
  assert.equal(resolve3d6(2, 4).success, true);
  assert.equal(resolve3d6(20, 17).success, false);
  assert.equal(resolve3d6(20, 18).success, false);
});

test("gurps4e: críticos — sucesso em 3 e 4, 5 com NH 15+, 6 com NH 16+; falha em 18, 17 com NH ≤15 e 10 acima do NH", () => {
  assert.equal(resolve3d6(8, 3).critical, true);
  assert.equal(resolve3d6(8, 4).critical, true);
  assert.equal(resolve3d6(14, 5).critical, false);
  assert.equal(resolve3d6(15, 5).critical, true);
  assert.equal(resolve3d6(15, 6).critical, false);
  assert.equal(resolve3d6(16, 6).critical, true);
  assert.equal(resolve3d6(20, 18).critical, true);
  assert.equal(resolve3d6(15, 17).critical, true);
  assert.equal(resolve3d6(16, 17).critical, false);
  assert.equal(resolve3d6(3, 13).critical, true);
  assert.equal(resolve3d6(3, 12).critical, false);
});

test("gurps4e: derivados do motor não quebram com a lista de perícias vazia", () => {
  const d = deriveSheet(GURPS4E_PACK, { abilities: { st: 12, dx: 11, iq: 13, ht: 10 } });
  assert.deepEqual(d.skills, []);
  assert.deepEqual(d.abilities.map((a) => [a.short, a.score]), [["ST", 12], ["DX", 11], ["IQ", 13], ["HT", 10]]);
  assert.equal(d.proficiency, 0);
});

test("gurps4e: ficha escolhida como GURPS mostra a faixa e os créditos sem alegar licença aberta", async () => {
  const state = createDungeonSessionState();
  await updateSheetBasicInfo(state, { name: "Kael", system: "gurps4e" });
  assert.deepEqual(state.sheet.system, { id: "gurps4e", version: 1 });
  const html = renderDerivedStrip(state.sheet);
  assert.match(html, /GURPS 4e \(matemática\)/);
  assert.match(html, /Nenhum texto do livro/);
  assert.ok(!/CC-BY|Creative Commons/.test(html));
});

test("gurps4e: nenhum texto de livro no pacote (sem chaves de descrição, perícias, vantagens) e textos curtos", () => {
  const json = JSON.stringify(GURPS4E_PACK);
  const keys = new Set(json.match(/"[a-zA-Z]+":/g));
  for (const forbidden of ['"description":', '"text":', '"rules":', '"advantages":', '"disadvantages":', '"spells":', '"tables":']) assert.equal(keys.has(forbidden), false, forbidden);
  const long = [...json.matchAll(/"([^"]{41,})"/g)].map((m) => m[1]);
  assert.deepEqual(long.filter((t) => t !== GURPS4E_ATTRIBUTION && !t.startsWith("https://") && !t.startsWith("Fórmulas numéricas")), []);
  assert.notEqual(GURPS4E_PACK.license.spdx, "CC-BY-4.0");
});
