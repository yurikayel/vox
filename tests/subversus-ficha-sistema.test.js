/**
 * @file Pacote de sistema plugado na ficha: derivados na aba Jogar, seletor de sistema no Editar, edição que
 * grava `system`/`system_choices` e deriva na hora, e fichas legadas exibidas sem gravar nada.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { renderSheetScreen } from "../client/js/dungeon/screen-sheet.js";
import { renderDerivedStrip, renderSystemSelect, resolveSheetSystem } from "../client/js/dungeon/screen-sheet-derived.js";
import { updateSheetBasicInfo } from "../client/js/dungeon/dungeon-persistence.js";

const legacy = () => JSON.parse(readFileSync(new URL("./fixtures/ficha-lyra-legado.json", import.meta.url), "utf8"));
const panel = (html, id) => {
  const open = `<div class="dungeon-sheet-tab-panel is-${id}">`;
  const start = html.indexOf(open);
  assert.ok(start >= 0, `painel ${id} ausente`);
  const next = html.indexOf('<div class="dungeon-sheet-tab-panel is-', start + open.length);
  return html.slice(start, next === -1 ? html.length : next);
};

test("jogar: a faixa mostra proficiência, CA base, iniciativa e percepção passiva da Lyra com os rótulos do pacote", () => {
  const html = renderSheetScreen({ ...createDungeonSessionState(), sheet: legacy() });
  const play = panel(html, "play");
  assert.match(play, /<h3 class="dungeon-eyebrow">Números do personagem · D&amp;D 2024<\/h3>/);
  assert.match(play, /<dt>Proficiência<\/dt><dd>\+2<\/dd>/);
  assert.match(play, /<dt>CA base<\/dt><dd>11<\/dd>/);
  assert.match(play, /<dt>Iniciativa<\/dt><dd>\+1<\/dd>/);
  assert.match(play, /<dt>Percepção passiva<\/dt><dd>14<\/dd>/);
  assert.ok(play.indexOf("Números do personagem") < play.indexOf("Mais usados"), "números antes dos testes");
  for (const id of ["abilities", "items"]) assert.doesNotMatch(panel(html, id), /dungeon-derived/);
});

test("jogar: ficha sem pacote registrado ou vazia não quebra a tela e não mostra a faixa", () => {
  assert.equal(renderDerivedStrip(null), "");
  const odd = { ...legacy(), system: { id: "t20", version: 1 } };
  assert.equal(resolveSheetSystem(odd), null);
  assert.equal(renderDerivedStrip(odd), "");
});

test("derivados seguem a ficha viva: nível e atributos editados mudam os números na hora", () => {
  const sheet = legacy();
  sheet.attributes_lww.level = 5;
  sheet.attributes_lww.abilities.dex = 18;
  const html = renderDerivedStrip(sheet);
  assert.match(html, /<dt>Proficiência<\/dt><dd>\+3<\/dd>/);
  assert.match(html, /<dt>Iniciativa<\/dt><dd>\+4<\/dd>/);
  assert.match(html, /<dt>CA base<\/dt><dd>14<\/dd>/);
});

test("exibir uma ficha legada não grava nada nela", () => {
  const sheet = legacy();
  renderSheetScreen({ ...createDungeonSessionState(), sheet });
  assert.deepEqual(sheet, legacy());
});

test("editar: o seletor de sistema lista o pacote, vem marcado e vai dentro do formulário de edição", () => {
  assert.match(renderSystemSelect(legacy()), /<select class="dungeon-input" name="sheetSystem"><option value="dnd5e-2024" selected>D&amp;D 2024<\/option><\/select>/);
  const about = panel(renderSheetScreen({ ...createDungeonSessionState(), sheet: legacy() }), "about");
  assert.match(about, /<form class="dungeon-token-edit-form" data-dungeon="edit-sheet-form">[\s\S]*name="sheetSystem"[\s\S]*<\/form>/);
});

test("editar: salvar grava system e system_choices (atributos em sincronia) e o derivado acompanha", async () => {
  const state = createDungeonSessionState();
  await updateSheetBasicInfo(state, { name: "Kael", dex: 16, system: "dnd5e-2024" });
  assert.deepEqual(state.sheet.system, { id: "dnd5e-2024", version: 1 });
  assert.equal(state.sheet.system_choices.abilities.dex, 16);
  assert.equal(state.sheet.attributes_lww.abilities.dex, 16);
  assert.match(renderDerivedStrip(state.sheet), /<dt>Iniciativa<\/dt><dd>\+3<\/dd>/);
  assert.equal("armorClassDerived" in state.sheet, false, "derivado nunca é gravado");
  assert.equal(JSON.stringify(state.sheet).includes("passivePerception"), false);
});

test("editar: sistema desconhecido no formulário é ignorado e o atual permanece", async () => {
  const state = createDungeonSessionState();
  await updateSheetBasicInfo(state, { system: "t20" });
  assert.equal(state.sheet.system.id, "dnd5e-2024");
});
