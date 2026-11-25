/**
 * @file Porta no canvas 2D (spec §3, U7): clique duplo do mouse alterna a porta; clique simples só seleciona;
 * jogador não interage com porta na névoa; o toque simples continua abrindo no touch.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { attachCanvasInput } from "../client/js/dungeon/canvas-input.js";
import { createDefaultScene } from "../client/js/dungeon/vtt-scene-schema.js";

const DOOR_XY = { clientX: 4 * 64, clientY: 2.5 * 64 };

function makeCanvas() {
  const listeners = {};
  return {
    listeners, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0 }),
    addEventListener: (k, fn) => { listeners[k] = fn; }, removeEventListener: (k) => { delete listeners[k]; },
  };
}

function setup(over = {}) {
  const scene = over.scene || createDefaultScene("local");
  scene.tokens = over.tokens || [];
  const toggles = [];
  const canvas = makeCanvas();
  attachCanvasInput(canvas, {
    getScene: () => scene, getCamera: () => ({ panX: 0, panY: 0, zoom: 1 }),
    getViewerRole: () => over.role || "gm", getTool: () => over.tool || "select",
    onDoorToggle: (id) => toggles.push(id),
  });
  return { canvas, toggles, scene };
}

const click = (canvas, extra = {}) => {
  canvas.listeners.pointerdown({ pointerId: 1, button: 0, ...DOOR_XY, ...extra });
  canvas.listeners.pointerup({ pointerId: 1, ...DOOR_XY, ...extra });
};

test("canvas-input porta: clique simples do mouse não alterna; o duplo alterna", () => {
  const { canvas, toggles } = setup();
  click(canvas, { pointerType: "mouse" });
  assert.deepEqual(toggles, []);
  canvas.listeners.dblclick({ button: 0, pointerType: "mouse", ...DOOR_XY });
  assert.deepEqual(toggles, ["door-cripta"]);
});

test("canvas-input porta: jogador não alterna porta que está na névoa", () => {
  const scene = createDefaultScene("local");
  scene.floors[0].fog = { enabled: true, revealedRects: [{ id: "f1", x: 0, y: 0, w: 200, h: 200 }] };
  const { canvas, toggles } = setup({ scene, role: "player" });
  canvas.listeners.dblclick({ button: 0, ...DOOR_XY });
  assert.deepEqual(toggles, []);
  scene.floors[0].fog.revealedRects.push({ id: "f2", x: 200, y: 100, w: 200, h: 200 });
  canvas.listeners.dblclick({ button: 0, ...DOOR_XY });
  assert.deepEqual(toggles, ["door-cripta"]);
});

test("canvas-input porta: o Mestre alterna mesmo na névoa e porta secreta fica fora do alcance do jogador", () => {
  const scene = createDefaultScene("local");
  scene.floors[0].fog = { enabled: true, revealedRects: [] };
  const gm = setup({ scene, role: "gm" });
  gm.canvas.listeners.dblclick({ button: 0, ...DOOR_XY });
  assert.deepEqual(gm.toggles, ["door-cripta"]);
  scene.floors[0].fog.enabled = false;
  scene.floors[0].doors.forEach((d) => { d.state = "secret"; });
  const pl = setup({ scene, role: "player" });
  pl.canvas.listeners.dblclick({ button: 0, ...DOOR_XY });
  assert.deepEqual(pl.toggles, []);
});

test("canvas-input porta: token no ponto, ferramenta de desenho e botão direito não alternam a porta", () => {
  const token = { tokenId: "t1", name: "T", x: 4, y: 2, floorZ: 0, layer: "player", sizeCells: 1 };
  const withToken = setup({ tokens: [token] });
  const bare = setup({ scene: createDefaultScene("local") });
  bare.canvas.listeners.dblclick({ button: 0, clientX: DOOR_XY.clientX + 10, clientY: DOOR_XY.clientY });
  assert.deepEqual(bare.toggles, ["door-cripta"], "controle: sem token, o mesmo ponto alterna");
  withToken.canvas.listeners.dblclick({ button: 0, clientX: DOOR_XY.clientX + 10, clientY: DOOR_XY.clientY });
  const drawing = setup({ tool: "draw" });
  drawing.canvas.listeners.dblclick({ button: 0, ...DOOR_XY });
  const right = setup();
  right.canvas.listeners.dblclick({ button: 2, ...DOOR_XY });
  assert.deepEqual([withToken.toggles, drawing.toggles, right.toggles], [[], [], []]);
});

test("canvas-input porta: no toque o toque simples abre e o dblclick sintético é ignorado", () => {
  const { canvas, toggles } = setup();
  click(canvas, { pointerType: "touch" });
  assert.deepEqual(toggles, ["door-cripta"]);
  canvas.listeners.dblclick({ button: 0, pointerType: "touch", ...DOOR_XY });
  assert.deepEqual(toggles, ["door-cripta"]);
});
