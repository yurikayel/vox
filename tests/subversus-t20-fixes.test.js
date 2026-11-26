/**
 * @file PM-111 do pacote T20: a Iniciativa do T20 vem da perícia, a rolagem usa o mesmo número da faixa
 * e um sistema sem Dado de Vida não o mostra nem o gasta (spec "PR-T20a").
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { getActiveScene } from "../client/js/dungeon/dungeon-scene-actions.js";
import { rollInitiativeForScene } from "../client/js/dungeon/dungeon-tactics-actions.js";
import { renderDerivedStrip, renderSystemEditFields } from "../client/js/dungeon/screen-sheet-derived.js";
import { renderWizard } from "../client/js/dungeon/sheet-wizard-view.js";
import { createWizard } from "../client/js/dungeon/sheet-wizard.js";
import { longRestPlan, spendHitDie } from "../client/js/dungeon/system-rest.js";
import { getSystemPack } from "../client/js/dungeon/system-pack.js";
import { T20_PACK } from "../client/js/dungeon/system-pack-t20.js";

const fixedBytes = () => new Uint8Array(32).fill(7);
const sheetOf = (systemId) => ({
  character_id: "ficha-1",
  system: { id: systemId, version: 1 },
  attributes_lww: { level: 3, abilities: { dex: 14, con: 14 } },
  pools_base: { hp_max: 20, hp_current: 20 },
  inventory_orset: {},
});

async function initiativeRolls(systemId) {
  const state = createDungeonSessionState({ viewerRole: "gm", campaignId: "", syncPeer: null });
  const base = sheetOf(systemId);
  delete base.character_id;
  Object.assign(state.sheet, base);
  const init = await rollInitiativeForScene(state, { randomBytesFn: fixedBytes });
  const roll = (tokenId) => init.entries.find((e) => e.tokenId === tokenId).roll;
  const tokens = getActiveScene(state).tokens;
  const hero = tokens.find((t) => t.sheetId === state.sheet.character_id);
  const npc = tokens.find((t) => !t.sheetId);
  return { hero: roll(hero.tokenId), npc: roll(npc.tokenId) };
}

test("a) o rótulo da Iniciativa do T20 é 'Iniciativa', não 'Iniciativa (atributo)'", () => {
  const entry = T20_PACK.display.derived.find((d) => d.id === "initiative");
  assert.equal(entry.label, "Iniciativa");
});

test("b) T20: a rolagem soma o mesmo valor mostrado na faixa (Des 14 = +4)", async () => {
  const { hero, npc } = await initiativeRolls("t20");
  assert.match(renderDerivedStrip(sheetOf("t20")), /<dt>Iniciativa<\/dt><dd>\+4<\/dd>/);
  assert.equal(hero, npc + 4);
});

test("c) T20: o painel Editar não lança e não oferece Dado de Vida nem Deslocamento", () => {
  let html = "";
  assert.doesNotThrow(() => { html = renderSystemEditFields(sheetOf("t20")); });
  assert.ok(html.length > 0, "o painel deve mostrar ao menos as salvaguardas");
  assert.doesNotMatch(html, /Dado de Vida|Dados de Vida|name="hitDie"/);
  assert.doesNotMatch(html, /name="speedFt"/);
});

test("d) T20: gastar Dado de Vida devolve recusa em vez de lançar", () => {
  let out;
  assert.doesNotThrow(() => { out = spendHitDie(T20_PACK, { level: 3, abilities: { con: 14 } }, 5); });
  assert.equal(out.ok, false);
  assert.match(out.error, /não usa Dado de Vida/);
});

test("e) controle D&D 5e: faixa +2, rolagem +2 e o painel Editar mantém o Dado de Vida", async () => {
  const { hero, npc } = await initiativeRolls("dnd5e-2024");
  assert.match(renderDerivedStrip(sheetOf("dnd5e-2024")), /<dt>Iniciativa<\/dt><dd>\+2<\/dd>/);
  assert.equal(hero, npc + 2);
  const html = renderSystemEditFields(sheetOf("dnd5e-2024"));
  assert.match(html, /Dados? de Vida/);
  assert.match(html, /name="speedFt"/);
});

test("g) T20: o descanso longo não aplica cura automática; o D&D segue curando ao máximo", () => {
  const state = { pools: { hp_current: 5 }, base: { hp_max: 20 } };
  assert.deepEqual(longRestPlan(T20_PACK, { level: 3 }, state).deltas, []);
  const dnd = longRestPlan(getSystemPack("dnd5e-2024"), { level: 3 }, state);
  assert.deepEqual(dnd.deltas, [{ pool: "hp_current", delta: 15 }]);
});

test("f) o passo 5 do assistente com pacote T20 não mostra Dado de Vida; o D&D mostra", () => {
  const wz = { ...createWizard(), mode: "guided", step: 5 };
  assert.match(renderWizard(wz), /Dado de Vida/);
  assert.doesNotMatch(renderWizard({ ...wz, systemId: "t20" }), /Dado de Vida/);
});
