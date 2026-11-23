/**
 * @file Cobertura T7 de `canvas-renderer.js`: grades quadrada e hexagonal, mapa de fundo, tokens com PV exato/status,
 * projeção por papel e notas fixadas, contra um contexto 2D que registra as chamadas.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { renderSceneToCanvas } from "../client/js/dungeon/canvas-renderer.js";
import { createDefaultScene, hpStatusLabel } from "../client/js/dungeon/vtt-scene-schema.js";

/**
 * Canvas falso cujo contexto registra nome das chamadas e textos desenhados.
 * @param {object} [size] Dimensões do canvas.
 * @returns {{ canvas: object, calls: string[], texts: string[], images: object[] }} Canvas e registros.
 */
function makeCanvas(size = {}) {
  const calls = [];
  const texts = [];
  const images = [];
  const ctx = new Proxy({}, {
    get: (_o, k) => {
      if (k === "fillText") return (t) => texts.push(String(t));
      if (k === "drawImage") return (img) => images.push(img);
      return (...a) => { calls.push(String(k)); return a; };
    },
    set: () => true,
  });
  return { canvas: { width: 0, height: 0, getContext: () => ctx, ...size }, calls, texts, images };
}

/**
 * Cena padrão com ajustes no piso ativo e nos tokens.
 * @param {{ grid?: object, tokens?: object[] }} patch Alterações.
 * @returns {object} Cena.
 */
function sceneWith({ grid, tokens } = {}) {
  const s = createDefaultScene("vx_gm");
  if (grid) s.floors[0].grid = { ...s.floors[0].grid, ...grid };
  if (tokens) s.tokens = tokens.map((t) => ({ floorZ: s.activeFloorZ, x: 1, y: 1, sizeCells: 1, layer: "player", hpMax: 10, hpCurrent: 10, ...t }));
  return s;
}

test("cena sem andares ou sem contexto devolve resumo vazio", () => {
  assert.deepEqual(renderSceneToCanvas({ getContext: () => null }, createDefaultScene("x")), { drawnTokens: 0, viewerRole: "player", floorZ: 0 });
  assert.equal(renderSceneToCanvas(makeCanvas().canvas, { floors: [] }).drawnTokens, 0);
});

test("grade quadrada desenha linhas; hexagonal traça hexágonos; grade invisível não desenha", () => {
  const sq = makeCanvas();
  renderSceneToCanvas(sq.canvas, sceneWith({ grid: { type: "square", visible: true } }));
  const hex = makeCanvas();
  renderSceneToCanvas(hex.canvas, sceneWith({ grid: { type: "hex", visible: true } }));
  const off = makeCanvas();
  renderSceneToCanvas(off.canvas, sceneWith({ grid: { visible: false } }));
  assert.ok(sq.calls.filter((c) => c === "lineTo").length > 0);
  assert.equal(sq.calls.includes("closePath"), false);
  assert.ok(hex.calls.filter((c) => c === "closePath").length > 10);
  assert.ok(hex.calls.filter((c) => c === "moveTo").length > 10);
  assert.equal(off.calls.filter((c) => c === "lineTo").length < sq.calls.filter((c) => c === "lineTo").length, true);
});

test("imagem do mapa é desenhada no fundo quando fornecida", () => {
  const withMap = makeCanvas();
  const bmp = { id: "mapa" };
  renderSceneToCanvas(withMap.canvas, sceneWith(), { mapImage: bmp });
  assert.deepEqual(withMap.images, [bmp]);
  const without = makeCanvas();
  renderSceneToCanvas(without.canvas, sceneWith());
  assert.deepEqual(without.images, []);
});

test("tokens - GM vê a camada do mestre; jogador só a pública; PV exato aparece como texto", () => {
  const scene = sceneWith({
    tokens: [
      { tokenId: "a", name: "Ana", hpVisible: "exact", hpCurrent: 3, hpMax: 10 },
      { tokenId: "b", name: "Boss", layer: "gm", hpVisible: "bar" },
    ],
  });
  const gm = makeCanvas();
  const rg = renderSceneToCanvas(gm.canvas, scene, { viewerRole: "gm", selectedTokenId: "a" });
  assert.equal(rg.drawnTokens, 2);
  assert.ok(gm.texts.includes("[GM] Boss"));
  assert.ok(gm.texts.includes("3/10"));
  const pl = makeCanvas();
  const rp = renderSceneToCanvas(pl.canvas, scene, { viewerRole: "visitante" });
  assert.deepEqual([rp.drawnTokens, rp.viewerRole], [1, "player"]);
  assert.equal(pl.texts.includes("[GM] Boss"), false);
});

test("PV em modo status - jogador vê só o rótulo; GM ainda vê a barra", () => {
  const scene = sceneWith({ tokens: [{ tokenId: "s", name: "Sombra", hpVisible: "status", hpCurrent: 2, hpMax: 10 }] });
  const pl = makeCanvas();
  renderSceneToCanvas(pl.canvas, scene, { viewerRole: "player" });
  assert.ok(pl.texts.includes(hpStatusLabel(2, 10)));
  assert.equal(pl.texts.includes("2/10"), false);
  const gm = makeCanvas();
  renderSceneToCanvas(gm.canvas, scene, { viewerRole: "gm" });
  assert.equal(gm.texts.includes(hpStatusLabel(2, 10)), false);
  assert.ok(gm.calls.filter((c) => c === "fillRect").length > pl.calls.filter((c) => c === "fillRect").length);
});

test("prévia de arrasto move o token só no desenho", () => {
  const scene = sceneWith({ tokens: [{ tokenId: "a", name: "Ana", x: 1, y: 1 }] });
  const r = renderSceneToCanvas(makeCanvas().canvas, scene, { dragPreview: { tokenId: "a", x: 3, y: 3 } });
  assert.equal(r.drawnTokens, 1);
  assert.equal(scene.tokens[0].x, 1);
});

test("notas fixadas - GM vê todas; jogador não vê as só do mestre", () => {
  const scene = sceneWith();
  const pin = (id, vis) => ({ id, visibility: vis, pin: { sceneId: scene.sceneId, floorZ: scene.activeFloorZ, x: 2, y: 2 } });
  const notes = [pin("n1", "shared"), pin("n2", "gm_only"), { id: "n3", pin: { sceneId: "outra", floorZ: 0 } }, null];
  const countP = (role) => {
    const c = makeCanvas();
    renderSceneToCanvas(c.canvas, scene, { viewerRole: role, notes });
    return c.texts.filter((t) => t === "P").length;
  };
  assert.equal(countP("gm"), 2);
  assert.equal(countP("player"), 1);
});

test("viewport - ajusta o tamanho do canvas ao CSS e ao DPR limitado a 2", () => {
  const c = makeCanvas({ clientWidth: 500, clientHeight: 300 });
  renderSceneToCanvas(c.canvas, sceneWith(), { dpr: 5 });
  assert.deepEqual([c.canvas.width, c.canvas.height], [1000, 600]);
  const tiny = makeCanvas({ clientWidth: 10, clientHeight: 10 });
  renderSceneToCanvas(tiny.canvas, sceneWith(), { dpr: 1 });
  assert.deepEqual([tiny.canvas.width, tiny.canvas.height], [240, 180]);
});
