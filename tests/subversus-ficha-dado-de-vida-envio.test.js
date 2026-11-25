/**
 * @file Caminho de envio do Dado de Vida no painel Editar (`submitEditSheet`): o valor do select chega à ficha,
 * vazio mantém o padrão d8 e valor fora de d4–d12 é ignorado, inclusive em ficha sem pacote de sistema.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { dispatchDungeonFormSubmit } from "../client/js/dungeon/dungeon-controller-actions.js";
import { updateSheetBasicInfo } from "../client/js/dungeon/dungeon-persistence.js";
import { resolveSheetSystem } from "../client/js/dungeon/screen-sheet-derived.js";

const ctx = { viewOpts: {}, settle: (p) => p };

function fakeForm(values) {
  const find = (sel) => { const m = sel.match(/name=(\w+)/); return m && m[1] in values ? { value: values[m[1]] } : null; };
  return { dataset: {}, querySelector: find };
}

async function freshState() {
  const state = createDungeonSessionState();
  await updateSheetBasicInfo(state, { name: "Kael" });
  return state;
}

const submit = (state, values) => dispatchDungeonFormSubmit("edit-sheet-form", state, fakeForm({ sheetName: "Kael", armorClass: "12", sheetSystem: "dnd5e-2024", ...values }), ctx);

test("envio: select hitDie = 10 grava d10 em system_choices", async () => {
  const state = await freshState();
  await submit(state, { hitDie: "10" });
  assert.equal(state.sheet.system_choices.hitDie, 10);
  const { rest } = resolveSheetSystem(state.sheet);
  assert.deepEqual([rest.hitDie, rest.hitDieSet], [10, true]);
});

test("envio: select em branco (Definir…) não grava escolha e o padrão d8 continua", async () => {
  const state = await freshState();
  await submit(state, { hitDie: "" });
  assert.equal("hitDie" in state.sheet.system_choices, false);
  const { rest } = resolveSheetSystem(state.sheet);
  assert.deepEqual([rest.hitDie, rest.hitDieSet], [8, false]);
});

test("envio: em branco depois de d10 não apaga a escolha já gravada", async () => {
  const state = await freshState();
  await submit(state, { hitDie: "10" });
  await submit(state, { hitDie: "" });
  assert.equal(state.sheet.system_choices.hitDie, 10);
});

test("envio: valor fora de d4–d12 vindo do form é rejeitado", async () => {
  const state = await freshState();
  for (const bad of ["7", "20", "0", "abc", "-8", "8.5"]) {
    await submit(state, { hitDie: bad });
    assert.equal("hitDie" in state.sheet.system_choices, false, `"${bad}" não grava`);
  }
});

test("envio: ficha de sistema sem pacote ou form sem o campo não quebra nem grava lixo", async () => {
  const state = await freshState();
  await dispatchDungeonFormSubmit("edit-sheet-form", state, fakeForm({ sheetName: "Kael", armorClass: "12", sheetSystem: "dnd5e-2024" }), ctx);
  assert.equal("hitDie" in state.sheet.system_choices, false, "sem o campo hitDie nada é gravado");
  await submit(state, { sheetSystem: "t20", hitDie: "10" });
  assert.equal(state.sheetEditIssues.length > 0, true, "sistema desconhecido recusa o Salvar");
  assert.notEqual(state.sheet.system_choices.hitDie, 10, "recusado: nada gravado");
  assert.equal(state.sheet.name, "Kael");
});
