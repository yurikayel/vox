/**
 * @file SUB-32b: o Mestre dispensa o roteiro "Primeira mesa" por um botão; a escolha é gravada no aparelho e o painel
 * não volta, nem depois de recarregar a mesa.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { ACTION_HANDLERS } from "../client/js/dungeon/dungeon-controller-actions.js";
import { wireDungeonView } from "../client/js/dungeon/dungeon-controller.js";
import { loadDungeonPrefs, saveDungeonPrefs } from "../client/js/dungeon/dungeon-persistence.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { renderFirstTablePanel } from "../client/js/dungeon/first-table-checklist.js";
import { renderDmScreen } from "../client/js/dungeon/screen-dm.js";

const makeHost = () => ({
  dataset: {},
  innerHTML: "",
  ownerDocument: { querySelector: () => null },
  addEventListener() {},
  querySelector: () => null,
});

test("o painel traz o botão de dispensar", () => {
  assert.match(renderFirstTablePanel({}), /data-dungeon="dismiss-first-table"/);
});

test("dispensar grava a preferência no aparelho e esconde o painel", () => {
  globalThis.localStorage.clear();
  const state = createDungeonSessionState({ viewerRole: "gm", campaignId: "", syncPeer: null });
  assert.equal(loadDungeonPrefs().firstTableDismissed, false);
  assert.match(renderDmScreen(state), /data-first-table/);
  ACTION_HANDLERS["dismiss-first-table"](state);
  assert.equal(loadDungeonPrefs().firstTableDismissed, true);
  assert.doesNotMatch(renderDmScreen(state), /data-first-table/);
});

test("depois de recarregar a mesa o painel continua dispensado", () => {
  globalThis.localStorage.clear();
  saveDungeonPrefs({ firstTableDismissed: true });
  const state = createDungeonSessionState({ viewerRole: "gm", campaignId: "", syncPeer: null });
  wireDungeonView(makeHost(), { screen: "escudo", state });
  assert.equal(state.dungeonPrefs.firstTableDismissed, true);
  assert.doesNotMatch(renderDmScreen(state), /data-first-table/);
});

test("sem a preferência gravada o painel aparece depois de recarregar", () => {
  globalThis.localStorage.clear();
  const state = createDungeonSessionState({ viewerRole: "gm", campaignId: "", syncPeer: null });
  wireDungeonView(makeHost(), { screen: "escudo", state });
  assert.equal(state.dungeonPrefs.firstTableDismissed, false);
  assert.match(renderDmScreen(state), /data-first-table/);
});

test("dispensar preserva as outras preferências do aparelho", () => {
  globalThis.localStorage.clear();
  saveDungeonPrefs({ dice3d: false, viewerRole: "player" });
  const state = createDungeonSessionState({ viewerRole: "gm", campaignId: "", syncPeer: null });
  ACTION_HANDLERS["dismiss-first-table"](state);
  const prefs = loadDungeonPrefs();
  assert.deepEqual([prefs.dice3d, prefs.viewerRole, prefs.firstTableDismissed], [false, "player", true]);
});
