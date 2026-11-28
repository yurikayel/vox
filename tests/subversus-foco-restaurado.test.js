/**
 * @file Depois de redesenhar a mochila o foco volta ao mesmo botão que o tinha (WCAG 2.4.3): o seletor que
 * `captureUiViewState` grava tem de casar primeiro o próprio controle, e não o "Equipado" (chip) ou a célula da grade, que
 * têm o mesmo `data-dungeon` e `data-item-id`. O chip "Equipado" também diz o nome do item primeiro (2.5.3).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { renderInventoryPanel } from "../client/js/dungeon/screen-sheet-inventory.js";
import { captureUiViewState } from "../client/js/dungeon/dungeon-dom-focus.js";

const HOSTIL = `Tio "Z" <b>&co'`;
const ESC = "Tio &quot;Z&quot; &lt;b&gt;&amp;co&#39;";

/** Os `<button>` do HTML, em ordem de DOM, com atributos e `dataset` (`data-item-id` → `itemId`). */
function botoes(html) {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => {
    const attrs = Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]));
    const dataset = Object.fromEntries(Object.entries(attrs).filter(([k]) => k.startsWith("data-")).map(([k, v]) => [k.slice(5).replace(/-(\w)/g, (_x, c) => c.toUpperCase()), v]));
    return { attrs, dataset, visible: m[2].replace(/<[^>]*>/g, "").trim() };
  });
}

/** O botão que o `querySelector(sel)` acharia primeiro: o 1º, em ordem de DOM, com todos os `[attr="valor"]` do seletor. */
function primeiroQueCasa(lista, sel) {
  const pares = [...sel.matchAll(/\[([\w-]+)="([^"]*)"\]/g)].map((m) => [m[1], m[2]]);
  return lista.find((b) => pares.every(([k, v]) => b.attrs[k] === v));
}

/** O seletor de foco que `captureUiViewState` grava quando `ativo` tem o foco. */
function seletorDoFoco(ativo) {
  const container = { ownerDocument: { activeElement: ativo }, contains: () => true, querySelectorAll: () => [] };
  return captureUiViewState(container).focusSel;
}

const ITENS = [
  { id: "i1", label: HOSTIL, qty: 1, tags: [], equipped: true },
  { id: "i2", label: "Espada longa", qty: 2, tags: [], equipped: false },
  { id: "i3", label: "Corda", qty: 1, tags: [], equipped: false },
];

test("o foco gravado de cada botão da mochila volta a esse mesmo botão, não ao Equipado nem à grade", () => {
  const html = renderInventoryPanel({ sheet: { inventoryItems: ITENS, sheet_meta: { favorites: ["item:i1", "item:i3"] } } });
  const lista = botoes(html);
  const acionaveis = lista.filter((b) => b.attrs["data-dungeon"]);
  assert.ok(acionaveis.length >= 12, `achou os botões da mochila (${acionaveis.length})`);
  for (const b of acionaveis) {
    const sel = seletorDoFoco({ id: "", dataset: b.dataset });
    assert.equal(primeiroQueCasa(lista, sel), b, `o foco em ${b.attrs["aria-label"] ?? b.visible} (${sel}) volta ao próprio botão`);
  }
});

test("equipar tem três controles do mesmo item e cada um tem seletor próprio", () => {
  const html = renderInventoryPanel({ sheet: { inventoryItems: ITENS } });
  const doItem = botoes(html).filter((b) => b.attrs["data-dungeon"] === "inv-equip" && b.attrs["data-item-id"] === "i1");
  assert.equal(doItem.length, 2, "item equipado: o chip do Equipado e o botão da linha");
  assert.deepEqual(doItem.map((b) => b.dataset.focusZone), ["equipado", "linha"], "cada controle diz a zona em que está");
  assert.equal(new Set(doItem.map((b) => seletorDoFoco({ id: "", dataset: b.dataset }))).size, 2, "seletores diferentes");
  const naoEquipado = botoes(html).filter((b) => b.attrs["data-dungeon"] === "inv-equip" && b.attrs["data-item-id"] === "i2");
  assert.equal(new Set(naoEquipado.map((b) => seletorDoFoco({ id: "", dataset: b.dataset }))).size, naoEquipado.length, "célula da grade e botão da linha também");
  assert.deepEqual(naoEquipado.map((b) => b.dataset.focusZone), ["mochila", "linha"], "célula da grade e linha dizem a zona");
});

test("o chip Equipado diz o nome do item primeiro e a ação depois, escapado", () => {
  const html = renderInventoryPanel({ sheet: { inventoryItems: ITENS } });
  const chip = botoes(html).find((b) => b.attrs["data-dungeon"] === "inv-equip" && b.visible === ESC);
  assert.ok(chip, "há o chip do item equipado (texto visível = o nome do item)");
  const nome = chip.attrs["aria-label"];
  assert.ok(nome.startsWith(chip.visible), `o nome "${nome}" começa pelo texto visível "${chip.visible}" (2.5.3)`);
  assert.equal(nome, `${ESC}, desequipar`);
});
