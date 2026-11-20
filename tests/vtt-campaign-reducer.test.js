import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign, createNoteDoc, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { createCharacterSheetDoc } from "../client/js/rpg-sheet-and-lore.js";
import { listInventoryItems } from "../client/js/dungeon/vtt-inventory.js";
import { CAMPAIGN_OP_HANDLERS, isPlayerAuthorizedForCampaignOp } from "../client/js/dungeon/vtt-campaign-reducer.js";

function reduceCampaignOp(state, type, payload, extra = {}) {
  const op = createVttOp({
    opId: extra.opId || `op-${type}`,
    type,
    lamport: extra.lamport ?? 1,
    actor: extra.actor ?? "vx_gm",
    ts: extra.ts ?? 1_700_000_000,
    payload,
  });
  return CAMPAIGN_OP_HANDLERS[type](state, op);
}

test("campaign-reducer: CALENDAR_ADVANCE anexa crônica e avança relógio", () => {
  let camp = createCampaign({ id: "cal-camp" });
  const before = camp.calendar?.minuteOfDay ?? 480;
  camp = reduceCampaignOp(camp, "CALENDAR_ADVANCE", { delta: "minutes_10" });
  assert.ok(camp.chronicle.length >= 1);
  assert.equal(camp.chronicle.at(-1).badge, "Tempo");
  assert.ok(camp.calendar.minuteOfDay >= before + 10);
});

test("campaign-reducer: NOTE_PIN grava pin em nota existente", () => {
  const camp = createCampaign({
    activeSceneId: "taverna",
    notesById: { pista: createNoteDoc({ id: "pista", title: "Pista" }) },
  });
  const next = reduceCampaignOp(camp, "NOTE_PIN", {
    noteId: "pista",
    sceneId: "taverna",
    floorZ: 1,
    x: 12.5,
    y: 3,
  });
  const pin = next.notesById.pista.pin;
  assert.equal(pin.sceneId, "taverna");
  assert.equal(pin.floorZ, 1);
  assert.equal(pin.x, 12.5);
});

test("campaign-reducer: NOTE_PIN sem nota é no-op", () => {
  const camp = createCampaign({ notesById: {} });
  const next = reduceCampaignOp(camp, "NOTE_PIN", { noteId: "ausente", x: 1, y: 1 });
  assert.equal(next, camp);
});

test("campaign-reducer: LEVEL_UP_APPLY sem plan é no-op", () => {
  const sheet = createCharacterSheetDoc({ character_id: "hero" });
  const camp = createCampaign({ activeSheetId: "hero", sheetsById: { hero: sheet } });
  const next = reduceCampaignOp(camp, "LEVEL_UP_APPLY", { sheetId: "hero" });
  assert.equal(next.sheetsById.hero.attributes_lww.level, sheet.attributes_lww.level);
});

test("campaign-reducer: isPlayerAuthorizedForCampaignOp fail-closed", () => {
  const sheet = createCharacterSheetDoc({ character_id: "hero", owner_pubkey_p256: "vx_p1" });
  const camp = createCampaign({ activeSheetId: "hero", sheetsById: { hero: sheet } });
  const calOp = createVttOp({ type: "CALENDAR_ADVANCE", actor: "vx_p1", payload: { delta: "round" } });
  assert.equal(isPlayerAuthorizedForCampaignOp(camp, calOp, false), false);

  const invOp = createVttOp({
    type: "INVENTORY_MUTATE",
    actor: "vx_p1",
    payload: { sheetId: "hero", kind: "add", label: "Cordel", qty: 1 },
  });
  assert.equal(isPlayerAuthorizedForCampaignOp(camp, invOp, false), true);
  const after = reduceCampaignOp(camp, "INVENTORY_MUTATE", invOp.payload, { actor: "vx_p1" });
  assert.equal(listInventoryItems(after.sheetsById.hero.inventory_orset).length, 1);
});