/**
 * @file Descrição acessível do Diorama (aria-live): só o que o observador vê, sem vazar névoa nem camada GM.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { describeDioramaView } from "../client/js/dungeon/diorama/diorama-geom.js";
import { projectDioramaView } from "../client/js/dungeon/diorama/diorama-layers.js";
import { attachDioramaOverlay } from "../client/js/dungeon/diorama/diorama-view.js";
import { createFloorDoc, createTokenDoc } from "../client/js/dungeon/vtt-scene-schema.js";
import { createDoorDoc } from "../client/js/dungeon/vtt-tactics-schema.js";

const FLOOR = () => createFloorDoc({
  fog: { enabled: true, revealedRects: [{ id: "r", x: 0, y: 0, w: 384, h: 384 }] },
  doors: [
    createDoorDoc({ doorId: "porta-vis", x1: 3, y1: 1, x2: 4, y2: 1, state: "closed" }),
    createDoorDoc({ doorId: "porta-nev", x1: 9, y1: 7, x2: 10, y2: 7, state: "open" }),
    createDoorDoc({ doorId: "porta-sec", x1: 1, y1: 4, x2: 2, y2: 4, state: "secret" }),
  ],
});
const TOKENS = () => [
  createTokenDoc({ tokenId: "tok-lyra", name: "Lyra", x: 1, y: 1, layer: "player" }),
  createTokenDoc({ tokenId: "tok-gareth", name: "Gareth", x: 3, y: 3, layer: "player" }),
  createTokenDoc({ tokenId: "tok-nevoa", name: "Sentinela", x: 9, y: 6, layer: "player" }),
  createTokenDoc({ tokenId: "tok-chefe", name: "Chefe Oculto", x: 2, y: 2, layer: "gm" }),
];

test("descrição do jogador: sem névoa, sem camada do Mestre e sem porta secreta", () => {
  const view = projectDioramaView(FLOOR(), TOKENS(), "player");
  const geral = describeDioramaView(view);
  assert.match(geral, /Lyra, Gareth/);
  assert.match(geral, /Portas visíveis: 1/);
  for (const secreto of ["Sentinela", "Chefe Oculto", "secreta"]) assert.ok(!geral.includes(secreto), secreto);
  const foco = describeDioramaView(view, "tok-lyra");
  assert.match(foco, /Lyra em \(1, 1\)/);
  assert.match(foco, /Gareth a /);
  assert.match(foco, /porta fechada a /);
  for (const secreto of ["Sentinela", "Chefe Oculto", "secreta", "aberta"]) assert.ok(!foco.includes(secreto), secreto);
});

test("descrição do Mestre inclui tudo, com o estado das portas", () => {
  const view = projectDioramaView(FLOOR(), TOKENS(), "gm");
  const foco = describeDioramaView(view, "tok-lyra");
  for (const esperado of ["Sentinela", "Chefe Oculto", "porta secreta", "porta aberta"]) assert.ok(foco.includes(esperado), esperado);
  assert.match(describeDioramaView(projectDioramaView(createFloorDoc({}), [], "gm")), /Tokens visíveis: nenhum/);
});

function rig(role) {
  const live = { dataset: {}, style: {}, textContent: "", parentNode: null, setAttribute(k, v) { this[k] = v; }, remove() { this.removed = true; } };
  const gl = new Proxy({}, { get: () => () => true });
  const glCanvas = { dataset: {}, style: {}, width: 800, height: 500, parentNode: null, getContext: () => gl, setAttribute() {}, addEventListener() {}, removeEventListener() {}, remove() {} };
  const host = { style: {}, appendChild: (c) => { c.parentNode = host; }, querySelector: () => null };
  const base = { width: 800, height: 500, parentNode: host, ownerDocument: { createElement: (tag) => (tag === "div" ? live : glCanvas) } };
  const overlay = attachDioramaOverlay(base, FLOOR(), { mode: "3d", viewerRole: role, tokens: TOKENS(), storage: null });
  return { live, overlay, base };
}

test("overlay: região aria-live narra a cena ao desenhar, acompanha a seleção e some no 2D", () => {
  const { live, overlay, base } = rig("player");
  overlay.draw();
  assert.equal(live["aria-live"], "polite");
  assert.equal(live.role, "status");
  assert.match(live.textContent, /Tokens visíveis: Lyra, Gareth/);
  assert.ok(!live.textContent.includes("Sentinela"));
  overlay.rebind(base, FLOOR(), { role: "player", tokens: TOKENS(), selectedId: "tok-gareth" });
  assert.match(live.textContent, /Gareth em \(3, 3\)/);
  overlay.setMode("2d");
  overlay.draw();
  assert.equal(live.textContent, "", "no 2D não narra");
  overlay.destroy();
  assert.equal(live.removed, true);
});
