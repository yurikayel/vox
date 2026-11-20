import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  CONDITION_CATALOG,
  createAoeDoc,
  createDoorDoc,
  createDrawingDoc,
  createFogState,
  createInitiativeState,
  normalizeTokenConditions,
  sortInitiativeEntries,
} from "../client/js/dungeon/vtt-tactics-schema.js";

test("vtt-tactics-schema: normalizeTokenConditions deduplica, catálogo e duração", () => {
  const fromStrings = normalizeTokenConditions(["envenenado", "envenenado", "desconhecida"]);
  assert.equal(fromStrings.length, 2);
  assert.equal(fromStrings[0].glyph, "☠");
  assert.equal(fromStrings[1].label, "desconhecida");
  const timed = normalizeTokenConditions([{ id: "queimando", durationRounds: 0.7 }, { durationRounds: -3 }]);
  assert.equal(timed[0].durationRounds, 1);
  assert.equal(normalizeTokenConditions("nope").length, 0);
});

test("vtt-tactics-schema: createDoorDoc/createDrawingDoc defaults e validação", () => {
  const door = createDoorDoc({ doorId: "d1", state: "bogus", x1: -2, y2: 3 });
  assert.equal(door.doorId, "d1");
  assert.equal(door.state, "closed");
  assert.equal(door.x1, 0);
  assert.equal(door.x2, 1);
  const drw = createDrawingDoc({
    color: "red",
    width: 99,
    layer: "gm",
    points: [{ wx: 1.2, wy: 2.8 }, ...Array.from({ length: 250 }, () => ({ wx: 0, wy: 0 }))],
  });
  assert.equal(drw.color, "#78d6cf");
  assert.equal(drw.width, 16);
  assert.equal(drw.layer, "gm");
  assert.equal(drw.points.length, 200);
  assert.deepEqual(drw.points[0], { wx: 1, wy: 3 });
});

test("vtt-tactics-schema: createAoeDoc/createFogState clamps e hex", () => {
  const aoe = createAoeDoc({ kind: "unknown", radiusCells: 50, spreadDeg: 5, color: "#abc" });
  assert.equal(aoe.kind, "circle");
  assert.equal(aoe.radiusCells, 20);
  assert.equal(aoe.spreadDeg, 15);
  assert.equal(aoe.color, "#ff8a65");
  const fog = createFogState({
    enabled: 1,
    revealedRects: [{ w: 4, h: 4 }, ...Array.from({ length: 200 }, (_, i) => ({ id: `r${i}` }))],
  });
  assert.equal(fog.enabled, true);
  assert.equal(fog.revealedRects.length, 128);
  assert.equal(fog.revealedRects[0].w, 8);
});

test("vtt-tactics-schema: iniciativa ordena e createInitiativeState normaliza", () => {
  const sorted = sortInitiativeEntries([
    { id: "b", roll: 10, tieBreak: 0 },
    { id: "a", roll: 10, tieBreak: 2 },
    { id: "c", roll: 12 },
  ]);
  assert.deepEqual(sorted.map((e) => e.id), ["c", "a", "b"]);
  const init = createInitiativeState({
    active: true,
    round: 0,
    turnIndex: 99,
    entries: [{ id: "e1", tokenId: "t1", name: "  ", roll: 8.9, hidden: 1 }],
  });
  assert.equal(init.round, 1);
  assert.equal(init.turnIndex, 0);
  assert.equal(init.entries[0].name, "Combatente");
  assert.equal(init.entries[0].roll, 8);
  assert.equal(init.entries[0].hidden, true);
  assert.equal(CONDITION_CATALOG.length, 12);
});