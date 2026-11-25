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
import { createDoorDoc } from "../client/js/dungeon/vtt-tactics-schema.js";
import { createFloorDoc, createPortalDoc, createTokenDoc, createVolumeDoc } from "../client/js/dungeon/vtt-scene-schema.js";

/** GL falso: constantes/funções genéricas e contadores só do que o ciclo de vida precisa. */
function countingGl() {
  const counts = { deleteProgram: 0, deleteBuffer: 0, clear: 0, drawArrays: 0 };
  const named = {
    deleteProgram: () => { counts.deleteProgram++; },
    deleteBuffer: () => { counts.deleteBuffer++; },
    clear: () => { counts.clear++; },
    drawArrays: () => { counts.drawArrays++; },
  };
  const gl = new Proxy({}, { get: (_t, k) => named[k] || (() => true) });
  return { gl, counts };
}

function domWithGl(gl) {
  const kids = [];
  const mk = () => {
    const el = { dataset: {}, style: {}, parentNode: null, getContext: () => gl, addEventListener() {}, removeEventListener() {} };
    el.remove = () => { const i = kids.indexOf(el); if (i >= 0) kids.splice(i, 1); el.parentNode = null; el.removed = true; };
    return el;
  };
  const host = {
    style: {},
    appendChild: (c) => { c.parentNode = host; kids.push(c); return c; },
    querySelector: () => kids[0] || null,
  };
  const base = { width: 768, height: 480, parentNode: host, ownerDocument: { createElement: mk },
    getContext: () => { throw new Error("canvas 2D não pode ser consultado"); } };
  return { base, kids };
}

test("Diorama: GL próprio — destroy limpa, apaga programa/buffer e remove o canvas", () => {
  const { gl, counts } = countingGl();
  const { base, kids } = domWithGl(gl);
  const overlay = attachDioramaOverlay(base, createFloorDoc({}), { mode: "3d", viewerRole: "gm", storage: null });
  assert.equal(kids.length, 1);
  overlay.destroy();
  assert.equal(counts.deleteProgram, 1);
  assert.equal(counts.deleteBuffer, 1);
  assert.ok(counts.clear >= 1);
  assert.equal(kids.length, 0, "canvas GL removido do DOM");
});

test("Diorama: detach + rebind reaproveita o mesmo canvas e contexto após o redesenho", () => {
  const { gl, counts } = countingGl();
  const { base, kids } = domWithGl(gl);
  const overlay = attachDioramaOverlay(base, createFloorDoc({}), { mode: "3d", viewerRole: "gm", storage: null });
  const first = kids[0];
  overlay.detach();
  assert.equal(kids.length, 0);
  overlay.rebind(base, createFloorDoc({}), { role: "gm" });
  assert.equal(kids[0], first);
  assert.equal(counts.deleteProgram, 0, "nenhum contexto/programa novo");
});

test("Diorama: jogador não recebe geometria de porta secreta; Mestre recebe", () => {
  const floor = createFloorDoc({ doors: [createDoorDoc({ x1: 0, y1: 0, x2: 3, y2: 0, state: "secret" })] });
  const draws = (role) => {
    const { gl, counts } = countingGl();
    const { base } = domWithGl(gl);
    attachDioramaOverlay(base, floor, { mode: "3d", viewerRole: role, storage: null }).draw();
    return counts.drawArrays;
  };
  assert.equal(draws("player"), 0);
  assert.equal(draws("gm"), 1);
});

test("Diorama: flag e pílula têm uma só definição em client/js/dungeon", () => {
  const dir = new URL("../client/js/dungeon/", import.meta.url);
  const src = ["screen-table.js", "diorama-lens.js", "diorama/diorama-view.js"].map((f) => readFileSync(new URL(f, dir), "utf8"));
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
