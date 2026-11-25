/**
 * @file Visão da ficha (PR "fonte única e valores honestos"): sem dado vira "—", nunca 24 PV nem 50 moedas,
 * e o peso guardado em libras aparece em quilos.
 */
import "./setup.js";
import assert from "node:assert/strict";
import test from "node:test";
import { buildCarryView, buildCoinsView, buildItemWeightView, buildVitalsView, formatKg, MISSING_VALUE } from "../client/js/dungeon/sheet-view-model.js";
import { KG_PER_LB, lbToKg, totalCarriedKg, totalCarriedWeight } from "../client/js/dungeon/vtt-inventory.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { renderTableScreen } from "../client/js/dungeon/screen-table.js";

test("vitais: ficha sem PV mostra '—' e barra vazia, não 24", () => {
  const v = buildVitalsView({}, {});
  assert.equal(v.text, "— / — PV");
  assert.equal(v.pct, 0);
  assert.equal(buildVitalsView({ pools_base: { hp_max: 20 } }, {}).text, "— / 20 PV");
  assert.equal(buildVitalsView({}, { hp_current: 7 }).text, "7 / — PV");
});

test("vitais: valores reais, PV acima do máximo e abaixo de zero ficam na barra 0–100", () => {
  assert.deepEqual(buildVitalsView({ pools_base: { hp_max: 20 } }, { hp_current: 5 }), { hp: 5, hpMax: 20, text: "5 / 20 PV", pct: 25 });
  assert.equal(buildVitalsView({ pools_base: { hp_max: 20 } }, { hp_current: 40 }).pct, 100);
  assert.equal(buildVitalsView({ pools_base: { hp_max: 20 } }, { hp_current: -3 }).pct, 0);
  assert.equal(buildVitalsView({ pools_base: { hp_max: 0 } }, { hp_current: 3 }).text, "3 / — PV");
});

test("moedas: ausente mostra '—'; zero é um valor real", () => {
  assert.equal(buildCoinsView({}).text, "— Moedas");
  assert.equal(buildCoinsView({ currency_gp: 0 }).text, "0 Moedas");
  assert.equal(buildCoinsView({ currency_gp: 12 }).text, "12 Moedas");
});

test("peso: libras viram quilos de verdade (1 lb = 0,45359237 kg)", () => {
  assert.equal(KG_PER_LB, 0.45359237);
  assert.ok(Math.abs(lbToKg(2) - 0.90718474) < 1e-9);
  assert.equal(lbToKg(-1), null);
  assert.equal(lbToKg("2"), null);
  assert.equal(formatKg(1.5), "1,5 kg");
  assert.equal(formatKg(null), MISSING_VALUE);
  assert.equal(buildItemWeightView({ weightLb: 2, qty: 2 }).text, "1,8 kg");
  assert.equal(buildItemWeightView({ weightLb: 0, qty: 3 }).text, MISSING_VALUE);
});

test("carga: soma em kg bate com a soma em libras convertida; mochila vazia é 0,0 kg", () => {
  const orset = { a: { id: "a", label: "A", qty: 2, weightLb: 1 }, b: { id: "b", label: "B", qty: 1, weightLb: 3 } };
  assert.equal(totalCarriedWeight(orset), 5);
  assert.ok(Math.abs(totalCarriedKg(orset) - 5 * KG_PER_LB) < 1e-9);
  const items = Object.values(orset);
  assert.equal(buildCarryView(items).text, "2,3 kg");
  assert.equal(buildCarryView([]).text, "0,0 kg");
});

test("mesa: a faixa de status mostra os números da ficha ativa, não constantes", () => {
  const state = createDungeonSessionState({ viewerRole: "player" });
  state.sheet.pools_base = { ...state.sheet.pools_base, hp_max: 31, gold_initial: 7 };
  const html = renderTableScreen(state);
  assert.match(html, /<strong>31 \/ 31 PV<\/strong>/);
  assert.match(html, /7 Moedas/);
  assert.doesNotMatch(html, /24 \/ 24 PV|50 Moedas/);
});
