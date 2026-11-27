/**
 * @file Ficha em abas (spec da ficha §5.1/§5.2): quatro abas, "Mais usados" e "Todos os testes" a partir das ações
 * existentes, só botões que o controlador já trata, aba que sobrevive ao redesenho e CSS de duas colunas.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderSheetScreen } from "../client/js/dungeon/screen-sheet.js";
import { SHEET_TABS, pickMostUsed, renderPlayTab, renderSheetTabs, splitSheetActions } from "../client/js/dungeon/screen-sheet-tabs.js";
import { captureUiViewState, restoreUiViewState } from "../client/js/dungeon/dungeon-dom-focus.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";

const css = readFileSync(new URL("../client/css/dungeon-layout.css", import.meta.url), "utf8");
const actions = [
  { id: "a1", label: "Espada", roll: "1d20+@for", damage: "1d8", tag: "ataque" },
  { id: "act-furtividade", label: "Furtividade", roll: "1d20+@des", damage: "", tag: "pericia" },
  { id: "s2", label: "Percepção", roll: "1d20+@sab", damage: "", tag: "pericia" },
  { id: "h1", label: "Golpe Furioso", roll: "1d20+@for", damage: "2d6", tag: "poder" },
  { id: "s3", label: "Ofício de Forja", roll: "1d20+@int", damage: "", tag: "pericia" },
];

function sheetState() {
  const state = createDungeonSessionState();
  state.sheet.sheet_meta = { ...(state.sheet.sheet_meta || {}), clickable_actions: actions };
  return state;
}

const panel = (html, id) => {
  const open = `<div class="dungeon-sheet-tab-panel is-${id}">`;
  const start = html.indexOf(open);
  assert.ok(start >= 0, `painel ${id} ausente`);
  const next = html.indexOf('<div class="dungeon-sheet-tab-panel is-', start + open.length);
  return html.slice(start, next === -1 ? html.length : next);
};
const beforeTabs = (html) => html.slice(0, html.indexOf('<div class="dungeon-sheet-tabs">'));

test("abas: Jogar, Habilidades, Itens e Sobre, com Jogar aberta por padrão", () => {
  assert.deepEqual(SHEET_TABS.map((t) => t.label), ["Jogar", "Habilidades", "Itens", "Sobre"]);
  const html = renderSheetTabs({ play: "P", abilities: "H", items: "I", about: "S" });
  assert.equal((html.match(/<input type="radio"/g) || []).length, 4);
  assert.match(html, /<input type="radio" class="dungeon-sheet-tab-input" name="sheet-tab" id="sheet-tab-play" data-dungeon-tab="play" checked \/>/);
  assert.equal((html.match(/ checked \/>/g) || []).length, 1);
  assert.match(renderSheetTabs({}, "items"), /id="sheet-tab-items" data-dungeon-tab="items" checked \/>/);
  assert.match(renderSheetTabs({}, "inexistente"), /id="sheet-tab-play" data-dungeon-tab="play" checked \/>/);
  for (const t of SHEET_TABS) assert.match(html, new RegExp(`<label class="dungeon-sheet-tab-label" for="sheet-tab-${t.id}">${t.label}</label>`));
});

test("abas: 'Mais usados' põe ataques antes das perícias e 'Todos os testes' lista as perícias", () => {
  assert.deepEqual(splitSheetActions(actions).skills.map((a) => a.id), ["act-furtividade", "s2", "s3"]);
  assert.deepEqual(pickMostUsed(actions).map((a) => a.id), ["a1", "h1", "act-furtividade", "s2", "s3"]);
  assert.equal(pickMostUsed(actions, 2).length, 2);
  const html = renderSheetScreen(sheetState());
  const play = panel(html, "play");
  assert.match(play, /<h3 class="dungeon-eyebrow">Mais usados<\/h3>/);
  assert.match(play, /<h3 class="dungeon-eyebrow">Todos os testes<\/h3>/);
  assert.ok(play.indexOf("Mais usados") < play.indexOf("Todos os testes"));
  assert.match(play, /data-dungeon="roll-skill" data-skill="[a-z]+"[^>]*><strong>Furtividade<\/strong>/);
  assert.doesNotMatch(play, /data-dungeon="roll-action" data-action-id="act-furtividade"/);
  const [mostUsed, allTests] = play.split('<h3 class="dungeon-eyebrow">Todos os testes</h3>');
  const forge = /data-dungeon="roll-action" data-action-id="s3"><strong>Ofício de Forja<\/strong>/;
  assert.match(mostUsed, forge);
  assert.match(allTests, forge);
  assert.doesNotMatch(play, /data-dungeon="remove-action"/);
  assert.match(panel(html, "abilities"), /data-dungeon="roll-action" data-action-id="h1"><strong>Golpe Furioso<\/strong>/);
  assert.match(panel(html, "abilities"), /data-dungeon="remove-action" data-action-id="h1"/);
});

test("abas: a aba Jogar tolera ações que não sejam lista", () => {
  for (const bad of [undefined, null, {}, "texto"]) {
    assert.doesNotThrow(() => renderPlayTab(bad, []), `renderPlayTab(${JSON.stringify(bad)})`);
    assert.match(renderPlayTab(bad, []), /Nada cadastrado ainda nesta ficha\./);
  }
});

test("abas: modo de rolagem, aviso de resultado ou erro e 'Subir de Nível' ficam fora das abas, sempre à vista", () => {
  const html = renderSheetScreen({ ...sheetState(), rollError: "Fórmula inválida", lastFormulaRoll: null });
  const top = beforeTabs(html);
  assert.equal((top.match(/data-dungeon="roll-mode"/g) || []).length, 3);
  assert.match(top, /<p class="dungeon-alert-warn" role="alert">Fórmula inválida<\/p>/);
  assert.match(top, /<button type="button" class="dungeon-btn dungeon-btn-secondary" data-dungeon="level-up-open">Subir de Nível<\/button>/);
  for (const id of ["play", "abilities", "items", "about"]) {
    const body = panel(html, id);
    assert.doesNotMatch(body, /data-dungeon="roll-mode"/);
    assert.doesNotMatch(body, /role="alert"/);
    assert.doesNotMatch(body, /data-dungeon="level-up-open"/);
  }
  const ok = renderSheetScreen({ ...sheetState(), lastFormulaRoll: { ok: true, label: "Furtividade", total: 17 } });
  assert.match(beforeTabs(ok), /<p class="dungeon-inline-status" role="status">Última rolagem \(Furtividade\): <strong>17<\/strong><\/p>/);
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
  assert.match(css, /@media \(min-width: 1024px\) \{\s*\.dungeon-sheet-layout \{[^}]*grid-template-columns/);
  assert.match(css, /\.dungeon-sheet-tab-panel \{ display: none; \}/);
  for (const t of SHEET_TABS) {
    assert.match(css, new RegExp(String.raw`#sheet-tab-${t.id}:checked ~ \.dungeon-sheet-tab-panels \.is-${t.id}`));
    assert.match(css, new RegExp(String.raw`#sheet-tab-${t.id}:focus-visible ~ \.dungeon-sheet-tab-list \[for="sheet-tab-${t.id}"\]`));
  }
  assert.doesNotMatch(css, /\.dungeon-sheet-tab-input:focus-visible ~ \.dungeon-sheet-tab-list label/);
});
