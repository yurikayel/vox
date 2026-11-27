/**
 * @file Editar e gastar PM/PF (SUB-17, D8): gasto relativo pelo ledger com limite, máximo por SHEET_UPSERT,
 * autorização de dono, controles da faixa e escape de HTML.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { setReserveMaxFor, spendReserve } from "../client/js/dungeon/dungeon-reserve-actions.js";
import { renderReserveControls } from "../client/js/dungeon/screen-sheet-reserves.js";
import { renderDerivedStrip } from "../client/js/dungeon/screen-sheet-derived.js";
import { updateSheetBasicInfo } from "../client/js/dungeon/dungeon-persistence.js";
import { projectReserves } from "../client/js/dungeon/sheet-reserves.js";
import { getSystemPack } from "../client/js/dungeon/system-pack.js";

const t20 = () => getSystemPack("t20");
async function local(max) {
  const state = createDungeonSessionState();
  await updateSheetBasicInfo(state, { name: "Kael", dex: 14, system: "t20" });
  if (max) await setReserveMaxFor(state, "mp", max);
  return state;
}

test("gastar e recuperar: relativo no ledger, limitado entre 0 e o máximo, sem acumular excesso", async () => {
  const s = await local(5);
  await spendReserve(s, "mp", -2);
  assert.equal(projectReserves(s.sheet, t20()).mp.cur, 3);
  await spendReserve(s, "mp", -99);
  assert.equal(projectReserves(s.sheet, t20()).mp.cur, 0);
  await spendReserve(s, "mp", -1);
  assert.equal(s.sheet.delta_ledger.length, 2, "gasto abaixo de zero não entra no ledger");
  await spendReserve(s, "mp", 500);
  assert.equal(projectReserves(s.sheet, t20()).mp.cur, 5);
  await spendReserve(s, "mp", 1);
  assert.equal(s.sheet.delta_ledger.length, 3, "recuperar acima do máximo não entra no ledger");
});

test("gastar: reserva inexistente, sem máximo, delta inválido e id de PV são ignorados", async () => {
  const s = await local();
  for (const [id, d] of [["mp", -1], ["zzz", -1], ["hp", -1]]) await spendReserve(s, id, d);
  await spendReserve(await local(5), "mp", NaN);
  assert.equal(s.sheet.delta_ledger.length, 0);
});

test("máximo: grava limitado por SHEET_UPSERT; baixar o máximo muda o atual (atual = máximo + soma)", async () => {
  const s = await local(10);
  await spendReserve(s, "mp", -4);
  await setReserveMaxFor(s, "mp", "7");
  assert.equal(s.sheet.pools_base.mp_max, 7);
  assert.equal(projectReserves(s.sheet, t20()).mp.cur, 3);
  await setReserveMaxFor(s, "zzz", 9);
  assert.equal("zzz_max" in s.sheet.pools_base, false);
});

test("controles: PM com máximo mostra atual/máximo e botões; sem máximo só o campo; 5e não desenha", async () => {
  const withMax = renderReserveControls((await local(8)).sheet, t20());
  assert.match(withMax, /8\/8/);
  assert.match(withMax, /data-hud-op="reserve-spend"[^>]*data-delta="-1"/);
  const none = renderReserveControls((await local()).sheet, t20());
  assert.match(none, /sem máximo/);
  assert.equal(none.includes("reserve-spend"), false);
  assert.equal(renderReserveControls({}, getSystemPack("5e")), "");
  assert.match(renderDerivedStrip((await local(8)).sheet), /Reservas/);
});

test("controles: rótulo do pacote com HTML sai escapado", async () => {
  const pack = { ...t20(), resources: [{ id: "mp", label: "<img src=x>", kind: "pool" }] };
  assert.equal(renderReserveControls((await local(3)).sheet, pack).includes("<img"), false);
});

test("passo: o teto de 99 vale por ação (pedir 150 gasta 99)", async () => {
  const s = await local(500);
  await spendReserve(s, "mp", -150);
  assert.equal(projectReserves(s.sheet, t20()).mp.cur, 401);
  assert.equal(s.sheet.delta_ledger.at(-1).delta, -99);
});

test("máximo vazio, NaN, texto ou negativo é ignorado e não grava 0", async () => {
  const s = await local(8);
  for (const bad of ["", "  ", "abc", NaN, -3, "-1", undefined]) await setReserveMaxFor(s, "mp", bad);
  assert.equal(s.sheet.pools_base.mp_max, 8);
  await setReserveMaxFor(s, "mp", "0");
  assert.equal(s.sheet.pools_base.mp_max, 0);
});

test("botão de máximo leva aria-label com o nome da reserva", async () => {
  const html = renderReserveControls((await local(8)).sheet, t20());
  assert.match(html, /aria-label="Definir máximo de PM"/);
  assert.match(renderReserveControls({ pools_base: { fp_max: 3 } }, getSystemPack("gurps4e")), /aria-label="Definir máximo de PF"/);
});

test("HUD: GURPS mostra Esquiva calculada (com o peso do inventário); 5e e T20 seguem com armor_class", async () => {
  const { buildHudStatus } = await import("../client/js/dungeon/hud-status-model.js");
  const g = { character_id: "g", system: { id: "gurps4e", version: 1 }, attributes_lww: { armor_class: 99, abilities: { st: 10, dx: 10, iq: 10, ht: 10 } }, pools_base: { hp_max: 10 }, delta_ledger: [], inventory_orset: {} };
  const own = buildHudStatus({ sheet: g }, { tokens: [] }).own;
  assert.equal(own.acLabel, "Esquiva");
  assert.equal(own.ac, 8);
  const t = buildHudStatus({ sheet: { ...g, system: { id: "t20", version: 1 } } }, { tokens: [] }).own;
  assert.equal(t.ac, 99);
});
