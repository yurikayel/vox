/**
 * @file Ficha em abas (spec da ficha §5.1/§5.2): quatro abas, "Mais usados" e "Todos os testes" a partir das ações
 * existentes, só botões que o controlador já trata, aba que sobrevive ao redesenho e CSS de duas colunas.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderSheetScreen } from "../client/js/dungeon/screen-sheet.js";
import { SHEET_TABS, pickMostUsed, renderSheetTabs, splitSheetActions } from "../client/js/dungeon/screen-sheet-tabs.js";
import { captureUiViewState, restoreUiViewState } from "../client/js/dungeon/dungeon-dom-focus.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";

const css = readFileSync(new URL("../client/css/dungeon-layout.css", import.meta.url), "utf8");
const actions = [
  { id: "a1", label: "Espada", roll: "1d20+@for", damage: "1d8", tag: "ataque" },
  { id: "s1", label: "Furtividade", roll: "1d20+@des", damage: "", tag: "pericia" },
  { id: "s2", label: "Percepção", roll: "1d20+@sab", damage: "", tag: "pericia" },
  { id: "h1", label: "Golpe Furioso", roll: "1d20+@for", damage: "2d6", tag: "poder" },
];

function sheetState() {
  const state = createDungeonSessionState();
  state.sheet.sheet_meta = { ...(state.sheet.sheet_meta || {}), clickable_actions: actions };
  return state;
}

test("abas: Jogar, Habilidades, Itens e Sobre, com Jogar aberta por padrão", () => {
  assert.deepEqual(SHEET_TABS.map((t) => t.label), ["Jogar", "Habilidades", "Itens", "Sobre"]);
  const html = renderSheetTabs({ play: "P", abilities: "H", items: "I", about: "S" });
  assert.equal((html.match(/type="radio"/g) || []).length, 4);
  assert.match(html, /id="sheet-tab-play"[^>]*checked/);
  assert.doesNotMatch(html, /id="sheet-tab-items"[^>]*checked/);
  assert.match(renderSheetTabs({}, "items"), /id="sheet-tab-items"[^>]*checked/);
  assert.match(renderSheetTabs({}, "inexistente"), /id="sheet-tab-play"[^>]*checked/);
});

test("abas: 'Mais usados' põe ataques antes das perícias e 'Todos os testes' lista as perícias", () => {
  assert.deepEqual(splitSheetActions(actions).skills.map((a) => a.id), ["s1", "s2"]);
  assert.deepEqual(pickMostUsed(actions).map((a) => a.id), ["a1", "h1", "s1", "s2"]);
  assert.equal(pickMostUsed(actions, 2).length, 2);
  const html = renderSheetScreen(sheetState());
  const play = html.slice(html.indexOf("is-play"), html.indexOf("is-abilities"));
  assert.match(play, /Mais usados/);
  assert.match(play, /Todos os testes/);
  assert.match(play, /Furtividade/);
  assert.match(html.slice(html.indexOf("is-abilities"), html.indexOf("is-items")), /Golpe Furioso/);
});

test("abas: só usa botões que o controlador já trata", () => {
  const html = renderSheetScreen(sheetState());
  const used = new Set([...html.matchAll(/data-dungeon="([a-z0-9-]+)"/g)].map((m) => m[1]));
  const known = readFileSync(new URL("../client/js/dungeon/dungeon-controller-actions.js", import.meta.url), "utf8");
  const submit = new Set(["add-action-form", "add-item-form", "edit-sheet-form"]);
  for (const name of used) assert.ok(known.includes(`"${name}"`) || submit.has(name), `sem tratador para ${name}`);
});

test("abas: a aba escolhida sobrevive ao redesenho", () => {
  const radios = SHEET_TABS.map((t) => ({ id: `sheet-tab-${t.id}`, checked: t.id === "items" }));
  const container = {
    querySelectorAll: (sel) => (sel.includes("data-dungeon-tab") ? radios : []),
    querySelector: () => null,
    ownerDocument: {},
  };
  const snap = captureUiViewState(container);
  radios.forEach((r) => { r.checked = r.id === "sheet-tab-play"; });
  restoreUiViewState(container, snap);
  assert.deepEqual(radios.filter((r) => r.checked).map((r) => r.id), ["sheet-tab-items"]);
});

test("abas: CSS com duas colunas no desktop e só o painel da aba marcada visível", () => {
  assert.match(css, /@media \(min-width: 900px\)[^}]*\.dungeon-sheet-layout[^}]*grid-template-columns/s);
  assert.match(css, /\.dungeon-sheet-tab-panel \{ display: none; \}/);
  for (const t of SHEET_TABS) assert.match(css, new RegExp(`#sheet-tab-${t.id}:checked ~ \.dungeon-sheet-tab-panels \.is-${t.id}`));
});
