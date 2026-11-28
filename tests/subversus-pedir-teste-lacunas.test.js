/**
 * @file SUB-24c, lacunas de teste do botão "Rolar" do pedido: o `requestId` gravado é o do pedido clicado (não um id
 * fixo), a rolagem vai para o `store` recebido, a marcação do botão (tipo, classe, rótulo, escape) e o chip "Só para o
 * Mestre" do jogador, que um pedido não consome.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { ACTION_HANDLERS } from "../client/js/dungeon/dungeon-controller-actions.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { renderCheckRollButton } from "../client/js/dungeon/check-roll-ui.js";
import { reduceCampaign } from "../client/js/dungeon/vtt-reducer.js";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";

const GM = "vx_gm";
const ME = "vx_a";
const request = (extra = {}) => ({ requestId: "req-1", skillId: "acrobacia", label: "Acrobacia", targets: [ME], dcHidden: false, dc: 14, rollVisibility: "public", ...extra });
let lamport = 0;
const opOf = (type, payload) => createVttOp({ type, payload, actor: GM, lamport: ++lamport, ts: 1000 + lamport });

/** Estado do alvo `ME` com os pedidos `requests` abertos. */
function stateWith(...requests) {
  const doc = requests.reduce((d, r) => reduceCampaign(d, opOf("CHECK_REQUEST", r)), createCampaign({ id: "camp-lacunas", name: "Pedido", gmRouteId: GM }));
  const state = createDungeonSessionState({ viewerRole: "player", campaignId: "", syncPeer: null });
  Object.assign(state.sheet, { system: { id: "t20", version: 1 }, attributes_lww: { level: 3, abilities: { dex: 14 } }, pools_base: { hp_max: 20, hp_current: 20 }, inventory_orset: {} });
  Object.assign(state, { campaignDoc: doc, chronicle: doc.chronicle, vttKeypair: { routeId: ME }, joinMode: "p2p_player" });
  return state;
}

const clickOn = (state, requestId, store = createVttStore(createMemoryVttBackend())) =>
  ACTION_HANDLERS["check-roll"](state, { dataset: { requestId }, closest: () => null }, null, { store });

test("o requestId gravado é o do pedido clicado, não um id fixo", async () => {
  for (const id of ["req-1", "req-2"]) {
    const state = stateWith(request(), request({ requestId: "req-2", skillId: "furtividade", label: "Furtividade" }));
    await clickOn(state, id);
    assert.equal(state.rolls.at(-1).requestId, id);
  }
});

test("a rolagem do pedido vai para o store recebido (não para o padrão)", async () => {
  const state = stateWith(request());
  state.campaignId = "camp-lacunas";
  const gravadas = [];
  const store = { appendOp: async (id, op) => { gravadas.push([id, op.type]); return { campaign: state.campaignDoc }; }, listCampaigns: async () => [] };
  await clickOn(state, "req-1", store);
  assert.deepEqual(gravadas, [["camp-lacunas", "ROLL_RECORDED"]]);
});

test("o botão sai com tipo button, classe primária e rótulo com a perícia do pedido", () => {
  const state = stateWith(request());
  const html = renderCheckRollButton({ badge: "Pedido", checkRequestId: "req-1" }, state);
  assert.match(html, /^<button type="button" class="dungeon-btn dungeon-btn-primary" data-dungeon="check-roll" data-request-id="req-1" aria-label="Rolar Acrobacia">Rolar<\/button>$/);
});

test("rótulo e id hostis saem escapados no aria-label e no data-request-id", () => {
  const hostil = 'x" onfocus="alert(1)" autofocus="';
  const state = { vttKeypair: { routeId: ME }, campaignDoc: { checkRequestsById: { [hostil]: { requestId: hostil, label: hostil, status: "open", targets: [ME] } } } };
  const html = renderCheckRollButton({ badge: "Pedido", checkRequestId: hostil }, state);
  assert.doesNotMatch(html, /onfocus="alert/);
  assert.equal((html.match(/&quot;/g) || []).length >= 6, true, "as aspas dos dois valores foram escapadas");
});

test("o chip Só para o Mestre do jogador continua ligado depois de rolar um pedido (a visibilidade segue o pedido)", async () => {
  const state = stateWith(request());
  state.rollSecret = true;
  await clickOn(state, "req-1");
  assert.equal(state.rolls.at(-1).visibility, "public", "o pedido manda na visibilidade");
  assert.equal(state.rollSecret, true, "o chip fica como o jogador deixou");
});

test("pedido recusado também não mexe no chip", async () => {
  const state = stateWith(request());
  state.rollSecret = true;
  await clickOn(state, "req-inexistente");
  assert.equal(state.rollSecret, true);
});
