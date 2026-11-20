import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  cellToWorldCenter,
  clampTokenToFloor,
  clampZoom,
  computeGridDistance,
  createCamera,
  hitTestTokens,
  MAX_ZOOM,
  MIN_ZOOM,
  screenToWorld,
  snapWorldToCell,
  worldToScreen,
  zoomCameraAt,
} from "../client/js/dungeon/vtt-geometry.js";

test("vtt-geometry: câmera pan/zoom mantém âncora fixa e respeita limites", () => {
  assert.equal(clampZoom(0.01), MIN_ZOOM);
  assert.equal(clampZoom(99), MAX_ZOOM);
  assert.equal(clampZoom(NaN), 1);

  const cam = createCamera({ panX: 40, panY: -20, zoom: 1.5 });
  const scr = worldToScreen(100, 80, cam);
  const back = screenToWorld(scr.sx, scr.sy, cam);
  assert.ok(Math.abs(back.wx - 100) < 1e-6);
  assert.ok(Math.abs(back.wy - 80) < 1e-6);

  const beforeAnchor = screenToWorld(250, 180, cam);
  const zoomed = zoomCameraAt(cam, 250, 180, 2.5);
  const afterAnchor = screenToWorld(250, 180, zoomed);
  assert.ok(Math.abs(afterAnchor.wx - beforeAnchor.wx) < 1e-6);
  assert.ok(Math.abs(afterAnchor.wy - beforeAnchor.wy) < 1e-6);
});

test("vtt-geometry: snap e distância em grade quadrada (5e, 5e-alt, euclidiana) e hexagonal", () => {
  const sq = { type: "square", cellPx: 64, unitMeters: 1.5 };
  const centerSq = cellToWorldCenter(3, 2, sq);
  assert.deepEqual(snapWorldToCell(centerSq.wx, centerSq.wy, sq), { x: 3, y: 2 });
  assert.deepEqual(computeGridDistance({ x: 0, y: 0 }, { x: 3, y: 2 }, sq, "5e"), { cells: 3, meters: 4.5 });
  assert.deepEqual(computeGridDistance({ x: 0, y: 0 }, { x: 3, y: 2 }, sq, "5e-alt"), { cells: 4, meters: 6 });
  assert.equal(computeGridDistance({ x: 0, y: 0 }, { x: 3, y: 4 }, sq, "euclidean").cells, 5);

  const hx = { type: "hex", cellPx: 64, unitMeters: 1.5 };
  for (const cell of [{ x: 0, y: 0 }, { x: 2, y: 1 }, { x: 4, y: 3 }]) {
    const c = cellToWorldCenter(cell.x, cell.y, hx);
    assert.deepEqual(snapWorldToCell(c.wx, c.wy, hx), cell);
  }
  assert.equal(computeGridDistance({ x: 1, y: 1 }, { x: 2, y: 1 }, hx).cells, 1);
  assert.equal(computeGridDistance({ x: 0, y: 0 }, { x: 2, y: 2 }, hx).cells, 3);
});

test("vtt-geometry: hitTestTokens respeita camada GM (fail-closed), z-order e clampTokenToFloor", () => {
  const grid = { type: "square", cellPx: 64 };
  const tokens = [
    { tokenId: "p1", x: 2, y: 2, sizeCells: 1, layer: "player" },
    { tokenId: "gm1", x: 2, y: 2, sizeCells: 1, layer: "gm" },
  ];
  const { wx, wy } = cellToWorldCenter(2, 2, grid);
  assert.equal(hitTestTokens(wx, wy, tokens, grid, "gm")?.tokenId, "gm1");
  assert.equal(hitTestTokens(wx, wy, tokens, grid, "player")?.tokenId, "p1");
  assert.equal(hitTestTokens(wx, wy, tokens, grid, undefined)?.tokenId, "p1");

  const floor = { widthPx: 768, heightPx: 576, grid };
  assert.deepEqual(clampTokenToFloor(-5, 99, 1, floor), { x: 0, y: 8 });
  assert.deepEqual(clampTokenToFloor(11, 8, 2, floor), { x: 10, y: 7 });
});
