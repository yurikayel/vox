/**
 * @file Depois de redesenhar a mochila o foco volta ao mesmo botão que o tinha (WCAG 2.4.3): o seletor que
 * `captureUiViewState` grava tem de casar primeiro o próprio controle, e não o "Equipado" (chip) ou a célula da grade, que
 * têm o mesmo `data-dungeon` e `data-item-id`. O chip "Equipado" também diz o nome do item primeiro (2.5.3).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { renderInventoryPanel } from "../client/js/dungeon/screen-sheet-inventory.js";
import { captureUiViewState, restoreUiViewState } from "../client/js/dungeon/dungeon-dom-focus.js";

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

/** Contêiner falso da tela refeita: `querySelector` acha o 1º botão, em ordem de DOM, com todos os `[attr="valor"]`. */
function telaRefeita(html) {
  const els = botoes(html).filter((b) => b.attrs["data-dungeon"]).map((b) => ({ ...b, focused: 0, focus() { this.focused += 1; } }));
  return {
    els,
    querySelectorAll: () => [],
    querySelector: (sel) => {
      const pares = [...sel.matchAll(/\[([\w-]+)="([^"]*)"\]/g)].map((m) => [m[1], m[2]]);
      return els.find((e) => pares.every(([k, v]) => e.attrs[k] === v)) ?? null;
    },
  };
}

/** Grava o foco em `botao` da tela de `antes` e restaura na tela de `depois`: devolve os controles que receberam foco. */
function refazer(antes, depois, filtro) {
  const botao = botoes(renderInventoryPanel({ sheet: { inventoryItems: antes } })).find(filtro);
  assert.ok(botao, "o controle focado existe na tela de antes");
  const snap = { focusSel: seletorDoFoco({ id: "", dataset: botao.dataset }) };
  const tela = telaRefeita(renderInventoryPanel({ sheet: { inventoryItems: depois } }));
  restoreUiViewState(tela, snap);
  return tela.els.filter((e) => e.focused > 0);
}

const DESEQUIPADOS = ITENS.map((i) => ({ ...i, equipped: false }));
const doItem = (id, zona) => (b) => b.attrs["data-dungeon"] === "inv-equip" && b.attrs["data-item-id"] === id && b.dataset.focusZone === zona;

test("equipar pela célula da grade: a célula some e o foco vai ao mesmo item em outra zona, não ao body", () => {
  const depois = ITENS.map((i) => (i.id === "i2" ? { ...i, equipped: true } : i));
  const focados = refazer(DESEQUIPADOS, depois, doItem("i2", "mochila"));
  assert.equal(focados.length, 1, "um controle recebe o foco");
  assert.equal(focados[0].attrs["data-item-id"], "i2", "é o mesmo item");
  assert.equal(focados[0].attrs["data-dungeon"], "inv-equip");
});

test("desequipar pelo chip Equipado: o chip some e o foco vai ao mesmo item em outra zona, não ao body", () => {
  const focados = refazer(ITENS, DESEQUIPADOS, doItem("i1", "equipado"));
  assert.equal(focados.length, 1, "um controle recebe o foco");
  assert.equal(focados[0].attrs["data-item-id"], "i1", "é o mesmo item");
  assert.equal(focados[0].attrs["data-dungeon"], "inv-equip");
});

test("com o controle ainda na zona, o foco fica nele e a reserva não entra", () => {
  const focados = refazer(DESEQUIPADOS, DESEQUIPADOS, doItem("i2", "linha"));
  assert.deepEqual(focados.map((e) => e.dataset.focusZone), ["linha"], "o botão da linha, não a célula da grade que vem antes no DOM");
});

test("se o item sumiu da tela, nada quebra e ninguém recebe o foco", () => {
  const focados = refazer(ITENS, ITENS.filter((i) => i.id !== "i2"), doItem("i2", "linha"));
  assert.deepEqual(focados, []);
});
