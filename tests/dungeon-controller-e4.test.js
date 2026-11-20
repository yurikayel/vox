import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCampaignActionHandlers,
  submitAddItemForm,
  submitPinNoteForm,
  showDice3dOverlay,
} from "../client/js/dungeon/dungeon-controller-e4.js";
import { loadDungeonPrefs } from "../client/js/dungeon/dungeon-persistence.js";
import { createCharacterSheetDoc } from "../client/js/rpg-sheet-and-lore.js";
import { createCampaign, createNoteDoc } from "../client/js/dungeon/vtt-schema.js";
import { listInventoryItems } from "../client/js/dungeon/vtt-inventory.js";

/** @param {Record<string, string>} fields */
function makeForm(fields) {
  return {
    querySelector: (sel) => {
      const name = /\[name=(\w+)\]/.exec(sel)?.[1];
      const value = name && Object.hasOwn(fields, name) ? fields[name] : "";
      return { value };
    },
  };
}

/** @param {object} [overrides] */
function baseState(overrides = {}) {
  return {
    dice3dEnabled: false,
    levelUpOpen: false,
    levelUpStep: 0,
    levelUpPlan: { stale: true },
    sheet: createCharacterSheetDoc({ character_id: "char_e4" }),
    campaignDoc: { system: "libre" },
    ...overrides,
  };
}

test("dungeon-controller-e4: assistente level-up open, cancel e step", () => {
  const handlers = buildCampaignActionHandlers(() => ({}));
  const state = baseState();
  handlers["level-up-open"](state);
  assert.equal(state.levelUpOpen, true);
  assert.equal(state.levelUpStep, 1);
  assert.equal(state.levelUpPlan, null);
  const el = { dataset: { step: "2" } };
  handlers["level-up-step"](state, el);
  assert.equal(state.levelUpStep, 2);
  assert.equal(state.levelUpPlan?.ok, true);
  assert.equal(state.levelUpPlan?.plan?.toLevel, 2);
  handlers["level-up-cancel"](state);
  assert.equal(state.levelUpOpen, false);
  assert.equal(state.levelUpStep, 1);
  assert.equal(state.levelUpPlan, null);
});

test("dungeon-controller-e4: toggle-dice3d alterna estado e persiste prefs", () => {
  globalThis.localStorage?.clear();
  const handlers = buildCampaignActionHandlers(() => ({ dice3d: true }));
  const state = baseState({ dice3dEnabled: false });
  handlers["toggle-dice3d"](state);
  assert.equal(state.dice3dEnabled, true);
  assert.equal(loadDungeonPrefs().dice3d, true);
  handlers["toggle-dice3d"](state);
  assert.equal(state.dice3dEnabled, false);
  assert.equal(loadDungeonPrefs().dice3d, false);
});

test("dungeon-controller-e4: submitAddItemForm ignora rótulo vazio", async () => {
  const sheet = createCharacterSheetDoc({ character_id: "char_e4" });
  const campaignDoc = createCampaign({
    gmRouteId: "gm-local",
    activeSheetId: "char_e4",
    sheetsById: { char_e4: sheet },
  });
  const state = { sheet, campaignDoc, localActor: "gm-local", chronicle: [], rolls: [] };
  const viewOpts = { state, store: {} };
  assert.equal(submitAddItemForm(viewOpts, makeForm({ itemLabel: "   " })), undefined);
  const reduced = await submitAddItemForm(viewOpts, makeForm({ itemLabel: "  Poção  " }));
  const items = listInventoryItems(reduced.sheetsById.char_e4.inventory_orset);
  assert.equal(items[0]?.label, "Poção");
});

test("dungeon-controller-e4: submitPinNoteForm valida noteId e coordenadas", async () => {
  const note = createNoteDoc({ id: "nota_pin", title: "Pista" });
  const campaignDoc = createCampaign({ gmRouteId: "gm-local", notesById: { nota_pin: note } });
  const state = { campaignDoc, localActor: "gm-local", chronicle: [], rolls: [] };
  const viewOpts = { state, store: {} };
  assert.equal(submitPinNoteForm(viewOpts, makeForm({ noteId: "", x: "1", y: "2" })), undefined);
  await submitPinNoteForm(
    viewOpts,
    makeForm({ noteId: "nota_pin", x: "3.7", y: "-2", floorZ: "1.9" }),
  );
  assert.equal(state.campaignNotice, "Nota fixada no mapa.");
});

test("dungeon-controller-e4: showDice3dOverlay não importa módulo se desligado", async () => {
  const container = { querySelector: () => null };
  await showDice3dOverlay(container, { ok: true, total: 20 }, false);
  await showDice3dOverlay(container, { ok: false }, true);
  await showDice3dOverlay(container, null, true);
  assert.equal(container.querySelector("#dungeon-main"), null);
});