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
  assert.equal(move("heroi-visto")?.refreshSnapshot, true);
  const open = { ...state, scenesById: { "sc-nevoa": { ...state.scenesById["sc-nevoa"], floors: [{ ...state.scenesById["sc-nevoa"].floors[0], fog: { enabled: false, revealedRects: [] } }] } } };
  assert.equal(filterOpForPlayer(open, { type: "TOKEN_MOVE", payload: { sceneId: "sc-nevoa", tokenId: "heroi-visto", x: 2, y: 2 } }, "vx_p1").type, "TOKEN_MOVE");
  assert.notEqual(move("ogro-na-nevoa")?.type, "TOKEN_MOVE");
  const door = { type: "DOOR_UPSERT", payload: { sceneId: "sc-nevoa", floorZ: 0, door: state.scenesById["sc-nevoa"].floors[0].doors[1] } };
  assert.notEqual(filterOpForPlayer(state, door, "vx_p1")?.type, "DOOR_UPSERT");
  assert.equal(filterOpForPlayer(state, { type: "FOG_SET", payload: { sceneId: "sc-nevoa", floorZ: 0, enabled: true } }, "vx_p1")?.refreshSnapshot, true);
});

function fogStateExtras() {
  const state = fogState();
  const scene = state.scenesById["sc-nevoa"];
  const floor = {
    ...scene.floors[0],
    drawings: [
      { drawingId: "traco-visto", layer: "player", points: [{ wx: 70, wy: 70 }, { wx: 100, wy: 90 }] },
      { drawingId: "traco-oculto", layer: "player", points: [{ wx: 600, wy: 450 }, { wx: 620, wy: 470 }] },
    ],
    aoes: [
      { aoeId: "area-vista", layer: "player", kind: "circle", wx: 100, wy: 100 },
      { aoeId: "area-oculta", layer: "player", kind: "circle", wx: 600, wy: 450 },
    ],
    portals: [
      { portalId: "portal-visto", layer: "player", x: 1, y: 1, label: "Visto" },
      { portalId: "portal-oculto", layer: "player", x: 9, y: 7, label: "Oculto" },
    ],
  };
  return { ...state, scenesById: { "sc-nevoa": { ...scene, floors: [floor] } } };
}

test("snapshot do jogador: desenhos, AoE e portais fora da área revelada não são enviados", () => {
  const floor = projectStateForPlayer(fogStateExtras(), "player", "vx_p1").scenesById["sc-nevoa"].floors[0];
  assert.deepEqual(floor.drawings.map((d) => d.drawingId), ["traco-visto"]);
  assert.deepEqual(floor.aoes.map((a) => a.aoeId), ["area-vista"]);
  assert.deepEqual(floor.portals.map((p) => p.portalId), ["portal-visto"]);
});

test("iniciativa do jogador: entradas de token não revelado ficam de fora", () => {
  const state = { ...fogState(), initiative: { active: true, entries: [
    { id: "i1", tokenId: "heroi-visto", name: "Herói", roll: 15 },
    { id: "i2", tokenId: "ogro-na-nevoa", name: "Ogro", roll: 10 },
  ] } };
  const init = projectStateForPlayer(state, "player", "vx_p1").initiative;
  assert.deepEqual(init.entries.map((e) => e.tokenId), ["heroi-visto"]);
  assert.equal(projectStateForPlayer(state, "gm", "vx_gm").initiative.entries.length, 2);
});

test("deltas: remoção, troca de andar e entrada na área revelada pedem novo snapshot", () => {
  const state = fogState();
  const send = (type, payload) => filterOpForPlayer(state, { type, payload: { sceneId: "sc-nevoa", ...payload } }, "vx_p1");
  assert.equal(send("TOKEN_REMOVE", { tokenId: "ogro-na-nevoa" })?.refreshSnapshot, true);
  assert.equal(send("TOKEN_CHANGE_FLOOR", { tokenId: "ogro-na-nevoa", floorZ: 0 })?.refreshSnapshot, true);
  assert.equal(send("TOKEN_MOVE", { tokenId: "heroi-visto", x: 2, y: 2 })?.refreshSnapshot, true, "token que pode ter entrado na área revelada");
});
