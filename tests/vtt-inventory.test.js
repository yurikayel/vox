import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCharacterSheetDoc } from "../client/js/rpg-sheet-and-lore.js";
import { applyInventoryMutation, listInventoryItems, totalCarriedWeight } from "../client/js/dungeon/vtt-inventory.js";

test("inventário: add e set_qty", () => {
  let sheet = createCharacterSheetDoc({ character_id: "a" });
  sheet = applyInventoryMutation(sheet, "add", { label: "Tocha", qty: 2, weightLb: 1 });
  const items = listInventoryItems(sheet.inventory_orset);
  assert.equal(items.length, 1);
  assert.equal(items[0].qty, 2);
  sheet = applyInventoryMutation(sheet, "set_qty", { itemId: items[0].id, qty: 5 });
  assert.equal(listInventoryItems(sheet.inventory_orset)[0].qty, 5);
  assert.equal(totalCarriedWeight(sheet.inventory_orset), 5);
});