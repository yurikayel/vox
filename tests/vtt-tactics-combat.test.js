import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { isAuthorizedVttOp, projectStateForPlayer, reduceCampaign } from "../client/js/dungeon/vtt-reducer.js";
import { renderSceneToCanvas } from "../client/js/dungeon/canvas-renderer.js";
import { attachCanvasInput } from "../client/js/dungeon/canvas-input.js";
import { createDefaultScene } from "../client/js/dungeon/vtt-scene-schema.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { renderDungeonView, wireDungeonView } from "../client/js/dungeon/dungeon-controller.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";
import { waitUntil } from "./helpers/wait-until.js";

function makeCanvasMock() {
  const texts = [];
  const listeners = {};
  const ctx = {
    save: () => {}, restore: () => {}, setTransform: () => {}, translate: () => {}, scale: () => {}, rotate: () => {},
    fillRect: () => {}, strokeRect: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, closePath: () => {},
    rect: () => {}, arc: () => {}, fill: () => {}, stroke: () => {}, setLineDash: () => {}, drawImage: () => {},
    fillText: (t) => texts.push(String(t)),
  };
  return {
    width: 768, height: 576, clientWidth: 768, clientHeight: 576, style: {}, texts, listeners,
    getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0 }),
    addEventListener: (k, fn) => { listeners[k] = fn; }, removeEventListener: (k) => { delete listeners[k]; },
  };
}

test("vtt-tactics: iniciativa oculta GM, decremento de condições por turno e virada de rodada", () => {
  let c = createCampaign({ id: "comb-1", name: "Combate", gmRouteId: "vx_gm" });
  c = reduceCampaign(c, createVttOp({ type: "TOKEN_CONDITION_SET", actor: "vx_gm", lamport: 1, payload: { tokenId: "tok-lyra", condition: { id: "envenenado", durationRounds: 2 } } }));
  c = reduceCampaign(c, createVttOp({ type: "TOKEN_CONDITION_SET", actor: "vx_gm", lamport: 2, payload: { tokenId: "tok-lyra", condition: { id: "concentrando", durationRounds: null } } }));
  c = reduceCampaign(c, createVttOp({ type: "INITIATIVE_SET_ENTRY", actor: "vx_gm", lamport: 3, payload: { entry: { tokenId: "tok-lyra", name: "Lyra", roll: 18 } } }));
  c = reduceCampaign(c, createVttOp({ type: "INITIATIVE_SET_ENTRY", actor: "vx_gm", lamport: 4, payload: { entry: { tokenId: "tok-sentinela", name: "Sentinela", roll: 14 } } }));

  const plView = projectStateForPlayer(c, "player", "vx_p1");
  assert.equal(plView.initiative.entries.length, 1);
  assert.equal(plView.initiative.entries[0].tokenId, "tok-lyra");

  c = reduceCampaign(c, createVttOp({ type: "INITIATIVE_NEXT", actor: "vx_gm", lamport: 5 }));
  assert.equal(c.initiative.turnIndex, 1);
  assert.equal(c.scenesById["sc-cripta"].tokens.find((t) => t.tokenId === "tok-lyra").conditions.find((x) => x.id === "envenenado").durationRounds, 1);

  c = reduceCampaign(c, createVttOp({ type: "INITIATIVE_NEXT", actor: "vx_gm", lamport: 6 }));
  assert.equal(c.initiative.round, 2);
  c = reduceCampaign(c, createVttOp({ type: "INITIATIVE_NEXT", actor: "vx_gm", lamport: 7 }));
  const lyraConds = c.scenesById["sc-cripta"].tokens.find((t) => t.tokenId === "tok-lyra").conditions;
  assert.deepEqual(lyraConds.map((x) => x.id), ["concentrando"]);
});

test("vtt-tactics: portas secretas/trancadas, desenhos GM, andares e autorização fail-closed", () => {
  let c = createCampaign({ id: "tac-2", name: "Masmorra", gmRouteId: "vx_gm" });
  c.scenesById["sc-cripta"].tokens[0].ownerRouteId = "vx_p1";
  c = reduceCampaign(c, createVttOp({ type: "DOOR_UPSERT", actor: "vx_gm", lamport: 1, payload: { door: { doorId: "d-lock", x1: 1, y1: 1, x2: 1, y2: 2, state: "locked" } } }));
  c = reduceCampaign(c, createVttOp({ type: "DRAWING_ADD", actor: "vx_gm", lamport: 2, payload: { drawing: { layer: "gm", points: [{ wx: 0, wy: 0 }, { wx: 40, wy: 40 }] } } }));
  c = reduceCampaign(c, createVttOp({ type: "FLOOR_ADD", actor: "vx_gm", lamport: 3, payload: { floor: { z: 1, name: "1º Andar" }, select: false } }));

  assert.equal(isAuthorizedVttOp(c, { type: "DOOR_STATE_SET", actor: "vx_p1", payload: { doorId: "door-cripta", state: "open" } }), true);
  assert.equal(isAuthorizedVttOp(c, { type: "DOOR_STATE_SET", actor: "vx_p1", payload: { doorId: "d-lock", state: "open" } }), false);
  assert.equal(isAuthorizedVttOp(c, { type: "DOOR_STATE_SET", actor: "vx_p1", payload: { doorId: "door-secreta", state: "open" } }), false);
  assert.equal(isAuthorizedVttOp(c, { type: "FOG_SET", actor: "vx_p1", payload: { enabled: false } }), false);
  assert.equal(isAuthorizedVttOp(c, { type: "DRAWING_ADD", actor: "vx_p1", payload: { drawing: { layer: "gm", points: [{ wx: 1, wy: 1 }] } } }), false);
  assert.equal(isAuthorizedVttOp(c, { type: "TOKEN_CHANGE_FLOOR", actor: "vx_p1", payload: { tokenId: "tok-lyra", floorZ: 1 } }), true);

  const pl = projectStateForPlayer(c, "player", "vx_p1");
  assert.equal(pl.scenesById["sc-cripta"].floors[0].doors.some((d) => d.doorId === "door-secreta"), false);
  assert.equal(pl.scenesById["sc-cripta"].floors[0].drawings.length, 0);

  c = reduceCampaign(c, createVttOp({ type: "TOKEN_CHANGE_FLOOR", actor: "vx_p1", lamport: 4, payload: { tokenId: "tok-lyra", floorZ: 1, x: 3, y: 2 } }));
  assert.equal(c.scenesById["sc-cripta"].tokens.find((t) => t.tokenId === "tok-lyra").floorZ, 1);
});

test("vtt-tactics: render 8 camadas (névoa/portas/AoE/régua/condições) e ferramentas no canvas-input", () => {
  const scene = createDefaultScene("local");
  scene.floors[0].fog = { enabled: true, revealedRects: [{ id: "f1", x: 0, y: 0, w: 200, h: 200 }] };
  scene.floors[0].aoes = [{ aoeId: "a1", kind: "circle", wx: 2.5 * 64, wy: 3.5 * 64, radiusCells: 2, color: "#ff8a65", layer: "player" }];
  scene.tokens[0].conditions = [{ id: "envenenado", durationRounds: 2 }];

  const gmCanvas = makeCanvasMock();
  const gmRes = renderSceneToCanvas(gmCanvas, scene, { viewerRole: "gm", ruler: { fromWx: 32, fromWy: 32, toWx: 224, toWy: 32 } });
  assert.equal(gmRes.drawnDoors, 2);
  assert.equal(gmRes.fogDrawn, true);
  assert.equal(gmRes.aoeHits, 1);
  assert.ok(gmCanvas.texts.some((t) => t.includes("4.5m (3c)")));

  const plRes = renderSceneToCanvas(makeCanvasMock(), scene, { viewerRole: "player" });
  assert.equal(plRes.drawnDoors, 1);

  const events = { doors: [], drawings: [], fogs: [], aoes: [] };
  let tool = "select";
  const c2 = makeCanvasMock();
  attachCanvasInput(c2, {
    getScene: () => scene, getCamera: () => ({ panX: 0, panY: 0, zoom: 1 }), getViewerRole: () => "gm", getTool: () => tool,
    onDoorToggle: (id) => events.doors.push(id),
    onDrawingCommit: (pts) => events.drawings.push(pts),
    onFogReveal: (r) => events.fogs.push(r),
    onAoeCommit: (a) => events.aoes.push(a),
  });
  c2.listeners.pointerdown({ pointerId: 1, clientX: 4 * 64, clientY: 2.5 * 64, button: 0 });
  c2.listeners.pointerup({ pointerId: 1, clientX: 4 * 64, clientY: 2.5 * 64 });
  assert.deepEqual(events.doors, [], "clique simples com o mouse só seleciona");
  c2.listeners.dblclick({ clientX: 4 * 64, clientY: 2.5 * 64, button: 0 });
  tool = "draw";
  c2.listeners.pointerdown({ pointerId: 2, clientX: 10, clientY: 10, button: 0 });
  c2.listeners.pointermove({ pointerId: 2, clientX: 40, clientY: 10 });
  c2.listeners.pointermove({ pointerId: 2, clientX: 80, clientY: 10 });
  c2.listeners.pointerup({ pointerId: 2, clientX: 80, clientY: 10 });
  tool = "fog-reveal";
  c2.listeners.pointerdown({ pointerId: 3, clientX: 20, clientY: 20, button: 0 });
  c2.listeners.pointermove({ pointerId: 3, clientX: 140, clientY: 120 });
  c2.listeners.pointerup({ pointerId: 3, clientX: 140, clientY: 120 });
  tool = "aoe-cone";
  c2.listeners.pointerdown({ pointerId: 4, clientX: 64, clientY: 64, button: 0 });
  c2.listeners.pointermove({ pointerId: 4, clientX: 256, clientY: 64 });
  c2.listeners.pointerup({ pointerId: 4, clientX: 256, clientY: 64 });
  assert.deepEqual(events.doors, ["door-cripta"]);
  assert.equal(events.drawings[0].length, 2);
  assert.equal(events.fogs[0].w, 120);
  assert.equal(events.aoes[0].kind, "cone");
});

test("vtt-tactics controller: iniciativa, condições, névoa, andares e Zero-Spoiler na UI da Mesa", async () => {
  globalThis.localStorage?.clear();
  const { saveDungeonPrefs } = await import("../client/js/dungeon/dungeon-persistence.js");
  saveDungeonPrefs({ viewerRole: "gm" });
  const store = createVttStore(createMemoryVttBackend(), {
    requestPersistenceFn: async () => ({ persisted: true, isSupported: true }),
    estimateStorageFn: async () => ({ quota: 10000, usage: 10, percentage: 0.1, isSupported: true }),
    checkPersistenceFn: async () => true,
  });
  const state = createDungeonSessionState();
  const listeners = {};
  const host = { dataset: {}, innerHTML: "", addEventListener: (k, fn) => { listeners[k] = fn; }, querySelector: () => null };
  wireDungeonView(host, { screen: "mesa", state, store });
  await waitUntil(() => state.persistenceReady);

  await listeners.click({ target: { closest: () => ({ dataset: { dungeon: "roll-initiative" } }) } });
  assert.equal(state.initiative.entries.length, 2);
  assert.ok(renderDungeonView({ screen: "mesa", state }).includes("Sentinela da Cripta"));

  listeners.click({ target: { closest: () => ({ dataset: { dungeon: "toggle-viewer-role" } }) } });
  assert.ok(!renderDungeonView({ screen: "mesa", state }).includes("Sentinela da Cripta"), "iniciativa oculta não vaza na visão jogador");
  listeners.click({ target: { closest: () => ({ dataset: { dungeon: "toggle-viewer-role" } }) } });

  listeners.click({ target: { closest: () => ({ dataset: { dungeon: "select-token", tokenId: "tok-lyra" } }) } });
  await listeners.click({ target: { closest: () => ({ dataset: { dungeon: "toggle-condition", tokenId: "tok-lyra", conditionId: "queimando" } }) } });
  assert.equal(state.scene.tokens.find((t) => t.tokenId === "tok-lyra").conditions[0].id, "queimando");

  await listeners.click({ target: { closest: () => ({ dataset: { dungeon: "toggle-fog" } }) } });
  assert.equal(state.scene.floors[0].fog.enabled, true);

  await listeners.click({ target: { closest: () => ({ dataset: { dungeon: "add-floor" } }) } });
  assert.equal(state.scene.floors.length, 2);
  assert.equal(state.scene.activeFloorZ, 1);

  await listeners.click({ target: { closest: () => ({ dataset: { dungeon: "move-token-floor", tokenId: "tok-lyra", floorZ: "1" } }) } });
  assert.equal(state.scene.tokens.find((t) => t.tokenId === "tok-lyra").floorZ, 1);
  assert.equal(state.scene.tokens.find((t) => t.tokenId === "tok-lyra").conditions[0].id, "queimando");
});
