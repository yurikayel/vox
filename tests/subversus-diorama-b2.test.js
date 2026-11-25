/**
 * @file Diorama B2: câmera de 1ª Pessoa, WASD, portais (geometria, descrição, picking) e b2 ligado no GL.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { applyCameraPreset, CAMERA_MODES, computeCameraMatrices, createDioramaCamera } from "../client/js/dungeon/diorama/diorama-camera.js";
import { keyboardCameraStep } from "../client/js/dungeon/diorama/diorama-input.js";
import { buildFloorDioramaGeometry, describeDioramaView } from "../client/js/dungeon/diorama/diorama-geom.js";
import { pickDioramaScene } from "../client/js/dungeon/diorama/diorama-pick.js";
import { renderDioramaModePill } from "../client/js/dungeon/diorama-lens.js";

const PORTAL = { portalId: "p1", x: 8, y: 2, radius: 0.8, label: "Escada", layer: "player" };

test("1ª Pessoa existe como modo, com a pílula '1ª'", () => {
  assert.ok(CAMERA_MODES.includes("fp"));
  assert.match(renderDioramaModePill("fp"), /data-mode="fp"[^>]*>1ª</);
});

test("1ª Pessoa: olhos na altura do token e sem cutaway", () => {
  const cam = applyCameraPreset({ ...createDioramaCamera({}), target: [3, 0, 4] }, "fp");
  const m = computeCameraMatrices(cam, 1.5);
  assert.deepEqual(m.eye, [3, 1.5, 4]);
  assert.equal(m.cutawayEnabled, false);
  assert.ok(m.target[1] < m.eye[1], "olha levemente para baixo");
});

test("WASD só anda em 1ª Pessoa", () => {
  const fp = applyCameraPreset({ ...createDioramaCamera({}), target: [5, 0, 5], yawDeg: 0 }, "fp");
  const next = keyboardCameraStep(fp, { key: "w" });
  assert.ok(next.target[2] < 5, "yaw 0 anda para -Z");
  assert.equal(keyboardCameraStep(applyCameraPreset(fp, "3d"), { key: "w" }), null);
});

test("portais viram geometria só com b2 e entram na descrição", () => {
  const floor = { portals: [PORTAL] };
  assert.equal(buildFloorDioramaGeometry(floor).triangleCount, 0);
  assert.ok(buildFloorDioramaGeometry(floor, { b2: true }).triangleCount > 0);
  const view = { floor, tokens: [{ tokenId: "t", name: "Ana", x: 8, y: 4 }] };
  assert.match(describeDioramaView(view, "t"), /portal Escada a 3\.0m ao norte/);
});

test("picking: raio no chão sobre o portal devolve o portal", () => {
  const view = { floor: { portals: [PORTAL], doors: [] }, tokens: [] };
  const hit = pickDioramaScene([8, 5, 2], [0, -1, 0], view);
  assert.deepEqual([hit.kind, hit.portalId], ["portal", "p1"]);
  assert.equal(pickDioramaScene([1, 5, 1], [0, -1, 0], view).kind, "floor");
});
