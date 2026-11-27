/**
 * @file Dado de Vida da ficha (5e): aviso de que vale d8 até o jogador definir, campo no painel Editar
 * (d4–d12), validação e escape.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createDungeonSessionState, applySheetResourceDelta } from "../client/js/dungeon/dungeon-state.js";
import { updateSheetBasicInfo } from "../client/js/dungeon/dungeon-persistence.js";
import { spendSheetHitDie } from "../client/js/dungeon/dungeon-persistence-sheet-rest.js";
import { renderDerivedStrip, renderSystemEditFields } from "../client/js/dungeon/screen-sheet-derived.js";
import { PACK_5E as pack } from "../client/js/dungeon/system-pack-5e.js";
import { normalizeRestChoices, validHitDie } from "../client/js/dungeon/system-rest.js";

test("dado válido: só d4, d6, d8, d10, d12 (número ou texto); o resto é nulo", () => {
  for (const n of [4, 6, 8, 10, 12, "10"]) assert.equal(validHitDie(n), Number(n));
  for (const bad of [0, 7, 20, "", null, undefined, "d8", "<img>", NaN, -4]) assert.equal(validHitDie(bad), null, String(bad));
});

test("normalização: dado ausente vale d8 mas não conta como definido", () => {
  assert.deepEqual([normalizeRestChoices(pack, {}).hitDie, normalizeRestChoices(pack, {}).hitDieSet], [8, false]);
  assert.deepEqual([normalizeRestChoices(pack, { hitDie: 8 }).hitDie, normalizeRestChoices(pack, { hitDie: 8 }).hitDieSet], [8, true]);
  assert.equal(normalizeRestChoices(pack, { hitDie: 7 }).hitDieSet, false, "inválido volta a não definido");
});

async function newState() {
  const state = createDungeonSessionState();
  await updateSheetBasicInfo(state, { name: "Kael" });
  return state;
}

test("aviso: sem dado definido a aba Jogar avisa que vale d8; definido, o aviso some", async () => {
  const state = await newState();
  assert.match(renderDerivedStrip(state.sheet), /O Dado de Vida está em d8 até você definir o seu em Editar Dados da Ficha/);
  await updateSheetBasicInfo(state, { hitDie: "10" });
  const html = renderDerivedStrip(state.sheet);
  assert.doesNotMatch(html, /até você definir/);
  assert.match(html, /Dados de Vida: 1\/1 \(d10\)/);
});

test("editor: campo com d4–d12, 'Definir…' sem escolha e o dado gravado marcado", async () => {
  const state = await newState();
  const before = renderSystemEditFields(state.sheet);
  assert.match(before, /<select class="dungeon-input" name="hitDie"><option value="" selected>Definir… \(padrão d8\)<\/option>/);
  for (const n of [4, 6, 8, 10, 12]) assert.ok(before.includes(`<option value="${n}">d${n}</option>`), `d${n}`);
  await updateSheetBasicInfo(state, { hitDie: "6" });
  assert.match(renderSystemEditFields(state.sheet), /<option value="6" selected>d6<\/option>/);
});

test("salvar: dado inválido é ignorado e o gravado permanece; vazio não apaga", async () => {
  const state = await newState();
  await updateSheetBasicInfo(state, { hitDie: "12" });
  for (const bad of ["20", "d8", "7", "", '"><img src=x>']) {
    await updateSheetBasicInfo(state, { hitDie: bad });
    assert.equal(state.sheet.system_choices.hitDie, 12, `inválido ${bad}`);
  }
  await updateSheetBasicInfo(state, { name: "Kael" });
  assert.equal(state.sheet.system_choices.hitDie, 12, "salvar sem o campo mantém");
});

test("o dado definido vale na cura: d4 com CON 10 nunca passa de +4", async () => {
  const state = await newState();
  await updateSheetBasicInfo(state, { hitDie: "4", con: 10 });
  applySheetResourceDelta(state, "hp_current", -20, "dano");
  await spendSheetHitDie(state, { roll: 99 });
  assert.match(state.campaignNotice, /\+4 PV/);
});

test("escape: valor sujo no dado não vira marcação no editor", () => {
  const sheet = { schema_version: "1.0.0", name: "A", attributes_lww: {}, system: { id: "5e", version: 1 }, system_choices: { hitDie: '"><img src=x onerror=alert(1)>' } };
  assert.equal(renderSystemEditFields(sheet).includes("<img"), false);
  assert.equal(renderDerivedStrip(sheet).includes("<img"), false);
});
