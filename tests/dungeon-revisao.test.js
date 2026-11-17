/**
 * AI Social Dungeon — correções da revisão de 16/11 (lab `#/dungeon`).
 * - CD da sugestão do co-mestre vem do roteador (`suggestedDc`), não fica sempre 14.
 * - Slider: 0% mostra 0 MB; o arrasto atualiza só os rótulos, sem redesenhar a tela (o slider não é trocado).
 * - Atestação de lore: uma por pessoa (confirmar de novo não soma testemunha).
 * - `op_id` sem colisão entre jogadores: ledgers de dois aparelhos se juntam sem perder jogada.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  createDungeonSessionState,
  updateFavoriteSlider,
  submitTableAction,
  applySheetResourceDelta,
  attestLoreNodeInState,
} from "../client/js/dungeon/dungeon-state.js";
import { renderDmScreen } from "../client/js/dungeon/screen-dm.js";
import { renderCampScreen } from "../client/js/dungeon/screen-camp.js";
import { wireDungeonView } from "../client/js/dungeon/dungeon-controller.js";
import { createCharacterSheetDoc, applyTurnResolutionToSheet, appendPoolDeltaOp } from "../client/js/rpg-sheet-and-lore.js";

test("CD da sugestão do co-mestre segue a regra da ação (Persuasão = 13, Investigação = 15)", () => {
  const state = createDungeonSessionState();
  submitTableAction(state, "Tento convencer o taverneiro a falar");
  assert.match(renderDmScreen(state), /Persuasão \(CD 13\)/);
  submitTableAction(state, "Examino o altar com cuidado");
  assert.match(renderDmScreen(state), /Investigação \(CD 15\)/);
});

test("slider em 0% mostra 0 MB para a comunidade sem fatia", () => {
  const state = createDungeonSessionState();
  updateFavoriteSlider(state, 0);
  const html = renderCampScreen(state);
  assert.match(html, /0% \(0 MB\)/);
  assert.match(html, /100% \(1024 MB\)/);
});

test("arrastar o slider atualiza os rótulos sem redesenhar a tela", () => {
  const listeners = {};
  const labels = { innerHTML: "" };
  const chip = { textContent: "" };
  const container = {
    dataset: {},
    innerHTML: "TELA-ORIGINAL",
    addEventListener: (type, fn) => { listeners[type] = fn; },
    querySelector: (sel) => (sel === ".dungeon-slider-labels" ? labels : sel === "[data-dungeon-next-turn]" ? chip : null),
  };
  const state = createDungeonSessionState();
  wireDungeonView(container, { screen: "acampamento", state });
  listeners.input({ target: { dataset: { dungeon: "slider-fav" }, value: "25" } });
  assert.equal(container.innerHTML, "TELA-ORIGINAL", "a tela (e o slider) não é trocada no meio do arrasto");
  assert.equal(state.favorites[0].sliderWeight, 25);
  assert.match(labels.innerHTML, /25%/);
  assert.match(labels.innerHTML, /75%/);
  assert.match(chip.textContent, /^Próximo turno: /);
});

test("confirmar a mesma lore duas vezes não soma testemunha; contestar troca a atestação", () => {
  const state = createDungeonSessionState();
  const node = () => state.loreNodes.find((n) => n.id === "lore-ferreiro");
  const before = node().attestations.length;
  attestLoreNodeInState(state, "lore-ferreiro", "CONFIRM");
  attestLoreNodeInState(state, "lore-ferreiro", "CONFIRM");
  assert.equal(node().attestations.length, before + 1);
  attestLoreNodeInState(state, "lore-ferreiro", "REJECT");
  const mine = node().attestations.filter((a) => a.actorPubkey === "pk-lyra");
  assert.equal(mine.length, 1);
  assert.equal(mine[0].verdict, "REJECT");
});

test("jogadas de dois jogadores no mesmo instante não colidem no op_id", (t) => {
  t.mock.method(Date, "now", () => 1_700_000_000_000);
  const a = createDungeonSessionState();
  const b = createDungeonSessionState();
  applySheetResourceDelta(a, "coins", -1, "Compra A");
  applySheetResourceDelta(b, "coins", -2, "Compra B");
  const opA = a.sheet.delta_ledger.at(-1).op_id;
  const opB = b.sheet.delta_ledger.at(-1).op_id;
  assert.notEqual(opA, opB);

  let x = applyTurnResolutionToSheet(createCharacterSheetDoc({ char_id: "x" }), { state_mutations: [{ target_pool: "currency_gp", delta: 4 }] }, "pk-a");
  const y = applyTurnResolutionToSheet(createCharacterSheetDoc({ char_id: "x" }), { state_mutations: [{ target_pool: "currency_gp", delta: -5 }] }, "pk-b");
  for (const op of y.delta_ledger) x = appendPoolDeltaOp(x, op);
  assert.equal(x.delta_ledger.length, 2, "juntar os dois históricos mantém as duas jogadas");
});
