import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { renderSceneToCanvas } from "../client/js/dungeon/canvas-renderer.js";
import { attachCanvasInput } from "../client/js/dungeon/canvas-input.js";
import { createDefaultScene } from "../client/js/dungeon/vtt-scene-schema.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { renderDungeonView, wireDungeonView } from "../client/js/dungeon/dungeon-controller.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";

function makeMockCanvas(width = 768, height = 576) {
  const texts = [];
  const listeners = {};
  const ctx = {
    save: () => {},
    restore: () => {},
    setTransform: () => {},
    translate: () => {},
    scale: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    setLineDash: () => {},
    drawImage: () => {},
    fillText: (t) => texts.push(String(t)),
  };
  return {
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    style: {},
    texts,
    listeners,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    addEventListener: (k, fn) => { listeners[k] = fn; },
    removeEventListener: (k) => { delete listeners[k]; },
  };
}

test("canvas-renderer: desenha camada GM apenas para Mestre e suporta grade quadrada/hex", () => {
  const scene = createDefaultScene("local");
  const gmCanvas = makeMockCanvas();
  const gmRes = renderSceneToCanvas(gmCanvas, scene, { viewerRole: "gm" });
  assert.equal(gmRes.drawnTokens, 2);
  assert.ok(gmCanvas.texts.some((t) => t.includes("[GM] Sentinela")));

  const playerCanvas = makeMockCanvas();
  const plRes = renderSceneToCanvas(playerCanvas, scene, { viewerRole: "player" });
  assert.equal(plRes.drawnTokens, 1);
  assert.ok(!playerCanvas.texts.some((t) => t.includes("Sentinela")));

  scene.floors[0].grid.type = "hex";
  const hexRes = renderSceneToCanvas(makeMockCanvas(), scene, { viewerRole: "gm" });
  assert.equal(hexRes.drawnTokens, 2);
});

test("canvas-input: arraste de token, pan, pinça 2 dedos, wheel e bloqueio de token GM para jogador", () => {
  const scene = createDefaultScene("local");
  const canvas = makeMockCanvas();
  let camera = { panX: 0, panY: 0, zoom: 1 };
  let role = "gm";
  const moves = [];
  const detach = attachCanvasInput(canvas, {
    getScene: () => scene,
    getCamera: () => camera,
    getViewerRole: () => role,
    onCameraChange: (c) => { camera = c; },
    onTokenMove: (id, x, y) => moves.push({ id, x, y }),
  });
  assert.equal(canvas.style.touchAction, "none");

  canvas.listeners.pointerdown({ pointerId: 1, clientX: 2 * 64 + 32, clientY: 3 * 64 + 32, button: 0 });
  canvas.listeners.pointermove({ pointerId: 1, clientX: 4 * 64 + 32, clientY: 5 * 64 + 32 });
  canvas.listeners.pointerup({ pointerId: 1, clientX: 4 * 64 + 32, clientY: 5 * 64 + 32 });
  assert.deepEqual(moves[0], { id: "tok-lyra", x: 4, y: 5 });

  canvas.listeners.pointerdown({ pointerId: 2, clientX: 10, clientY: 10, button: 0 });
  canvas.listeners.pointermove({ pointerId: 2, clientX: 50, clientY: 35 });
  canvas.listeners.pointerup({ pointerId: 2, clientX: 50, clientY: 35 });
  assert.equal(camera.panX, 40);

  canvas.listeners.wheel({ clientX: 100, clientY: 100, deltaY: -100, preventDefault: () => {} });
  assert.ok(camera.zoom > 1);

  role = "player";
  const camBefore = { ...camera };
  canvas.listeners.pointerdown({ pointerId: 3, clientX: 7 * 64 + 32, clientY: 4 * 64 + 32, button: 0 });
  canvas.listeners.pointermove({ pointerId: 3, clientX: 8 * 64 + 32, clientY: 4 * 64 + 32 });
  canvas.listeners.pointerup({ pointerId: 3, clientX: 8 * 64 + 32, clientY: 4 * 64 + 32 });
  assert.equal(moves.length, 1);
  assert.notEqual(camera.panX, camBefore.panX);
  detach();
});

test("vtt-e2 controller: mapa SHA-256, token GM oculto na visão jogador, revelação, grade hex e convite P2P", async () => {
  const store = createVttStore(createMemoryVttBackend(), {
    requestPersistenceFn: async () => ({ persisted: true, isSupported: true }),
    estimateStorageFn: async () => ({ quota: 10000, usage: 10, percentage: 0.1, isSupported: true }),
    checkPersistenceFn: async () => true,
  });
  const state = createDungeonSessionState();
  const listeners = {};
  const inputs = {
    "#dungeon-token-name": { value: "Goblin Espião" },
    "#dungeon-token-layer": { value: "gm" },
  };
  const host = { dataset: {}, innerHTML: "", addEventListener: (k, fn) => { listeners[k] = fn; }, querySelector: (s) => inputs[s] || null };
  wireDungeonView(host, { screen: "mesa", state, store });
  await new Promise((r) => setTimeout(r, 15));

  await listeners.change({ target: { dataset: { dungeon: "upload-map" }, files: [{ name: "mapa.png", type: "image/png", bytes: new Uint8Array([1, 2, 3, 4]) }] } });
  assert.match(state.mapNotice, /Mapa salvo localmente/);
  await listeners.change({ target: { dataset: { dungeon: "upload-map" }, files: [{ name: "mapa.png", type: "image/png", bytes: new Uint8Array([1, 2, 3, 4]) }] } });
  assert.match(state.mapNotice, /sem duplicar disco/);

  await listeners.submit({ target: { dataset: { dungeon: "add-token-form" }, querySelector: (s) => inputs[s] }, preventDefault: () => {} });
  assert.ok(renderDungeonView({ screen: "mesa", state }).includes("Goblin Espião"));

  listeners.click({ target: { closest: () => ({ dataset: { dungeon: "toggle-viewer-role" } }) } });
  assert.equal(state.viewerRole, "player");
  assert.ok(!renderDungeonView({ screen: "mesa", state }).includes("Goblin Espião"), "token GM não pode aparecer no roster na visão jogador");

  listeners.click({ target: { closest: () => ({ dataset: { dungeon: "toggle-viewer-role" } }) } });
  const goblin = state.scene.tokens.find((t) => t.name === "Goblin Espião");
  await listeners.click({ target: { closest: () => ({ dataset: { dungeon: "toggle-token-layer", tokenId: goblin.tokenId } }) } });
  assert.equal(state.scene.tokens.find((t) => t.tokenId === goblin.tokenId).layer, "player");

  await listeners.click({ target: { closest: () => ({ dataset: { dungeon: "toggle-grid-type" } }) } });
  assert.equal(state.scene.floors[0].grid.type, "hex");

  await listeners.click({ target: { closest: () => ({ dataset: { dungeon: "generate-invite" } }) } });
  assert.match(state.inviteHref, /^#\/dungeon\/entrar\/.+\?gm=vx_.+#k=/);
  assert.ok(renderDungeonView({ screen: "mestre", state }).includes(state.inviteHref));
  state.syncPeer?.close();
});
