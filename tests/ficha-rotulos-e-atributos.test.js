/**
 * Dívidas de teste da ficha: `mergePatchedAbilities` (limites, truncamento e valor inválido) e o par rótulo ↔ campo dos quatro
 * seletores de arquivo escondidos por `.sr-only` (o `for` do rótulo tem de apontar o `id` do campo que vem logo depois).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { mergePatchedAbilities } from "../client/js/dungeon/dungeon-persistence-sheet-system.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { renderCampScreen } from "../client/js/dungeon/screen-camp.js";
import { renderTableScreen } from "../client/js/dungeon/screen-table.js";
import { renderSheetEditPanel } from "../client/js/dungeon/screen-sheet-levelup.js";
import { renderWizard } from "../client/js/dungeon/sheet-wizard-view.js";

const base = { str: 10, dex: 12, con: 14, int: 8, wis: 9, cha: 11 };

test("mergePatchedAbilities: o valor fica entre 1 e 30", () => {
  const out = mergePatchedAbilities(base, { str: 0, dex: 31, con: 1, int: 30, wis: -5, cha: 999 });
  assert.deepEqual(out, { str: 1, dex: 30, con: 1, int: 30, wis: 1, cha: 30 });
});

test("mergePatchedAbilities: decimal é truncado (não arredondado)", () => {
  const out = mergePatchedAbilities(base, { str: 15.9, dex: "7.99", con: -0.4, int: 1.2 });
  assert.equal(out.str, 15);
  assert.equal(out.dex, 7);
  assert.equal(out.con, 1, "0 truncado cai no mínimo 1");
  assert.equal(out.int, 1);
});

test("mergePatchedAbilities: texto numérico vale; inválido ou ausente mantém o atual", () => {
  const out = mergePatchedAbilities(base, { str: "18", dex: "abc", con: NaN, int: Infinity, wis: undefined, cha: -Infinity });
  assert.equal(out.str, 18);
  assert.equal(out.dex, 12, "texto não numérico");
  assert.equal(out.con, 14, "NaN");
  assert.equal(out.int, 8, "Infinity não é finito");
  assert.equal(out.wis, 9, "ausente");
  assert.equal(out.cha, 11, "-Infinity não é finito");
});

test("mergePatchedAbilities: não mexe no objeto de entrada, ignora chaves fora de FOR–CAR e aceita base ausente", () => {
  const input = { ...base };
  const out = mergePatchedAbilities(input, { str: 20, luck: 5 });
  assert.deepEqual(input, base, "a base não muda");
  assert.notEqual(out, input);
  assert.equal("luck" in out, false);
  assert.deepEqual(mergePatchedAbilities(undefined, { dex: 16 }), { dex: 16 });
  assert.deepEqual(mergePatchedAbilities(null, {}), {});
});

/** Confere que o `<label for=X>` vem logo antes de `<input id=X class="sr-only" type="file">`. */
function assertFileLabel(html, id) {
  const pair = new RegExp(`<label for="${id}"[^>]*class="[^"]*dungeon-file-trigger[^"]*"[^>]*>[^<]+</label>\\s*<input id="${id}" class="sr-only" type="file"`);
  assert.match(html, pair, `rótulo de ${id}`);
  assert.equal(html.split(`id="${id}"`).length - 1, 1, `id ${id} único`);
}

test("seletores de arquivo: o rótulo aponta o campo (for = id) nas quatro telas", () => {
  const state = createDungeonSessionState();
  assertFileLabel(renderCampScreen(state), "dungeon-import-file");
  assertFileLabel(renderTableScreen(state), "dungeon-map-upload");
  assertFileLabel(renderSheetEditPanel(state.sheet || {}, {}), "dungeon-import-voxchar");
  assertFileLabel(renderWizard({ mode: "import", issues: [], draft: {}, confirmCancel: false }), "dungeon-wizard-import");
});
