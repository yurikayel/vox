import "./setup.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { wireDungeonView } from "../client/js/dungeon/dungeon-controller.js";
import {
  applySheetLevelUp,
  mutateSheetInventory,
  pinNoteToScene,
  updateNoteVisibility,
  updateSheetBasicInfo,
} from "../client/js/dungeon/dungeon-persistence.js";
import {
  addDoorToScene,
  generateTableInvite,
  mountSceneCanvas,
  nudgeTokenInScene,
  updateTokenPropsInScene,
} from "../client/js/dungeon/dungeon-scene-actions.js";
import { dispatchCampaignOp } from "../client/js/dungeon/dungeon-sync-bridge.js";
import { captureUiViewState, restoreUiViewState } from "../client/js/dungeon/dungeon-dom-focus.js";
import { mountDice3dOverlay } from "../client/js/dungeon/dice-3d.js";
import { renderSheetScreen } from "../client/js/dungeon/screen-sheet.js";
import { renderTableScreen } from "../client/js/dungeon/screen-table.js";
import { renderZ3SessionBlock } from "../client/js/dungeon/screen-table-layout.js";
import { advanceTime, createDefaultCalendar, formatInWorldDate } from "../client/js/dungeon/vtt-calendar.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";
import { waitUntil } from "./helpers/wait-until.js";

function makeCanvasMock() {
  const listeners = {};
  const ctx = {
    save: () => {}, restore: () => {}, setTransform: () => {}, translate: () => {}, scale: () => {}, rotate: () => {},
    fillRect: () => {}, strokeRect: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, closePath: () => {},
    rect: () => {}, arc: () => {}, fill: () => {}, stroke: () => {}, setLineDash: () => {}, drawImage: () => {}, fillText: () => {},
  };
  return {
    width: 768, height: 576, clientWidth: 768, clientHeight: 576, style: {}, listeners,
    getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0 }),
    addEventListener: (k, fn) => { listeners[k] = fn; }, removeEventListener: (k) => { delete listeners[k]; },
  };
}

function makeStore() {
  return createVttStore(createMemoryVttBackend(), {
    requestPersistenceFn: async () => ({ persisted: true, isSupported: true }),
    estimateStorageFn: async () => ({ quota: 10_000_000, usage: 1024, percentage: 1, isSupported: true }),
    checkPersistenceFn: async () => true,
  });
}

test("P0-1: pointerdown no token ou fundo não destrói canvas (drag e pan sobrevivem)", async () => {
  const state = createDungeonSessionState({ viewerRole: "gm", _cameraTouched: true });
  const canvas = makeCanvasMock();
  const container = { querySelector: (s) => (s === "#dungeon-vtt-canvas" ? canvas : null) };
  let redraws = 0;
  mountSceneCanvas(container, state, { store: makeStore(), onStateMutated: () => { redraws += 1; } });

  canvas.listeners.pointerdown({ pointerId: 1, clientX: 2.5 * 64, clientY: 3.5 * 64, button: 0 });
  assert.equal(redraws, 0, "pointerdown no token nunca pode chamar redrawContainer");
  canvas.listeners.pointermove({ pointerId: 1, clientX: 5.5 * 64, clientY: 3.5 * 64 });
  canvas.listeners.pointerup({ pointerId: 1, clientX: 5.5 * 64, clientY: 3.5 * 64 });
  await waitUntil(()=> redraws >= 1);
  const lyra = state.scene.tokens.find((t) => t.tokenId === "tok-lyra");
  assert.equal(lyra.x, 5);
  assert.equal(redraws, 1);
});

test("P0-2: Handouts abre automaticamente quando há anexo e CSS desktop nunca oculta summary", () => {
  const css = readFileSync(new URL("../client/css/dungeon-layout.css", import.meta.url), "utf8");
  assert.ok(!css.includes("dungeon-drawer-segment > summary {\n    display: none"), "summary não pode sumir no desktop");
  const state = createDungeonSessionState({
    viewerRole: "player",
    notes: [{ id: "h1", title: "Mapa Antigo", visibility: "shared", publicMarkdown: "Pista", links: [] }],
  });
  const html = renderZ3SessionBlock(state, true);
  assert.match(html, /dungeon-drawer-handouts" data-dungeon-details="z3-handouts" open>\s*<summary>Handouts<\/summary>/);
});

test("P0-3: calendário avança +1 rodada sem lixo float e rotaciona fase da lua após 7 dias", () => {
  let cal = createDefaultCalendar({ minuteOfDay: 480, day: 1, moonPhase: "crescente" });
  cal = advanceTime(cal, "round").calendar;
  assert.equal(formatInWorldDate(cal), "Ano 1, 1 de Veredas — 08:00:06 (lua crescente)");
  for (let i = 0; i < 9; i += 1) cal = advanceTime(cal, "round").calendar;
  assert.equal(cal.minuteOfDay, 481);
  assert.equal(cal.secondInMinute, 0);
  assert.equal(formatInWorldDate(cal), "Ano 1, 1 de Veredas — 08:01 (lua crescente)");
  for (let d = 0; d < 7; d += 1) cal = advanceTime(cal, { minutes: 24 * 60 }).calendar;
  assert.equal(cal.day, 8);
  assert.equal(cal.moonPhase, "cheia");
});

test("P0-4: inventário OR-Set e level-up funcionam no modo inicial sem campanha salva", async () => {
  const state = createDungeonSessionState();
  assert.equal(state.campaignId, "");
  await mutateSheetInventory(state, "add", { label: "Adaga de Prata", qty: 2, weightLb: 0.5 });
  const item = state.sheet.inventoryItems.find((i) => i.label === "Adaga de Prata");
  assert.ok(item);
  assert.equal(item.qty, 2);
  await mutateSheetInventory(state, "toggle_equip", { itemId: item.id });
  assert.equal(state.sheet.inventoryItems.find((i) => i.id === item.id).equipped, true);
  const lvlBefore = state.sheet.attributes_lww.level;
  await applySheetLevelUp(state, makeStore(), "tormenta20");
  assert.equal(state.sheet.attributes_lww.level, lvlBefore + 1);
  assert.ok(renderSheetScreen(state).includes("Desequipar"));
});

test("P0-5: convite auto-salva campanha, dispatchCampaignOp usa syncPeer e p2p_player trava papel", async () => {
  const store = makeStore();
  const state = createDungeonSessionState({ viewerRole: "gm" });
  await generateTableInvite(state, { store });
  assert.ok(state.campaignId, "convite garante campanha salva no store");
  assert.ok(await store.loadCampaign(state.campaignId));

  const dispatched = [];
  state.syncPeer = { dispatchOp: async (op) => { dispatched.push(op); return null; } };
  await dispatchCampaignOp(state, "CHRONICLE_APPEND", { text: "Oi P2P" }, { store });
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].type, "CHRONICLE_APPEND");

  const p2pState = createDungeonSessionState({ viewerRole: "player", joinMode: "p2p_player" });
  assert.ok(!renderTableScreen(p2pState).includes('data-dungeon="toggle-viewer-role"'));
  assert.ok(renderTableScreen(p2pState).includes("Visão: Jogador (P2P)"));
  const listeners = {};
  const host = { dataset: {}, innerHTML: "", addEventListener: (k, f) => { listeners[k] = f; }, querySelector: () => null };
  wireDungeonView(host, { screen: "mesa", state: p2pState, store });
  listeners.click({ target: { closest: () => ({ dataset: { dungeon: "toggle-viewer-role" } }) } });
  assert.equal(p2pState.viewerRole, "player");
});

test("P0-6: overlay 3D monta em ownerDocument.body com z-index 80 sobrevivendo ao redraw", () => {
  const appended = [];
  const fakeBody = { appendChild: (node) => appended.push(node) };
  const fakeDoc = {
    body: fakeBody,
    createElement: () => ({ className: "", style: {}, dataset: {}, innerHTML: "", setAttribute: () => {}, appendChild: () => {}, remove: () => {} }),
  };
  const cleanup = mountDice3dOverlay({ ownerDocument: fakeDoc }, { ok: true, total: 20, crits: 1, rolls: [{ sides: 20, kept: true, value: 20 }] });
  assert.equal(appended.length, 1);
  assert.match(appended[0].style.cssText, /z-index:80/);
  cleanup();
});

test("P0-7 e P0-8: jogador vê ferramentas seguras e iniciativa pública; Prévia Jogador oculta segredos", () => {
  const state = createDungeonSessionState({
    viewerRole: "player",
    initiative: {
      active: true,
      round: 2,
      turnIndex: 0,
      entries: [
        { id: "i1", tokenId: "tok-lyra", name: "Lyra", roll: 17, hidden: false },
        { id: "i2", tokenId: "tok-sentinela", name: "Sentinela da Cripta", roll: 19, hidden: true },
      ],
    },
    chronicle: [
      { id: "t1", speaker: "Lyra", badge: "Rolagem", text: "Público 15", rollNote: "1d20 = 15", visibility: "public" },
      { id: "t2", speaker: "Mestre", badge: "Rolagem GM", text: "Segredo 19", rollNote: "1d20 = 19", visibility: "gm" },
      { id: "t3", speaker: "Lyra", badge: "Rolagem Cega", text: "Cega 4", rollNote: "1d20 = 4", visibility: "blind" },
    ],
    notes: [
      { id: "n1", title: "Carta Pública", visibility: "shared", publicMarkdown: "Aberta" },
      { id: "n2", title: "Trama Secreta", visibility: "gm_only", publicMarkdown: "Oculta" },
    ],
  });
  const tableHtml = renderTableScreen(state);
  assert.ok(tableHtml.includes("Régua") && !tableHtml.includes("Cortar Névoa"));
  assert.ok(tableHtml.includes("Rastreador de Iniciativa") && !tableHtml.includes("Sentinela da Cripta"));
  assert.ok(tableHtml.includes("Público 15") && !tableHtml.includes("Segredo 19") && !tableHtml.includes("Cega 4"));
  const sheetHtml = renderSheetScreen(state);
  assert.ok(sheetHtml.includes("Carta Pública") && !sheetHtml.includes("Trama Secreta"));
});

test("P1 e P2: edição de token/porta/ficha, visibilidade/pin de notas e restauração de foco/details", async () => {
  const state = createDungeonSessionState({
    viewerRole: "gm",
    notes: [{ id: "n-pista", title: "Mapa da Cripta", visibility: "gm_only", publicMarkdown: "Runas" }],
  });
  await nudgeTokenInScene(state, "tok-lyra", 1, -1);
  assert.equal(state.scene.tokens.find((t) => t.tokenId === "tok-lyra").x, 3);
  await updateTokenPropsInScene(state, "tok-lyra", { hpCurrent: 12, hpMax: 30, sizeCells: 2 });
  assert.equal(state.scene.tokens.find((t) => t.tokenId === "tok-lyra").hpCurrent, 12);
  await addDoorToScene(state, { x1: 1, y1: 1, x2: 1, y2: 2, state: "locked" });
  assert.ok(state.scene.floors[0].doors.some((d) => d.state === "locked"));
  await updateSheetBasicInfo(state, { name: "Kael", class_name: "Mago", armor_class: 15, int: 18 });
  assert.equal(state.sheet.name, "Kael");
  assert.equal(state.sheet.attributes_lww.abilities.int, 18);
  await updateNoteVisibility(state, "n-pista", "shared");
  await pinNoteToScene(state, "n-pista", { x: 4, y: 2 });
  assert.equal(state.notes.find((n) => n.id === "n-pista").visibility, "shared");
  assert.equal(state.notes.find((n) => n.id === "n-pista").pin.x, 4);

  let focused = false;
  const det = { dataset: { dungeonDetails: "sheet-edit" }, open: true };
  const btn = { dataset: { dungeon: "hp-plus" }, focus: () => { focused = true; } };
  const fakeContainer = {
    ownerDocument: { activeElement: btn },
    contains: (el) => el === btn,
    querySelectorAll: (s) => (s.includes("details") ? [det] : []),
    querySelector: (s) => (s === '[data-dungeon="hp-plus"]' ? btn : null),
  };
  const snap = captureUiViewState(fakeContainer);
  det.open = false;
  restoreUiViewState(fakeContainer, snap);
  assert.equal(det.open, true);
  assert.equal(focused, true);
});
