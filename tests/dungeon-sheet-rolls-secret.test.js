/**
 * @file SUB-22: "Só para o Mestre" na ficha. O chip liga a próxima rolagem de atributo ou perícia como `gm` (só o autor e
 * o Mestre veem), desliga depois de uma rolagem que deu certo e não afeta a rolagem seguinte.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { ACTION_HANDLERS } from "../client/js/dungeon/dungeon-controller-actions.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { d20Formula, recordAbilityRoll, recordSkillRoll } from "../client/js/dungeon/dungeon-sheet-rolls.js";
import { renderSheetScreen } from "../client/js/dungeon/screen-sheet.js";
import { renderPlayTab } from "../client/js/dungeon/screen-sheet-tabs.js";

function stateFor(systemId = "t20") {
  const state = createDungeonSessionState({ viewerRole: "player", campaignId: "", syncPeer: null });
  Object.assign(state.sheet, { system: { id: systemId, version: 1 }, attributes_lww: { level: 3, abilities: { dex: 14 } }, pools_base: { hp_max: 20, hp_current: 20 }, inventory_orset: {} });
  state.loreNodes = [];
  return state;
}

const chip = (html) => /<button[^>]*data-dungeon="roll-secret"[^>]*>/.exec(html)?.[0] || "";

test("a) perícia com secret: a rolagem e a crônica saem para o Mestre (gm)", async () => {
  const state = stateFor();
  const roll = await recordSkillRoll(state, "acrobacia", { secret: true });
  assert.equal(roll.ok, true);
  assert.equal(state.lastFormulaRoll.visibility, "gm");
  assert.equal(state.rolls.at(-1).visibility, "gm");
});

test("b) atributo com secret também sai gm; sem secret, público", async () => {
  const state = stateFor();
  await recordAbilityRoll(state, "dex", { secret: true });
  assert.equal(state.lastFormulaRoll.visibility, "gm");
  await recordAbilityRoll(state, "dex");
  assert.equal(state.lastFormulaRoll.visibility, "public");
});

test("c) o chip ligado vale para uma rolagem só: a seguinte sai pública e o chip desliga", async () => {
  const state = stateFor();
  state.rollSecret = true;
  await recordSkillRoll(state, "acrobacia");
  assert.equal(state.lastFormulaRoll.visibility, "gm");
  assert.equal(state.rollSecret, false);
  await recordSkillRoll(state, "acrobacia");
  assert.equal(state.lastFormulaRoll.visibility, "public");
});

test("d) rolagem que falha (perícia inexistente) não desliga o chip", async () => {
  const state = stateFor();
  state.rollSecret = true;
  const roll = await recordSkillRoll(state, "nao-existe");
  assert.equal(roll.ok, false);
  assert.equal(state.rollSecret, true);
});

test("e) roll-secret alterna o chip e o clique no atributo respeita o estado", async () => {
  const state = stateFor();
  assert.equal(typeof ACTION_HANDLERS["roll-secret"], "function", "tratador roll-secret existe");
  ACTION_HANDLERS["roll-secret"](state, { dataset: {} }, null, {});
  assert.equal(state.rollSecret, true);
  await ACTION_HANDLERS["roll-ability"](state, { dataset: { ability: "dex" } }, null, {});
  assert.equal(state.lastFormulaRoll.visibility, "gm");
  ACTION_HANDLERS["roll-secret"](state, { dataset: {} }, null, {});
  ACTION_HANDLERS["roll-secret"](state, { dataset: {} }, null, {});
  assert.equal(state.rollSecret, false);
});

test("f) a ficha mostra o chip com aria-pressed e a dica de que vale para atributo e perícia", () => {
  const state = stateFor();
  assert.match(chip(renderSheetScreen(state)), /aria-pressed="false"/);
  state.rollSecret = true;
  const html = renderSheetScreen(state);
  assert.match(chip(html), /aria-pressed="true"/);
  assert.match(chip(html), /aria-describedby="dungeon-secret-hint"/);
  assert.match(html, /id="dungeon-secret-hint"[^>]*>Vale para testes de atributo e perícia/);
  assert.match(html, />Só para o Mestre</);
});

test("g) d20Formula só ganha o prefixo /gmroll com secret", () => {
  assert.equal(d20Formula(4, "Teste"), "1d20+4 # Teste");
  assert.equal(d20Formula(4, "Teste", true), "/gmroll 1d20+4 # Teste");
});

test("h) perícia sem atributo declarado e fórmula com @var desconhecida não some da aba Jogar", () => {
  const html = renderPlayTab([{ id: "x", label: "Ofício", roll: "1d20+@xyz", damage: "", tag: "pericia" }], [{ id: "oficio", label: "Ofício", bonus: 0 }]);
  assert.match(html, /data-dungeon="roll-action" data-action-id="x"/);
});
