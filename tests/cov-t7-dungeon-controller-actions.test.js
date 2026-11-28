/**
 * @file Cobertura T7 de `dungeon-controller-actions.js`: handlers de clique e despacho de formulários da Mesa,
 * chamados diretamente com elementos/formulários falsos sobre uma sessão efêmera.
 */
import "./setup.js";
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ACTION_HANDLERS, dispatchDungeonFormSubmit, SUBMIT_FORMS, DICE3D_CLICK_ACTIONS } from "../client/js/dungeon/dungeon-controller-actions.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { getActiveScene } from "../client/js/dungeon/dungeon-scene-actions.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";

let state;
let opts;
const settled = [];
const ctx = () => ({
  viewOpts: opts,
  redraw: (f) => settled.push(["redraw", f]),
  settle: (p, o) => { settled.push(["settle", o]); return p; },
});

beforeEach(() => {
  state = createDungeonSessionState({ viewerRole: "gm", campaignId: "", syncPeer: null });
  opts = { store: createVttStore(createMemoryVttBackend()) };
  settled.length = 0;
  localStorage.clear();
});

/**
 * Elemento falso com `dataset`.
 * @param {object} dataset Atributos `data-*` já em camelCase.
 * @returns {{ dataset: object }} Elemento.
 */
const el = (dataset = {}) => ({ dataset });

/**
 * Formulário falso que responde a `querySelector` por seletor.
 * @param {Record<string, string>} fields Valor por seletor.
 * @param {object} [dataset] `data-*` do formulário.
 * @returns {{ querySelector: Function, dataset: object }} Formulário.
 */
const form = (fields, dataset = {}) => ({
  dataset,
  querySelector: (sel) => (sel in fields ? { value: fields[sel] } : null),
});

test("tabelas de ações - formulários e rolagens com overlay 3D conhecidos", () => {
  assert.equal(SUBMIT_FORMS.size, 9);
  assert.ok(SUBMIT_FORMS.has("add-door-form"));
  assert.deepEqual([...DICE3D_CLICK_ACTIONS].sort(), ["check-roll", "roll-ability", "roll-action", "roll-d20", "roll-quick", "roll-skill"]);
});

test("câmera - zoom in/out limitado, reset e ajuste ao canvas", () => {
  ACTION_HANDLERS["canvas-zoom-in"](state);
  const zin = state.camera.zoom;
  assert.ok(zin > 1);
  ACTION_HANDLERS["canvas-zoom-out"](state);
  ACTION_HANDLERS["canvas-zoom-out"](state);
  assert.ok(state.camera.zoom < zin);
  assert.equal(state._cameraTouched, true);
  ACTION_HANDLERS["canvas-reset"](state);
  assert.deepEqual(state.camera, { panX: 0, panY: 0, zoom: 1 });
  const canvas = { clientWidth: 1200, clientHeight: 900 };
  ACTION_HANDLERS["canvas-fit"](state, null, { querySelector: () => canvas });
  assert.ok(state.camera.zoom > 0 && state.camera.zoom <= 1);
  ACTION_HANDLERS["canvas-fit"](state, null, null);
  assert.ok(Number.isFinite(state.camera.panX));
});

test("papel de visão - alterna GM/jogador e grava; jogador P2P não alterna", () => {
  state.mapNotice = "aviso";
  ACTION_HANDLERS["toggle-viewer-role"](state);
  assert.equal(state.viewerRole, "player");
  assert.equal(state.mapNotice, "");
  assert.equal(JSON.parse(localStorage.getItem("vox-dungeon-prefs-v1")).viewerRole, "player");
  ACTION_HANDLERS["toggle-viewer-role"](state);
  assert.equal(state.viewerRole, "gm");
  state.joinMode = "p2p_player";
  ACTION_HANDLERS["toggle-viewer-role"](state);
  assert.equal(state.viewerRole, "gm");
});

test("estado simples - modo de rolagem, seleção, ferramenta, preset, nível, exclusão e dados 3D", () => {
  ACTION_HANDLERS["roll-mode"](state, el({ mode: "adv" }));
  assert.equal(state.rollMode, "adv");
  ACTION_HANDLERS["roll-mode"](state, el());
  assert.equal(state.rollMode, "normal");
  ACTION_HANDLERS["select-token"](state, el({ tokenId: "t1" }));
  assert.equal(state.selectedTokenId, "t1");
  ACTION_HANDLERS["select-token"](state, el());
  assert.equal(state.selectedTokenId, "");
  ACTION_HANDLERS["select-tool"](state, el({ tool: "fog" }));
  ACTION_HANDLERS["select-levelup-preset"](state, el({ preset: "tormenta20" }));
  assert.deepEqual([state.activeTool, state.levelUpPreset], ["fog", "tormenta20"]);
  ACTION_HANDLERS["select-tool"](state, el());
  ACTION_HANDLERS["select-levelup-preset"](state, el());
  assert.deepEqual([state.activeTool, state.levelUpPreset], ["select", "d20_fantasy"]);
  ACTION_HANDLERS["level-up-open"](state);
  assert.equal(state.levelUpOpen, true);
  ACTION_HANDLERS["level-up-cancel"](state);
  assert.equal(state.levelUpOpen, false);
  ACTION_HANDLERS["arm-delete-campaign"](state, el({ campaignId: "c1" }));
  assert.equal(state.pendingDeleteId, "c1");
  ACTION_HANDLERS["cancel-delete-campaign"](state);
  assert.equal(state.pendingDeleteId, "");
  const before = state.dice3dEnabled;
  ACTION_HANDLERS["toggle-dice3d"](state);
  assert.equal(state.dice3dEnabled, !before);
  assert.equal(JSON.parse(localStorage.getItem("vox-dungeon-prefs-v1")).dice3d, !before);
});

test("rolar d20 - guarda a rolagem e devolve o payload do overlay", async () => {
  const payload = await ACTION_HANDLERS["roll-d20"](state, el(), null, opts);
  assert.equal(payload.ok, true);
  assert.equal(payload.total, state.lastRoll.value);
  assert.equal(payload.crits, payload.total === 20 ? 1 : 0);
  assert.equal(payload.fumbles, payload.total === 1 ? 1 : 0);
  assert.equal(payload.rolls[0].sides, 20);
});

test("ajustes de PV e moedas - aplicam o delta na ficha da sessão", async () => {
  const hp0 = state.sheet.hp_current ?? state.sheet.hp?.current;
  await ACTION_HANDLERS["hp-minus"](state, el(), null, opts);
  await ACTION_HANDLERS["hp-plus"](state, el(), null, opts);
  assert.equal(state.sheet.hp_current ?? state.sheet.hp?.current, hp0);
  await ACTION_HANDLERS["spend-10"](state, el(), null, opts);
  await ACTION_HANDLERS["test-overdraft"](state, el(), null, opts);
  assert.ok(state.sheet.delta_ledger.length >= 2);
});

test("ações de cena e táticas pelo mapa de handlers", async () => {
  await ACTION_HANDLERS["toggle-grid-type"](state, el(), null, opts);
  await ACTION_HANDLERS["toggle-fog"](state, el(), null, opts);
  await ACTION_HANDLERS["reset-fog"](state, el(), null, opts);
  await ACTION_HANDLERS["clear-drawings"](state, el(), null, opts);
  await ACTION_HANDLERS["clear-aoes"](state, el(), null, opts);
  await ACTION_HANDLERS["add-floor"](state, el(), null, opts);
  const sc = () => getActiveScene(state);
  assert.equal(sc().floors.length, 2);
  await ACTION_HANDLERS["select-floor"](state, el({ floorZ: "0" }), null, opts);
  assert.equal(sc().activeFloorZ, 0);
  const tid = sc().tokens[0].tokenId;
  await ACTION_HANDLERS["move-token-floor"](state, el({ tokenId: tid, floorZ: "1" }), null, opts);
  assert.equal(sc().tokens.find((t) => t.tokenId === tid).floorZ, 1);
  await ACTION_HANDLERS["nudge-token"](state, el({ tokenId: tid, dx: "1", dy: "0" }), null, opts);
  await ACTION_HANDLERS["toggle-token-layer"](state, el({ tokenId: tid }), null, opts);
  assert.equal(sc().tokens.find((t) => t.tokenId === tid).layer, "gm");
  await ACTION_HANDLERS["toggle-condition"](state, el({ tokenId: tid, conditionId: "caido" }), null, opts);
  await ACTION_HANDLERS["roll-initiative"](state, el(), null, opts);
  assert.ok(state.initiative.entries.length > 0);
  await ACTION_HANDLERS["next-turn"](state, el(), null, opts);
  await ACTION_HANDLERS["reset-initiative"](state, el(), null, opts);
  assert.equal(state.initiative.entries.length, 0);
  await ACTION_HANDLERS["remove-token"](state, el({ tokenId: tid }), null, opts);
  assert.equal(sc().tokens.some((t) => t.tokenId === tid), false);
});

test("exportar - usa o callback de download ou grava o aviso de falha", async () => {
  const downloads = [];
  const c = { querySelector: (s) => (s === "#dungeon-backup-passphrase" ? { value: "segredo-forte-123" } : null) };
  await ACTION_HANDLERS["export-chronicle-md"](state, el(), c, { ...opts, onDownload: (a) => downloads.push(a) });
  assert.match(downloads[0].filename, /-cronica\.md$/);
  assert.match(state.campaignNotice, /Backup gerado: .*-cronica\.md/);
  await ACTION_HANDLERS["export-voxrpg"](state, el(), c, { ...opts, onDownload: (a) => downloads.push(a) });
  assert.equal(downloads[1].mime, "application/zip");
  await ACTION_HANDLERS["export-voxrpg-enc"](state, el(), c, { ...opts, onDownload: (a) => downloads.push(a) });
  assert.match(downloads[2].filename, /\.voxrpg\.enc$/);
  await ACTION_HANDLERS["export-voxrpg-enc"](state, el(), { querySelector: () => null }, { ...opts, onDownload: () => {} });
  assert.ok(state.campaignNotice.length > 0);
});

test("exportar - sem callback sem document ou URL.createObjectURL não faz download e não quebra", async () => {
  await ACTION_HANDLERS["export-chronicle-md"](state, el(), { querySelector: () => null }, opts);
  assert.match(state.campaignNotice, /Backup gerado/);
});

test("formulário de ação - texto vazio é ignorado; barra de rolagem vira rolagem de fórmula", async () => {
  const k = "action-form";
  assert.equal(dispatchDungeonFormSubmit(k, state, form({ "#dungeon-action-input": "  " }), ctx()), undefined);
  const job = dispatchDungeonFormSubmit(k, state, form({ "#dungeon-action-input": "/roll 1d6" }), ctx());
  const res = await job;
  assert.equal(res.ok, true);
  assert.equal(settled.at(-1)[1].showDice3d, true);
  const before = state.chronicle.length;
  assert.equal(dispatchDungeonFormSubmit(k, state, form({ "#dungeon-action-input": "Examino a porta" }), ctx()), undefined);
  assert.ok(state.chronicle.length > before);
  assert.deepEqual(settled.at(-1), ["redraw", "#dungeon-action-input"]);
});

test("formulário de ação com campanha salva persiste a nova entrada da crônica", async () => {
  await ACTION_HANDLERS["generate-invite"](state, el(), null, opts);
  const job = dispatchDungeonFormSubmit("action-form", state, form({ "#dungeon-action-input": "Abro a cripta" }), ctx());
  await job;
  const saved = await opts.store.loadCampaign(state.campaignId);
  assert.ok(saved.chronicle.some((e) => /cripta/i.test(e.text)));
  state.syncPeer?.destroy?.();
});

test("formulários de ficha, token, porta e item chamam a ação certa", async () => {
  await dispatchDungeonFormSubmit("edit-sheet-form", state, form({ "[name=sheetName]": "Lyra II", "[name=sheetClass]": "Maga", "[name=armorClass]": "15", "[name=str]": "18" }), ctx());
  assert.match(state.campaignNotice, /Ficha "Lyra II" atualizada/);
  assert.equal(dispatchDungeonFormSubmit("edit-token-form", state, form({}), ctx()), undefined);
  const tid = getActiveScene(state).tokens[0].tokenId;
  await dispatchDungeonFormSubmit("edit-token-form", state, form({ "[name=hpMax]": "40", "[name=hpCurrent]": "12", "[name=sizeCells]": "2" }, { tokenId: tid }), ctx());
  const tok = getActiveScene(state).tokens.find((t) => t.tokenId === tid);
  assert.deepEqual([tok.hpMax, tok.hpCurrent, tok.sizeCells], [40, 12, 2]);
  const doors = getActiveScene(state).floors[0].doors.length;
  await dispatchDungeonFormSubmit("add-door-form", state, form({ "[name=doorState]": "locked" }), ctx());
  assert.equal(getActiveScene(state).floors[0].doors.length, doors + 1);
  assert.equal(dispatchDungeonFormSubmit("add-item-form", state, form({ "[name=itemLabel]": "" }), ctx()), undefined);
  await dispatchDungeonFormSubmit("add-item-form", state, form({ "[name=itemLabel]": "Corda", "[name=itemQty]": "0" }), ctx());
  assert.match(state.campaignNotice, /Item "Corda" adicionado/);
});

test("formulários de ação clicável, token, campanha e rolagem", async () => {
  await dispatchDungeonFormSubmit("add-action-form", state, form({ "#dungeon-action-label": "Arco", "#dungeon-action-formula": "1d20+3", "#dungeon-action-damage": "1d8" }), ctx());
  assert.match(state.campaignNotice, /Ação "Arco" adicionada/);
  await dispatchDungeonFormSubmit("add-action-form", state, form({ "#dungeon-action-label": "", "#dungeon-action-formula": "" }), ctx());
  assert.match(state.rollError, /Informe nome e fórmula/);
  assert.equal(dispatchDungeonFormSubmit("add-token-form", state, form({}), ctx()), undefined);
  await dispatchDungeonFormSubmit("add-token-form", state, form({ "#dungeon-token-name": "Troll", "#dungeon-token-layer": "gm" }), ctx());
  assert.equal(getActiveScene(state).tokens.find((t) => t.name === "Troll").layer, "gm");
  assert.equal(dispatchDungeonFormSubmit("create-campaign-form", state, form({}), ctx()), undefined);
  await dispatchDungeonFormSubmit("create-campaign-form", state, form({ "#dungeon-campaign-name": "Saga", "#dungeon-campaign-system": "libre" }), ctx());
  assert.equal((await opts.store.loadCampaign(state.campaignId)).name, "Saga");
  assert.equal(dispatchDungeonFormSubmit("roll-formula-form", state, form({}), ctx()), undefined);
  const roll = await dispatchDungeonFormSubmit("roll-formula-form", state, form({ "#dungeon-roll-input": "2d6" }), ctx());
  assert.equal(roll.ok, true);
  assert.equal(dispatchDungeonFormSubmit("desconhecido", state, form({}), ctx()), undefined);
});
