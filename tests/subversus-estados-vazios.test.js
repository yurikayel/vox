/**
 * @file Estados vazios do Subversus no molde do cartão de estado: sem handouts, sem ações clicáveis e sem movimentações
 * a tela mostra `.sv-state--empty` com `role="status"` e a frase de sempre, em vez de um parágrafo cinza solto.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { renderHandoutViewer } from "../client/js/dungeon/screen-notes.js";
import { renderAbilitiesPanel, renderSheetScreen } from "../client/js/dungeon/screen-sheet.js";

const EMPTY_CARD = /<div class="sv-state sv-state--empty" role="status">[\s\S]*?<p class="sv-state-text">([^<]*)<\/p>/;

/** Frase do cartão vazio que contém `texto`, ou `null` se não houver cartão. */
function cardText(html, texto) {
  const found = [...html.matchAll(new RegExp(EMPTY_CARD.source, "g"))].map((m) => m[1]);
  return found.find((frase) => frase.includes(texto)) ?? null;
}

function sessionWithoutActions() {
  const state = createDungeonSessionState({ viewerRole: "player", campaignId: "", syncPeer: null });
  state.sheet.sheet_meta = { ...state.sheet.sheet_meta, clickable_actions: [] };
  state.sheet.delta_ledger = [];
  return state;
}

test("sem handouts compartilhados, o jogador vê o cartão de estado vazio", () => {
  const html = renderHandoutViewer({ notes: [] });
  assert.equal(cardText(html, "Nenhum handout compartilhado"), "Nenhum handout compartilhado com a mesa ainda.");
});

test("sem ações clicáveis, o painel de habilidades mostra o cartão de estado vazio", () => {
  const html = renderAbilitiesPanel(sessionWithoutActions());
  assert.equal(cardText(html, "Nenhuma ação clicável"), "Nenhuma ação clicável cadastrada nesta ficha.");
});

test("sem movimentações, o histórico da mesa mostra o cartão de estado vazio fora da lista", () => {
  const html = renderSheetScreen(sessionWithoutActions());
  assert.equal(cardText(html, "Nenhuma movimentação"), "Nenhuma movimentação ainda neste turno.");
  assert.doesNotMatch(html, /<ul class="dungeon-clean-list"><li class="dungeon-muted">/, "sem <li> de aviso dentro da lista");
  const painel = html.split("Histórico da Mesa")[1].split("</section>")[0];
  assert.doesNotMatch(painel, /dungeon-clean-list/, "sem movimentações não há lista, nem vazia, em volta do cartão");
});

test("com handouts e movimentações os cartões vazios somem", () => {
  const state = sessionWithoutActions();
  state.notes = [{ id: "n1", title: "Mapa", visibility: "shared", publicMarkdown: "Texto", links: [] }];
  state.sheet.delta_ledger = [{ delta: 3, target_pool: "hp_current", reason: "Poção" }];
  assert.equal(cardText(renderHandoutViewer(state), "Nenhum handout"), null);
  assert.equal(cardText(renderSheetScreen(state), "Nenhuma movimentação"), null);
});
