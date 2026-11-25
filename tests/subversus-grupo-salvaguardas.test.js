/**
 * @file Grupo, espólios e salvaguardas (Subversus, spec §3.1): só renderização com dados que a campanha já guarda.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { buildLootView, buildPartyView, buildSavesView, NO_DATA } from "../client/js/dungeon/party-view-model.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { renderCampScreen } from "../client/js/dungeon/screen-camp.js";
import { renderDmScreen } from "../client/js/dungeon/screen-dm.js";
import { renderLootPanel, renderPartyPanel, renderSavesPanel } from "../client/js/dungeon/screen-party-panels.js";

const sheet = (id, name, extra = {}) => ({
  character_id: id,
  name,
  role_title: "Bardo",
  attributes_lww: { level: 3, abilities: { str: 8, dex: 14, con: 10, int: 12, wis: 9, cha: 18 } },
  pools_base: { hp_max: 20 },
  delta_ledger: [],
  inventory_orset: { adaga: { id: "adaga", label: "Adaga", qty: 2, weightLb: 1, equipped: true } },
  ...extra,
});

function stateWith(sheets) {
  const state = createDungeonSessionState({});
  state.campaign = { sheetsById: Object.fromEntries(sheets.map((s) => [s.character_id, s])) };
  return state;
}

test("grupo: uma linha por ficha da campanha, com classe, nível e PV", () => {
  const view = buildPartyView(stateWith([sheet("ana", "Ana"), sheet("bia", "Bia")]));
  assert.deepEqual(view.map((m) => m.name), ["Ana", "Bia"]);
  assert.deepEqual(view[0], { id: "ana", name: "Ana", role: "Bardo", level: "3", hp: "20 / 20 PV" });
});

test("grupo: sem dado vira '—', nunca um número inventado", () => {
  const bare = { character_id: "x", name: "X", attributes_lww: {}, pools_base: {}, delta_ledger: [] };
  const row = buildPartyView(stateWith([bare]))[0];
  assert.equal(row.level, NO_DATA);
  assert.equal(row.role, NO_DATA);
  assert.equal(row.hp, "— / — PV");
});

test("grupo: sem campanha carregada mostra só a ficha ativa; sem ficha nenhuma, nada", () => {
  const solo = createDungeonSessionState({});
  assert.equal(buildPartyView(solo).length, 1);
  assert.equal(renderPartyPanel({}), "");
  assert.equal(renderSavesPanel({}), "");
});

test("espólios: junta as mochilas por personagem e conta os itens; mochila vazia não aparece", () => {
  const empty = sheet("bia", "Bia", { inventory_orset: {} });
  const loot = buildLootView(stateWith([sheet("ana", "Ana"), empty]));
  assert.deepEqual(loot.holders.map((h) => h.name), ["Ana"]);
  assert.equal(loot.totalItems, 2);
  assert.match(renderLootPanel(stateWith([empty])), /Ninguém do grupo carrega itens ainda/);
});

test("salvaguardas: modificador de cada atributo, em lote, e a nota de que não há proficiência", () => {
  const view = buildSavesView(stateWith([sheet("ana", "Ana")]));
  assert.deepEqual(view.rows[0].saves.map((s) => s.text), ["-1", "+2", "+0", "+1", "-1", "+4"]);
  const html = renderSavesPanel(stateWith([sheet("ana", "Ana")]));
  assert.match(html, /<th scope="col" title="Carisma">CAR<\/th>/);
  assert.match(html, /ainda não guarda salvaguardas treinadas/);
});

test("telas: o Acampamento mostra grupo e espólios só com campanha; o Escudo mostra as salvaguardas", () => {
  const state = stateWith([sheet("ana", "Ana")]);
  assert.doesNotMatch(renderCampScreen({ ...state, campaignId: "" }), /aria-label="Grupo da campanha"/);
  const camp = renderCampScreen({ ...state, campaignId: "c1" });
  assert.match(camp, /aria-label="Grupo da campanha"/);
  assert.match(camp, /aria-label="Espólios do grupo"/);
  assert.match(renderDmScreen(state), /aria-label="Salvaguardas em lote"/);
});

test("telas: nomes vindos da ficha são escapados", () => {
  const html = renderPartyPanel(stateWith([sheet("x", "<img src=x onerror=alert(1)>")]));
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});
