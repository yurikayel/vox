/**
 * @file Fiação da B2 do Diorama: `b2` ligado no GL, standee próprio oculto em 1ª Pessoa, câmera nos olhos do
 * token selecionado e clique em portal com o aviso "Portal: …". Cada teste falha se a linha correspondente sair.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { applyCameraPreset, computeCameraMatrices, createDioramaCamera } from "../client/js/dungeon/diorama/diorama-camera.js";
import { tokenCenter3d } from "../client/js/dungeon/diorama/diorama-layers.js";
import { attachDioramaOverlay } from "../client/js/dungeon/diorama/diorama-view.js";
import { wireDungeonView } from "../client/js/dungeon/dungeon-controller.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { createCampaign } from "../client/js/dungeon/vtt-schema.js";
import { createDefaultScene, createFloorDoc, createTokenDoc } from "../client/js/dungeon/vtt-scene-schema.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";

const HERO = createTokenDoc({ tokenId: "tok-heroi", x: 2, y: 2, layer: "player" });
const ORC = createTokenDoc({ tokenId: "tok-orc", x: 6, y: 3, layer: "player" });
const PORTAL = { portalId: "portal-escada", x: 8, y: 2, radius: 0.8, label: "Escada", layer: "player" };

/** GL falso que registra os buffers de vértices e as matrizes enviadas. */
function glSpy() {
  const rec = { buffers: [], matrices: [] };
  const gl = new Proxy({}, {
    get: (_t, k) => {
      if (k === "bufferData") return (_target, data) => { if (data instanceof Float32Array) rec.buffers.push(data.length); };
      if (k === "uniformMatrix4fv") return (_loc, _tr, m) => { rec.matrices.push(Array.from(m)); };
      return () => true;
    },
  });
  return { gl, rec };
}

function overlayWith(gl, floor, opts) {
  const glCanvas = { dataset: {}, style: {}, width: 800, height: 500, parentNode: null, getContext: () => gl, setAttribute() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 500 }), addEventListener() {}, removeEventListener() {}, remove() {} };
  const host = { style: {}, appendChild: (c) => { c.parentNode = host; }, querySelector: () => null };
  const base = { width: 800, height: 500, parentNode: host, ownerDocument: { createElement: (tag) => (tag === "div" ? { dataset: {}, style: {}, setAttribute() {}, remove() {} } : glCanvas) } };
  return attachDioramaOverlay(base, floor, { viewerRole: "gm", storage: null, ...opts });
}

const biggest = (rec) => Math.max(0, ...rec.buffers);

test("b2 ligado no GL: volumes e portais do piso viram vértices", () => {
  const { gl, rec } = glSpy();
  const floor = createFloorDoc({ volumes: [{ volumeId: "v1", shape: "box", x: 3, y: 3, w: 1, d: 1, h: 1, layer: "player" }], portals: [PORTAL] });
  overlayWith(gl, floor, { mode: "3d", tokens: [] }).draw();
  assert.ok(biggest(rec) > 0, "sem b2 o piso só com volumes e portais não geraria malha");
});

test("1ª Pessoa: o standee do próprio token fica de fora, o dos outros não", () => {
  const sizes = (selectedId) => {
    const { gl, rec } = glSpy();
    overlayWith(gl, createFloorDoc({}), { mode: "fp", tokens: [HERO, ORC], selectedId }).draw();
    return biggest(rec);
  };
  const semSelecao = sizes("");
  const comSelecao = sizes("tok-heroi");
  assert.ok(semSelecao > 0);
  assert.ok(comSelecao > 0 && comSelecao < semSelecao, "só o outro token é desenhado");
});

test("1ª Pessoa: a câmera vai para os olhos do token selecionado (ao anexar e ao trocar de modo)", () => {
  const expected = Array.from(computeCameraMatrices(applyCameraPreset({ ...createDioramaCamera({ mode: "fp" }), target: tokenCenter3d(HERO) }, "fp"), 800 / 500).viewProj);
  const sees = (rec) => rec.matrices.some((m) => m.length === expected.length && m.every((v, i) => Math.abs(v - expected[i]) < 1e-5));
  const a = glSpy();
  overlayWith(a.gl, createFloorDoc({}), { mode: "fp", tokens: [HERO], selectedId: "tok-heroi" }).draw();
  assert.ok(sees(a.rec), "ao anexar já em 1ª Pessoa");
  const b = glSpy();
  const overlay = overlayWith(b.gl, createFloorDoc({}), { mode: "3d", tokens: [HERO], selectedId: "tok-heroi" });
  overlay.setMode("fp");
  assert.ok(sees(b.rec), "ao trocar para 1ª Pessoa");
});

/** Mesa falsa com canvas GL funcional para o controller montar o overlay e receber o clique. */
function fakeMesaWithGl(gl) {
  const listeners = {};
  const glCanvas = { dataset: {}, style: {}, width: 800, height: 500, parentNode: null, getContext: () => gl, setAttribute() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 500 }),
    addEventListener: (k, fn) => { listeners[k] = fn; }, removeEventListener() {}, remove() {} };
  const createElement = (tag) => (tag === "div" ? { dataset: {}, style: {}, setAttribute() {}, remove() {} } : glCanvas);
  const appended = [];
  const base = { id: "dungeon-vtt-canvas", width: 800, height: 500, offsetWidth: 800, offsetHeight: 500, offsetLeft: 0, offsetTop: 0,
    getContext: () => null, addEventListener() {}, removeEventListener() {},
    parentNode: { style: {}, appendChild: (el) => appended.push(el), querySelector: () => null }, ownerDocument: { createElement } };
  const handlers = {};
  const container = { dataset: {}, innerHTML: "", ownerDocument: base.ownerDocument, addEventListener: (t, fn) => { handlers[t] = fn; },
    querySelector: (sel) => (sel === "#dungeon-vtt-canvas" ? base : null), querySelectorAll: () => [] };
  return { container, handlers, listeners, appended };
}

test("clique em portal na lente avisa 'Portal: <rótulo>' e não mexe em portas", async () => {
  const { gl } = glSpy();
  const state = createDungeonSessionState({ viewerRole: "gm", campaignId: "", syncPeer: null });
  const scene = createDefaultScene("local");
  scene.floors[0].portals = [PORTAL];
  state.campaignDoc = createCampaign({ title: "T", scenesById: { [scene.sceneId]: scene }, activeSceneId: scene.sceneId });
  const mesa = fakeMesaWithGl(gl);
  wireDungeonView(mesa.container, { screen: "mesa", state, store: createVttStore(createMemoryVttBackend()) });
  const btn = { dataset: { dungeon: "diorama-mode", mode: "3d" } };
  btn.closest = () => btn;
  await mesa.handlers.click({ target: btn });
  for (let i = 0; i < 50 && !mesa.listeners.click; i += 1) await new Promise((r) => setTimeout(r, 0));
  const m = computeCameraMatrices(createDioramaCamera({ mode: "3d" }), 800 / 500).viewProj;
  const p = [0, 1, 2, 3].map((r) => m[r] * PORTAL.x + m[4 + r] * 0 + m[8 + r] * PORTAL.y + m[12 + r]);
  mesa.listeners.click({ clientX: ((p[0] / p[3] + 1) / 2) * 800, clientY: ((1 - p[1] / p[3]) / 2) * 500 });
  assert.equal(state.campaignNotice, "Portal: Escada");
});
