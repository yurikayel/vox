/**
 * @file Ficha → Ataques e Habilidades: depois do × de remover ação o botão some do DOM, então o foco vai para o título
 * do painel (`tabindex="-1"`) em vez de cair no body.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { renderAbilitiesPanel } from "../client/js/dungeon/screen-sheet.js";
import { FOCUS_AFTER_ACTION } from "../client/js/dungeon/dungeon-controller-actions.js";
import { restoreUiViewState } from "../client/js/dungeon/dungeon-dom-focus.js";

/** Contêiner falso: `querySelector(sel)` só acha o alvo se o HTML desenhado tiver o atributo do seletor. */
function containerFor(html, doc) {
  const alvo = { tag: "H2", focus() { doc.activeElement = this; } };
  const attr = /^\[([\w-]+)\]$/.exec("[data-actions-focus]")[1];
  return { querySelector: (sel) => (sel === `[${attr}]` && html.includes(attr) ? alvo : null), querySelectorAll: () => [] };
}

test("remover ação pede foco no título do painel, que existe e aceita foco por script", () => {
  const seletor = FOCUS_AFTER_ACTION["remove-action"];
  assert.equal(seletor, "[data-actions-focus]");
  const state = createDungeonSessionState();
  const html = renderAbilitiesPanel(state);
  assert.match(html, /<h2 tabindex="-1" data-actions-focus>Ataques e Habilidades<\/h2>/);
  assert.equal(html.match(/data-actions-focus/g).length, 1, "um só alvo");
});

test("depois do redesenho o foco está no título, não no body", () => {
  const doc = { activeElement: { tag: "BODY" } };
  const html = renderAbilitiesPanel(createDungeonSessionState());
  restoreUiViewState(containerFor(html, doc), {}, FOCUS_AFTER_ACTION["remove-action"]);
  assert.equal(doc.activeElement.tag, "H2");
});
