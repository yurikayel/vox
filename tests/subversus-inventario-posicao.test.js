/**
 * @file Inventário com posição guardada (SUB-25a): `x`/`y`/`rot` no item, `layoutBackpack` determinístico,
 * mutações `place` e `organize` revalidadas no reducer e compatibilidade com ficha antiga e com `.voxchar`.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as inventory from "../client/js/dungeon/vtt-inventory.js";
import { applyInventoryMutation, listInventoryItems, organizeBackpack } from "../client/js/dungeon/vtt-inventory.js";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { CAMPAIGN_OP_HANDLERS } from "../client/js/dungeon/vtt-campaign-reducer.js";
import { renderInventoryPanel } from "../client/js/dungeon/screen-sheet-inventory.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { mutateSheetInventory, updateSheetBasicInfo } from "../client/js/dungeon/dungeon-persistence.js";
import { exportVoxchar, importVoxchar } from "../client/js/dungeon/voxchar.js";

const item = (id, label, extra = {}) => ({ id, label, qty: 1, weightLb: 0, equipped: false, ...extra });
const sheetWith = (...labels) => labels.reduce((sheet, label) => applyInventoryMutation(sheet, "add", { label }), {});
const byLabel = (sheet) => Object.fromEntries(listInventoryItems(sheet.inventory_orset).map((it) => [it.label, it]));
const spot = (it) => ({ x: it.x, y: it.y, rot: it.rot });
const placeOp = (sheet, itemId, extra) => applyInventoryMutation(sheet, "place", { itemId, ...extra });

test("place válido grava x/y no item e o painel desenha a célula escolhida", () => {
  const sheet = placeOp(sheetWith("Escudo"), "escudo", { x: 5, y: 1 });
  assert.deepEqual(spot(byLabel(sheet).Escudo), { x: 5, y: 1, rot: undefined });
  const html = renderInventoryPanel({ sheet: { inventoryItems: listInventoryItems(sheet.inventory_orset) } });
  assert.match(html, /grid-column:6 \/ span 2;grid-row:2 \/ span 2/);
});

test("place sobre célula ocupada é no-op: nada é gravado e o item guardado fica onde estava", () => {
  let sheet = placeOp(sheetWith("Escudo", "Elmo"), "escudo", { x: 3, y: 0 });
  const before = byLabel(sheet);
  assert.deepEqual(spot(before.Escudo), { x: 3, y: 0, rot: undefined }, "o primeiro place vale");
  sheet = placeOp(sheet, "elmo", { x: 4, y: 1 });
  assert.deepEqual(byLabel(sheet), before, "colisão: ficha idêntica");
  assert.equal("x" in byLabel(sheet).Elmo, false);
});

test("place que colide com item sem posição (layout atual) também é recusado", () => {
  const sheet = sheetWith("Escudo", "Elmo");
  const elmo = organizeBackpack(listInventoryItems(sheet.inventory_orset)).placements.find((p) => p.id === "elmo");
  const free = placeOp(sheet, "escudo", { x: 8, y: 2 });
  assert.deepEqual(spot(byLabel(free).Escudo), { x: 8, y: 2, rot: undefined }, "célula livre aceita");
  assert.equal("x" in byLabel(placeOp(sheet, "escudo", { x: elmo.x, y: elmo.y })).Escudo, false, "célula do Elmo recusa");
});

test("place fora da grade, não inteiro ou de item inexistente/equipado é no-op", () => {
  const base = placeOp(sheetWith("Escudo", "Anel"), "anel", { x: 9, y: 3 });
  assert.deepEqual(spot(byLabel(base).Anel), { x: 9, y: 3, rot: undefined }, "ponto de partida válido");
  for (const bad of [{ x: 9, y: 0 }, { x: 0, y: 3 }, { x: -1, y: 0 }, { x: 1.5, y: 0 }, { x: "a", y: 0 }, {}]) {
    assert.equal("x" in byLabel(placeOp(base, "escudo", bad)).Escudo, false, JSON.stringify(bad));
  }
  assert.deepEqual(placeOp(base, "nao-existe", { x: 4, y: 0 }), base);
  const worn = applyInventoryMutation(base, "toggle_equip", { itemId: "escudo" });
  assert.equal("x" in byLabel(placeOp(worn, "escudo", { x: 4, y: 0 })).Escudo, false);
});

test("rot troca w↔h no cálculo; em item quadrado é ignorado", () => {
  let sheet = placeOp(sheetWith("Espada", "Escudo"), "espada", { x: 7, y: 0, rot: true });
  assert.deepEqual(spot(byLabel(sheet).Espada), { x: 7, y: 0, rot: true }, "1×3 girada ocupa 3×1 e cabe de x=7 a 9");
  const placed = inventory.layoutBackpack(listInventoryItems(sheet.inventory_orset)).placements.find((p) => p.id === "espada");
  assert.deepEqual([placed.w, placed.h], [3, 1]);
  assert.equal(byLabel(placeOp(sheet, "espada", { x: 8, y: 0, rot: true })).Espada.x, 7, "girada em x=8 sai da grade: fica onde estava");
  sheet = placeOp(sheet, "escudo", { x: 0, y: 0, rot: true });
  assert.deepEqual(spot(byLabel(sheet).Escudo), { x: 0, y: 0, rot: undefined }, "2×2 não guarda rot");
});

test("organize grava x/y de todos pelo first-fit e tira a posição de quem não coube", () => {
  const sheet = applyInventoryMutation(sheetWith("Poção", "Armadura", "Espada"), "organize", {});
  const expected = organizeBackpack(listInventoryItems(sheet.inventory_orset)).placements;
  assert.equal(expected.length, 3);
  for (const p of expected) assert.deepEqual(spot(sheet.inventory_orset[p.id]), { x: p.x, y: p.y, rot: undefined });
  let full = {};
  for (let i = 0; i < 5; i += 1) full = applyInventoryMutation(full, "add", { label: `Baú ${i}`, w: 4, h: 4 });
  const packed = applyInventoryMutation(full, "organize", {});
  assert.equal(Object.values(packed.inventory_orset).filter((i) => "x" in i).length, 2, "só 2 baús 4×4 cabem em 10×4");
});

test("layoutBackpack: posição guardada vale, colisão perde a posição só no cálculo, o resto entra por first-fit", () => {
  assert.equal(typeof inventory.layoutBackpack, "function");
  const items = [item("a", "Escudo", { x: 2, y: 0 }), item("b", "Elmo", { x: 3, y: 1 }), item("c", "Poção"), item("d", "Anel")];
  const { placements, overflow } = inventory.layoutBackpack(items);
  const at = Object.fromEntries(placements.map((p) => [p.id, [p.x, p.y]]));
  assert.deepEqual(at.a, [2, 0], "id menor entra primeiro com a posição guardada");
  assert.notDeepEqual(at.b, [3, 1], "b colide com a e perde a posição");
  assert.deepEqual(at.b, [0, 0], "o 2×2 que perdeu a posição entra por first-fit, antes dos 1×1 (maior área)");
  assert.deepEqual([at.d, at.c], [[4, 0], [5, 0]], "sem posição: first-fit nas células livres, por nome");
  assert.deepEqual(overflow, []);
  assert.equal(items[1].x, 3, "o cálculo não altera a entrada");
  assert.deepEqual(inventory.layoutBackpack([...items].reverse()), { placements, overflow }, "mesma entrada, qualquer ordem, mesma saída");
});

test("layoutBackpack sem posições guardadas é igual ao organizar de antes (ficha antiga)", () => {
  assert.equal(typeof inventory.layoutBackpack, "function");
  const items = [item("p", "Poção"), item("a", "Armadura"), item("e", "Espada"), item("m", "Machado"), item("d", "Adaga")];
  const layout = inventory.layoutBackpack(items);
  const legacy = organizeBackpack(items);
  const byId = (a, b) => a.id.localeCompare(b.id);
  assert.equal(layout.placements.length, 5);
  assert.deepEqual([...layout.placements].sort(byId).map(({ id, x, y, w, h }) => ({ id, x, y, w, h })), [...legacy.placements].sort(byId));
  assert.deepEqual(layout.overflow, legacy.overflow);
});

test("equipar tira a posição; desequipar volta a 'sem posição'", () => {
  let sheet = placeOp(sheetWith("Escudo"), "escudo", { x: 4, y: 1 });
  assert.equal(byLabel(sheet).Escudo.x, 4);
  sheet = applyInventoryMutation(sheet, "toggle_equip", { itemId: "escudo" });
  sheet = applyInventoryMutation(sheet, "toggle_equip", { itemId: "escudo" });
  assert.equal("x" in byLabel(sheet).Escudo, false);
});

test("x/y inválidos já guardados caem na leitura (item volta a 'sem posição')", () => {
  const raw = { a: item("a", "Escudo", { x: 9, y: 0 }), b: item("b", "Poção", { x: "3", y: 0 }), c: item("c", "Anel", { x: 1, y: 1 }) };
  const out = byLabel({ inventory_orset: raw });
  assert.equal("x" in out.Escudo, false, "2×2 em x=9 não cabe");
  assert.equal("x" in out.Poção, false, "x não numérico");
  assert.deepEqual(spot(out.Anel), { x: 1, y: 1, rot: undefined });
});

test("o reducer revalida: place que colide não grava e o válido seguinte vale", () => {
  let n = 0;
  const reduce = (state, payload) => {
    const op = createVttOp({ opId: `op-${n += 1}`, type: "INVENTORY_MUTATE", lamport: n, actor: "vx_gm", ts: 1_700_000_000, payload: { sheetId: "s1", kind: "place", ...payload } });
    return CAMPAIGN_OP_HANDLERS.INVENTORY_MUTATE(state, op);
  };
  let state = { ...createCampaign({ id: "c1" }), sheetsById: { s1: sheetWith("Escudo", "Elmo") } };
  state = reduce(state, { itemId: "escudo", x: 4, y: 0 });
  state = reduce(state, { itemId: "elmo", x: 5, y: 1 });
  state = reduce(state, { itemId: "elmo", x: 6, y: 0 });
  const items = byLabel(state.sheetsById.s1);
  assert.deepEqual([items.Escudo.x, items.Elmo.x], [4, 6]);
});

test(".voxchar leva x/y/rot da mochila e a ficha importada guarda o item no mesmo lugar", async () => {
  const src = createDungeonSessionState();
  await updateSheetBasicInfo(src, { name: "Kael", class_name: "Mago" });
  await mutateSheetInventory(src, "add", { label: "Espada", qty: 1 });
  await mutateSheetInventory(src, "place", { itemId: "espada", x: 7, y: 0, rot: true });
  const artifact = exportVoxchar(src.sheet);
  const file = JSON.parse(new TextDecoder().decode(artifact.bytes));
  assert.deepEqual(spot(file.sheet.inventory_orset.espada), { x: 7, y: 0, rot: true });
  const dst = createDungeonSessionState();
  assert.equal((await importVoxchar(dst, { bytes: artifact.bytes })).ok, true);
  assert.deepEqual(spot(Object.values(dst.sheet.inventory_orset).find((i) => i.label === "Espada")), { x: 7, y: 0, rot: true });
});
