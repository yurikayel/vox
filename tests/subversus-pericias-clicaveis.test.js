/**
 * @file PM-111 do SUB-21: toda perícia do pacote vira botão que rola pelo derivado (o mesmo número da ficha) e o
 * teste de atributo usa o modificador do sistema, não o `@atr` de 5e (T20 com Des 14 = +4, não +2).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { ACTION_HANDLERS } from "../client/js/dungeon/dungeon-controller-actions.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { renderSheetHero } from "../client/js/dungeon/screen-sheet.js";
import { renderPlayTab } from "../client/js/dungeon/screen-sheet-tabs.js";
import { resolveSheetSystem } from "../client/js/dungeon/screen-sheet-derived.js";

function stateFor(systemId, extra = {}) {
  const state = createDungeonSessionState({ viewerRole: "gm", campaignId: "", syncPeer: null });
  const sheet = {
    system: { id: systemId, version: 1 },
    attributes_lww: { level: 3, abilities: { dex: 14, con: 14 } },
    pools_base: { hp_max: 20, hp_current: 20 },
    inventory_orset: {},
    ...extra,
  };
  Object.assign(state.sheet, sheet);
  return state;
}

/** Bônus que o dado somou: total menos o d20 mantido. */
function bonusOf(result) {
  const kept = result.rolls.find((d) => d.kept && d.sides === 20);
  return result.total - kept.value;
}

async function click(state, action, dataset) {
  assert.equal(typeof ACTION_HANDLERS[action], "function", `tratador ${action} existe`);
  await ACTION_HANDLERS[action](state, { dataset }, null, {});
  return state.lastFormulaRoll;
}

const playTab = (state) => renderPlayTab(state.sheet.sheet_meta?.clickable_actions || [], resolveSheetSystem(state.sheet)?.derived.skills);

test("a) T20: todas as perícias do pacote têm botão na aba Jogar", () => {
  const state = stateFor("t20");
  const { pack } = resolveSheetSystem(state.sheet);
  const html = playTab(state);
  for (const skill of pack.skills) assert.ok(html.includes(`data-skill="${skill.id}"`), `botão de ${skill.id}`);
  assert.equal((html.match(/data-dungeon="roll-skill"/g) || []).length, pack.skills.length);
});

test("b) T20 com Des 14: Acrobacia rola k+4 e o botão mostra +4", async () => {
  const state = stateFor("t20");
  assert.match(playTab(state), /data-skill="acrobacia"[^>]*aria-label="Rolar Acrobacia \+4"/);
  const roll = await click(state, "roll-skill", { skill: "acrobacia" });
  assert.equal(roll.ok, true);
  assert.equal(bonusOf(roll), 4);
});

test("c) T20 com Des 14: o teste de Destreza soma +4 e o cabeçalho mostra +4", async () => {
  const state = stateFor("t20");
  const roll = await click(state, "roll-ability", { ability: "dex" });
  assert.equal(bonusOf(roll), 4);
  assert.match(renderSheetHero(state.sheet), /data-ability="dex"[^>]*><strong>14 \(\+4\)</);
});

test("d) 5e com Des 14 (controle): Furtividade e teste de Destreza somam +2", async () => {
  const state = stateFor("5e");
  assert.equal(bonusOf(await click(state, "roll-skill", { skill: "stealth" })), 2);
  assert.equal(bonusOf(await click(state, "roll-ability", { ability: "dex" })), 2);
});

test("e) perícia treinada soma a proficiência do derivado", async () => {
  const trained = { id: "act-furtividade", label: "Furtividade", roll: "1d20+@des+@prof", damage: "", tag: "pericia" };
  const state = stateFor("5e", { sheet_meta: { clickable_actions: [trained] } });
  const { derived } = resolveSheetSystem(state.sheet);
  const expected = derived.skills.find((s) => s.id === "stealth").bonus;
  assert.equal(expected, 2 + derived.proficiency);
  assert.equal(bonusOf(await click(state, "roll-skill", { skill: "stealth" })), expected);
});

test("f) perícia ou atributo que a ficha não tem não rola e avisa", async () => {
  const state = stateFor("t20");
  const before = state.rolls.length;
  assert.equal(await click(state, "roll-skill", { skill: "nao-existe" }).then(() => state.rollError), "Perícia não encontrada nesta ficha.");
  await click(state, "roll-ability", { ability: "nao-existe" });
  assert.equal(state.rollError, "Atributo não encontrado nesta ficha.");
  assert.equal(state.rolls.length, before);
});

test("g) a rolagem entra na crônica com o nome da perícia (mesmo caminho do recordFormulaRoll)", async () => {
  const state = stateFor("t20");
  await click(state, "roll-skill", { skill: "acrobacia" });
  assert.match(state.lastFormulaRoll.label, /Perícia: Acrobacia/);
  assert.equal(state.rolls.at(-1).label, state.lastFormulaRoll.label);
});

test("h) 'Mais usados' não repete perícia do pacote com fórmula @var: só o botão do derivado rola", async () => {
  const state = stateFor("t20");
  const html = playTab(state);
  assert.equal(html.includes('data-action-id="act-furtividade"'), false);
  assert.equal(html.includes("@des"), false);
  assert.equal((html.match(/data-skill="furtividade"/g) || []).length, 1);
  assert.equal(bonusOf(await click(state, "roll-skill", { skill: "furtividade" })), 4);
});

test("i) pacote sem os seis atributos da 5e (GURPS) não mostra botão de atributo que daria alerta", () => {
  const html = renderSheetHero(stateFor("gurps4e").sheet);
  assert.equal(html.includes('data-dungeon="roll-ability"'), false);
});

test("j) controle: 5e e T20 seguem com os seis botões de atributo", () => {
  for (const id of ["5e", "t20"]) {
    const html = renderSheetHero(stateFor(id).sheet);
    assert.equal((html.match(/data-dungeon="roll-ability"/g) || []).length, 6, id);
  }
});
