/**
 * @file Cinto do HUD (SUB-06, pendência 1): gastar um consumível manda um delta relativo, então dois cliques antes de o
 * estado voltar gastam dois; o delta é validado e a autorização continua só do dono da ficha.
 */
import "./setup.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { createCharacterSheetDoc } from "../client/js/rpg-sheet-and-lore.js";
import { applyInventoryMutation, listInventoryItems } from "../client/js/dungeon/vtt-inventory.js";
import { isPlayerAuthorizedForCampaignOp } from "../client/js/dungeon/vtt-campaign-reducer.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { mutateSheetInventory, updateSheetBasicInfo } from "../client/js/dungeon/dungeon-persistence.js";
import { runHudOp } from "../client/js/dungeon/dungeon-hud-actions.js";

const qtyOf = (sheet, id) => listInventoryItems(sheet.inventory_orset).find((i) => i.id === id)?.qty;

/** Sessão com um par P2P lento: a ficha só volta depois de dois turnos, como na rede, e aplica o que o redutor aplicaria. */
function sessionWithSlowPeer(qty) {
  const state = createDungeonSessionState();
  state.sheet = applyInventoryMutation(createCharacterSheetDoc({ character_id: "h" }), "add", { itemId: "p", label: "Poção", qty, tags: ["consumivel"] });
  state.campaignId = "c1";
  state.syncPeer = {
    async dispatchOp({ payload }) {
      await Promise.resolve();
      await Promise.resolve();
      state.sheet = applyInventoryMutation(state.sheet, payload.kind, payload);
      return { id: "op" };
    },
  };
  return state;
}

test("cinto: dois cliques antes de o estado voltar gastam dois (qty 3 → 1), não um", async () => {
  const state = sessionWithSlowPeer(3);
  const el = { dataset: { hudOp: "belt-use", itemId: "p" } };
  await Promise.all([runHudOp(state, el), runHudOp(state, el)]);
  assert.equal(qtyOf(state.sheet, "p"), 1);
});

test("cinto: três cliques antes de o estado voltar sobre 2 unidades tiram o item e nunca deixam quantidade negativa", async () => {
  const state = sessionWithSlowPeer(2);
  const el = { dataset: { hudOp: "belt-use", itemId: "p" } };
  await Promise.all([runHudOp(state, el), runHudOp(state, el), runHudOp(state, el)]);
  assert.equal(qtyOf(state.sheet, "p"), undefined);
});

test("cinto: com a ficha local (sem rede), dois cliques seguidos continuam gastando dois", async () => {
  const state = createDungeonSessionState();
  await updateSheetBasicInfo(state, { name: "Kael" });
  await mutateSheetInventory(state, "add", { label: "Poção", qty: 3, tags: ["consumivel"], itemId: "p" });
  const el = { dataset: { hudOp: "belt-use", itemId: "p" } };
  await runHudOp(state, el);
  await runHudOp(state, el);
  assert.equal(qtyOf(state.sheet, "p"), 1);
});

test("adjust_qty: soma o delta, zerar tira o item, a quantidade nunca fica negativa", () => {
  const sheet = applyInventoryMutation(createCharacterSheetDoc({ character_id: "h" }), "add", { itemId: "p", label: "Poção", qty: 5 });
  assert.equal(qtyOf(applyInventoryMutation(sheet, "adjust_qty", { itemId: "p", delta: -2 }), "p"), 3);
  assert.equal(qtyOf(applyInventoryMutation(sheet, "adjust_qty", { itemId: "p", delta: 4 }), "p"), 9);
  assert.equal(qtyOf(applyInventoryMutation(sheet, "adjust_qty", { itemId: "p", delta: -5 }), "p"), undefined);
  assert.equal(qtyOf(applyInventoryMutation(sheet, "adjust_qty", { itemId: "p", delta: -50 }), "p"), undefined);
});

test("adjust_qty: delta inválido não muda nada; fracionário é truncado; o teto é 99 por operação", () => {
  const sheet = applyInventoryMutation(createCharacterSheetDoc({ character_id: "h" }), "add", { itemId: "p", label: "Poção", qty: 5 });
  for (const bad of [undefined, null, "", "x", NaN, Infinity, {}, [1, 2]]) assert.equal(qtyOf(applyInventoryMutation(sheet, "adjust_qty", { itemId: "p", delta: bad }), "p"), 5, String(bad));
  assert.equal(qtyOf(applyInventoryMutation(sheet, "adjust_qty", { itemId: "p", delta: "-1.9" }), "p"), 4);
  assert.equal(qtyOf(applyInventoryMutation(sheet, "adjust_qty", { itemId: "p", delta: 1e9 }), "p"), 104);
  assert.equal(qtyOf(applyInventoryMutation(sheet, "adjust_qty", { itemId: "inexistente", delta: -1 }), "p"), 5);
});

test("adjust_qty: continua só do dono da ficha (outro jogador é recusado)", () => {
  const sheet = createCharacterSheetDoc({ character_id: "hero", owner_pubkey_p256: "vx_dono" });
  const camp = createCampaign({ activeSheetId: "hero", sheetsById: { hero: sheet } });
  const op = (actor) => createVttOp({ type: "INVENTORY_MUTATE", actor, payload: { sheetId: "hero", kind: "adjust_qty", itemId: "p", delta: -1 } });
  assert.equal(isPlayerAuthorizedForCampaignOp(camp, op("vx_dono"), false), true);
  assert.equal(isPlayerAuthorizedForCampaignOp(camp, op("vx_intruso"), false), false);
});
