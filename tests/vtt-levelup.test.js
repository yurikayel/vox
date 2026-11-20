import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCharacterSheetDoc } from "../client/js/rpg-sheet-and-lore.js";
import { applyLevelUp, buildLevelUpPlan } from "../client/js/dungeon/vtt-levelup.js";

test("level-up: não desce nível", () => {
  const sheet = createCharacterSheetDoc({ character_id: "p", pools_base: { hp_max: 20 } });
  sheet.attributes_lww.level = 3;
  const plan = buildLevelUpPlan(sheet, 2, "libre");
  assert.equal(plan.ok, false);
});

test("level-up: preset tormenta20", () => {
  const sheet = createCharacterSheetDoc({ character_id: "t20" });
  const built = buildLevelUpPlan(sheet, 2, "tormenta20");
  assert.equal(built.ok, true);
  assert.equal(built.plan?.preset, "tormenta20");
  assert.equal(built.plan?.hpGain, 6);
});

test("level-up: marco imutável e PV", () => {
  const sheet = createCharacterSheetDoc({ character_id: "p", pools_base: { hp_max: 20 } });
  const built = buildLevelUpPlan(sheet, 2, "libre");
  assert.equal(built.ok, true);
  const next = applyLevelUp(sheet, built.plan, { ts: 1 });
  assert.equal(next.attributes_lww.level, 2);
  assert.equal(next.sheet_meta.level_milestones.length, 1);
  assert.ok(next.pools_base.hp_max > 20);
});