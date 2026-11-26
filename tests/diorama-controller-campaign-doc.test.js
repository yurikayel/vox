/**
 * @file Regressão PM-111: a lente Diorama lê a cena ativa de `state.campaignDoc` (o campo real da sessão).
 * Antes, o controller lia `state.campaign` (inexistente) e o canvas WebGL `data-diorama-gl` nunca era criado.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { wireDungeonView } from "../client/js/dungeon/dungeon-controller.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { createCampaign } from "../client/js/dungeon/vtt-schema.js";
import { createDefaultScene } from "../client/js/dungeon/vtt-scene-schema.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";
import { waitUntil } from "./helpers/wait-until.js";

/** Contêiner e canvas 2D falsos, o suficiente para o controller montar o overlay (sem WebGL no Node). */
function makeFakeMesa() {
  const appended = [];
  const style = {};
  const base = {
    id: "dungeon-vtt-canvas", width: 768, height: 576, offsetWidth: 768, offsetHeight: 576, offsetLeft: 0, offsetTop: 0,
    getContext: () => null, addEventListener() {}, removeEventListener() {},
    parentNode: { style, appendChild: (el) => appended.push(el), querySelector: () => null },
    ownerDocument: {
      createElement: () => ({ dataset: {}, style: {}, setAttribute() {}, addEventListener() {}, removeEventListener() {}, remove() {}, getContext: () => null }),
    },
  };
  const handlers = {};
  const container = {
    dataset: {}, innerHTML: "", ownerDocument: base.ownerDocument,
    addEventListener: (type, fn) => { handlers[type] = fn; },
    querySelector: (sel) => (sel === "#dungeon-vtt-canvas" ? base : null),
    querySelectorAll: () => [],
  };
  return { container, handlers, appended };
}

test("Diorama: com campanha em campaignDoc, o clique no modo 3D cria o canvas data-diorama-gl", async () => {
  const state = createDungeonSessionState({ viewerRole: "gm", campaignId: "", syncPeer: null });
  const scene = createDefaultScene("local");
  state.campaignDoc = createCampaign({ title: "T", scenesById: { [scene.sceneId]: scene }, activeSceneId: scene.sceneId });
  const { container, handlers, appended } = makeFakeMesa();
  wireDungeonView(container, { screen: "mesa", state, store: createVttStore(createMemoryVttBackend()) });
  const button = { dataset: { dungeon: "diorama-mode", mode: "iso" } };
  button.closest = () => button;
  await handlers.click({ target: button });
  assert.ok(await waitUntil(() => appended.length), "a lente anexou o canvas");
  assert.ok(appended.some((el) => el.dataset?.dioramaGl === "1"), "o canvas WebGL da lente foi anexado ao mapa");
});
