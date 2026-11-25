/**
 * @file Fiação do token com a ficha no renderizador e na entrada do canvas: PV da ficha, retrato sem
 * iniciais, "Sua vez" no token certo, toque no chão com token selecionado e sigilo do PV em modo `status`.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { renderSceneToCanvas } from "../client/js/dungeon/canvas-renderer.js";
import { attachCanvasInput } from "../client/js/dungeon/canvas-input.js";
import { createDefaultScene, createTokenDoc } from "../client/js/dungeon/vtt-scene-schema.js";

const SHEET = { pools_base: { hp_max: 20 }, delta_ledger: [], attributes_lww: { speed_ft: 30 } };

function spyCanvas() {
  const calls = [];
  const store = {};
  const ctx = new Proxy(store, {
    get: (t, k) => (k in t ? t[k] : (...a) => { calls.push([k, ...a]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  return { canvas: { getContext: () => ctx, width: 768, height: 576, clientWidth: 768, clientHeight: 576 }, calls };
}

function sceneWith(tokens) {
  const scene = createDefaultScene("local");
  scene.tokens = tokens.map((t) => createTokenDoc({ floorZ: 0, layer: "player", x: 3, y: 3, ...t }));
  return scene;
}

const texts = (calls) => calls.filter((c) => c[0] === "fillText").map((c) => c[1]);

test("PV da ficha ligada ao token aparecem na barra (20/20, não os 99 do token)", () => {
  const { canvas, calls } = spyCanvas();
  const scene = sceneWith([{ tokenId: "tok-ana", name: "Ana", sheetId: "s1", hpVisible: "exact", hpCurrent: 99, hpMax: 99 }]);
  renderSceneToCanvas(canvas, scene, { viewerRole: "gm", sheetsById: { s1: SHEET } });
  assert.ok(texts(calls).includes("20/20"));
  assert.ok(!texts(calls).includes("99/99"));
});

test("modo status: o jogador vê só o rótulo, nunca o número da ficha", () => {
  const { canvas, calls } = spyCanvas();
  const scene = sceneWith([{ tokenId: "tok-ana", name: "Ana", sheetId: "s1", hpVisible: "status", hpCurrent: 1, hpMax: 99 }]);
  renderSceneToCanvas(canvas, scene, { viewerRole: "player", sheetsById: { s1: SHEET } });
  const shown = texts(calls);
  assert.ok(shown.includes("Ileso"), "PV cheios da ficha viram rótulo (o token sozinho diria Crítico)");
  assert.ok(!shown.some((t) => /\d+\/\d+/.test(String(t))), "nenhum número de PV vaza");
});

test("com retrato não há iniciais; sem retrato há", () => {
  const withBmp = spyCanvas();
  const scene = sceneWith([{ tokenId: "tok-ana", name: "Ana", initials: "AN", avatarBlobHash: "h1" }]);
  renderSceneToCanvas(withBmp.canvas, scene, { avatars: new Map([["h1", {}]]) });
  assert.ok(withBmp.calls.some((c) => c[0] === "drawImage"));
  assert.ok(!texts(withBmp.calls).includes("AN"));
  const without = spyCanvas();
  renderSceneToCanvas(without.canvas, scene, {});
  assert.ok(texts(without.calls).includes("AN"));
});

test("'Sua vez' só aparece no token da vez", () => {
  const scene = sceneWith([{ tokenId: "tok-ana", name: "Ana", x: 1 }, { tokenId: "tok-bia", name: "Bia", x: 5 }]);
  const turn = (id) => { const s = spyCanvas(); renderSceneToCanvas(s.canvas, scene, { turnTokenId: id }); return texts(s.calls).filter((t) => t === "Sua vez").length; };
  assert.equal(turn("tok-ana"), 1);
  assert.equal(turn(""), 0);
  assert.equal(turn("tok-zzz"), 0);
});

function inputSetup(tokenId, onFloorTap) {
  const scene = sceneWith([{ tokenId: "tok-ana", name: "Ana", x: 1, y: 1 }]);
  const log = { selected: [], committed: [], taps: [] };
  const listeners = {};
  const canvas = { listeners, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0 }), addEventListener: (k, fn) => { listeners[k] = fn; }, removeEventListener() {} };
  attachCanvasInput(canvas, {
    getScene: () => scene, getCamera: () => ({ panX: 0, panY: 0, zoom: 1 }), getViewerRole: () => "gm", getTool: () => "select",
    onSelectToken: (id) => log.selected.push(id), onSelectCommitted: (id) => log.committed.push(id),
    onFloorTap: onFloorTap && ((cell) => { log.taps.push(cell); return tokenId !== ""; }),
  });
  const at = { clientX: 8 * 64 + 10, clientY: 6 * 64 + 10, pointerId: 1, button: 0 };
  canvas.listeners.pointerdown(at);
  canvas.listeners.pointerup(at);
  return log;
}

test("toque no chão com token selecionado marca o destino e mantém a seleção", () => {
  const log = inputSetup("tok-ana", true);
  assert.deepEqual(log.taps, [{ x: 8, y: 6 }]);
  assert.deepEqual(log.selected, []);
  assert.deepEqual(log.committed, []);
});

test("toque no chão sem alcance (onFloorTap devolve falso) limpa a seleção", () => {
  const log = inputSetup("", true);
  assert.deepEqual(log.selected, [""]);
  assert.deepEqual(log.committed, [""]);
});
