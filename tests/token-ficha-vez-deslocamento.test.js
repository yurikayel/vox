/**
 * @file Token ligado à ficha: PV, retrato, "Sua vez" e alcance do Deslocamento.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  activeTurnTokenId, movementPath, reachableCells, speedInCells, tokenHp,
} from "../client/js/dungeon/token-ficha.js";
import {
  drawTokenPortrait, drawTurnBadge, loadTokenAvatars, tokenFichaRenderOpts,
} from "../client/js/dungeon/canvas-token-layers.js";

const SHEET = { attributes_lww: { speed_ft: 30 }, pools_base: { hp_max: 20, hp_current: 20 }, delta_ledger: [] };
const FLOOR = { z: 0, widthPx: 640, heightPx: 640, grid: { cellPx: 64, unitMeters: 1.5 } };
const SCENE = { activeFloorZ: 0, floors: [FLOOR], tokens: [{ tokenId: "t1", sheetId: "s1", x: 5, y: 5, floorZ: 0 }] };

function spyCtx() {
  const calls = [];
  const store = {};
  const ctx = new Proxy(store, {
    get: (t, k) => (k in t ? t[k] : (...a) => calls.push([k, ...a])),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  return { ctx, calls };
}

test("30 ft de Deslocamento viram 6 células na grade de 1,5 m", () => {
  assert.equal(speedInCells({ attributes_lww: { speed_ft: 30 } }, { unitMeters: 1.5 }), 6);
  assert.equal(speedInCells(null, { unitMeters: 1.5 }), 0, "sem ficha não há alcance");
});

test("PV do token vêm da ficha; sem ficha, do próprio token", () => {
  assert.deepEqual(tokenHp({}, SHEET), { hpCurrent: 20, hpMax: 20 });
  assert.deepEqual(tokenHp({ hpCurrent: 3, hpMax: 9 }, null), { hpCurrent: 3, hpMax: 9 });
});

test("token da vez só existe com combate ativo", () => {
  const init = { active: true, turnIndex: 1, entries: [{ tokenId: "a" }, { tokenId: "b" }] };
  assert.equal(activeTurnTokenId(init), "b");
  assert.equal(activeTurnTokenId({ ...init, active: false }), "");
  assert.equal(activeTurnTokenId(null), "");
});

test("caminho anda na diagonal e é cortado no alcance; alcance respeita o piso", () => {
  assert.deepEqual(movementPath({ x: 0, y: 0 }, { x: 3, y: 1 }, 6).map((c) => `${c.x},${c.y}`), ["1,1", "2,1", "3,1"]);
  assert.equal(movementPath({ x: 0, y: 0 }, { x: 9, y: 0 }, 4).length, 4);
  assert.equal(reachableCells({ x: 0, y: 0 }, 2, { cols: 10, rows: 10 }).length, 8);
});

test("opções: selecionado com ficha ganha alcance e caminho; sem ficha, nada", () => {
  const state = { selectedTokenId: "t1", campaignDoc: { sheetsById: { s1: SHEET } } };
  const opts = tokenFichaRenderOpts(state, SCENE, { moveTarget: { x: 8, y: 5 } });
  assert.equal(opts.movePreview.path.length, 3);
  assert.equal(opts.movePreview.cells.length, 10 * 10 - 1, "alcance de 6 células cortado pelo piso 10x10");
  assert.equal(tokenFichaRenderOpts({ ...state, campaignDoc: { sheetsById: {} } }, SCENE, {}).movePreview, null);
  assert.equal(tokenFichaRenderOpts({ ...state, selectedTokenId: "" }, SCENE, {}).movePreview, null);
});

test("retrato só desenha com bitmap; selo escreve 'Sua vez'", () => {
  const b = { cx: 10, cy: 10, radius: 8, top: 2 };
  const a = spyCtx();
  assert.equal(drawTokenPortrait(a.ctx, null, b), false);
  assert.equal(drawTokenPortrait(a.ctx, {}, b), true);
  assert.ok(a.calls.some((c) => c[0] === "drawImage"));
  const s = spyCtx();
  drawTurnBadge(s.ctx, b);
  assert.ok(s.calls.some((c) => c[0] === "fillText" && c[1] === "Sua vez"));
});

test("loadTokenAvatars carrega cada retrato uma única vez", async () => {
  const prev = globalThis.createImageBitmap;
  globalThis.createImageBitmap = async () => ({ ok: true });
  try {
    let reads = 0;
    const store = { getBlob: async () => { reads += 1; return new Uint8Array([1]); } };
    const scene = { tokens: [{ avatarBlobHash: "h1" }, { avatarBlobHash: "h1" }, {}] };
    const avatars = new Map();
    assert.equal(await loadTokenAvatars(scene, store, avatars), 1);
    assert.equal(await loadTokenAvatars(scene, store, avatars), 0);
    assert.equal(reads, 1);
  } finally { globalThis.createImageBitmap = prev; }
});
