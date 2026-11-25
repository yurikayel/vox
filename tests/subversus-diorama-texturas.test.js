/**
 * @file Texturas do Diorama: chão com a imagem do mapa e avatares dos tokens num atlas.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { computeCameraMatrices, createDioramaCamera } from "../client/js/dungeon/diorama/diorama-camera.js";
import { projectDioramaView } from "../client/js/dungeon/diorama/diorama-layers.js";
import {
  ATLAS_CELL, atlasLayout, avatarQuadVertices, buildRasters, buildTexturedPass, fitTextureSize, floorQuadVertices, loadDioramaImages,
} from "../client/js/dungeon/diorama/diorama-textures.js";
import { attachDioramaOverlay } from "../client/js/dungeon/diorama/diorama-view.js";
import { createFloorDoc, createTokenDoc } from "../client/js/dungeon/vtt-scene-schema.js";

function fakeCanvasFactory() {
  const made = [];
  const create = (w, h) => {
    const draws = [];
    const c = { width: w, height: h, draws, getContext: () => ({ drawImage: (...a) => draws.push(a) }) };
    made.push(c);
    return c;
  };
  return { create, made };
}

test("tamanho: reduz ao teto de 2048 mantendo a proporção e nunca amplia", () => {
  assert.deepEqual(fitTextureSize(4096, 2048), { w: 2048, h: 1024 });
  assert.deepEqual(fitTextureSize(800, 600), { w: 800, h: 600 });
  assert.deepEqual(fitTextureSize(0, 0), { w: 1, h: 1 });
});

test("atlas: grade quadrada em ordem e limite de avatares", () => {
  const layout = atlasLayout(["a", "b", "c", "d", "e"]);
  assert.equal(layout.cols, 3);
  assert.equal(layout.size, 3 * ATLAS_CELL);
  assert.deepEqual(layout.cells.get("d"), { col: 0, row: 1 });
  assert.equal(atlasLayout(Array.from({ length: 200 }, (_, i) => `t${i}`)).cells.size, 64);
});

test("rasters: chão reduzido ao teto e avatares desenhados nas células", () => {
  const { create, made } = fakeCanvasFactory();
  const big = { width: 4096, height: 2048 };
  const avatar = { width: 10, height: 10 };
  const r = buildRasters({ map: big, avatars: { heroi: avatar, anao: avatar } }, create);
  assert.deepEqual([r.floor.width, r.floor.height], [2048, 1024]);
  assert.deepEqual(r.floor.draws[0].slice(1), [0, 0, 2048, 1024]);
  assert.equal(r.atlas.canvas.draws.length, 2);
  assert.equal(made.length, 2);
  assert.deepEqual(buildRasters({ map: null, avatars: {} }, create), { floor: null, atlas: null });
});

test("geometria: quad do chão cobre o mapa; avatar só para quem tem célula", () => {
  const floor = createFloorDoc({});
  const quad = floorQuadVertices(floor);
  assert.equal(quad.length, 6 * 5);
  const xs = Array.from({ length: 6 }, (_, i) => quad[i * 5]);
  assert.equal(Math.max(...xs), floor.widthPx / floor.grid.cellPx);
  assert.ok(Array.from({ length: 6 }, (_, i) => quad[i * 5 + 1]).every((y) => y === 0));
  const toks = [createTokenDoc({ tokenId: "heroi", x: 1, y: 1 }), createTokenDoc({ tokenId: "sem-avatar", x: 3, y: 3 })];
  const layout = atlasLayout(["heroi"]);
  const av = avatarQuadVertices(toks, layout, [5, 6, 9]);
  assert.equal(av.count, 1);
  assert.equal(av.vertices.length, 6 * 5);
});

test("passe: token com avatar sai do passe colorido; sem imagens nada muda", () => {
  const floor = createFloorDoc({});
  const toks = [createTokenDoc({ tokenId: "heroi", x: 1, y: 1 }), createTokenDoc({ tokenId: "outro", x: 3, y: 3 })];
  const view = projectDioramaView(floor, toks, "gm");
  const { create } = fakeCanvasFactory();
  const rasters = { ...buildRasters({ map: { width: 64, height: 64 }, avatars: { heroi: { width: 8, height: 8 } } }, create), version: 1 };
  const pass = buildTexturedPass(rasters, view, [5, 6, 9]);
  assert.deepEqual(pass.plainTokens.map((t) => t.tokenId), ["outro"]);
  assert.equal(pass.avatars.count, 1);
  assert.ok(pass.floor);
  const none = buildTexturedPass(null, view, [5, 6, 9]);
  assert.equal(none.floor, null);
  assert.equal(none.plainTokens.length, 2);
});

test("carga: lê blobs por hash, ignora falhas e hashes vazios", async () => {
  const blobs = { mapa: new Uint8Array([1]), av1: new Uint8Array([2]) };
  const io = {
    getBlob: async (h) => { if (h === "quebra") throw new Error("x"); return blobs[h] || null; },
    decode: async (b) => ({ width: b[0], height: b[0] }),
  };
  const floor = createFloorDoc({ mapBlobHash: "mapa" });
  const tokens = [
    createTokenDoc({ tokenId: "tok-aaa", avatarBlobHash: "av1" }),
    createTokenDoc({ tokenId: "tok-bbb", avatarBlobHash: "quebra" }),
    createTokenDoc({ tokenId: "tok-ccc" }),
  ];
  const out = await loadDioramaImages({ floor, tokens }, io);
  assert.deepEqual(out.map, { width: 1, height: 1 });
  assert.deepEqual(Object.keys(out.avatars), ["tok-aaa"]);
});

test("overlay: com imagens o GL desenha chão e avatares (passe texturizado) e libera as texturas", () => {
  const calls = { draw: 0, tex: 0, delTex: 0 };
  const gl = new Proxy({}, { get: (_t, k) => {
    if (k === "drawArrays") return () => { calls.draw++; };
    if (k === "createTexture") return () => { calls.tex++; return {}; };
    if (k === "deleteTexture") return () => { calls.delTex++; };
    return () => true;
  } });
  const glCanvas = { dataset: {}, style: {}, width: 800, height: 500, parentNode: null, getContext: () => gl,
    setAttribute() {}, addEventListener() {}, removeEventListener() {}, remove() {} };
  const host = { style: {}, appendChild: (c) => { c.parentNode = host; }, querySelector: () => null };
  const base = { width: 800, height: 500, parentNode: host, ownerDocument: { createElement: (tag) => (tag === "div" ? { dataset: {}, style: {}, parentNode: null, setAttribute() {}, remove() {} } : glCanvas) } };
  const { create } = fakeCanvasFactory();
  const toks = [createTokenDoc({ tokenId: "heroi", x: 6, y: 4 })];
  const overlay = attachDioramaOverlay(base, createFloorDoc({}), { mode: "3d", viewerRole: "gm", tokens: toks, storage: null, createCanvas: create });
  overlay.draw();
  assert.equal(calls.draw, 1, "só o standee colorido");
  calls.draw = 0;
  overlay.setImages({ map: { width: 64, height: 64 }, avatars: { heroi: { width: 8, height: 8 } } });
  assert.equal(calls.draw, 2, "chão + avatar; o token com avatar sai do passe colorido");
  overlay.destroy();
  assert.equal(calls.delTex, 2);
  assert.ok(computeCameraMatrices(createDioramaCamera({ mode: "3d" })).eye);
});
