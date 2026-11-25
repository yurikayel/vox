/**
 * @file Gestos da lente Diorama (P3): câmera pura (zoom/pan/órbita), teclado e ponteiros.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createDioramaCamera, orbitCamera, panCamera, zoomCamera } from "../client/js/dungeon/diorama/diorama-camera.js";
import { attachDioramaGestures, DIORAMA_KEYS_HELP, keyboardCameraStep } from "../client/js/dungeon/diorama/diorama-input.js";
import { attachDioramaOverlay } from "../client/js/dungeon/diorama/diorama-view.js";
import { createFloorDoc, createTokenDoc } from "../client/js/dungeon/vtt-scene-schema.js";

const cam3d = () => createDioramaCamera({ mode: "3d", targetX: 6, targetZ: 4 });

test("câmera: zoom respeita 3..40, pan segue o yaw e fica no piso, iso não inclina", () => {
  assert.equal(zoomCamera(cam3d(), 0.0001).zoom, 3);
  assert.equal(zoomCamera(cam3d(), 1000).zoom, 40);
  const north = { ...cam3d(), yawDeg: 0 };
  const moved = panCamera(north, 2, 0);
  assert.deepEqual([moved.target[0], moved.target[2]], [8, 4]);
  const forward = panCamera(north, 0, 1);
  assert.deepEqual([forward.target[0], forward.target[2]], [6, 3]);
  assert.equal(panCamera(north, 100, 100, { maxX: 12, maxZ: 9 }).target[0], 12);
  assert.equal(panCamera(north, -100, -100, { maxX: 12, maxZ: 9 }).target[0], 0);
  const iso = createDioramaCamera({ mode: "iso" });
  assert.equal(orbitCamera(iso, 30, 40).pitchDeg, iso.pitchDeg);
  assert.equal(orbitCamera(iso, 30, 40).yawDeg, 75);
});

test("teclado: setas orbitam, Shift move, +/- zoom, Home reinicia, outras teclas passam", () => {
  const cam = cam3d();
  assert.equal(keyboardCameraStep(cam, { key: "ArrowRight" }).yawDeg, (cam.yawDeg + 15) % 360);
  assert.ok(keyboardCameraStep(cam, { key: "ArrowUp" }).pitchDeg < cam.pitchDeg);
  assert.notDeepEqual(keyboardCameraStep(cam, { key: "ArrowRight", shiftKey: true }).target, cam.target);
  assert.ok(keyboardCameraStep(cam, { key: "+" }).zoom < cam.zoom);
  assert.ok(keyboardCameraStep(cam, { key: "-" }).zoom > cam.zoom);
  assert.equal(keyboardCameraStep({ ...cam, yawDeg: 200 }, { key: "Home" }).yawDeg, 45);
  assert.equal(keyboardCameraStep(cam, { key: "Tab" }), null);
});

function fakeEl() {
  const listeners = {};
  return {
    listeners,
    addEventListener: (n, fn) => { listeners[n] = fn; },
    removeEventListener: (n) => { delete listeners[n]; },
    setPointerCapture() {},
    releasePointerCapture() {},
    focus() {},
  };
}

function rig() {
  const el = fakeEl();
  const state = { cam: cam3d(), sets: 0 };
  const g = attachDioramaGestures({
    el,
    getCam: () => state.cam,
    setCam: (c) => { state.cam = c; state.sets++; },
    bounds: () => ({ maxX: 12, maxZ: 9 }),
    viewHeight: () => 480,
  });
  const ptr = (type, id, x, y, extra = {}) => el.listeners[type]({ pointerId: id, clientX: x, clientY: y, button: 0, ...extra });
  return { el, state, g, ptr };
}

test("ponteiro: arraste do mouse move o mapa; movimento mínimo é só clique", () => {
  const { state, g, ptr } = rig();
  const before = state.cam.target;
  ptr("pointerdown", 1, 100, 100);
  ptr("pointermove", 1, 102, 101);
  assert.equal(g.wasDrag(), false);
  assert.equal(state.sets, 0);
  ptr("pointermove", 1, 160, 100);
  assert.equal(g.wasDrag(), true);
  assert.notDeepEqual(state.cam.target, before);
  ptr("pointerup", 1, 160, 100);
});

test("ponteiro: botão direito ou Alt orbitam; um novo gesto zera o arrasto", () => {
  const { state, g, ptr } = rig();
  const yaw = state.cam.yawDeg;
  ptr("pointerdown", 1, 100, 100, { button: 2 });
  ptr("pointermove", 1, 150, 100);
  assert.notEqual(state.cam.yawDeg, yaw);
  ptr("pointerup", 1, 150, 100);
  ptr("pointerdown", 1, 10, 10);
  assert.equal(g.wasDrag(), false);
  const target = state.cam.target;
  ptr("pointerup", 1, 10, 10);
  ptr("pointerdown", 2, 10, 10, { altKey: true });
  ptr("pointermove", 2, 60, 10, { altKey: true });
  assert.deepEqual(state.cam.target, target, "Alt orbita, não move");
});

test("ponteiro: dois dedos fazem pinça (zoom) e giram; roda dá zoom e bloqueia a rolagem", () => {
  const { el, state, ptr } = rig();
  const zoom = state.cam.zoom;
  ptr("pointerdown", 1, 100, 100);
  ptr("pointerdown", 2, 200, 100);
  ptr("pointermove", 2, 300, 100);
  assert.ok(state.cam.zoom < zoom, "dedos se afastam: a câmera se aproxima");
  let prevented = false;
  const z2 = state.cam.zoom;
  el.listeners.wheel({ deltaY: 200, preventDefault: () => { prevented = true; } });
  assert.ok(prevented);
  assert.ok(state.cam.zoom > z2);
});

test("overlay: canvas GL focável e rotulado; arrasto não dispara o clique; tecla redesenha", () => {
  const listeners = {};
  const attrs = {};
  const gl = new Proxy({}, { get: () => () => true });
  const glCanvas = { dataset: {}, style: {}, width: 800, height: 500, parentNode: null, getContext: () => gl,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 500 }),
    setAttribute: (k, v) => { attrs[k] = v; }, setPointerCapture() {}, releasePointerCapture() {}, focus() {},
    addEventListener: (n, fn) => { listeners[n] = fn; }, removeEventListener() {}, remove() {} };
  const host = { style: {}, appendChild: (c) => { c.parentNode = host; }, querySelector: () => null };
  const base = { width: 800, height: 500, parentNode: host, ownerDocument: { createElement: (tag) => (tag === "div" ? { dataset: {}, style: {}, parentNode: null, setAttribute() {}, remove() {} } : glCanvas) } };
  const picks = [];
  const overlay = attachDioramaOverlay(base, createFloorDoc({}), { mode: "3d", viewerRole: "gm", tokens: [createTokenDoc({ tokenId: "heroi", x: 6, y: 4 })], storage: null, onPick: (h) => picks.push(h) });
  overlay.draw();
  assert.equal(attrs.tabindex, "0");
  assert.equal(attrs["aria-label"], DIORAMA_KEYS_HELP);
  assert.match(glCanvas.style.cssText, /touch-action:none/);
  listeners.pointerdown({ pointerId: 1, clientX: 400, clientY: 250, button: 0 });
  listeners.pointermove({ pointerId: 1, clientX: 460, clientY: 250 });
  listeners.pointerup({ pointerId: 1 });
  listeners.click({ clientX: 460, clientY: 250 });
  assert.equal(picks.length, 0, "clique após arrasto é ignorado");
  let handled = false;
  listeners.keydown({ key: "ArrowLeft", preventDefault: () => { handled = true; } });
  assert.ok(handled);
});
