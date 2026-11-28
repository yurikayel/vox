/**
 * @file Setas no canvas da Mesa (`<canvas tabindex="0">`, sem texto dentro): empurrar o token selecionado precisa ser
 * anunciado ao leitor de tela, na região viva estável do HUD (`#dungeon-hud-live`, a mesma do PV, sem criar outra):
 * para onde o token foi, ou que ele já está na borda do mapa. O aviso não é apagado por um redesenho com o mesmo PV e
 * dá lugar ao PV quando ele muda de verdade.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { handleCanvasKeydown } from "../client/js/dungeon/dungeon-controller.js";
import { addTokenToScene } from "../client/js/dungeon/dungeon-scene-actions.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { syncHudLive } from "../client/js/dungeon/hud-live.js";

/** Documento mínimo: só o que a região viva usa, contando os nós criados. */
function installDoc(t) {
  const nodes = new Map();
  const doc = {
    nodes,
    body: { appendChild: (n) => nodes.set(n.id, n) },
    getElementById: (id) => nodes.get(id) ?? null,
    createElement: () => ({ attrs: {}, textContent: "", setAttribute(k, v) { this.attrs[k] = v; } }),
  };
  const before = globalThis.document;
  globalThis.document = doc;
  t.after(() => { globalThis.document = before; });
  return doc;
}

async function mesaWithPawn(x, y) {
  const state = createDungeonSessionState({ viewerRole: "gm", campaignId: "", syncPeer: null });
  await addTokenToScene(state, { name: "Peão", x, y });
  state.selectedTokenId = state.scene.tokens.find((tk) => tk.name === "Peão").tokenId;
  return state;
}

const arrow = (key) => ({ key, target: { id: "dungeon-vtt-canvas" }, preventDefault() {} });
const press = (state, key) => handleCanvasKeydown({}, { state }, arrow(key), (job) => job);
const live = (doc) => doc.getElementById("dungeon-hud-live");

test("seta move o token e anuncia para onde ele foi na região viva do HUD", async (t) => {
  const doc = installDoc(t);
  const state = await mesaWithPawn(1, 1);
  await press(state, "ArrowRight");
  assert.equal(live(doc)?.textContent, "Peão movido para (2, 1).");
  await press(state, "ArrowDown");
  assert.equal(live(doc).textContent, "Peão movido para (2, 2).");
});

test("a região é a viva e educada do HUD, e é só uma: as setas não criam outra", async (t) => {
  const doc = installDoc(t);
  const state = await mesaWithPawn(1, 1);
  await press(state, "ArrowRight");
  await press(state, "ArrowRight");
  assert.equal(doc.nodes.size, 1, "um nó só");
  assert.deepEqual(live(doc).attrs, { role: "status", "aria-live": "polite" });
});

test("na borda do mapa o token não anda e o aviso diz isso, em vez de silêncio", async (t) => {
  const doc = installDoc(t);
  const state = await mesaWithPawn(0, 0);
  await press(state, "ArrowLeft");
  assert.equal(live(doc)?.textContent, "Peão já está na borda do mapa, em (0, 0).");
});

test("o redesenho com o mesmo PV não apaga o aviso; quando o PV muda, o PV volta", async (t) => {
  const doc = installDoc(t);
  const state = await mesaWithPawn(1, 1);
  syncHudLive("PV 5/10");
  await press(state, "ArrowRight");
  assert.equal(syncHudLive("PV 5/10"), false, "o redesenho depois da seta não troca o texto");
  assert.equal(live(doc).textContent, "Peão movido para (2, 1).");
  assert.equal(syncHudLive("PV 4/10"), true);
  assert.equal(live(doc).textContent, "PV 4/10");
});

test("sem token selecionado a seta não faz nada nem anuncia", async (t) => {
  const doc = installDoc(t);
  const state = await mesaWithPawn(1, 1);
  state.selectedTokenId = "";
  assert.equal(press(state, "ArrowRight"), undefined);
  assert.equal(live(doc), null);
});
