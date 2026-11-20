import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  drawDrawingsLayer,
  drawDoorsLayer,
  drawFogLayer,
  drawRulerLayer,
} from "../client/js/dungeon/canvas-tactics-layers.js";

/** @returns {CanvasRenderingContext2D} */
function mockCtx() {
  const noop = () => {};
  return {
    save: noop,
    restore: noop,
    globalAlpha: 1,
    strokeStyle: "",
    lineWidth: 0,
    lineCap: "butt",
    lineJoin: "miter",
    fillStyle: "",
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    stroke: noop,
    fill: noop,
    arc: noop,
    rect: noop,
    translate: noop,
    rotate: noop,
    setLineDash: noop,
    strokeRect: noop,
    fillRect: noop,
    fillText: noop,
  };
}

const SEG = [
  { wx: 0, wy: 0 },
  { wx: 64, wy: 64 },
];

test("canvas-tactics-layers: drawDrawingsLayer filtra camada GM (Zero-Spoiler)", () => {
  const floor = {
    drawings: [
      { layer: "player", points: SEG, color: "#78d6cf", width: 3 },
      { layer: "gm", points: SEG, color: "#ce93d8", width: 3 },
    ],
  };
  assert.equal(drawDrawingsLayer(mockCtx(), floor, "player"), 1);
  assert.equal(drawDrawingsLayer(mockCtx(), floor, "gm"), 2);
  const withDraft = drawDrawingsLayer(mockCtx(), floor, "gm", {
    points: SEG,
    color: "#e7c26b",
    width: 2,
  });
  assert.equal(withDraft, 2);
});

test("canvas-tactics-layers: drawDoorsLayer oculta portas secret para jogador", () => {
  const floor = {
    grid: { cellPx: 64 },
    doors: [
      { state: "closed", x1: 0, y1: 0, x2: 1, y2: 0 },
      { state: "secret", x1: 2, y1: 0, x2: 3, y2: 0 },
    ],
  };
  assert.equal(drawDoorsLayer(mockCtx(), floor, "player"), 1);
  assert.equal(drawDoorsLayer(mockCtx(), floor, "gm"), 2);
});

test("canvas-tactics-layers: drawFogLayer fail-closed quando névoa desativada", () => {
  assert.equal(drawFogLayer(mockCtx(), { fog: { enabled: false } }, "player"), false);
  const floor = { widthPx: 320, heightPx: 240, fog: { enabled: true, revealedRects: [{ x: 10, y: 10, w: 40, h: 40 }] } };
  assert.equal(drawFogLayer(mockCtx(), floor, "player"), true);
  assert.equal(drawFogLayer(mockCtx(), floor, "gm"), true);
});

test("canvas-tactics-layers: drawRulerLayer no-op sem régua e com fromWx/toWx", () => {
  const grid = { cellPx: 64, offsetX: 0, offsetY: 0 };
  assert.equal(drawRulerLayer(mockCtx(), null, grid), undefined);
  assert.equal(
    drawRulerLayer(mockCtx(), { fromWx: 0, fromWy: 0, toWx: 96, toWy: 0 }, grid),
    undefined,
  );
});