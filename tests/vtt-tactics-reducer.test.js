import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign } from "../client/js/dungeon/vtt-schema.js";
import { createFloorDoc } from "../client/js/dungeon/vtt-scene-schema.js";
import {
  isPlayerAuthorizedForTacticsOp,
  projectInitiativeForPlayer,
  projectTacticsFloorForPlayer,
  TACTICS_OP_HANDLERS,
} from "../client/js/dungeon/vtt-tactics-reducer.js";

test("vtt-tactics-reducer: projectTacticsFloorForPlayer Zero-Spoiler", () => {
  const floor = createFloorDoc({
    doors: [
      { doorId: "pub", state: "open" },
      { doorId: "sec", state: "secret" },
    ],
    drawings: [
      { drawingId: "d-pl", layer: "player", points: [{ wx: 0, wy: 0 }] },
      { drawingId: "d-gm", layer: "gm", points: [{ wx: 1, wy: 1 }] },
    ],
    aoes: [{ aoeId: "a-pl", layer: "player" }, { aoeId: "a-gm", layer: "gm" }],
  });
  const view = projectTacticsFloorForPlayer(floor);
  assert.deepEqual(view.doors.map((d) => d.doorId), ["pub"]);
  assert.deepEqual(view.drawings.map((d) => d.drawingId), ["d-pl"]);
  assert.deepEqual(view.aoes.map((a) => a.aoeId), ["a-pl"]);
});

test("vtt-tactics-reducer: projectInitiativeForPlayer oculta GM/hidden e ajusta turnIndex", () => {
  const scenes = {
    sc1: {
      tokens: [{ tokenId: "gm-t", layer: "gm" }, { tokenId: "pl-t", layer: "player" }],
    },
  };
  const initiative = {
    active: true,
    round: 2,
    turnIndex: 1,
    entries: [
      { id: "e-pl", tokenId: "pl-t", name: "Lyra", roll: 18, hidden: false },
      { id: "e-gm", tokenId: "gm-t", name: "Boss", roll: 20, hidden: false },
      { id: "e-hid", tokenId: "", name: "Trap", roll: 15, hidden: true },
    ],
  };
  const view = projectInitiativeForPlayer(initiative, { sc1: scenes.sc1 });
  assert.equal(view.entries.length, 1);
  assert.equal(view.entries[0].tokenId, "pl-t");
  assert.equal(view.turnIndex, 0);
});

test("vtt-tactics-reducer: isPlayerAuthorizedForTacticsOp fail-closed e INITIATIVE_RESET", () => {
  let c = createCampaign({ id: "red-1", gmRouteId: "vx_gm" });
  c.scenesById["sc-cripta"].tokens[0].ownerRouteId = "vx_p1";
  const floor = c.scenesById["sc-cripta"].floors[0];
  floor.doors.push({ doorId: "toggle-me", state: "closed", x1: 0, y1: 0, x2: 1, y2: 0 });

  assert.equal(isPlayerAuthorizedForTacticsOp(c, { type: "DRAWING_ADD", payload: { drawing: { layer: "player" } } }), true);
  assert.equal(isPlayerAuthorizedForTacticsOp(c, { type: "DRAWING_ADD", payload: { drawing: { layer: "gm" } } }), false);
  assert.equal(isPlayerAuthorizedForTacticsOp(c, { type: "DOOR_STATE_SET", payload: { sceneId: "sc-cripta", floorZ: 0, doorId: "toggle-me", state: "open" } }), true);
  assert.equal(isPlayerAuthorizedForTacticsOp(c, { type: "FOG_SET", payload: {} }), false);
  assert.equal(
    isPlayerAuthorizedForTacticsOp(c, { type: "TOKEN_CHANGE_FLOOR", actor: "vx_p1", payload: { tokenId: "tok-lyra", floorZ: 0 } }),
    true,
  );

  c = { ...c, initiative: { active: true, round: 3, turnIndex: 1, entries: [{ id: "x" }] } };
  const next = TACTICS_OP_HANDLERS.INITIATIVE_RESET(c);
  assert.equal(next.initiative.active, false);
  assert.equal(next.initiative.entries.length, 0);
  assert.equal(next.initiative.round, 1);
});