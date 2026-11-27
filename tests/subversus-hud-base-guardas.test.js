/**
 * @file HUD de jogo, parte 2a: guardas (escape de texto definido pela mesa, chave de favorito, autorização do cinto e visão do jogador).
 */
import "./setup.js";
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeFavorites, toggleFavorite } from "../client/js/dungeon/hud-favorites.js";
import { renderHudStatus } from "../client/js/dungeon/screen-hud-status.js";
import { renderInventoryPanel } from "../client/js/dungeon/screen-sheet-inventory.js";
import { runHudOp } from "../client/js/dungeon/dungeon-hud-actions.js";
import { ACTION_HANDLERS } from "../client/js/dungeon/dungeon-controller-actions.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { mutateSheetInventory, updateSheetBasicInfo } from "../client/js/dungeon/dungeon-persistence.js";
import { PACK_5E } from "../client/js/dungeon/system-pack-5e.js";
import { registerSystemPack } from "../client/js/dungeon/system-pack.js";
import { createAndSelectCampaign } from "../client/js/dungeon/dungeon-persistence.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";
import { createDraft, createWizard } from "../client/js/dungeon/sheet-wizard.js";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { createCharacterSheetDoc } from "../client/js/rpg-sheet-and-lore.js";
import { isAuthorizedVttOp, projectStateForPlayer, reduceCampaign } from "../client/js/dungeon/vtt-reducer.js";

const HOSTILE = `"><img src=x onerror=alert(1)>`;
const own = (extra = {}) => ({ character_id: "ana", char_id: "ana", name: "Lyra", attributes_lww: { armor_class: 12 }, pools_base: { hp_max: 10 }, delta_ledger: [], ...extra });

test("escape: rótulo da magia vindo do pacote, id do item no cinto e chave do favorito na mochila", () => {
  const resources = PACK_5E.resources.map((r) => (r.id === "spell-slots" ? { ...r, label: HOSTILE } : r));
  registerSystemPack({ ...PACK_5E, id: "pacote-hostil", resources });
  const magic = renderHudStatus({ sheet: own({ system: { id: "pacote-hostil" }, pools_base: { hp_max: 10, spell_slots_max: { l1: 1 } } }) }, { tokens: [] });
  assert.match(magic, /data-hud-magic>&quot;&gt;&lt;img src=x onerror=alert\(1\)&gt; 1\/1</);
  assert.ok(!magic.includes("<img"));
  const item = { id: HOSTILE.slice(0, 40), label: "Poção", qty: 1, weightLb: 0, equipped: false, tags: ["consumivel"] };
  const belt = renderHudStatus({ sheet: own({ inventory_orset: { [item.id]: item } }) }, { tokens: [] });
  assert.ok(!belt.includes("<img"));
  assert.match(belt, /data-item-id="&quot;&gt;&lt;img/);
  const panel = renderInventoryPanel({ sheet: { ...own(), inventoryItems: [item], sheet_meta: { favorites: [] } } });
  assert.ok(!panel.includes("<img"));
  assert.match(panel, /data-favorite-key="item:&quot;&gt;&lt;img/);
});

test("chave de favorito: espaço, quebra de linha, tabulação e caractere de controle são recusados", () => {
  for (const bad of ["item:a b", "item:a\nb", "item:a\tb", "item:a\u0000b", "item:a\u007fb", "action:a\rb", "item:", "item: a"]) {
    assert.deepEqual(normalizeFavorites([bad]), [], JSON.stringify(bad));
    assert.equal(toggleFavorite([], bad).changed, false, JSON.stringify(bad));
  }
  assert.deepEqual(normalizeFavorites(["item:poção-1", "action:ataque_2"]), ["item:poção-1", "action:ataque_2"]);
});

test("ação do HUD: o botão do cinto e o da mochila despacham para um tratador que existe, e op desconhecida não faz nada", async () => {
  assert.equal(typeof ACTION_HANDLERS["hud-op"], "function");
  const state = createDungeonSessionState();
  assert.equal(await runHudOp(state, { dataset: { hudOp: "inexistente" } }), undefined);
  assert.equal(await runHudOp(state, undefined), undefined);
});

const GM = "vx_gm";
const ANA = "vx_ana";
const BIA = "vx_bia";

function table() {
  const sheet = (id, owner) => createCharacterSheetDoc({ character_id: id, owner_pubkey_p256: owner, inventory_orset: { p: { id: "p", label: "Poção", qty: 2, tags: ["consumivel"] } } });
  return createCampaign({ id: "mesa-hud", name: "Mesa", gmRouteId: GM, sheetsById: { ficha_ana: sheet("ficha_ana", ANA), ficha_bia: sheet("ficha_bia", BIA) } });
}

const beltOp = (actor, sheetId, qty) => createVttOp({ type: "INVENTORY_MUTATE", actor, lamport: 5, ts: 1, payload: { sheetId, kind: "set_qty", itemId: "p", qty } });

test("cinto na ficha alheia: o gate recusa e o reducer não gasta; na própria e como Mestre, aceita", () => {
  const t = table();
  assert.equal(isAuthorizedVttOp(t, beltOp(ANA, "ficha_bia", 1)), false);
  assert.equal(isAuthorizedVttOp(t, beltOp(BIA, "ficha_bia", 1)), true);
  assert.equal(isAuthorizedVttOp(t, beltOp(GM, "ficha_bia", 1)), true);
  const afterOwn = reduceCampaign(t, beltOp(BIA, "ficha_bia", 1));
  assert.equal(afterOwn.sheetsById.ficha_bia.inventory_orset.p.qty, 1);
});

test("favoritos não aparecem na ficha alheia na projeção do jogador; a própria os mantém", () => {
  const t = table();
  for (const id of ["ficha_ana", "ficha_bia"]) t.sheetsById[id].sheet_meta = { favorites: ["item:p"] };
  t.scenesById[t.activeSceneId].tokens.push({ tokenId: "t-ana", sheetId: "ficha_ana", ownerRouteId: ANA, layer: "player", name: "Ana", floorZ: 0 });
  const view = projectStateForPlayer(t, "player", ANA);
  assert.deepEqual(view.sheetsById.ficha_ana.sheet_meta.favorites, ["item:p"]);
  assert.equal(view.sheetsById.ficha_bia.sheet_meta, undefined);
  assert.ok(!JSON.stringify(view.sheetsById.ficha_bia).includes("item:p"));
});

test("dois cliques seguidos no cinto gastam dois (a quantidade é relida a cada clique)", async () => {
  const state = createDungeonSessionState();
  await updateSheetBasicInfo(state, { name: "Kael" });
  await mutateSheetInventory(state, "add", { label: "Poção", qty: 3, tags: ["consumivel"], itemId: "p" });
  const el = { dataset: { hudOp: "belt-use", itemId: "p" } };
  await runHudOp(state, el);
  await runHudOp(state, el);
  assert.equal(Object.values(state.sheet.inventory_orset).find((i) => i.id === "p").qty, 1);
});

test("assistente: todas as ações wizard-* continuam registradas e despachando; nome desconhecido não faz nada", async () => {
  const names = ["wizard-open", "wizard-mode", "wizard-step", "wizard-add-item", "wizard-remove-item", "wizard-cancel", "wizard-keep", "wizard-discard"];
  for (const name of names) assert.equal(typeof ACTION_HANDLERS[name], "function", name);
  const { runWizardOp } = await import("../client/js/dungeon/sheet-wizard-actions.js");
  assert.equal(runWizardOp("wizard-inexistente", {}, null, {}, {}), undefined);
  const state = createDungeonSessionState();
  await ACTION_HANDLERS["wizard-open"](state, null, { querySelector: () => null });
  assert.ok(state.sheetWizard, "abrir cria o rascunho");
  await ACTION_HANDLERS["wizard-cancel"](state, null, { querySelector: () => null });
  await ACTION_HANDLERS["wizard-discard"](state, null, { querySelector: () => null });
  assert.equal(state.sheetWizard, null, "descartar fecha o assistente");
});

test("assistente: wizard-remove-item tira o item do rascunho", async () => {
  const state = createDungeonSessionState();
  await ACTION_HANDLERS["wizard-open"](state, null, { querySelector: () => null });
  state.sheetWizard.draft.items.push({ label: "A" }, { label: "B" }, { label: "C" });
  await ACTION_HANDLERS["wizard-remove-item"](state, { dataset: { index: "1" } }, { querySelector: () => null });
  assert.deepEqual(state.sheetWizard.draft.items.map((i) => i.label), ["A", "C"]);
});

test("assistente: wizard-step até finish grava no store injetado", async () => {
  const store = createVttStore(createMemoryVttBackend());
  const state = createDungeonSessionState();
  await createAndSelectCampaign(state, "Mesa", { store });
  const writes = [];
  const real = store.appendOp.bind(store);
  store.appendOp = (...a) => { writes.push(a[1].type); return real(...a); };
  const { runWizardOp } = await import("../client/js/dungeon/sheet-wizard-actions.js");
  state.sheetWizard = { ...createWizard(), mode: "quick", draft: { ...createDraft(), name: "Bram" } };
  await runWizardOp("wizard-step", state, { dataset: { dir: "finish" } }, { sheetName: "Bram" }, { store });
  assert.deepEqual(writes, ["SHEET_UPSERT"]);
  assert.equal(state.sheetWizard, null);
  assert.equal(state.sheet.attributes_lww.name, "Bram");
});
