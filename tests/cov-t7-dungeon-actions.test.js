/**
 * @file Cobertura T7 de `dungeon-scene-actions.js` e `dungeon-tactics-actions.js`: ações da Mesa sobre uma sessão
 * efêmera (sem campanha salva) e, onde há disco, sobre um `VttStore` em memória.
 */
import "./setup.js";
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as scene from "../client/js/dungeon/dungeon-scene-actions.js";
import * as tac from "../client/js/dungeon/dungeon-tactics-actions.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";

let state;

beforeEach(() => {
  state = createDungeonSessionState({ viewerRole: "gm", campaignId: "", syncPeer: null });
});

const tokens = () => scene.getActiveScene(state).tokens;
const floor = () => scene.getActiveScene(state).floors.find((f) => f.z === scene.getActiveScene(state).activeFloorZ);
const byName = (n) => tokens().find((t) => t.name === n);

test("getActiveScene - cria cena padrão quando a sessão não tem nenhuma e a reaproveita", () => {
  const bare = { localActor: "vx_x" };
  const s = scene.getActiveScene(bare);
  assert.ok(s.floors.length >= 1);
  assert.equal(bare.scene, s);
  assert.equal(scene.getActiveScene(bare), s);
  const fromDoc = { campaignDoc: { activeSceneId: "a", scenesById: { a: { floors: [{ z: 0 }], marca: 1 } } } };
  assert.equal(scene.getActiveScene(fromDoc).marca, 1);
  assert.ok(scene.getActiveScene(null).floors.length >= 1);
});

test("addTokenToScene - nome vazio é ignorado; GM cria token oculto; jogador nunca cria na camada GM", async () => {
  const before = tokens().length;
  await scene.addTokenToScene(state, { name: "  " });
  assert.equal(tokens().length, before);
  await scene.addTokenToScene(state, { name: "Orc", layer: "gm", hpMax: "30.9", x: 3, y: 4 });
  const orc = byName("Orc");
  assert.deepEqual([orc.layer, orc.hpMax, orc.hpCurrent, orc.x, orc.y], ["gm", 30, 30, 3, 4]);
  assert.match(state.mapNotice, /Camada do Mestre/);
  state.viewerRole = "player";
  await scene.addTokenToScene(state, { name: "Intruso", layer: "gm", hpMax: 0 });
  assert.equal(byName("Intruso").layer, "player");
  assert.equal(byName("Intruso").hpMax, 20);
  assert.match(state.mapNotice, /adicionado ao mapa/);
});

test("updateTokenPropsInScene - limita PV e tamanho; token inexistente não muda nada", async () => {
  await scene.addTokenToScene(state, { name: "Goblin", hpMax: 10 });
  const id = byName("Goblin").tokenId;
  await scene.updateTokenPropsInScene(state, id, { hpCurrent: 99, sizeCells: 9, color: "#aabbcc", hpVisible: "status" });
  let g = byName("Goblin");
  assert.deepEqual([g.hpCurrent, g.hpMax, g.sizeCells, g.color, g.hpVisible], [10, 10, 4, "#aabbcc", "status"]);
  await scene.updateTokenPropsInScene(state, id, { hpMax: 5, hpCurrent: -3 });
  g = byName("Goblin");
  assert.deepEqual([g.hpCurrent, g.hpMax], [0, 5]);
  assert.match(state.mapNotice, /0\/5 PV/);
  const before = tokens().length;
  await scene.updateTokenPropsInScene(state, "nao-existe", { hpMax: 1 });
  assert.equal(tokens().length, before);
});

test("moveTokenInScene/nudgeTokenInScene - move, limita ao piso e guarda a posição da Lyra", async () => {
  await scene.moveTokenInScene(state, "tok-lyra", 9, -2);
  assert.deepEqual(state.playerPos, { x: 4, y: 0 });
  await scene.addTokenToScene(state, { name: "Peão", x: 1, y: 1 });
  const id = byName("Peão").tokenId;
  await scene.nudgeTokenInScene(state, id, 2, 1);
  assert.deepEqual([byName("Peão").x, byName("Peão").y], [3, 2]);
  await scene.nudgeTokenInScene(state, id, -999, -999);
  assert.deepEqual([byName("Peão").x, byName("Peão").y], [0, 0]);
  const same = await scene.nudgeTokenInScene(state, "nao-existe", 1, 1);
  assert.equal(same, scene.getActiveScene(state));
});

test("camada, remoção, porta e tipo de grade", async () => {
  await scene.addTokenToScene(state, { name: "Vigia" });
  const id = byName("Vigia").tokenId;
  await scene.toggleTokenLayerInScene(state, id);
  assert.equal(byName("Vigia").layer, "gm");
  assert.match(state.mapNotice, /ocultado/);
  await scene.toggleTokenLayerInScene(state, id);
  assert.equal(byName("Vigia").layer, "player");
  assert.match(state.mapNotice, /revelado/);
  await scene.toggleTokenLayerInScene(state, "nao-existe");
  state.selectedTokenId = id;
  await scene.removeTokenFromScene(state, id);
  assert.equal(byName("Vigia"), undefined);
  assert.equal(state.selectedTokenId, "");
  const doors = floor().doors.length;
  await scene.addDoorToScene(state, { x: 1, y: 1, state: "locked" });
  assert.equal(floor().doors.length, doors + 1);
  assert.match(state.mapNotice, /Porta \(locked\)/);
  const type0 = floor().grid.type;
  await scene.toggleSceneGridType(state);
  assert.notEqual(floor().grid.type, type0);
  await scene.toggleSceneGridType(state);
  assert.equal(floor().grid.type, type0);
});

test("iniciativa - rola por token do piso, avança turno e reinicia", async () => {
  const bytes = (buf) => buf.fill(7);
  await scene.addTokenToScene(state, { name: "Oculto", layer: "gm" });
  const init = await tac.rollInitiativeForScene(state, { randomBytesFn: bytes });
  const n = tokens().filter((t) => t.floorZ === scene.getActiveScene(state).activeFloorZ).length;
  assert.equal(init.entries.length, n);
  assert.equal(init.active, true);
  assert.ok(init.entries.find((e) => e.name === "Oculto").hidden);
  assert.match(state.mapNotice, new RegExp(`${n} combatente`));
  const next = await tac.advanceInitiativeTurn(state);
  assert.equal(next.turnIndex, init.entries.length > 1 ? 1 : 0);
  const reset = await tac.resetInitiativeTracker(state);
  assert.deepEqual([reset.active, reset.entries.length, reset.round], [false, 0, 1]);
});

test("condições - alterna adicionar/remover e ignora token inexistente", async () => {
  await scene.addTokenToScene(state, { name: "Alvo" });
  const id = byName("Alvo").tokenId;
  await tac.toggleConditionOnToken(state, id, " Envenenado ", { durationRounds: 3 });
  assert.deepEqual(byName("Alvo").conditions.map((c) => [c.id, c.durationRounds]), [["envenenado", 3]]);
  await tac.toggleConditionOnToken(state, id, "envenenado");
  assert.deepEqual(byName("Alvo").conditions, []);
  const s = scene.getActiveScene(state);
  assert.equal(await tac.toggleConditionOnToken(state, "nao-existe", "caido"), s);
});

test("névoa de guerra - liga/desliga, revela retângulo e cobre de novo", async () => {
  const on = !floor().fog?.enabled;
  await tac.toggleFogEnabled(state);
  assert.equal(floor().fog.enabled, on);
  assert.match(state.mapNotice, on ? /ativada/ : /desativada/);
  await tac.revealFogRectInScene(state, { x: 10, y: 10, w: 100, h: 50 });
  assert.equal(floor().fog.enabled, true);
  assert.equal(floor().fog.revealedRects.length, 1);
  await tac.resetFogInScene(state);
  assert.deepEqual(floor().fog.revealedRects, []);
});

test("desenhos e áreas de efeito - criar e limpar no piso ativo", async () => {
  await tac.commitDrawingStroke(state, [{ wx: 0, wy: 0 }, { wx: 10, wy: 10 }], { color: "#f00", width: 5, layer: "gm" });
  await tac.commitDrawingStroke(state, [{ wx: 1, wy: 1 }, { wx: 2, wy: 2 }]);
  assert.equal(floor().drawings.length, 2);
  assert.equal(floor().drawings[0].layer, "gm");
  await tac.clearSceneDrawings(state);
  assert.deepEqual(floor().drawings, []);
  await tac.commitAoeTemplate(state, { shape: "circle", x: 100, y: 100, radius: 40 });
  assert.equal(floor().aoes.length, 1);
  await tac.clearSceneAoes(state);
  assert.deepEqual(floor().aoes, []);
});

test("portas - jogador alterna aberta/fechada; trancada só o GM; porta inexistente é ignorada", async () => {
  await scene.addDoorToScene(state, { doorId: "d1", x: 1, y: 1, state: "closed" });
  await scene.addDoorToScene(state, { doorId: "d2", x: 2, y: 2, state: "locked" });
  await scene.addDoorToScene(state, { doorId: "d3", x: 3, y: 3, state: "secret" });
  const st = (id) => floor().doors.find((d) => d.doorId === id).state;
  state.viewerRole = "player";
  await tac.toggleDoorInScene(state, "d1");
  assert.equal(st("d1"), "open");
  await tac.toggleDoorInScene(state, "d1");
  assert.equal(st("d1"), "closed");
  await tac.toggleDoorInScene(state, "d2");
  await tac.toggleDoorInScene(state, "d3");
  assert.deepEqual([st("d2"), st("d3")], ["locked", "secret"]);
  state.viewerRole = "gm";
  await tac.toggleDoorInScene(state, "d2");
  assert.equal(st("d2"), "closed");
  await tac.toggleDoorInScene(state, "d3", { forceState: "open" });
  assert.equal(st("d3"), "open");
  const s = scene.getActiveScene(state);
  assert.equal(await tac.toggleDoorInScene(state, "nao-existe"), s);
});

test("andares - adicionar, selecionar e mover token entre andares", async () => {
  await tac.addFloorToScene(state, "Porão", { z: -1 });
  const s = () => scene.getActiveScene(state);
  assert.equal(s().activeFloorZ, -1);
  assert.equal(s().floors.find((f) => f.z === -1).name, "Porão");
  await tac.addFloorToScene(state);
  assert.ok(s().floors.some((f) => f.z === 1));
  await tac.selectSceneFloor(state, 0);
  assert.equal(s().activeFloorZ, 0);
  await scene.addTokenToScene(state, { name: "Escalador" });
  await tac.moveTokenToFloor(state, byName("Escalador").tokenId, 1);
  assert.equal(byName("Escalador").floorZ, 1);
});

test("uploadSceneMapBlob - grava o mapa no store e avisa quando reaproveita o mesmo arquivo", async () => {
  const store = createVttStore(createMemoryVttBackend());
  const file = { bytes: new Uint8Array([1, 2, 3, 4]), mime: "image/png", widthPx: 640, heightPx: 480 };
  const saved = await scene.uploadSceneMapBlob(state, file, { store });
  assert.match(state.mapNotice, /Mapa salvo localmente/);
  assert.equal(floor().mapBlobHash, saved.sha256);
  assert.equal(floor().widthPx, 640);
  await scene.uploadSceneMapBlob(state, file, { store });
  assert.match(state.mapNotice, /Mapa reutilizado/);
});

test("generateTableInvite - cria chave, salva a campanha e monta o link do convite", async () => {
  const store = createVttStore(createMemoryVttBackend());
  const href = await scene.generateTableInvite(state, { store });
  assert.equal(href, state.inviteHref);
  assert.ok(state.vttKeypair.routeId);
  assert.ok(state.roomKey);
  assert.ok(state.campaignId);
  assert.ok(href.includes(encodeURIComponent(state.vttKeypair.routeId)) || href.includes(state.vttKeypair.routeId));
  assert.equal((await store.loadCampaign(state.campaignId)).gmRouteId, state.vttKeypair.routeId);
  const again = await scene.generateTableInvite(state, { store });
  assert.equal(again, href);
  assert.match(state.campaignNotice, /Convite P2P ativo/);
  state.syncPeer?.destroy?.();
  state.syncPeer?.stop?.();
});

test("computeFitCamera - encaixa o piso no canvas com mínimos e zoom limitado a 1", () => {
  const cam = scene.computeFitCamera({ clientWidth: 1000, clientHeight: 800 }, { widthPx: 500, heightPx: 400 });
  assert.equal(cam.zoom, 1);
  assert.deepEqual([cam.panX, cam.panY], [250, 200]);
  const small = scene.computeFitCamera({ clientWidth: 100, clientHeight: 100 }, { widthPx: 1000, heightPx: 1000 });
  assert.ok(small.zoom < 0.5);
  const dflt = scene.computeFitCamera(null, null);
  assert.ok(dflt.zoom > 0 && dflt.zoom <= 1);
});

test("mountSceneCanvas - sem canvas devolve função vazia; com canvas desenha e desanexa", () => {
  assert.equal(typeof scene.mountSceneCanvas(null, state)(), "undefined");
  const texts = [];
  const listeners = {};
  const ctx = new Proxy({ fillText: (t) => texts.push(String(t)) }, { get: (o, k) => (k in o ? o[k] : () => {}) });
  const canvas = {
    width: 768, height: 576, clientWidth: 768, clientHeight: 576, style: {}, getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    addEventListener: (k, fn) => { listeners[k] = fn; },
    removeEventListener: (k) => { delete listeners[k]; },
  };
  const badge = { textContent: "" };
  const container = { querySelector: (sel) => (sel === "#dungeon-vtt-canvas" ? canvas : sel === "[data-dungeon-zoom-label]" ? badge : null) };
  const detach = scene.mountSceneCanvas(container, state, { store: createVttStore(createMemoryVttBackend()) });
  assert.match(badge.textContent, /^\d+%$/);
  assert.ok(state.camera.zoom > 0);
  assert.ok(Object.keys(listeners).length > 0);
  detach();
  assert.equal(Object.keys(listeners).length, 0);
});
