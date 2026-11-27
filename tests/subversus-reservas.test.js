/**
 * @file Reservas genéricas PM/PF (SUB-17, D8): máximo em `pools_base.<id>_max`, atual pelo `delta_ledger`, faixa com
 * `resource`, indicador de PM no HUD, ficha antiga sem reservas, projeção ao jogador e `.voxchar`.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendPoolDeltaOp } from "../client/js/rpg-sheet-and-lore.js";
import { RESERVE_CAP, projectReserves, reserveIds, reserveMax, withReserveMax } from "../client/js/dungeon/sheet-reserves.js";
import { renderDerivedStrip } from "../client/js/dungeon/screen-sheet-derived.js";
import { getSystemPack, validateSystemPack } from "../client/js/dungeon/system-pack.js";
import { validateDisplay } from "../client/js/dungeon/system-display.js";
import { buildHudMagic } from "../client/js/dungeon/hud-bar-model.js";
import { projectSheetsForPlayer } from "../client/js/dungeon/vtt-sheet-projection.js";
import { checkVoxchar } from "../client/js/dungeon/voxchar-check.js";
import { exportVoxchar } from "../client/js/dungeon/voxchar.js";

const t20 = () => getSystemPack("t20");
const gurps = () => getSystemPack("gurps4e");
const sheet = (id, base = {}) => ({ character_id: "a", campaign_id: "c", name: "Kael", system: { id, version: 1 }, attributes_lww: { name: "Kael", level: 5, armor_class: 14, abilities: { dex: 14 } }, pools_base: { hp_max: 24, ...base }, delta_ledger: [], inventory_orset: {} });
const spend = (s, pool, delta, n = 1) => appendPoolDeltaOp(s, { op_id: `op${n}`, lamport_clock: n, target_pool: pool, delta, actor_pubkey: "x" });
const stat = (html, label) => html.match(new RegExp(`<dt>${label.replace(/[()]/g, (c) => `\\${c}`)}</dt><dd>([^<]*)</dd>`))?.[1];

test("máximo: inteiro de 0 a 9999; ausente, negativo, texto e infinito valem 0 ou o teto", () => {
  assert.equal(reserveMax({ mp_max: 12 }, "mp"), 12);
  assert.equal(reserveMax({ mp_max: 12.9 }, "mp"), 12);
  for (const bad of [undefined, null, "", "x", -3, NaN, 0]) assert.equal(reserveMax({ mp_max: bad }, "mp"), 0);
  assert.equal(reserveMax({ mp_max: 1e12 }, "mp"), RESERVE_CAP);
  assert.equal(reserveMax({ mp_max: Infinity }, "mp"), 0);
  assert.equal(reserveMax(undefined, "mp"), 0);
});

test("ids de reserva: recursos pool que não são PV (T20 mp, GURPS fp, 5e nenhum)", () => {
  assert.deepEqual(reserveIds(t20()), ["mp"]);
  assert.deepEqual(reserveIds(gurps()), ["fp"]);
  assert.deepEqual(reserveIds(getSystemPack("5e")), []);
});

test("atual: máximo mais deltas do ledger, nunca abaixo de 0 nem acima do máximo; delta infinito não conta", () => {
  let s = sheet("t20", { mp_max: 10 });
  assert.deepEqual(projectReserves(s, t20()).mp, { cur: 10, max: 10 });
  s = spend(s, "mp_current", -4);
  assert.equal(projectReserves(s, t20()).mp.cur, 6);
  s = spend(s, "mp_current", -100, 2);
  assert.equal(projectReserves(s, t20()).mp.cur, 0);
  s = spend(s, "mp_current", 1000, 3);
  assert.equal(projectReserves(s, t20()).mp.cur, 10);
  const inf = { ...s, delta_ledger: [{ target_pool: "mp_current", delta: Infinity }, { target_pool: "mp_current", delta: -Infinity }, { target_pool: "mp_current", delta: "x" }] };
  assert.equal(projectReserves(inf, t20()).mp.cur, 10);
  assert.equal(projectReserves(spend(sheet("t20", { mp_max: 10 }), "outro_current", -5), t20()).mp.cur, 10);
});

test("a ordem das operações não muda o resultado (soma comutativa, clamp no fim)", () => {
  const base = sheet("t20", { mp_max: 10 });
  const a = spend(spend(base, "mp_current", -3, 1), "mp_current", -5, 2);
  const b = spend(spend(base, "mp_current", -5, 2), "mp_current", -3, 1);
  assert.equal(projectReserves(a, t20()).mp.cur, 2);
  assert.equal(projectReserves(b, t20()).mp.cur, 2);
});

test("ficha antiga sem reservas é válida: sem máximo a reserva não existe e a faixa não a mostra", () => {
  const old = sheet("t20");
  assert.deepEqual(Object.keys(projectReserves(old, t20())), ["hp"]);
  const html = renderDerivedStrip(old);
  assert.equal(stat(html, "PM"), undefined);
  assert.equal(stat(html, "PV"), "24/24");
});

test("faixa: T20 mostra PM atual/máximo e GURPS mostra PV e PF atuais", () => {
  const t = spend(sheet("t20", { mp_max: 8 }), "mp_current", -3);
  assert.equal(stat(renderDerivedStrip(t), "PM"), "5/8");
  const g = spend(sheet("gurps4e", { fp_max: 12 }), "fp_current", -2);
  g.attributes_lww.abilities = { st: 12, dx: 11, iq: 10, ht: 12 };
  const html = renderDerivedStrip(g);
  assert.equal(stat(html, "PF"), "10/12");
  assert.equal(stat(html, "PV"), "24/24");
  assert.equal(stat(html, "PF (HT)"), "12");
});

test("HUD: T20 mostra o indicador de PM só com máximo; GURPS não; 5e segue com espaços de magia", () => {
  assert.equal(buildHudMagic(sheet("t20")), null);
  assert.deepEqual(buildHudMagic(spend(sheet("t20", { mp_max: 8 }), "mp_current", -3)), { label: "PM", text: "5/8" });
  assert.equal(buildHudMagic(sheet("gurps4e", { fp_max: 12 })), null);
  assert.notEqual(buildHudMagic(sheet("5e", { spell_slots_max: { l1: 2 } })), null);
});

test("pacote: resource que aponta para recurso inexistente recusa o pacote", () => {
  const bad = { ...t20(), display: { derived: [{ id: "x", label: "X", source: { resource: "zzz" } }] } };
  assert.match(validateSystemPack(bad).errors.join("|"), /recurso inexistente: zzz/);
  assert.deepEqual(validateDisplay({ derived: [{ id: "x", label: "X", source: { resource: "zzz" } }] }), []);
  assert.deepEqual(validateSystemPack(t20()), { ok: true, errors: [] });
  assert.deepEqual(validateSystemPack(gurps()), { ok: true, errors: [] });
});

test("setter: grava o máximo limitado e não muda a ficha original", () => {
  const s = sheet("t20");
  const out = withReserveMax(s, "mp", 1e9);
  assert.equal(out.pools_base.mp_max, RESERVE_CAP);
  assert.equal("mp_max" in s.pools_base, false);
  assert.equal(withReserveMax(s, "mp", -5).pools_base.mp_max, 0);
});

test("projeção ao jogador: ficha alheia não vaza reservas nem ledger", () => {
  const mine = { ...sheet("t20", { mp_max: 8 }), character_id: "mine" };
  const other = { ...sheet("t20", { mp_max: 9 }), character_id: "other", delta_ledger: [{ target_pool: "mp_current", delta: -1 }] };
  const state = { sheetsById: { mine, other }, scenesById: {} };
  const out = projectSheetsForPlayer(state, "viewer");
  const text = JSON.stringify(out.sheetsById.other);
  assert.equal(text.includes("mp_max"), false);
  assert.equal(text.includes("mp_current"), false);
  assert.equal(out.sheetsById.other.pools_base, undefined);
});

test(".voxchar: a ficha com reservas exporta e passa na validação; pools (estado de jogo) ficam fora, como o PV", () => {
  const exported = exportVoxchar(sheet("t20", { mp_max: 8 }));
  assert.equal(checkVoxchar(exported.bytes).ok, true);
  assert.equal(new TextDecoder().decode(exported.bytes).includes("mp_max"), false);
  assert.equal(checkVoxchar(exportVoxchar(sheet("t20")).bytes).ok, true);
});

test("5e: a faixa continua com o mesmo hash (golden)", () => {
  const s = { character_id: "a", system: { id: "5e", version: 1 }, attributes_lww: { level: 5, armor_class: 16, abilities: { dex: 14, wis: 12 } }, pools_base: { hp_max: 24, hp_current: 18 }, inventory_orset: {} };
  assert.equal(createHash("sha256").update(renderDerivedStrip(s, 18)).digest("hex"), "2a81793865e326036473983ac44af6e4a9ff7fa2525c22deaa141bf28166104b");
});
