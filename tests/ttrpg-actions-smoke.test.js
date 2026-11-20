import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { createDefaultScene } from "../client/js/dungeon/vtt-scene-schema.js";
import {
  getActiveScene,
  addTokenToScene,
  removeTokenFromScene,
} from "../client/js/dungeon/dungeon-scene-actions.js";
import {
  toggleFogEnabled,
  resetInitiativeTracker,
  rollInitiativeForScene,
} from "../client/js/dungeon/dungeon-tactics-actions.js";
import { attachCanvasInput } from "../client/js/dungeon/canvas-input.js";
import { mountDice3dOverlay } from "../client/js/dungeon/dice-3d.js";

test("dungeon-scene-actions: getActiveScene usa cena, campaignDoc ou fallback padrão", () => {
  const seeded = createDefaultScene("local");
  const withScene = { scene: seeded };
  assert.equal(getActiveScene(withScene).sceneId, "sc-cripta");
  const fromDoc = {
    localActor: "vx_p1",
    campaignDoc: { activeSceneId: "sc-cripta", scenesById: { "sc-cripta": seeded } },
  };
  assert.equal(getActiveScene(fromDoc).name, "Cripta das Águas Sussurrantes");
  const bare = { localActor: "solo" };
  const fallback = getActiveScene(bare);
  assert.equal(bare.scene.sceneId, fallback.sceneId);
  assert.ok(fallback.floors.length > 0);
});

test("dungeon-scene-actions: addTokenToScene ignora nome vazio e upsert in-memory", async () => {
  const state = createDungeonSessionState({ viewerRole: "gm" });
  const before = state.scene.tokens.length;
  const unchanged = await addTokenToScene(state, { name: "   " });
  assert.equal(unchanged.tokens.length, before);
  const scene = await addTokenToScene(state, { name: "Lobo", x: 4, y: 4 });
  const added = scene.tokens.find((t) => t.name === "Lobo");
  assert.ok(added);
  assert.equal(added.x, 4);
  assert.equal(added.layer, "player");
  assert.match(state.mapNotice, /Lobo/);
});

test("dungeon-scene-actions: removeTokenFromScene limpa seleção e remove token", async () => {
  const state = createDungeonSessionState({ selectedTokenId: "tok-lyra" });
  const count = state.scene.tokens.length;
  const scene = await removeTokenFromScene(state, "tok-lyra");
  assert.equal(state.selectedTokenId, "");
  assert.equal(scene.tokens.length, count - 1);
  assert.ok(!scene.tokens.some((t) => t.tokenId === "tok-lyra"));
});

test("dungeon-tactics-actions: toggleFogEnabled alterna névoa no andar ativo", async () => {
  const state = createDungeonSessionState();
  assert.equal(state.scene.floors[0].fog.enabled, false);
  await toggleFogEnabled(state);
  assert.equal(getActiveScene(state).floors[0].fog.enabled, true);
  assert.match(state.mapNotice, /ativada/);
  await toggleFogEnabled(state);
  assert.equal(getActiveScene(state).floors[0].fog.enabled, false);
});

test("dungeon-tactics-actions: rollInitiativeForScene e resetInitiativeTracker", async () => {
  const state = createDungeonSessionState();
  const fixedBytes = () => new Uint8Array(32).fill(7);
  const init = await rollInitiativeForScene(state, { randomBytesFn: fixedBytes });
  assert.ok(init.entries.length >= 2);
  await resetInitiativeTracker(state);
  assert.equal(state.initiative.entries.length, 0);
  assert.equal(state.initiative.turnIndex, 0);
});

// canvas-input: gestos completos em vtt-tactics-combat.test.js; dice-3d sem import CSS pesado
test("canvas-input e dice-3d: exports leves não lançam em caminhos noop", () => {
  const teardownNull = attachCanvasInput(null, {});
  assert.doesNotThrow(() => teardownNull());
  const stub = { style: {}, addEventListener: () => {}, removeEventListener: () => {} };
  assert.doesNotThrow(() => attachCanvasInput(stub, {
    getScene: () => createDefaultScene("local"),
    getCamera: () => ({ panX: 0, panY: 0, zoom: 1 }),
  })());
  const offBad = mountDice3dOverlay(null, null);
  assert.doesNotThrow(() => offBad());
  assert.doesNotThrow(() => mountDice3dOverlay({ appendChild: () => {} }, { ok: false })());
});