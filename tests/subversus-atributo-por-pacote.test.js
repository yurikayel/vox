/**
 * @file SUB-21 PR-B: `@atributo` e `@prof` das fórmulas seguem o pacote do sistema da ficha (T20: valor − 10 e sem
 * proficiência), e as ações semeadas numa ficha nova vêm do pacote (5e: 4; T20: só o ataque; GURPS: nenhuma). O dock
 * do HUD não lista a semente que o botão do pacote já cobre nem a semente de outro sistema, sem apagar nada da ficha.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { resolveSheetVars, rollDiceFormula } from "../client/js/dungeon/dice-engine.js";
import { buildHudShortcuts } from "../client/js/dungeon/sheet-view-model.js";
import { DEFAULT_CLICKABLE_ACTIONS, ensureSheetMeta } from "../client/js/dungeon/vtt-schema.js";

const abilities = { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 10 };

function sheetOf(systemId, extra = {}) {
  const system = systemId ? { system: { id: systemId, version: 1 } } : {};
  return { char_id: "c1", ...system, attributes_lww: { level: 5, abilities }, ...extra };
}

/** Ficha com as 4 sementes antigas gravadas, como as criadas antes de cada sistema ter as suas. */
const legacy = (systemId) => sheetOf(systemId, { sheet_meta: { clickable_actions: DEFAULT_CLICKABLE_ACTIONS.map((a) => ({ ...a })) } });

const labelsOf = (shortcuts) => shortcuts.filter((s) => s.action === "roll-action").map((s) => s.label);

/** Bônus que o dado somou: total menos o d20 mantido. */
function bonusOf(formula, sheet) {
  const result = rollDiceFormula(formula, { sheet });
  assert.equal(result.ok, true, result.error);
  const kept = result.rolls.find((d) => d.kept && d.sides === 20);
  return result.total - kept.value;
}

test("T20: @for e @des usam valor − 10 e @prof é zero (Força 8 = −2, Destreza 14 = +4)", () => {
  const vars = resolveSheetVars(sheetOf("t20"));
  assert.deepEqual([vars.for, vars.des, vars.prof], [-2, 4, 0]);
});

test("T20: o ataque semeado rola com o modificador do T20, não o da 5e", () => {
  assert.equal(bonusOf("1d20+@for+@prof", sheetOf("t20")), -2);
});

test("5e (controle): Força 8 = −1 e @prof pelo nível, com ou sem system, e com pacote desconhecido", () => {
  for (const id of ["5e", undefined, "nao-existe"]) {
    const vars = resolveSheetVars(sheetOf(id));
    assert.deepEqual([vars.for, vars.des, vars.prof], [-1, 2, 3], String(id));
  }
  assert.equal(bonusOf("1d20+@for+@prof", sheetOf("5e")), 2);
});

test("GURPS: sem proficiência e com o modificador de valor − 10", () => {
  const vars = resolveSheetVars(sheetOf("gurps4e"));
  assert.deepEqual([vars.for, vars.prof], [-2, 0]);
});

test("o bônus de proficiência guardado na ficha continua valendo, qualquer que seja o pacote", () => {
  assert.equal(resolveSheetVars(sheetOf("t20", { sheet_meta: { proficiency_bonus: 4 } })).prof, 4);
});

test("ficha nova: 5e semeia as 4 ações, T20 só o ataque e GURPS nenhuma", () => {
  const seeds = (id) => ensureSheetMeta({ schema_version: "1.0.0", system: { id } }).sheet_meta.clickable_actions.map((a) => a.id);
  assert.deepEqual(seeds("5e"), ["act-ataque", "act-investigacao", "act-percepcao", "act-furtividade"]);
  assert.deepEqual(seeds("t20"), ["act-ataque"]);
  assert.deepEqual(seeds("gurps4e"), []);
  assert.equal(ensureSheetMeta({}).sheet_meta.clickable_actions.length, 4, "sem system vale a 5e");
});

test("dock do T20: some a perícia semeada que o botão do pacote cobre; o ataque fica", () => {
  assert.deepEqual(labelsOf(buildHudShortcuts(legacy("t20"))), ["Espada Longa"]);
});

test("dock da 5e: o ataque fica e as perícias semeadas já cobertas pelo pacote saem", () => {
  assert.deepEqual(labelsOf(buildHudShortcuts(legacy("5e"))), ["Espada Longa"]);
  assert.deepEqual(labelsOf(buildHudShortcuts(legacy(undefined))), ["Espada Longa"]);
});

test("dock de uma ficha GURPS antiga: nenhuma semente da 5e, e os dados da ficha continuam lá", () => {
  const sheet = legacy("gurps4e");
  assert.deepEqual(labelsOf(buildHudShortcuts(sheet)), []);
  assert.equal(ensureSheetMeta(sheet).sheet_meta.clickable_actions.length, 4, "nada é apagado");
});

test("ação cadastrada à mão ou editada nunca é tratada como semente", () => {
  const custom = { id: "x1", label: "Furtividade", roll: "1d20+@des+2", damage: "", tag: "pericia" };
  const edited = { id: "act-investigacao", label: "Investigação", roll: "1d20+@int+5", damage: "", tag: "pericia" };
  for (const id of ["5e", "t20", "gurps4e"]) {
    const sheet = sheetOf(id, { sheet_meta: { clickable_actions: [custom, edited] } });
    assert.deepEqual(labelsOf(buildHudShortcuts(sheet)), ["Furtividade", "Investigação"], id);
  }
});
