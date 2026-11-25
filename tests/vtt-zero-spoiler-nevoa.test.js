/**
 * @file Zero-Spoiler da névoa: o estado e os deltas enviados ao jogador não carregam
 * tokens nem portas fora das áreas reveladas; o Mestre segue com tudo.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign } from "../client/js/dungeon/vtt-schema.js";
import { projectStateForPlayer } from "../client/js/dungeon/vtt-reducer.js";
import { filterOpForPlayer } from "../client/js/dungeon/vtt-sync.js";
import { createSceneDoc } from "../client/js/dungeon/vtt-scene-schema.js";

const REVEALED = { id: "r1", x: 0, y: 0, w: 256, h: 256 };

function fogState() {
  const scene = createSceneDoc({
    sceneId: "sc-nevoa",
    floors: [{
      z: 0,
      grid: { cellPx: 64 },
      fog: { enabled: true, revealedRects: [REVEALED] },
      doors: [
        { doorId: "porta-vista", x1: 1, y1: 1, x2: 2, y2: 1, state: "closed" },
        { doorId: "porta-oculta", x1: 8, y1: 6, x2: 9, y2: 6, state: "closed" },
      ],
    }],
    tokens: [
      { tokenId: "heroi-visto", x: 1, y: 1, layer: "player" },
      { tokenId: "ogro-na-nevoa", x: 9, y: 7, layer: "player" },
    ],
  });
  return { ...createCampaign({ id: "camp-nevoa", name: "Névoa" }), scenesById: { [scene.sceneId]: scene }, activeSceneId: scene.sceneId };
}

test("snapshot do jogador: tokens e portas fora da área revelada não são enviados", () => {
  const view = projectStateForPlayer(fogState(), "player", "vx_p1").scenesById["sc-nevoa"];
  assert.deepEqual(view.tokens.map((t) => t.tokenId), ["heroi-visto"]);
  assert.deepEqual(view.floors[0].doors.map((d) => d.doorId), ["porta-vista"]);
});

test("snapshot do Mestre: continua completo com a névoa ligada", () => {
  const view = projectStateForPlayer(fogState(), "gm", "vx_gm").scenesById["sc-nevoa"];
  assert.equal(view.tokens.length, 2);
  assert.equal(view.floors[0].doors.length, 2);
});

test("deltas: alvo na névoa não segue como está e mudar a névoa pede novo snapshot", () => {
  const state = fogState();
  const move = (tokenId) => filterOpForPlayer(state, { type: "TOKEN_MOVE", payload: { sceneId: "sc-nevoa", tokenId, x: 9, y: 7 } }, "vx_p1");
  assert.equal(move("heroi-visto")?.type, "TOKEN_MOVE");
  assert.notEqual(move("ogro-na-nevoa")?.type, "TOKEN_MOVE");
  const door = { type: "DOOR_UPSERT", payload: { sceneId: "sc-nevoa", floorZ: 0, door: state.scenesById["sc-nevoa"].floors[0].doors[1] } };
  assert.notEqual(filterOpForPlayer(state, door, "vx_p1")?.type, "DOOR_UPSERT");
  assert.equal(filterOpForPlayer(state, { type: "FOG_SET", payload: { sceneId: "sc-nevoa", floorZ: 0, enabled: true } }, "vx_p1")?.refreshSnapshot, true);
});
