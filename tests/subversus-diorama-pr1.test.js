/**
 * @file PR-1 da revisão do Diorama: canvas WebGL2 próprio, flag/pílula em um só lugar e B2 atrás de guarda.
 * Só importa exports que já existiam na base (PM-111).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CAMERA_MODES } from "../client/js/dungeon/diorama/diorama-camera.js";
import { buildFloorDioramaGeometry, describeTokenSurroundings } from "../client/js/dungeon/diorama/diorama-geom.js";
import { attachDioramaOverlay } from "../client/js/dungeon/diorama/diorama-view.js";
import { createFloorDoc, createPortalDoc, createTokenDoc, createVolumeDoc } from "../client/js/dungeon/vtt-scene-schema.js";

function fakeDom() {
  const kids = [];
  const mk = () => ({ dataset: {}, style: {}, getContext: () => null, addEventListener() {}, removeEventListener() {}, remove() {} });
  const host = {
    style: {},
    appendChild: (c) => { kids.push(c); return c; },
    querySelector: (sel) => kids.find((k) => sel.includes("data-diorama-gl") && k.dataset.dioramaGl) || null,
  };
  const calls = [];
  const base = { ...mk(), width: 768, height: 480, parentNode: host, ownerDocument: { createElement: () => mk() },
    getContext: (kind) => { calls.push(kind); return null; } };
  return { base, kids, calls };
}

test("Diorama: não pede webgl2 ao canvas 2D e cria o canvas próprio uma única vez", () => {
  const { base, kids, calls } = fakeDom();
  const floor = createFloorDoc({});
  attachDioramaOverlay(base, floor, { mode: "3d", storage: null }).draw();
  attachDioramaOverlay(base, floor, { mode: "iso", storage: null }).draw();
  assert.ok(!calls.includes("webgl2"), "canvas 2D não pode receber getContext('webgl2')");
  assert.equal(kids.length, 1, "um único canvas WebGL2 reaproveitado");
});

test("Diorama: flag e pílula têm uma só definição em client/js/dungeon", () => {
  const dir = new URL("../client/js/dungeon/", import.meta.url);
  const src = [".", "diorama"].flatMap((d) => ["screen-table.js", "diorama/diorama-view.js"].map((f) => readFileSync(new URL(f, dir), "utf8")));
  const all = [...new Set(src)].join("\n");
  assert.equal((all.match(/"vox\.lab\.diorama"/g) || []).length, 1);
  assert.equal((all.match(/class="subversus-diorama-pill"/g) || []).length, 1);
});

test("Diorama: modo fp (B2) fora dos modos selecionáveis", () => {
  assert.ok(!CAMERA_MODES.includes("fp"));
});

test("Diorama: volumes e portais (B2) só entram com guarda explícita", () => {
  const floor = createFloorDoc({ volumes: [createVolumeDoc({ shape: "box", x: 1, y: 1 })], portals: [createPortalDoc({ x: 2, y: 2, label: "Escada" })] });
  assert.equal(buildFloorDioramaGeometry(floor).triangleCount, 0);
  assert.ok(buildFloorDioramaGeometry(floor, { b2: true }).triangleCount > 0);
  const tok = createTokenDoc({ tokenId: "t1", name: "G", x: 0, y: 0 });
  assert.doesNotMatch(describeTokenSurroundings(floor, [tok], tok), /portal/);
  assert.match(describeTokenSurroundings(floor, [tok], tok, { b2: true }), /portal Escada/);
});
