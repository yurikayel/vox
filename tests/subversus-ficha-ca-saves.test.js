/**
 * @file Ficha com o pacote 5e: CA pela armadura equipada (campo opcional `armor`), salvaguardas e
 * especialização editáveis, Deslocamento e testes contra a morte. Fichas e itens antigos não mudam.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { markSheetDeathSave } from "../client/js/dungeon/dungeon-persistence-sheet-system.js";
import { updateSheetBasicInfo, mutateSheetInventory } from "../client/js/dungeon/dungeon-persistence.js";
import { renderDerivedStrip, renderSystemEditFields, resolveSheetSystem } from "../client/js/dungeon/screen-sheet-derived.js";
import { renderInventoryPanel } from "../client/js/dungeon/screen-sheet-inventory.js";
import { PACK_5E as pack } from "../client/js/dungeon/system-pack-5e.js";
import { armorClassFromItems, deathSaveStatus, markDeathSave, normalizeChoices } from "../client/js/dungeon/system-derive.js";
import { applyInventoryMutation, normalizeInventoryOrset } from "../client/js/dungeon/vtt-inventory.js";

const legacy = () => JSON.parse(readFileSync(new URL("./fixtures/ficha-lyra-legado.json", import.meta.url), "utf8"));
const worn = (kind, ac) => ({ id: `${kind}-${ac}`, label: kind, qty: 1, equipped: true, armor: { kind, ac } });

test("CA: leve soma DES, média limita DES a 2, pesada ignora DES, escudo soma", () => {
  assert.equal(armorClassFromItems(pack, [worn("leve", 11)], 4).armorClass, 15);
  assert.equal(armorClassFromItems(pack, [worn("media", 14)], 4).armorClass, 16);
  assert.equal(armorClassFromItems(pack, [worn("media", 14)], 1).armorClass, 15);
  assert.equal(armorClassFromItems(pack, [worn("pesada", 18)], 4).armorClass, 18);
  assert.equal(armorClassFromItems(pack, [worn("pesada", 18), worn("escudo", 2)], -1).armorClass, 20);
  assert.equal(armorClassFromItems(pack, [worn("leve", 11)], -2).armorClass, 9, "DES negativo reduz a leve");
});

test("CA: só equipado conta, uma armadura de corpo (a maior) e um escudo; sem armadura vale 10 + DES", () => {
  const off = { ...worn("pesada", 18), equipped: false };
  assert.deepEqual(armorClassFromItems(pack, [off], 2), { armorClass: 12, worn: false });
  assert.equal(armorClassFromItems(pack, [worn("leve", 11), worn("pesada", 16)], 3).armorClass, 16);
  assert.equal(armorClassFromItems(pack, [worn("escudo", 2), worn("escudo", 3)], 0).armorClass, 12, "um escudo só: o primeiro");
  assert.equal(armorClassFromItems(pack, [worn("escudo", 2)], 2).armorClass, 14, "escudo sozinho soma à base");
});

test("CA: tipo desconhecido, CA inválida e lixo no inventário não quebram", () => {
  assert.equal(armorClassFromItems(pack, [worn("mithril", 20), null, {}], 1).armorClass, 11);
  assert.equal(armorClassFromItems(pack, [worn("pesada", 999)], 0).armorClass, 30, "CA limitada ao teto do pacote");
  assert.equal(armorClassFromItems(pack, undefined, 0).armorClass, 10);
});

test("item antigo sem armor: a CA não muda, equipado ou não", () => {
  const sheet = legacy();
  const before = resolveSheetSystem(sheet).derived.armorClass;
  sheet.inventory_orset = { tocha: { id: "tocha", label: "Tocha", qty: 1, equipped: true }, cota: { id: "cota", label: "Cota de malha", qty: 1, equipped: true } };
  const sys = resolveSheetSystem(sheet);
  assert.equal(sys.derived.armorClass, before);
  assert.equal(sys.derived.armored, false);
  assert.match(renderDerivedStrip(sheet), /<dt>CA sem armadura<\/dt>/);
  assert.equal("armor" in normalizeInventoryOrset(sheet.inventory_orset).cota, false);
});

test("item com armor: normaliza, vira CA derivada na faixa e no cabeçalho, e o CA salvo fica intocado", async () => {
  const state = createDungeonSessionState();
  await updateSheetBasicInfo(state, { name: "Kael", dex: 14, armor_class: 12 });
  await mutateSheetInventory(state, "add", { label: "Cota", qty: 1, weightLb: 20, armor: { kind: "media", ac: 14 } });
  const id = state.sheet.inventoryItems.find((i) => i.label === "Cota").id;
  assert.deepEqual(state.sheet.inventoryItems.find((i) => i.id === id).armor, { kind: "media", ac: 14 });
  assert.match(renderDerivedStrip(state.sheet), /<dt>CA sem armadura<\/dt><dd>12<\/dd>/, "desequipada: nada muda");
  await mutateSheetInventory(state, "toggle_equip", { itemId: id });
  assert.match(renderDerivedStrip(state.sheet), /<dt>CA<\/dt><dd>16<\/dd>/);
  assert.equal(state.sheet.attributes_lww.armor_class, 12, "a CA digitada continua guardada");
});

test("item: armor inválido é descartado na normalização", () => {
  const inv = applyInventoryMutation({}, "add", { label: "X", armor: { kind: "", ac: 12 } }).inventory_orset;
  assert.equal("armor" in inv.x, false);
  const bad = applyInventoryMutation({}, "add", { label: "Y", armor: { kind: "leve", ac: "abc" } }).inventory_orset;
  assert.equal("armor" in bad.y, false);
});

test("formulário de item mostra o campo Armadura com os tipos do pacote", () => {
  const html = renderInventoryPanel({ sheet: { ...legacy(), inventoryItems: [] } });
  for (const label of ["Armadura leve", "Armadura média", "Armadura pesada", "Escudo"]) assert.ok(html.includes(label), label);
  assert.match(html, /name="itemArmorAc"/);
});

test("salvaguardas e especialização: salvar grava, especialização só vale em perícia treinada", async () => {
  const state = createDungeonSessionState();
  await updateSheetBasicInfo(state, { name: "Kael", proficientSaves: ["str", "zzz"], expertSkills: ["perception", "arcana"], speedFt: 25 });
  assert.deepEqual(state.sheet.system_choices.proficientSaves, ["str"]);
  assert.equal(state.sheet.attributes_lww.speed_ft, 25);
  assert.match(renderDerivedStrip(state.sheet), /<dt>Deslocamento<\/dt><dd>7,5 m<\/dd>/);
  await updateSheetBasicInfo(state, { name: "Kael" });
  assert.deepEqual(state.sheet.system_choices.proficientSaves, ["str"], "sem listas no formulário, nada muda");
  assert.equal(state.sheet.attributes_lww.speed_ft, 25);
  await updateSheetBasicInfo(state, { proficientSaves: [], speedFt: 9999 });
  assert.deepEqual(state.sheet.system_choices.proficientSaves, []);
  assert.equal(state.sheet.attributes_lww.speed_ft, 200, "limitado ao teto do pacote");
});

test("campos do Editar: salvaguardas, especialização (desabilitada sem treino) e Deslocamento", () => {
  const html = renderSystemEditFields(legacy());
  assert.match(html, /name="speedFt"[^>]*value="30"/);
  assert.match(html, /name="saveProf" value="str"/);
  assert.match(html, /name="expertSkill" value="perception"(?! disabled)/);
  assert.match(html, /name="expertSkill" value="arcana" disabled/);
});

test("testes contra a morte: marcas, limites, estado e zerar", () => {
  assert.deepEqual(deathSaveStatus(pack, { successes: 3, failures: 1 }).status, "stable");
  assert.equal(deathSaveStatus(pack, { successes: 1, failures: 3 }).status, "dead");
  assert.equal(deathSaveStatus(pack, undefined).status, "dying");
  let s = { successes: 2, failures: 0 };
  s = markDeathSave(pack, s, "success");
  s = markDeathSave(pack, s, "success");
  assert.equal(s.successes, 3, "não passa do máximo");
  assert.deepEqual(markDeathSave(pack, s, "reset"), { successes: 0, failures: 0 });
  assert.deepEqual(normalizeChoices(pack, { deathSaves: { successes: -4, failures: "x" } }).deathSaves, { successes: 0, failures: 0 });
});

test("testes contra a morte: persiste na ficha, e o bloco só aparece com 0 PV ou com marcas", async () => {
  const state = createDungeonSessionState();
  await updateSheetBasicInfo(state, { name: "Kael" });
  assert.equal(renderDerivedStrip(state.sheet, 8).includes('data-dungeon="death-save"'), false);
  assert.ok(renderDerivedStrip(state.sheet, 0).includes('data-kind="failure"'));
  await markSheetDeathSave(state, "failure");
  await markSheetDeathSave(state, "failure");
  assert.deepEqual(state.sheet.system_choices.deathSaves, { successes: 0, failures: 2 });
  assert.match(renderDerivedStrip(state.sheet, 8), /Falhas 2\/3/);
  await markSheetDeathSave(state, "reset");
  assert.deepEqual(state.sheet.system_choices.deathSaves, { successes: 0, failures: 0 });
  assert.equal(await markSheetDeathSave({ sheet: null }, "success"), undefined);
});
