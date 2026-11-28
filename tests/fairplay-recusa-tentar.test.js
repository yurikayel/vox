/**
 * @file Fairplay: o jogador com "Entrada recusada" ganha o botão "Tentar de novo" (V8), e o botão não fura a recusa:
 * o Mestre que recusou continua sem admitir nem pôr o jogador de volta na fila.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign } from "../client/js/dungeon/vtt-schema.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";
import { generateRoomKey, generateVttKeypair } from "../client/js/dungeon/vtt-sync-codec.js";
import { createInMemorySyncHub, createVttSyncPeer } from "../client/js/dungeon/vtt-sync.js";
import { renderFairplayAccess, handleFairplayRetry } from "../client/js/dungeon/vtt-fairplay-acesso.js";
import { settlePeers } from "./helpers/wait-until.js";

const ID = "mesa-recusa-tentar";
const RETRY = /<button[^>]*data-dungeon="fairplay-retry"[^>]*>Tentar de novo<\/button>/g;

function makeStore() {
  return createVttStore(createMemoryVttBackend(), {
    requestPersistenceFn: async () => ({ persisted: true, isSupported: true }),
    estimateStorageFn: async () => ({ quota: 100000, usage: 100, percentage: 0.1, isSupported: true }),
    checkPersistenceFn: async () => true,
  });
}

async function mesaComJogadorRecusado() {
  const [gm, player] = [await generateVttKeypair(), await generateVttKeypair()];
  const [roomKey, hub, gmStore] = [generateRoomKey(), createInMemorySyncHub(), makeStore()];
  await gmStore.saveCampaign(createCampaign({ id: ID, name: "Mesa", gmRouteId: gm.routeId }));
  const gmPeer = createVttSyncPeer({ role: "gm", campaignId: ID, keypair: gm, store: gmStore, transport: hub.connect(gm.routeId), roomKey, storage: { getItem: () => "1" } });
  const peer = createVttSyncPeer({ role: "player", campaignId: ID, keypair: player, store: makeStore(), transport: hub.connect(player.routeId), roomKey, gmRouteId: gm.routeId });
  peer.join();
  await settlePeers(gmPeer, peer);
  await gmPeer.refuseFairplayPeer(player.routeId);
  await settlePeers(gmPeer, peer);
  return { gmPeer, peer, gmStore };
}

test("recusado: o aviso 'Entrada recusada' vem com um único botão Tentar de novo, fora do role=status", () => {
  const html = renderFairplayAccess({ fairplayAccess: "refused" });
  assert.match(html, /role="status">Entrada recusada<\/p>/);
  assert.equal(html.match(RETRY)?.length, 1, "um botão Tentar de novo");
  assert.doesNotMatch(html, /role="status">[^<]*<button/, "o botão não entra dentro do aviso lido pelo leitor de tela");
});

test("aguardando e liberado não mostram Tentar de novo; o sem-contato continua mostrando", () => {
  assert.doesNotMatch(renderFairplayAccess({ fairplayAccess: "waiting" }), RETRY);
  assert.doesNotMatch(renderFairplayAccess({ fairplayAccess: "ok" }), RETRY);
  assert.match(renderFairplayAccess({ fairplayHelloGaveUp: true }), RETRY);
});

test("o clique do recusado refaz o pedido (join) sem furar a recusa: não entra na fila nem é admitido", async () => {
  const { gmPeer, peer, gmStore } = await mesaComJogadorRecusado();
  let joins = 0;
  const state = { fairplayAccess: "refused", syncPeer: { join: () => { joins += 1; peer.join(); } } };
  assert.equal(handleFairplayRetry(state), true);
  await settlePeers(gmPeer, peer);
  assert.equal(joins, 1);
  assert.deepEqual(gmPeer.getPendingFairplayPeers(), [], "o Mestre não põe o recusado de volta na fila");
  assert.deepEqual(Object.keys((await gmStore.loadCampaign(ID)).fairplay.admitted), [], "ninguém foi admitido");
  assert.match(renderFairplayAccess(state), /role="status">Entrada recusada</, "o estado segue recusado");
});
