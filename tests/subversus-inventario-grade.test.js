/**
 * @file Inventário em grade 10×4 (ficha-personagem-brainstorm §5.4): tamanhos, "Organizar" determinístico,
 * campos w/h opcionais e retrocompatíveis, carga com motivo e a renderização com as ações já existentes.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { applyInventoryMutation, defaultItemSize, itemSize, listInventoryItems, organizeBackpack } from "../client/js/dungeon/vtt-inventory.js";
import { buildLoadView } from "../client/js/dungeon/sheet-view-model.js";
import { renderInventoryPanel } from "../client/js/dungeon/screen-sheet-inventory.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { renderSheetScreen } from "../client/js/dungeon/screen-sheet.js";

const item = (id, label, extra = {}) => ({ id, label, qty: 1, weightLb: 0, equipped: false, ...extra });

test("tamanho padrão pelo nome segue a tabela da spec (sem acento, sem maiúscula)", () => {
  const sizes = Object.fromEntries(["Poção de Cura", "Adaga", "Espada Longa", "Lança", "Arco Longo", "Escudo", "Armadura de Couro", "Corda"].map((l) => [l, defaultItemSize({ label: l })]));
  assert.deepEqual(sizes["Poção de Cura"], { w: 1, h: 1 });
  assert.deepEqual(sizes.Adaga, { w: 1, h: 2 });
  assert.deepEqual(sizes["Espada Longa"], { w: 1, h: 3 });
  assert.deepEqual(sizes["Lança"], { w: 1, h: 4 });
  assert.deepEqual(sizes["Arco Longo"], { w: 1, h: 4 });
  assert.deepEqual(sizes.Escudo, { w: 2, h: 2 });
  assert.deepEqual(sizes["Armadura de Couro"], { w: 2, h: 3 });
  assert.deepEqual(sizes.Corda, { w: 1, h: 1 }, "nome desconhecido ocupa uma célula");
});

test("w/h opcionais: ausentes não aparecem, inválidos são descartados, válidos mandam sobre o padrão", () => {
  let sheet = applyInventoryMutation({}, "add", { label: "Espada", qty: 1 });
  assert.equal("w" in listInventoryItems(sheet.inventory_orset)[0], false, "ficha antiga segue igual");
  sheet = applyInventoryMutation(sheet, "add", { label: "Baú", w: 3, h: 2 });
  sheet = applyInventoryMutation(sheet, "add", { label: "Bolsa", w: 99, h: 0 });
  const byLabel = Object.fromEntries(listInventoryItems(sheet.inventory_orset).map((it) => [it.label, it]));
  assert.deepEqual(itemSize(byLabel["Baú"]), { w: 3, h: 2 });
  assert.equal("w" in byLabel.Bolsa, false);
  assert.deepEqual(itemSize(byLabel.Espada), { w: 1, h: 3 });
});

test("organizar: maior área primeiro, desempate por altura e depois por nome, esquerda→direita, cima→baixo", () => {
  const items = [item("p", "Poção"), item("a", "Armadura"), item("e", "Espada"), item("m", "Machado"), item("d", "Adaga")];
  const { placements, overflow } = organizeBackpack(items);
  assert.deepEqual(overflow, []);
  assert.deepEqual(placements.map((p) => [p.id, p.x, p.y, p.w, p.h]), [
    ["a", 0, 0, 2, 3],
    ["e", 2, 0, 1, 3],
    ["m", 3, 0, 1, 3],
    ["d", 4, 0, 1, 2],
    ["p", 5, 0, 1, 1],
  ]);
});

test("organizar: o resultado não depende da ordem de entrada e não guarda estado", () => {
  const items = [item("1", "Tocha"), item("2", "Escudo"), item("3", "Anel"), item("4", "Cajado"), item("5", "Elmo")];
  const first = organizeBackpack(items);
  assert.deepEqual(organizeBackpack([...items].reverse()), first);
  assert.deepEqual(organizeBackpack(items), first);
});

test("organizar: equipado fica fora da grade, e o que não cabe volta em `overflow`", () => {
  const worn = item("w", "Armadura", { equipped: true });
  assert.deepEqual(organizeBackpack([worn]).placements, []);
  const armors = Array.from({ length: 6 }, (_, i) => item(`a${i}`, `Armadura ${i}`));
  const { placements, overflow } = organizeBackpack(armors, { cols: 4, rows: 3 });
  assert.equal(placements.length, 2, "uma grade 4×3 comporta duas armaduras 2×3");
  assert.equal(overflow.length, 4);
  const cells = new Set(placements.flatMap((p) => Array.from({ length: p.w * p.h }, (_, i) => `${p.x + (i % p.w)},${p.y + Math.floor(i / p.w)}`)));
  assert.equal(cells.size, 12, "nenhuma célula é usada duas vezes");
});

test("carga: acima do limite marca excesso com o motivo; sem Força o limite é desconhecido", () => {
  const sheet = { attributes_lww: { abilities: { str: 10 } } };
  const light = buildLoadView(sheet, [{ weightLb: 10, qty: 1 }]);
  assert.equal(light.over, false);
  assert.match(light.reason, /Dentro do limite de 68,0 kg \(Força 10 × 15 lb, regra do D&D\)/);
  const heavy = buildLoadView(sheet, [{ weightLb: 200, qty: 1 }]);
  assert.equal(heavy.over, true);
  assert.match(heavy.reason, /Carga de 90,7 kg acima do limite de 68,0 kg/);
  const unknown = buildLoadView({}, [{ weightLb: 999, qty: 1 }]);
  assert.equal(unknown.over, false);
  assert.equal(unknown.limitText, "—");
  assert.match(unknown.reason, /não tem Força/);
});

function sessionWith(items) {
  const state = createDungeonSessionState({});
  state.sheet.inventoryItems = items;
  return state;
}

test("tela: grade 10×4 com botões de equipar existentes, equipados à parte e carga com motivo", () => {
  const state = sessionWith([item("e", "Espada", { weightLb: 3 }), item("a", "Armadura", { equipped: true, weightLb: 20 })]);
  const html = renderInventoryPanel(state);
  assert.match(html, /aria-label="Mochila 10 por 4"/);
  assert.match(html, /style="grid-column:1 \/ span 1;grid-row:1 \/ span 3"[^>]*data-dungeon="inv-equip" data-item-id="e"/);
  assert.match(html, /aria-label="Equipado"[\s\S]*Desequipar Armadura/);
  assert.match(html, /data-dungeon="inv-remove" data-item-id="e"/);
  assert.match(html, /class="dungeon-load"[^>]*>.*Dentro do limite/s);
  assert.match(html, /Inventário compartilhado/);
});

test("tela: carga acima do limite fica vermelha com o motivo, e o que não coube é dito", () => {
  const many = Array.from({ length: 8 }, (_, i) => item(`ar${i}`, `Armadura ${i}`, { weightLb: 80 }));
  const html = renderInventoryPanel(sessionWith(many));
  assert.match(html, /class="dungeon-load is-over"/);
  assert.match(html, /acima do limite/);
  assert.match(html, /Não coube na mochila \(10×4\): /);
});

test("tela: mochila vazia, nomes escapados e a ficha usa o novo painel", () => {
  assert.match(renderInventoryPanel(sessionWith([])), /Mochila vazia — adicione itens acima/);
  const html = renderInventoryPanel(sessionWith([item("x", "<b>x</b>")]));
  assert.doesNotMatch(html, /<b>x/);
  assert.match(renderSheetScreen(createDungeonSessionState({})), /aria-label="Mochila 10 por 4"/);
});
