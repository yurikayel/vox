/**
 * @file Camadas interativas do Diorama: visibilidade por papel, névoa, standees, portas e picking.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { computeCameraMatrices, createDioramaCamera } from "../client/js/dungeon/diorama/diorama-camera.js";
import { buildFloorDioramaGeometry } from "../client/js/dungeon/diorama/diorama-geom.js";
import { buildFogLayer, FOG_MASK_SIZE, projectDioramaView } from "../client/js/dungeon/diorama/diorama-layers.js";
import { mat4Invert, pickDioramaScene, unprojectRay } from "../client/js/dungeon/diorama/diorama-pick.js";
import { attachDioramaOverlay } from "../client/js/dungeon/diorama/diorama-view.js";
import { createFloorDoc, createTokenDoc } from "../client/js/dungeon/vtt-scene-schema.js";
import { createDoorDoc } from "../client/js/dungeon/vtt-tactics-schema.js";

const door = (extra) => createDoorDoc({ x1: 4, y1: 2, x2: 6, y2: 2, ...extra });
const tokens = () => [
  createTokenDoc({ tokenId: "heroi", x: 2, y: 2, layer: "player" }),
  createTokenDoc({ tokenId: "boss", x: 3, y: 3, layer: "gm" }),
];

test("visibilidade: jogador sem token GM e sem porta secreta; Mestre vê tudo", () => {
  const floor = createFloorDoc({ doors: [door({ doorId: "porta-s", state: "secret" }), door({ doorId: "porta-c", state: "closed" })] });
  const player = projectDioramaView(floor, tokens(), "player");
  assert.deepEqual(player.tokens.map((t) => t.tokenId), ["heroi"]);
  assert.deepEqual(player.floor.doors.map((d) => d.doorId), ["porta-c"]);
  const gm = projectDioramaView(floor, tokens(), "gm");
  assert.equal(gm.tokens.length, 2);
  assert.equal(gm.floor.doors.length, 2);
});

test("névoa: sem fog não há camada; retângulo revelado vira 255 e o resto 0", () => {
  assert.equal(buildFogLayer(createFloorDoc({}), "player"), null);
  const floor = createFloorDoc({ fog: { enabled: true, revealedRects: [{ id: "r", x: 0, y: 0, w: floor_w() / 2, h: floor_h() }] } });
  const layer = buildFogLayer(floor, "player");
  assert.equal(layer.mask[10 * FOG_MASK_SIZE + 10], 255);
  assert.equal(layer.mask[10 * FOG_MASK_SIZE + FOG_MASK_SIZE - 10], 0);
  assert.equal(layer.dim, 0);
  assert.equal(buildFogLayer(floor, "gm").dim, 0.5);
  const other = createFloorDoc({ fog: { enabled: true, revealedRects: [{ id: "r", x: 0, y: 0, w: 64, h: 64 }] } });
  assert.notEqual(buildFogLayer(other, "gm").version, layer.version);
});

function floor_w() { return createFloorDoc({}).widthPx; }
function floor_h() { return createFloorDoc({}).heightPx; }

test("standees e portas: token vira 2 triângulos; porta aberta fica baixa, fechada alta", () => {
  const base = createFloorDoc({});
  const withTokens = buildFloorDioramaGeometry(base, { tokens: tokens(), eye: [5, 6, 9] });
  assert.equal(withTokens.triangleCount, 4);
  const maxY = (d) => {
    const g = buildFloorDioramaGeometry(createFloorDoc({ doors: [door({ state: d })] }));
    return Math.max(...Array.from({ length: g.vertices.length / 7 }, (_, i) => g.vertices[i * 7 + 1]));
  };
  assert.ok(maxY("open") < 0.5);
  assert.ok(maxY("closed") > 1.5);
});

test("picking: inversa de matriz, standee e porta pelo mesmo identificador do 2D", () => {
  const cam = createDioramaCamera({ mode: "3d" });
  const mats = computeCameraMatrices(cam, 1.6);
  const inv = mat4Invert(mats.viewProj);
  assert.ok(inv);
  const floor = createFloorDoc({ doors: [door({ doorId: "d1", state: "closed" })] });
  const view = projectDioramaView(floor, tokens(), "player");
  const aim = (x, y, z) => {
    const [c0, c1, c2, c3] = [0, 1, 2, 3].map((r) => mats.viewProj[r] * x + mats.viewProj[4 + r] * y + mats.viewProj[8 + r] * z + mats.viewProj[12 + r]);
    void c2;
    return unprojectRay(mats.viewProj, c0 / c3, c1 / c3);
  };
  const tokRay = aim(2.5, 0.7, 2.5);
  assert.equal(pickDioramaScene(tokRay.origin, tokRay.dir, view).tokenId, "heroi");
  const doorRay = aim(5, 1, 2);
  assert.deepEqual(pickDioramaScene(doorRay.origin, doorRay.dir, view).doorId, "d1");
  const bossRay = aim(3.5, 0.7, 3.5);
  assert.notEqual(pickDioramaScene(bossRay.origin, bossRay.dir, view).tokenId, "boss");
});

test("overlay: clique no canvas GL chama onPick com o token sob o ponto", () => {
  let click = null;
  const gl = new Proxy({}, { get: () => () => true });
  const glCanvas = { dataset: {}, style: {}, width: 800, height: 500, parentNode: null, getContext: () => gl,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 500 }),
    addEventListener: (ev, fn) => { if (ev === "click") click = fn; }, removeEventListener() {}, remove() {} };
  const host = { style: {}, appendChild: (c) => { c.parentNode = host; }, querySelector: () => null };
  const base = { width: 800, height: 500, parentNode: host, ownerDocument: { createElement: () => glCanvas } };
  const picks = [];
  const overlay = attachDioramaOverlay(base, createFloorDoc({}), { mode: "3d", viewerRole: "player", tokens: tokens(), storage: null, onPick: (h) => picks.push(h) });
  overlay.draw();
  const mats = computeCameraMatrices(createDioramaCamera({ mode: "3d" }), 800 / 500);
  const p = [0, 1, 2, 3].map((r) => mats.viewProj[r] * 2.5 + mats.viewProj[4 + r] * 0.7 + mats.viewProj[8 + r] * 2.5 + mats.viewProj[12 + r]);
  click({ clientX: ((p[0] / p[3] + 1) / 2) * 800, clientY: ((1 - p[1] / p[3]) / 2) * 500 });
  assert.equal(picks[0]?.kind, "token");
  assert.equal(picks[0]?.tokenId, "heroi");
});

test("overlay: névoa envia dim 0 ao shader do jogador e 1 sem névoa", () => {
  const dims = [];
  const gl = new Proxy({}, { get: (_t, k) => (k === "uniform1f" ? (_l, v) => dims.push(v) : () => true) });
  const mk = () => {
    const el = { dataset: {}, style: {}, getContext: () => gl, addEventListener() {}, removeEventListener() {}, remove() {}, parentNode: null };
    return el;
  };
  const host = { style: {}, appendChild: (c) => { c.parentNode = host; }, querySelector: () => null };
  const draw = (floor) => {
    const base = { width: 800, height: 500, parentNode: host, ownerDocument: { createElement: mk } };
    attachDioramaOverlay(base, floor, { mode: "3d", viewerRole: "player", storage: null }).draw();
  };
  draw(createFloorDoc({ fog: { enabled: true, revealedRects: [{ id: "r", x: 0, y: 0, w: 64, h: 64 }] } }));
  draw(createFloorDoc({}));
  assert.deepEqual(dims, [0, 1]);
});
