/**
 * @file Região viva do HUD no fluxo PV → seta → redesenho, e o aviso repetido: com o token parado (borda do mapa, 2ª
 * seta igual) o texto não muda e o leitor de tela não relê; o nó precisa mudar de fato a cada anúncio.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { handleCanvasKeydown } from "../client/js/dungeon/dungeon-controller.js";
import { ACTION_HANDLERS } from "../client/js/dungeon/dungeon-controller-actions.js";
import { addTokenToScene } from "../client/js/dungeon/dungeon-scene-actions.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { announceHudLive, syncHudLive } from "../client/js/dungeon/hud-live.js";

/** Documento mínimo: só o que a região viva usa. */
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
const spoken = (doc) => live(doc).textContent.replace(/ /g, "");

test("PV muda, depois a seta empurra o token: o redesenho com o PV novo mantém o aviso", async (t) => {
  const doc = installDoc(t);
  const state = await mesaWithPawn(1, 1);
  syncHudLive("PV 5/10");
  assert.equal(syncHudLive("PV 4/10"), true);
  await press(state, "ArrowRight");
  assert.equal(syncHudLive("PV 4/10"), false, "o PV novo já é o anunciado");
  assert.equal(spoken(doc), "Peão movido para (2, 1).");
});

test("duas setas seguidas e um redesenho: fica o aviso da última, e só um PV diferente o substitui", async (t) => {
  const doc = installDoc(t);
  const state = await mesaWithPawn(1, 1);
  syncHudLive("PV 5/10");
  await press(state, "ArrowRight");
  await press(state, "ArrowDown");
  assert.equal(syncHudLive("PV 5/10"), false);
  assert.equal(spoken(doc), "Peão movido para (2, 2).");
  assert.equal(syncHudLive("PV 3/10"), true);
  assert.equal(spoken(doc), "PV 3/10");
});

test("PV depois do aviso volta ao PV mesmo que seja o mesmo valor de antes do aviso", async (t) => {
  const doc = installDoc(t);
  const state = await mesaWithPawn(1, 1);
  syncHudLive("PV 5/10");
  await press(state, "ArrowRight");
  syncHudLive("PV 4/10");
  assert.equal(syncHudLive("PV 5/10"), true);
  assert.equal(spoken(doc), "PV 5/10");
});

test("token parado na borda: a 2ª seta igual muda o nó, para o leitor reler", async (t) => {
  const doc = installDoc(t);
  const state = await mesaWithPawn(0, 0);
  await press(state, "ArrowLeft");
  const primeira = live(doc).textContent;
  await press(state, "ArrowLeft");
  const segunda = live(doc).textContent;
  await press(state, "ArrowLeft");
  assert.notEqual(segunda, primeira, "o texto do nó muda na repetição");
  assert.notEqual(live(doc).textContent, segunda, "e volta a mudar na seguinte");
  assert.equal(spoken(doc), "Peão já está na borda do mapa, em (0, 0).");
});

test("o botão direcional na borda também alterna o texto repetido", async (t) => {
  const doc = installDoc(t);
  const state = await mesaWithPawn(0, 0);
  const botao = { dataset: { tokenId: state.selectedTokenId, dx: "-1", dy: "0" } };
  await ACTION_HANDLERS["nudge-token"](state, botao, null, {});
  const primeira = live(doc).textContent;
  await ACTION_HANDLERS["nudge-token"](state, botao, null, {});
  assert.notEqual(live(doc).textContent, primeira);
  assert.equal(spoken(doc), "Peão já está na borda do mapa, em (0, 0).");
});

test("anunciar o mesmo texto devolve true e o sufixo não falado não acumula", (t) => {
  const doc = installDoc(t);
  for (let i = 0; i < 5; i += 1) assert.equal(announceHudLive("Aviso."), true);
  assert.ok(live(doc).textContent.length <= "Aviso.".length + 1);
  assert.equal(spoken(doc), "Aviso.");
});

test("anúncio sem texto ou sem documento não escreve nada", (t) => {
  const doc = installDoc(t);
  assert.equal(announceHudLive("", doc), false);
  assert.equal(announceHudLive("x", {}), false);
  assert.equal(live(doc).textContent, "");
});

test("seta antes de qualquer PV anunciado: o redesenho sem PV (texto vazio) não apaga o aviso", async (t) => {
  const doc = installDoc(t);
  const state = await mesaWithPawn(1, 1);
  await press(state, "ArrowRight");
  assert.equal(syncHudLive(""), false, "sem PV, o redesenho não troca nada");
  assert.equal(spoken(doc), "Peão movido para (2, 1).");
});

test("o redesenho do mesmo PV depois de um aviso repetido não apaga o aviso", async (t) => {
  const doc = installDoc(t);
  syncHudLive("PV 5/10");
  announceHudLive("Aviso.");
  announceHudLive("Aviso.");
  assert.equal(syncHudLive("PV 5/10"), false);
  assert.equal(spoken(doc), "Aviso.");
});
