import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  canvasToInvestigationBoard,
  MAX_CANVAS_JSON_BYTES,
  parseObsidianCanvas,
} from "../client/js/dungeon/obsidian-bridge.js";

test("canvas: parse e quadro de pistas", () => {
  const json = {
    nodes: [{ id: "a", type: "text", x: 10, y: 20, text: "Pista A" }],
    edges: [],
  };
  const parsed = parseObsidianCanvas(json);
  const board = canvasToInvestigationBoard(parsed);
  assert.equal(board.length, 1);
  assert.equal(board[0].label, "Pista A");
});

test("canvas: rejeita oversize", () => {
  const huge = { nodes: [{ id: "x", type: "text", text: "x".repeat(MAX_CANVAS_JSON_BYTES) }], edges: [] };
  assert.throws(() => parseObsidianCanvas(huge), /excede/);
});