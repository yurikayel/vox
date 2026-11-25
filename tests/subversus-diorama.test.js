/**
 * @file Testes unitários da Trilha B1 do Subversus VTT (Lente Diorama WebGL2 lazy):
 * matemática 4×4, conversão floorPxToWorld, picking ray-cylinder/ray-plane, câmera,
 * extrusão + Vertex AO + cutaway, descrição acessível, fallback webglcontextlost e 0 B no SHELL_ASSETS.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  applyCameraPreset,
  computeCameraMatrices,
  createDioramaCamera,
  orbitCamera,
} from "../client/js/dungeon/diorama/diorama-camera.js";
import {
  buildFloorDioramaGeometry,
  describeTokenSurroundings,
} from "../client/js/dungeon/diorama/diorama-geom.js";
import { createDioramaGlRenderer, STANDEE_FS_SOURCE } from "../client/js/dungeon/diorama/diorama-gl.js";
import {
  floorPxToWorld,
  rayCylinderIntersect,
  rayPlaneIntersect,
  worldTo3d,
} from "../client/js/dungeon/diorama/diorama-math.js";
import {
  attachDioramaOverlay,
  pickDioramaTarget,
  renderDioramaModePill,
} from "../client/js/dungeon/diorama/diorama-view.js";
import { buildDungeonTabs, renderDungeonChrome } from "../client/js/dungeon/dungeon-chrome.js";
import { createFloorDoc, createPortalDoc, createTokenDoc, createVolumeDoc, createWallDoc } from "../client/js/dungeon/vtt-scene-schema.js";
import { createDoorDoc } from "../client/js/dungeon/vtt-tactics-schema.js";

function createFakeGl() {
  const counts = { deleteBuffer: 0, deleteTexture: 0, deleteProgram: 0, texUploads: 0, drawCalls: 0 };
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    ARRAY_BUFFER: 5, DYNAMIC_DRAW: 6, FLOAT: 7, TEXTURE_2D: 8, TEXTURE_MIN_FILTER: 9,
    TEXTURE_MAG_FILTER: 10, LINEAR: 11, R8: 12, RED: 13, UNSIGNED_BYTE: 14,
    DEPTH_TEST: 15, COLOR_BUFFER_BIT: 16, DEPTH_BUFFER_BIT: 17, TRIANGLES: 18,
    createShader: () => ({}), shaderSource: () => {}, compileShader: () => {},
    getShaderParameter: () => true, deleteShader: () => {},
    createProgram: () => ({}), attachShader: () => {}, linkProgram: () => {},
    getProgramParameter: () => true, deleteProgram: () => { counts.deleteProgram++; },
    createBuffer: () => ({}), bindBuffer: () => {}, bufferData: () => {},
    deleteBuffer: () => { counts.deleteBuffer++; },
    enableVertexAttribArray: () => {}, vertexAttribPointer: () => {},
    createTexture: () => ({}), bindTexture: () => {}, texParameteri: () => {},
    texImage2D: () => { counts.texUploads++; },
    deleteTexture: () => { counts.deleteTexture++; },
    getUniformLocation: () => ({}), enable: () => {}, viewport: () => {},
    clearColor: () => {}, clear: () => {}, useProgram: () => {},
    uniformMatrix4fv: () => {}, uniform3fv: () => {},
    drawArrays: () => { counts.drawCalls++; },
  };
  return { gl, counts };
}

test("diorama-math: floorPxToWorld, worldTo3d e picking ray-cylinder prioriza standee", () => {
  const floor = createFloorDoc({ grid: { cellPx: 64, offsetX: 32, offsetY: 0 } });
  assert.deepEqual(floorPxToWorld(160, 128, floor), { wx: 2, wy: 2 });
  assert.deepEqual(worldTo3d(2, 3, 1.5), [2, 1.5, 3]);
  assert.ok(rayPlaneIntersect([0, 5, 0], [0, -1, 0], 0)?.t === 5);
  assert.ok(rayCylinderIntersect([0, 0.8, 5], [0, 0, -1], { x: 0, y: 0, z: 0, radius: 0.5, height: 1.4 }) > 0);
  const tok = createTokenDoc({ tokenId: "tok-gareth", name: "Gareth", x: 0, y: 0, elevation: 0 });
  const hit = pickDioramaTarget([0, 0.7, 4], [0, 0, -1], [tok]);
  assert.equal(hit?.kind, "token");
  assert.equal(hit?.tokenId, "tok-gareth");
});

test("diorama-camera: limites 15°–85° e modo fp (B2) removido", () => {
  let cam = createDioramaCamera({ mode: "3d" });
  cam = orbitCamera(cam, 90, -200);
  assert.equal(cam.pitchDeg, 15);
  cam = orbitCamera(cam, 0, 200);
  assert.equal(cam.pitchDeg, 85);
  assert.equal(computeCameraMatrices(cam).cutawayEnabled, true);
  assert.equal(applyCameraPreset(cam, "fp").mode, "2d");
});

test("diorama-geom: extrusão walls/doors fechadas, cutaway, 3 primitivas e descrição acessível", () => {
  const floor = createFloorDoc({
    walls: [createWallDoc({ x1: 2, y1: 6, x2: 6, y2: 6, height: 2.6 })],
    doors: [
      createDoorDoc({ doorId: "d-closed", x1: 2, y1: 2, x2: 3, y2: 2, state: "closed" }),
      createDoorDoc({ doorId: "d-open", x1: 4, y1: 2, x2: 5, y2: 2, state: "open" }),
    ],
    volumes: [
      createVolumeDoc({ shape: "box", x: 1, y: 1 }),
      createVolumeDoc({ shape: "cylinder", x: 2, y: 2 }),
      createVolumeDoc({ shape: "ramp", x: 3, y: 3 }),
    ],
    portals: [createPortalDoc({ x: 6, y: 3, label: "Escada" })],
  });
  const geom = buildFloorDioramaGeometry(floor, { eye: [4, 5, 10], target: [4, 0, 3], cutawayEnabled: true, b2: true });
  assert.ok(geom.triangleCount > 20);
  assert.equal(geom.cutawayWalls, 1);
  const gareth = createTokenDoc({ tokenId: "t1", name: "Gareth", x: 2, y: 3 });
  const lyra = createTokenDoc({ tokenId: "t2", name: "Lyra", x: 4, y: 3 });
  const desc = describeTokenSurroundings(floor, [gareth, lyra], gareth, { b2: true });
  assert.match(desc, /Gareth em \(2, 3\)/);
  assert.match(desc, /Lyra a 3\.0m ao leste/);
  assert.match(desc, /portal Escada/);
});

test("diorama-gl & fallback: cache fogVersion, discard em standees e fallback em webglcontextlost", () => {
  assert.match(STANDEE_FS_SOURCE, /discard;/);
  const { gl, counts } = createFakeGl();
  let lostHandler = null;
  const canvas = {
    width: 800, height: 600,
    getContext: () => gl,
    addEventListener: (ev, fn) => { if (ev === "webglcontextlost") lostHandler = fn; },
    removeEventListener: () => {},
  };
  const floor = createFloorDoc({ walls: [createWallDoc({ x1: 0, y1: 0, x2: 4, y2: 0 })] });
  const renderer = createDioramaGlRenderer(canvas);
  const mats = computeCameraMatrices(createDioramaCamera({ mode: "iso" }));
  const mask = new Uint8Array(512 * 512);
  renderer.render(floor, mats, { mask, version: 1 });
  renderer.render(floor, mats, { mask, version: 1 });
  assert.equal(counts.texUploads, 1);
  renderer.destroy();
  assert.equal(counts.deleteBuffer, 1);
  assert.equal(counts.deleteTexture, 1);
  assert.equal(counts.deleteProgram, 1);

  let fallbackMsg = "";
  const kids = [];
  const host = { style: {}, appendChild: (c) => kids.push(c), querySelector: () => kids[0] || null };
  const base = { width: 800, height: 600, parentNode: host, ownerDocument: { createElement: () => ({ ...canvas, dataset: {}, style: {} }) } };
  const overlay = attachDioramaOverlay(base, floor, { mode: "3d", onFallback2d: (r) => { fallbackMsg = r; } });
  assert.equal(overlay.active, true);
  lostHandler({ preventDefault: () => {} });
  assert.equal(overlay.active, false);
  assert.match(fallbackMsg, /mapa 2D/i);
  assert.match(renderDioramaModePill("iso"), /data-mode="iso" aria-pressed="true"/);
});

test("subversus branding & dieta PM-01: 0 byte de diorama em SHELL_ASSETS e chrome renomeado", () => {
  const swSource = fs.readFileSync(path.resolve("client/sw.js"), "utf8");
  assert.ok(!swSource.includes("diorama"), "Módulos diorama devem permanecer 100% lazy fora de SHELL_ASSETS");
  const tabs = buildDungeonTabs();
  assert.deepEqual(tabs.map((t) => t.label), ["Acampamento", "Mapa", "Grimório", "Escudo"]);
  const html = renderDungeonChrome({ activeTab: "mesa", bodyHtml: "<p>ok</p>" });
  assert.ok(html.includes("SUBVERSUS"));
  assert.ok(!html.includes("VOX · AI SOCIAL DUNGEON"));
});
