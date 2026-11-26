/**
 * @file Entradas inválidas no `inventory_orset` (null, número, texto, lista) são ignoradas por todos os leitores,
 * sem derrubar o HUD nem a faixa; e `validateDisplay` confere `hud.defense`.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as inv from "../client/js/dungeon/vtt-inventory.js";
import { buildHudBelt } from "../client/js/dungeon/hud-bar-model.js";
import { buildHudStatus } from "../client/js/dungeon/hud-status-model.js";
import { renderDerivedStrip } from "../client/js/dungeon/screen-sheet-derived.js";
import { validateDisplay } from "../client/js/dungeon/system-display.js";

const good = { id: "e1", label: "Espada", qty: 1, weightLb: 3, equipped: true };
const dirty = () => ({ a: null, b: 7, c: "x", d: [1], e: undefined, e1: good });
const sheet = (system = "dnd5e-2024") => ({ character_id: "a", system: { id: system, version: 1 }, attributes_lww: { level: 1, armor_class: 12, abilities: { dex: 10 } }, pools_base: { hp_max: 10 }, delta_ledger: [], inventory_orset: dirty() });

test("leitores do inventário ignoram entradas inválidas e mantêm as boas", () => {
  assert.deepEqual(inv.listInventoryItems(dirty()).map((i) => i.id), ["e1"]);
  assert.equal(inv.totalCarriedWeight(dirty()), 3);
  assert.deepEqual(Object.keys(inv.normalizeInventoryOrset(dirty())), ["e1"]);
});

test("HUD e faixa não quebram com entrada inválida no inventário", () => {
  assert.doesNotThrow(() => buildHudBelt(sheet()));
  const status = buildHudStatus({ sheet: sheet() }, { tokens: [] });
  assert.equal(status.own.ac, 12);
  for (const system of ["dnd5e-2024", "t20", "gurps4e"]) assert.doesNotThrow(() => renderDerivedStrip(sheet(system)), system);
});

test("validateDisplay: hud.defense só aceita id de entrada existente; hud precisa ser objeto", () => {
  const derived = [{ id: "ca", label: "CA", source: { formula: "armorClass" } }];
  assert.deepEqual(validateDisplay({ derived, hud: { defense: "ca" } }), []);
  assert.deepEqual(validateDisplay({ derived }), []);
  assert.match(validateDisplay({ derived, hud: { defense: "zzz" } }).join("|"), /hud\.defense/);
  assert.match(validateDisplay({ derived, hud: { defense: 3 } }).join("|"), /hud\.defense/);
  assert.match(validateDisplay({ hud: { defense: "ca" } }).join("|"), /hud\.defense/);
  for (const bad of [null, "x", [], 5]) assert.match(validateDisplay({ derived, hud: bad }).join("|"), /display\.hud/);
});
