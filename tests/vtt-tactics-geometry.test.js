import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  distancePointToSegment,
  hitTestDoors,
  isPointRevealedByFog,
  pointInAoe,
  simplifyPolyline,
  tokensInsideAoe,
} from "../client/js/dungeon/vtt-tactics-geometry.js";

test("vtt-tactics-geometry: Ramer-Douglas-Peucker simplifica reta e preserva vértices de curva", () => {
  const straight = [
    { wx: 0, wy: 0 },
    { wx: 20, wy: 1 },
    { wx: 40, wy: 0 },
    { wx: 60, wy: -1 },
    { wx: 80, wy: 0 },
  ];
  assert.equal(simplifyPolyline(straight, 4).length, 2);

  const corner = [
    { wx: 0, wy: 0 },
    { wx: 50, wy: 0 },
    { wx: 50, wy: 50 },
    { wx: 100, wy: 50 },
  ];
  assert.equal(simplifyPolyline(corner, 4).length, 4);
  assert.equal(distancePointToSegment({ wx: 5, wy: 5 }, { x1: 5, y1: 5, x2: 5, y2: 5 }), 0);
});

test("vtt-tactics-geometry: hit-test de AoE (esfera, cone, cubo, linha) com Zero-Spoiler", () => {
  const grid = { type: "square", cellPx: 64 };
  const tokens = [
    { tokenId: "p1", x: 2, y: 2, sizeCells: 1, layer: "player" },
    { tokenId: "p2", x: 5, y: 2, sizeCells: 1, layer: "player" },
    { tokenId: "gm1", x: 2, y: 2, sizeCells: 1, layer: "gm" },
  ];
  const circle = { kind: "circle", wx: 2.5 * 64, wy: 2.5 * 64, radiusCells: 1.5, layer: "player" };
  assert.deepEqual(tokensInsideAoe(circle, tokens, grid, "player").map((t) => t.tokenId), ["p1"]);
  assert.deepEqual(tokensInsideAoe(circle, tokens, grid, "gm").map((t) => t.tokenId), ["p1", "gm1"]);

  const cone = { kind: "cone", wx: 64, wy: 2.5 * 64, lengthCells: 5, angleRad: 0, spreadDeg: 60, layer: "player" };
  assert.deepEqual(tokensInsideAoe(cone, tokens, grid, "player").map((t) => t.tokenId), ["p1", "p2"]);

  const cube = { kind: "cube", wx: 2 * 64, wy: 2 * 64, lengthCells: 2, layer: "player" };
  assert.deepEqual(tokensInsideAoe(cube, tokens, grid, "player").map((t) => t.tokenId), ["p1"]);

  const line = { kind: "line", wx: 2 * 64, wy: 2.5 * 64, lengthCells: 4, widthCells: 1, angleRad: 0, layer: "player" };
  assert.deepEqual(tokensInsideAoe(line, tokens, grid, "player").map((t) => t.tokenId), ["p1", "p2"]);
  assert.equal(pointInAoe(999, 999, line, grid), false);
});

test("vtt-tactics-geometry: hitTestDoors ignora portas secretas p/ jogador e fog valida áreas reveladas", () => {
  const grid = { type: "square", cellPx: 64 };
  const doors = [
    { doorId: "d-pub", x1: 2, y1: 1, x2: 2, y2: 2, state: "closed" },
    { doorId: "d-sec", x1: 4, y1: 1, x2: 4, y2: 2, state: "secret" },
  ];
  assert.equal(hitTestDoors(2 * 64, 1.5 * 64, doors, grid, { viewerRole: "player" })?.doorId, "d-pub");
  assert.equal(hitTestDoors(4 * 64, 1.5 * 64, doors, grid, { viewerRole: "player" }), null);
  assert.equal(hitTestDoors(4 * 64, 1.5 * 64, doors, grid, { viewerRole: "gm" })?.doorId, "d-sec");

  assert.equal(isPointRevealedByFog(10, 10, { enabled: false, revealedRects: [] }), true);
  const fog = { enabled: true, revealedRects: [{ id: "r1", x: 100, y: 100, w: 120, h: 80 }] };
  assert.equal(isPointRevealedByFog(150, 140, fog), true);
  assert.equal(isPointRevealedByFog(20, 20, fog), false);
});
