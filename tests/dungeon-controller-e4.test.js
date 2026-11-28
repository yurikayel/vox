import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { hasStoredViewerRole, loadDungeonPrefs, saveDungeonPrefs } from "../client/js/dungeon/dungeon-persistence.js";
import { createCharacterSheetDoc } from "../client/js/rpg-sheet-and-lore.js";
import { applyInventoryMutation, listInventoryItems } from "../client/js/dungeon/vtt-inventory.js";

test("dungeon-e4: hasStoredViewerRole detecta ausência de chave", () => {
  globalThis.localStorage?.clear();
  assert.equal(hasStoredViewerRole(), false);
  saveDungeonPrefs({ viewerRole: "player" });
  assert.equal(hasStoredViewerRole(), true);
});

test("dungeon-e4: saveDungeonPrefs persiste toggle dice3d", () => {
  globalThis.localStorage?.clear();
  saveDungeonPrefs({ dice3d: true });
  assert.equal(loadDungeonPrefs().dice3d, true);
  assert.equal(loadDungeonPrefs().viewerRole, "gm");
  saveDungeonPrefs({ dice3d: false, viewerRole: "player" });
  assert.equal(loadDungeonPrefs().dice3d, false);
  assert.equal(loadDungeonPrefs().viewerRole, "player");
});

test("dungeon-e4: applyInventoryMutation adiciona item na ficha", () => {
  let sheet = createCharacterSheetDoc({ character_id: "char_e4" });
  sheet = applyInventoryMutation(sheet, "add", { label: "Poção", qty: 1 });
  const items = listInventoryItems(sheet.inventory_orset);
  assert.equal(items[0]?.label, "Poção");
});