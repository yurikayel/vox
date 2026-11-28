/**
 * @file SUB-24c: a entrada "O Mestre pede X · CD n" da Crônica mostra, ao jogador que é alvo do pedido, o botão "Rolar".
 * O clique rola a perícia ligada ao pedido e grava a rolagem com o `requestId`; quem não é alvo, o Mestre e o pedido já
 * revelado não veem o botão.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { ACTION_HANDLERS, DICE3D_CLICK_ACTIONS } from "../client/js/dungeon/dungeon-controller-actions.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { renderChronicleEntry } from "../client/js/dungeon/screen-table-layout.js";
import { reduceCampaign } from "../client/js/dungeon/vtt-reducer.js";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";

const GM = "vx_gm";
const request = (extra = {}) => ({ requestId: "req-1", skillId: "acrobacia", label: "Acrobacia", targets: ["vx_a", "vx_b"], dcHidden: false, dc: 14, rollVisibility: "public", ...extra });
let lamport = 0;
const opOf = (type, payload) => createVttOp({ type, payload, actor: GM, lamport: ++lamport, ts: 1000 + lamport });

/** Campanha com o pedido aberto (ou já revelado) e o estado de um leitor com a ficha de T20. */
function stateFor(reader, { revealed = false, requestExtra = {}, role = "player" } = {}) {
  let doc = reduceCampaign(createCampaign({ id: "camp-24c", name: "Pedido", gmRouteId: GM }), opOf("CHECK_REQUEST", request(requestExtra)));
  if (revealed) doc = reduceCampaign(doc, opOf("CHECK_REVEAL", { requestId: "req-1" }));
  const state = createDungeonSessionState({ viewerRole: role, campaignId: "", syncPeer: null });
  Object.assign(state.sheet, { system: { id: "t20", version: 1 }, attributes_lww: { level: 3, abilities: { dex: 14 } }, pools_base: { hp_max: 20, hp_current: 20 }, inventory_orset: {} });
  Object.assign(state, { campaignDoc: doc, chronicle: doc.chronicle, vttKeypair: reader ? { routeId: reader } : null, joinMode: "p2p_player" });
  return state;
}

const entryOf = (state) => state.chronicle.find((e) => e.badge === "Pedido");
const render = (state) => renderChronicleEntry(entryOf(state), state);

test("o alvo do pedido aberto vê o botão Rolar, com o id do pedido", () => {
  const html = render(stateFor("vx_a"));
  assert.match(html, /<button[^>]*data-dungeon="check-roll"[^>]*data-request-id="req-1"[^>]*>[^<]*Rolar/);
});

test("quem não é alvo, o Mestre e o leitor sem chave não veem o botão", () => {
  assert.doesNotMatch(render(stateFor("vx_outro")), /check-roll/);
  assert.doesNotMatch(render(stateFor(GM, { role: "gm" })), /check-roll/);
  assert.doesNotMatch(render(stateFor(null)), /check-roll/);
});

test("pedido já revelado não tem mais o botão", () => {
  assert.doesNotMatch(render(stateFor("vx_a", { revealed: true })), /check-roll/);
});

/** Faz o clique no botão do pedido `req-1`: exige que a ação exista e devolve o resultado dela. */
async function click(state) {
  assert.equal(typeof ACTION_HANDLERS["check-roll"], "function", "a ação check-roll existe");
  const el = { dataset: { requestId: "req-1" }, closest: () => null };
  return ACTION_HANDLERS["check-roll"](state, el, null, { store: createVttStore(createMemoryVttBackend()) });
}

test("o clique rola a perícia do pedido e grava a rolagem com o requestId", async () => {
  const state = stateFor("vx_a");
  const result = await click(state);
  assert.equal(result.ok, true);
  assert.equal(state.rolls.at(-1).requestId, "req-1");
  assert.equal(state.rolls.at(-1).visibility, "public");
  assert.match(state.lastFormulaRoll.label, /Acrobacia/);
});

test("pedido com rolagem do Mestre: o clique rola como gm", async () => {
  const state = stateFor("vx_a", { requestExtra: { rollVisibility: "gm" } });
  await click(state);
  assert.equal(state.rolls.at(-1).visibility, "gm");
  assert.equal(state.rolls.at(-1).requestId, "req-1");
});

test("clique num pedido que não é seu ou que já foi revelado não rola e avisa", async () => {
  for (const [reader, revealed] of [["vx_outro", false], ["vx_a", true]]) {
    const state = stateFor(reader, { revealed });
    const result = await click(state);
    assert.equal(result.ok, false);
    assert.equal(state.rolls.length, 0);
    assert.ok(state.rollError);
  }
});

test("o clique dispara o overlay dos dados 3D como as outras rolagens da ficha", () => {
  assert.ok(DICE3D_CLICK_ACTIONS.has("check-roll"));
});
