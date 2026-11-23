/**
 * @file Cobertura T7 de `vtt-reducer.js` e `vtt-tactics-reducer.js`: operações de cena, ficha, névoa, desenhos,
 * áreas, portas, andares, iniciativa e permissões de jogador, aplicadas por `reduceCampaign`.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { isAuthorizedVttOp, reduceCampaign, replayCampaignOps } from "../client/js/dungeon/vtt-reducer.js";

const GM = "vx_gm";
let lamport = 0;

/**
 * Aplica uma operação com ator e lamport crescentes.
 * @param {object} state Campanha.
 * @param {string} type Tipo da operação.
 * @param {object} [payload] Carga.
 * @param {string} [actor] Autor.
 * @returns {object} Nova campanha.
 */
function apply(state, type, payload = {}, actor = GM) {
  lamport += 1;
  return reduceCampaign(state, createVttOp({ type, actor, lamport, payload }));
}

const base = () => createCampaign({ id: "camp-t7", name: "T7", gmRouteId: GM });
const scene = (c) => c.scenesById[c.activeSceneId];
const floor = (c) => scene(c).floors.find((f) => f.z === scene(c).activeFloorZ);
const tok = (c, id) => scene(c).tokens.find((t) => t.tokenId === id);

test("iniciativa - remover entrada por id ou token e desativar quando esvazia", () => {
  let c = apply(base(), "INITIATIVE_SET_ENTRY", { entry: { id: "e1", tokenId: "tok-lyra", name: "Lyra", roll: 15 } });
  c = apply(c, "INITIATIVE_SET_ENTRY", { entry: { id: "e2", name: "Livre", roll: 9 } });
  assert.equal(c.initiative.entries.length, 2);
  assert.equal(c.initiative.active, true);
  c = apply(c, "INITIATIVE_REMOVE_ENTRY", { entryId: "e2" });
  assert.deepEqual(c.initiative.entries.map((e) => e.id), ["e1"]);
  c = apply(c, "INITIATIVE_REMOVE_ENTRY", { tokenId: "tok-lyra" });
  assert.deepEqual([c.initiative.entries.length, c.initiative.active], [0, false]);
  const next = apply(c, "INITIATIVE_NEXT");
  assert.equal(next.initiative.round, c.initiative.round);
});

test("iniciativa - NEXT dá a volta incrementando a rodada e RESET zera o rastreador", () => {
  let c = apply(base(), "INITIATIVE_SET_ENTRY", { entry: { id: "e1", name: "A", roll: 10 } });
  c = apply(c, "INITIATIVE_SET_ENTRY", { entry: { id: "e2", name: "B", roll: 5 } });
  c = apply(c, "INITIATIVE_NEXT");
  assert.deepEqual([c.initiative.turnIndex, c.initiative.round], [1, 1]);
  c = apply(c, "INITIATIVE_NEXT");
  assert.deepEqual([c.initiative.turnIndex, c.initiative.round], [0, 2]);
  c = apply(c, "INITIATIVE_RESET");
  assert.deepEqual([c.initiative.active, c.initiative.round, c.initiative.entries], [false, 1, []]);
});

test("condições - definir, substituir e remover; entradas inválidas não alteram o token", () => {
  let c = apply(base(), "TOKEN_CONDITION_SET", { tokenId: "tok-lyra", condition: { id: "caido", durationRounds: 3 } });
  c = apply(c, "TOKEN_CONDITION_SET", { tokenId: "tok-lyra", condition: { id: "caido", durationRounds: 1 } });
  assert.deepEqual(tok(c, "tok-lyra").conditions.map((x) => [x.id, x.durationRounds]), [["caido", 1]]);
  const same = apply(c, "TOKEN_CONDITION_SET", { tokenId: "tok-lyra" });
  assert.deepEqual(tok(same, "tok-lyra").conditions, tok(c, "tok-lyra").conditions);
  const noToken = apply(c, "TOKEN_CONDITION_REMOVE", { conditionId: "caido" });
  assert.equal(tok(noToken, "tok-lyra").conditions.length, 1);
  c = apply(c, "TOKEN_CONDITION_REMOVE", { tokenId: "tok-lyra", conditionId: " CAIDO " });
  assert.deepEqual(tok(c, "tok-lyra").conditions, []);
});

test("névoa - revelar com tamanho mínimo, esconder retângulo, desligar e resetar", () => {
  let c = apply(base(), "FOG_SET", { enabled: true, revealRect: { id: "r1", x: 10.4, y: 20.6, w: 2, h: 500 } });
  assert.deepEqual(floor(c).fog.revealedRects, [{ id: "r1", x: 10, y: 21, w: 8, h: 500 }]);
  c = apply(c, "FOG_SET", { revealRect: { x: 0, y: 0, w: 50, h: 50 } });
  assert.equal(floor(c).fog.revealedRects.length, 2);
  c = apply(c, "FOG_SET", { hideRectId: "r1" });
  assert.equal(floor(c).fog.revealedRects.some((r) => r.id === "r1"), false);
  assert.equal(floor(c).fog.enabled, true);
  c = apply(c, "FOG_SET", { enabled: false, reset: true });
  assert.deepEqual([floor(c).fog.enabled, floor(c).fog.revealedRects], [false, []]);
});

test("desenhos - exige pontos, limita a 120 traços e limpa", () => {
  const pts = [{ wx: 0, wy: 0 }, { wx: 5, wy: 5 }];
  let c = apply(base(), "DRAWING_ADD", { drawing: { points: [] } });
  assert.equal((floor(c).drawings || []).length, 0);
  for (let i = 0; i < 125; i++) c = apply(c, "DRAWING_ADD", { drawing: { points: pts, drawingId: `d${i}` } });
  assert.equal(floor(c).drawings.length, 120);
  assert.equal(floor(c).drawings[0].drawingId, "d5");
  assert.equal(floor(c).drawings.at(-1).author, GM);
  c = apply(c, "DRAWING_CLEAR");
  assert.deepEqual(floor(c).drawings, []);
});

test("áreas de efeito - criar, substituir pelo id, remover, limpar e ignorar sem corpo", () => {
  let c = apply(base(), "AOE_UPSERT", {});
  assert.equal((floor(c).aoes || []).length, 0);
  c = apply(c, "AOE_UPSERT", { aoe: { aoeId: "a1", kind: "circle", wx: 10, wy: 10 } });
  c = apply(c, "AOE_UPSERT", { aoe: { aoeId: "a1", kind: "circle", wx: 99, wy: 10 } });
  c = apply(c, "AOE_UPSERT", { aoe: { aoeId: "a2", kind: "circle", wx: 1, wy: 1 } });
  assert.equal(floor(c).aoes.length, 2);
  assert.equal(floor(c).aoes.find((a) => a.aoeId === "a1").wx, 99);
  c = apply(c, "AOE_REMOVE", { aoeId: "a1" });
  assert.deepEqual(floor(c).aoes.map((a) => a.aoeId), ["a2"]);
  c = apply(c, "AOE_CLEAR");
  assert.deepEqual(floor(c).aoes, []);
});

test("portas - criar, mudar estado válido, recusar estado inválido e remover", () => {
  let c = apply(base(), "DOOR_UPSERT", {});
  const n0 = (floor(c).doors || []).length;
  c = apply(c, "DOOR_UPSERT", { door: { doorId: "d1", x1: 1, y1: 1, x2: 1, y2: 2, state: "closed" } });
  c = apply(c, "DOOR_UPSERT", { door: { doorId: "d1", x1: 1, y1: 1, x2: 1, y2: 2, state: "locked" } });
  assert.equal(floor(c).doors.length, n0 + 1);
  c = apply(c, "DOOR_STATE_SET", { doorId: "d1", state: "open" });
  assert.equal(floor(c).doors.find((d) => d.doorId === "d1").state, "open");
  c = apply(c, "DOOR_STATE_SET", { doorId: "d1", state: "quebrada" });
  assert.equal(floor(c).doors.find((d) => d.doorId === "d1").state, "open");
  c = apply(c, "DOOR_REMOVE", { doorId: "d1" });
  assert.equal(floor(c).doors.some((d) => d.doorId === "d1"), false);
});

test("andares - adicionar com nome padrão, recusar z repetido, selecionar e mover token", () => {
  let c = apply(base(), "FLOOR_ADD", { select: true });
  const z = scene(c).activeFloorZ;
  assert.equal(scene(c).floors.length, 2);
  assert.match(floor(c).name, /Andar/);
  const same = apply(c, "FLOOR_ADD", { floor: { z } });
  assert.equal(scene(same).floors.length, 2);
  c = apply(c, "FLOOR_ADD", { floor: { z: -2 } });
  assert.equal(scene(c).floors[0].name, "Subsolo 2");
  assert.equal(scene(c).activeFloorZ, z);
  c = apply(c, "FLOOR_SELECT", { floorZ: -2 });
  assert.equal(scene(c).activeFloorZ, -2);
  c = apply(c, "FLOOR_SELECT", { floorZ: 77 });
  assert.equal(scene(c).activeFloorZ, -2);
  c = apply(c, "FLOOR_SELECT", { floorZ: "abc" });
  assert.equal(scene(c).activeFloorZ, -2);
  c = apply(c, "TOKEN_CHANGE_FLOOR", { tokenId: "tok-lyra", floorZ: z, x: -5, y: 3.9 });
  assert.deepEqual([tok(c, "tok-lyra").floorZ, tok(c, "tok-lyra").x, tok(c, "tok-lyra").y], [z, 0, 3]);
  const bad = apply(c, "TOKEN_CHANGE_FLOOR", { tokenId: "tok-lyra", floorZ: 99 });
  assert.equal(tok(bad, "tok-lyra").floorZ, z);
});

test("permissões - jogador só desenha/AoE na camada pública, alterna portas fechadas/abertas e move o próprio token", () => {
  let c = apply(base(), "DOOR_UPSERT", { door: { doorId: "dp", x1: 1, y1: 1, x2: 1, y2: 2, state: "closed" } });
  c = apply(c, "DOOR_UPSERT", { door: { doorId: "dl", x1: 2, y1: 1, x2: 2, y2: 2, state: "locked" } });
  const as = (type, payload) => createVttOp({ type, actor: "vx_p1", lamport: ++lamport, payload });
  assert.equal(isAuthorizedVttOp(c, as("DRAWING_ADD", { drawing: { points: [{ wx: 0, wy: 0 }], layer: "gm" } })), false);
  assert.equal(isAuthorizedVttOp(c, as("DRAWING_ADD", { drawing: { points: [{ wx: 0, wy: 0 }] } })), true);
  assert.equal(isAuthorizedVttOp(c, as("AOE_UPSERT", { aoe: { layer: "gm" } })), false);
  assert.equal(isAuthorizedVttOp(c, as("AOE_UPSERT", { aoe: {} })), true);
  assert.equal(isAuthorizedVttOp(c, as("DOOR_STATE_SET", { doorId: "dp", state: "open" })), true);
  assert.equal(isAuthorizedVttOp(c, as("DOOR_STATE_SET", { doorId: "dp", state: "locked" })), false);
  assert.equal(isAuthorizedVttOp(c, as("DOOR_STATE_SET", { doorId: "dl", state: "open" })), false);
  assert.equal(isAuthorizedVttOp(c, as("FOG_SET", {})), false);
  assert.equal(isAuthorizedVttOp(c, as("SCENE_SELECT", {})), false);
  assert.equal(isAuthorizedVttOp(null, as("DRAWING_ADD", {})), false);
  c = apply(c, "TOKEN_UPSERT", { token: { tokenId: "meu", name: "Meu", layer: "player", ownerRouteId: "vx_p1", x: 1, y: 1 } });
  assert.equal(isAuthorizedVttOp(c, as("TOKEN_MOVE", { tokenId: "meu", x: 2, y: 2 })), true);
  assert.equal(isAuthorizedVttOp(c, as("TOKEN_MOVE", { tokenId: "tok-lyra", x: 2, y: 2 })), false);
  assert.equal(isAuthorizedVttOp(c, as("TOKEN_CHANGE_FLOOR", { tokenId: "meu", floorZ: 0 })), true);
  assert.equal(isAuthorizedVttOp(c, as("TOKEN_CHANGE_FLOOR", { tokenId: "tok-lyra", floorZ: 0 })), false);
});

test("fichas - ação clicável criada, substituída e removida; meta da campanha com limites", () => {
  let c = base();
  const sid = c.activeSheetId;
  c = apply(c, "SHEET_ACTION_UPSERT", { action: { label: "  Espada  ", roll: "1d20+5", damage: "1d8", tag: "ataque" } });
  const acts = () => c.sheetsById[sid].sheet_meta.clickable_actions;
  const sword = acts().find((a) => a.label === "Espada");
  assert.deepEqual([sword.roll, sword.damage, sword.tag], ["1d20+5", "1d8", "ataque"]);
  c = apply(c, "SHEET_ACTION_UPSERT", { action: { id: sword.id, label: "Espada Longa" } });
  assert.equal(acts().filter((a) => a.id === sword.id).length, 1);
  assert.equal(acts().find((a) => a.id === sword.id).roll, "1d20");
  const n = acts().length;
  c = apply(c, "SHEET_ACTION_UPSERT", { action: {} });
  assert.equal(acts().length, n);
  c = apply(c, "SHEET_ACTION_REMOVE", { actionId: sword.id });
  assert.equal(acts().some((a) => a.id === sword.id), false);
  c = apply(c, "SHEET_ACTION_REMOVE", {});
  assert.equal(acts().length, n - 1);
  c = apply(c, "CAMPAIGN_META_UPDATE", { name: `  ${"N".repeat(100)}  `, system: "tormenta20", activeSheetId: "inexistente" });
  assert.deepEqual([c.name.length, c.system, c.activeSheetId], [80, "tormenta20", sid]);
});

test("cenas - criar e ativar, selecionar existente, definir mapa e mover token", () => {
  let c = apply(base(), "SCENE_UPSERT", { scene: { sceneId: "sc-nova", name: "Taverna" }, setActive: true });
  assert.equal(c.activeSceneId, "sc-nova");
  assert.ok(c.scenesById["sc-cripta"]);
  c = apply(c, "SCENE_SELECT", { sceneId: "sc-cripta" });
  assert.equal(c.activeSceneId, "sc-cripta");
  c = apply(c, "SCENE_SELECT", { sceneId: "nao-existe" });
  assert.equal(c.activeSceneId, "sc-cripta");
  c = apply(c, "SCENE_MAP_SET", { mapBlobHash: "abc123", widthPx: 900, heightPx: 700, grid: { type: "hex" } });
  assert.deepEqual([floor(c).mapBlobHash, floor(c).widthPx, floor(c).heightPx, floor(c).grid.type], ["abc123", 900, 700, "hex"]);
  c = apply(c, "SCENE_MAP_SET", { floorZ: 50, mapBlobHash: "zzz" });
  assert.equal(floor(c).mapBlobHash, "abc123");
  c = apply(c, "TOKEN_MOVE", { tokenId: "tok-lyra", x: 2, y: 2 });
  assert.deepEqual([tok(c, "tok-lyra").x, tok(c, "tok-lyra").y].map(Number.isFinite), [true, true]);
});

test("replayCampaignOps - ordena por lamport e id e ignora operação repetida", () => {
  const mk = (id, lp, label) => createVttOp({ opId: id, type: "SHEET_ACTION_UPSERT", actor: GM, lamport: lp, payload: { action: { id: "x", label, roll: "1d6" } } });
  const ops = [mk("op-b", 2, "segunda"), mk("op-a", 1, "primeira"), mk("op-b", 2, "duplicada")];
  const c = replayCampaignOps(base(), ops);
  const a = c.sheetsById[c.activeSheetId].sheet_meta.clickable_actions.find((x) => x.id === "x");
  assert.equal(a.label, "segunda");
  assert.deepEqual(c.appliedOpIds, ["op-a", "op-b"]);
  assert.equal(c.lamport, 2);
  assert.equal(replayCampaignOps(base()).id, "camp-t7");
});
