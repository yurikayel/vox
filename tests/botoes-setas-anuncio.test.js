/**
 * @file Botões direcionais do token (↑ ← → ↓ do editor do token selecionado, ação `nudge-token`): o mesmo empurrão das
 * setas do canvas, e também precisa ser anunciado ao leitor de tela na região viva do HUD (`#dungeon-hud-live`, a mesma
 * do PV, sem criar outra). Sem o anúncio, o botão move o token e o leitor só ouve o botão de novo, sem saber se andou.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { ACTION_HANDLERS } from "../client/js/dungeon/dungeon-controller-actions.js";
import { addTokenToScene } from "../client/js/dungeon/dungeon-scene-actions.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";

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
  return { state, tokenId: state.scene.tokens.find((tk) => tk.name === "Peão").tokenId };
}

const button = (tokenId, dx, dy) => ({ dataset: { tokenId, dx: String(dx), dy: String(dy) } });
const push = (state, tokenId, dx, dy) => ACTION_HANDLERS["nudge-token"](state, button(tokenId, dx, dy), null, {});
const live = (doc) => doc.getElementById("dungeon-hud-live");

test("botão direcional move o token e anuncia para onde ele foi na região viva do HUD", async (t) => {
  const doc = installDoc(t);
  const { state, tokenId } = await mesaWithPawn(1, 1);
  await push(state, tokenId, 1, 0);
  assert.equal(live(doc)?.textContent, "Peão movido para (2, 1).");
  await push(state, tokenId, 0, 1);
  assert.equal(live(doc).textContent, "Peão movido para (2, 2).");
});

test("botão e seta dividem a mesma região viva: um nó só, com role e aria-live", async (t) => {
  const doc = installDoc(t);
  const { state, tokenId } = await mesaWithPawn(1, 1);
  await push(state, tokenId, 1, 0);
  await push(state, tokenId, -1, 0);
  assert.equal(doc.nodes.size, 1, "um nó só");
  assert.deepEqual(live(doc).attrs, { role: "status", "aria-live": "polite" });
});

test("botão na borda do mapa: o token não anda e o aviso diz isso, em vez de silêncio", async (t) => {
  const doc = installDoc(t);
  const { state, tokenId } = await mesaWithPawn(0, 0);
  await push(state, tokenId, -1, 0);
  assert.equal(live(doc)?.textContent, "Peão já está na borda do mapa, em (0, 0).");
});

test("token que não existe mais: o botão não anuncia nada", async (t) => {
  const doc = installDoc(t);
  const { state } = await mesaWithPawn(1, 1);
  await push(state, "fantasma", 1, 0);
  assert.equal(live(doc), null);
});
