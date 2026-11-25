/**
 * @file Condições (marcas do SRD 5.2), Exaustão (nível 0–6, efeito só informativo), Dados de Vida e descansos
 * curto e longo da ficha com o pacote dnd5e-2024.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { projectCharacterPools } from "../client/js/rpg-sheet-and-lore.js";
import { applySheetResourceDelta, createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { longRestSheet, shortRestSheet, spendSheetHitDie, stepSheetExhaustion, toggleSheetCondition } from "../client/js/dungeon/dungeon-persistence-sheet-rest.js";
import { markSheetDeathSave } from "../client/js/dungeon/dungeon-persistence-sheet-system.js";
import { updateSheetBasicInfo } from "../client/js/dungeon/dungeon-persistence.js";
import { renderDerivedStrip } from "../client/js/dungeon/screen-sheet-derived.js";
import { DND5E_2024_PACK as pack } from "../client/js/dungeon/system-pack-dnd5e-2024.js";
import { exhaustionEffect, longRestPlan, normalizeRestChoices, shortRestPlan, spendHitDie, toggleCondition } from "../client/js/dungeon/system-rest.js";

const pools = (state) => projectCharacterPools(state.sheet.pools_base, state.sheet.delta_ledger).pools;
const sheetState = async () => {
  const state = createDungeonSessionState();
  await updateSheetBasicInfo(state, { name: "Kael", con: 14 });
  return state;
};

test("pacote: 14 condições do SRD sem Exaustão, que é nível; números de Exaustão vêm do pacote", () => {
  assert.equal(pack.conditions.length, 14);
  assert.equal(pack.conditions.some((c) => c.id === "exhaustion"), false);
  assert.deepEqual(pack.formulas.exhaustion, { max: 6, d20PenaltyPerLevel: 2, speedPenaltyFtPerLevel: 5 });
});

test("condições: ligar, desligar e id desconhecido não muda nada", () => {
  let c = toggleCondition(pack, {}, "prone");
  assert.deepEqual(c, ["prone"]);
  c = toggleCondition(pack, { conditions: c }, "poisoned");
  assert.deepEqual(c, ["prone", "poisoned"]);
  assert.deepEqual(toggleCondition(pack, { conditions: c }, "prone"), ["poisoned"]);
  assert.deepEqual(toggleCondition(pack, { conditions: c }, "dragonfear"), c);
});

test("normalização: lixo vira valor seguro", () => {
  const r = normalizeRestChoices(pack, { level: 3, conditions: ["prone", "prone", "x"], exhaustion: 99, hitDie: 7, hitDiceSpent: 50 });
  assert.deepEqual(r, { conditions: ["prone"], exhaustion: 6, hitDie: 8, hitDieSet: false, hitDiceTotal: 3, hitDiceSpent: 3 });
  assert.equal(normalizeRestChoices(pack, { exhaustion: -2, hitDie: 12 }).exhaustion, 0);
  assert.equal(normalizeRestChoices(pack, { hitDie: 12 }).hitDie, 12);
});

test("Exaustão: efeito é −2 por nível nos d20 e −5 pés por nível; nível 6 é fatal; nada é aplicado aos números", () => {
  assert.deepEqual(exhaustionEffect(pack, 0), { level: 0, d20Penalty: 0, speedPenaltyFt: 0, fatal: false });
  assert.deepEqual(exhaustionEffect(pack, 3), { level: 3, d20Penalty: 6, speedPenaltyFt: 15, fatal: false });
  assert.equal(exhaustionEffect(pack, 5).fatal, false, "só o nível máximo é fatal");
  assert.equal(exhaustionEffect(pack, 6).fatal, true);
});

test("Dado de Vida: cura = dado + CON, nunca negativa, e acaba quando todos foram gastos", () => {
  const ch = { level: 2, abilities: { con: 14 }, hitDie: 8, hitDiceSpent: 0 };
  assert.deepEqual(spendHitDie(pack, ch, 5), { ok: true, heal: 7, hitDiceSpent: 1 });
  assert.equal(spendHitDie(pack, { ...ch, abilities: { con: 1 } }, 1).heal, 0, "CON 1 (−5) não cura negativo");
  assert.equal(spendHitDie(pack, { ...ch, hitDiceSpent: 2 }, 5).ok, false);
  assert.equal(spendHitDie(pack, ch, 99).heal, 8 + 2, "dado limitado aos lados");
});

test("descanso longo (plano): PV e espaços ao máximo, dados e mortes zerados, Exaustão −1 (nunca abaixo de 0)", () => {
  const base = { hp_max: 24, spell_slots_max: { l1: 3, l2: 1, l3: 0 } };
  const plan = longRestPlan(pack, { level: 3, exhaustion: 2, hitDiceSpent: 3, deathSaves: { successes: 1, failures: 2 } }, { pools: { hp_current: 10, spell_slot_l1: 1, spell_slot_l2: 1, spell_slot_l3: 0 }, base });
  assert.deepEqual(plan.deltas, [{ pool: "hp_current", delta: 14 }, { pool: "spell_slot_l1", delta: 2 }]);
  assert.equal(plan.choices.hitDiceSpent, 0, "todos os dados voltam, não metade");
  assert.equal(plan.choices.exhaustion, 1);
  assert.deepEqual(plan.choices.deathSaves, { successes: 0, failures: 0 });
  assert.equal(longRestPlan(pack, { exhaustion: 0 }, { pools: { hp_current: 24 }, base }).choices.exhaustion, 0);
  assert.deepEqual(longRestPlan(pack, {}, { pools: { hp_current: 24, spell_slot_l1: 3, spell_slot_l2: 1, spell_slot_l3: 0 }, base }).deltas, [], "cheio: nada a restaurar");
});

test("descanso curto (plano): testes contra a morte só zeram com PV acima de 0", () => {
  const marks = { deathSaves: { successes: 2, failures: 1 } };
  assert.deepEqual(shortRestPlan(marks, 0).deathSaves, { successes: 2, failures: 1 });
  assert.deepEqual(shortRestPlan(marks, 3).deathSaves, { successes: 0, failures: 0 });
});

test("ficha: condição e Exaustão persistem, aparecem na aba Jogar e o limite vale", async () => {
  const state = await sheetState();
  await toggleSheetCondition(state, "prone");
  await toggleSheetCondition(state, "x");
  assert.deepEqual(state.sheet.system_choices.conditions, ["prone"]);
  for (let i = 0; i < 9; i++) await stepSheetExhaustion(state, 1);
  assert.equal(state.sheet.system_choices.exhaustion, 6);
  await stepSheetExhaustion(state, -1);
  assert.equal(state.sheet.system_choices.exhaustion, 5);
  const html = renderDerivedStrip(state.sheet);
  assert.match(html, /data-condition-id="prone"[^>]*aria-pressed="true"/);
  assert.match(html, /data-condition-id="blinded"[^>]*aria-pressed="false"/);
  assert.match(html, /Exaustão 5: −10 nos testes de d20, −7,5 m de Deslocamento \(só informativo\)/);
  assert.match(html, /<dt>Iniciativa<\/dt><dd>\+1<\/dd>/, "os números não mudam com Exaustão");
});

test("ficha: gastar Dado de Vida cura (CON 14: +2) sem passar do máximo e recusa sem dados", async () => {
  const state = await sheetState();
  applySheetResourceDelta(state, "hp_current", -10, "dano");
  await spendSheetHitDie(state, { roll: 5 });
  assert.equal(pools(state).hp_current, 14 + 7);
  assert.equal(state.sheet.system_choices.hitDiceSpent, 1, "nível 1 tem um dado só");
  assert.equal(await spendSheetHitDie(state, { roll: 8 }), undefined);
  assert.match(state.rollError, /Sem Dados de Vida/);
});

test("ficha: a cura do Dado de Vida não passa do máximo de PV", async () => {
  const state = await sheetState();
  applySheetResourceDelta(state, "hp_current", -3, "dano");
  await spendSheetHitDie(state, { roll: 8 });
  assert.equal(pools(state).hp_current, 24);
});

test("ficha: descanso longo devolve PV, espaços e dados, desce a Exaustão e zera as marcas de morte", async () => {
  const state = await sheetState();
  applySheetResourceDelta(state, "hp_current", -20, "dano");
  applySheetResourceDelta(state, "spell_slot_l1", -2, "magia");
  await spendSheetHitDie(state, { roll: 1 });
  await stepSheetExhaustion(state, 1);
  await stepSheetExhaustion(state, 1);
  await markSheetDeathSave(state, "failure");
  await longRestSheet(state);
  const p = pools(state);
  assert.equal(p.hp_current, 24);
  assert.equal(p.spell_slot_l1, 3);
  assert.deepEqual(state.sheet.system_choices.deathSaves, { successes: 0, failures: 0 });
  assert.equal(state.sheet.system_choices.hitDiceSpent, 0);
  assert.equal(state.sheet.system_choices.exhaustion, 1);
});

test("ficha: descanso curto com 0 PV mantém as marcas de morte; com PV acima de 0 zera", async () => {
  const state = await sheetState();
  applySheetResourceDelta(state, "hp_current", -24, "dano");
  await markSheetDeathSave(state, "failure");
  await shortRestSheet(state);
  assert.deepEqual(state.sheet.system_choices.deathSaves, { successes: 0, failures: 1 });
  await spendSheetHitDie(state, { roll: 6 });
  await shortRestSheet(state);
  assert.deepEqual(state.sheet.system_choices.deathSaves, { successes: 0, failures: 0 });
});

test("ficha: sem ficha ou sem pacote, nada acontece e nada quebra", async () => {
  assert.equal(await longRestSheet({ sheet: null }), undefined);
  assert.equal(await toggleSheetCondition({ sheet: null }, "prone"), undefined);
  assert.equal(await shortRestSheet({ sheet: { schema_version: "1.0.0", system: { id: "t20", version: 1 }, attributes_lww: {} } }), undefined);
});
