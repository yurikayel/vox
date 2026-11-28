/**
 * @file SUB-32b: o Mestre dispensa o roteiro "Primeira mesa" por um botão; a escolha é gravada no aparelho e o painel
 * não volta, nem depois de recarregar a mesa.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { ACTION_HANDLERS, FOCUS_AFTER_ACTION } from "../client/js/dungeon/dungeon-controller-actions.js";
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

const PREFS_KEY = "vox-dungeon-prefs-v1";
const storedPrefs = () => JSON.parse(globalThis.localStorage.getItem(PREFS_KEY));

test("dispensar sem prefs gravadas grava só o campo novo e não toca no papel", () => {
  globalThis.localStorage.clear();
  const state = createDungeonSessionState({ viewerRole: "player", campaignId: "", syncPeer: null });
  ACTION_HANDLERS["dismiss-first-table"](state);
  assert.deepEqual(storedPrefs(), { firstTableDismissed: true });
});

test("quem abriu a Mesa direto como jogador continua jogador depois de dispensar e recarregar", () => {
  globalThis.localStorage.clear();
  const first = createDungeonSessionState({ viewerRole: "gm", campaignId: "", syncPeer: null });
  wireDungeonView(makeHost(), { screen: "mesa", state: first });
  assert.equal(first.viewerRole, "player", "1ª visita direto na Mesa abre como jogador");
  ACTION_HANDLERS["dismiss-first-table"](first);
  const reloaded = createDungeonSessionState({ viewerRole: "gm", campaignId: "", syncPeer: null });
  wireDungeonView(makeHost(), { screen: "mesa", state: reloaded });
  assert.equal(reloaded.viewerRole, "player", "recarregar não vira mestre");
});

test("dispensar leva o foco a um botão que existe na tela do Escudo, não ao body", () => {
  globalThis.localStorage.clear();
  const selector = FOCUS_AFTER_ACTION["dismiss-first-table"];
  assert.ok(selector, "a ação tem alvo de foco");
  const state = createDungeonSessionState({ viewerRole: "gm", campaignId: "", syncPeer: null });
  ACTION_HANDLERS["dismiss-first-table"](state);
  const html = renderDmScreen(state);
  assert.match(html, /<button[^>]*data-dungeon="toggle-viewer-role"/);
  assert.equal(selector, '[data-dungeon="toggle-viewer-role"]');
});

test("a preferência dos dados 3D chega à sessão pela fiação", () => {
  globalThis.localStorage.clear();
  saveDungeonPrefs({ dice3d: false });
  const off = createDungeonSessionState({ viewerRole: "gm", campaignId: "", syncPeer: null });
  wireDungeonView(makeHost(), { screen: "escudo", state: off });
  assert.equal(off.dice3dEnabled, false, "desligado no aparelho, desligado na sessão");
  globalThis.localStorage.clear();
  const on = createDungeonSessionState({ viewerRole: "gm", campaignId: "", syncPeer: null });
  on.dice3dEnabled = false;
  wireDungeonView(makeHost(), { screen: "escudo", state: on });
  assert.equal(on.dice3dEnabled, true, "sem prefs gravadas, os dados 3D ficam ligados");
});

test("JSON corrompido nas prefs não dispensa o roteiro nem derruba a fiação", () => {
  globalThis.localStorage.setItem(PREFS_KEY, "{isto não é json");
  assert.equal(loadDungeonPrefs().firstTableDismissed, false);
  const state = createDungeonSessionState({ viewerRole: "gm", campaignId: "", syncPeer: null });
  wireDungeonView(makeHost(), { screen: "escudo", state });
  assert.equal(state.dungeonPrefs.firstTableDismissed, false);
  globalThis.localStorage.clear();
});

test("valor que não é o booleano true não dispensa o roteiro", () => {
  for (const valor of ["true", "sim", 1, {}, [true]]) {
    globalThis.localStorage.setItem(PREFS_KEY, JSON.stringify({ firstTableDismissed: valor }));
    assert.equal(loadDungeonPrefs().firstTableDismissed, false, `valor ${JSON.stringify(valor)}`);
  }
  globalThis.localStorage.clear();
});

test("dispensar preserva as outras preferências do aparelho", () => {
  globalThis.localStorage.clear();
  saveDungeonPrefs({ dice3d: false, viewerRole: "player" });
  const state = createDungeonSessionState({ viewerRole: "gm", campaignId: "", syncPeer: null });
  ACTION_HANDLERS["dismiss-first-table"](state);
  const prefs = loadDungeonPrefs();
  assert.deepEqual([prefs.dice3d, prefs.viewerRole, prefs.firstTableDismissed], [false, "player", true]);
});
