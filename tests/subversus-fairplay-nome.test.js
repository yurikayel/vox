/**
 * @file Nome de exibição no Fairplay: o HELLO leva o nome, o Mestre o limpa ao receber, e a lista de admissão
 * mostra o nome com o fim do `routeId` (ninguém se passa por outro) ou o `routeId` curto quando não há nome.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign } from "../client/js/dungeon/vtt-schema.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";
import { generateRoomKey, generateVttKeypair } from "../client/js/dungeon/vtt-sync-codec.js";
import { createInMemorySyncHub, createVttSyncPeer } from "../client/js/dungeon/vtt-sync.js";
import { fairplayPeerLabel, sanitizeDisplayName, shortRouteId } from "../client/js/dungeon/vtt-fairplay-nome.js";
import { renderFairplayRequests } from "../client/js/dungeon/vtt-fairplay-acesso.js";
import { settlePeers } from "./helpers/wait-until.js";

const ID = "mesa-nome";
const FLAG_ON = { getItem: () => "1" };

function makeStore() {
  return createVttStore(createMemoryVttBackend(), {
    requestPersistenceFn: async () => ({ persisted: true, isSupported: true }),
    estimateStorageFn: async () => ({ quota: 100000, usage: 100, percentage: 0.1, isSupported: true }),
    checkPersistenceFn: async () => true,
  });
}

async function joinWith(displayName, rawHello) {
  const [gm, player] = [await generateVttKeypair(), await generateVttKeypair()];
  const hub = createInMemorySyncHub();
  const roomKey = generateRoomKey();
  const gmStore = makeStore();
  await gmStore.saveCampaign(createCampaign({ id: ID, name: "Mesa", gmRouteId: gm.routeId }));
  const gmPeer = createVttSyncPeer({ role: "gm", campaignId: ID, keypair: gm, store: gmStore, transport: hub.connect(gm.routeId), roomKey, storage: FLAG_ON });
  if (rawHello) hub.connect(player.routeId).send(gm.routeId, { kind: "HELLO_SYNC", roomKey, ...rawHello });
  else createVttSyncPeer({ role: "player", campaignId: ID, keypair: player, store: makeStore(), transport: hub.connect(player.routeId), roomKey, gmRouteId: gm.routeId, displayName }).join();
  await settlePeers(gmPeer);
  return { gmPeer, id: player.routeId };
}

test("o nome anunciado no HELLO chega ao Mestre, limpo", async () => {
  const { gmPeer, id } = await joinWith("  Ana\u0000 da\u202e Silva  ");
  assert.deepEqual(gmPeer.getPeerNames(), { [id]: "Ana da Silva" });
  gmPeer.close();
});

test("nome ausente: nada é guardado e o rótulo cai no routeId curto", async () => {
  const { gmPeer, id } = await joinWith(undefined);
  assert.deepEqual(gmPeer.getPeerNames(), {});
  assert.equal(fairplayPeerLabel(id, undefined), shortRouteId(id));
  gmPeer.close();
});

test("nome hostil no HELLO (tipo errado, só controles, enorme) não vira nome", async () => {
  const objeto = await joinWith(undefined, { name: { toString: "x" } });
  assert.deepEqual(objeto.gmPeer.getPeerNames(), {});
  const controles = await joinWith(undefined, { name: "\u0007\u202e\u200b" });
  assert.deepEqual(controles.gmPeer.getPeerNames(), {});
  const longo = await joinWith(undefined, { name: "A".repeat(500) });
  assert.equal(Object.values(longo.gmPeer.getPeerNames())[0].length, 32);
  for (const r of [objeto, controles, longo]) r.gmPeer.close();
});

test("sanitizeDisplayName: corta por caractere, tira controle e direção, aceita só texto", () => {
  assert.equal(sanitizeDisplayName("a\n\tb"), "a b");
  assert.equal(sanitizeDisplayName("\u202eevil\u2066"), "evil");
  assert.equal(sanitizeDisplayName(42), "");
  assert.equal(sanitizeDisplayName("😀".repeat(40)), "😀".repeat(32));
  assert.equal(sanitizeDisplayName("   "), "");
});

test("lista de admissão: nome com fim do routeId, escapado; dois 'Ana' se distinguem", () => {
  const state = { fairplayPendingPeers: ["vx_aaaaaaaaaaaaaa1111", "vx_bbbbbbbbbbbbbb2222", "vx_cccccccccccccc3333"], fairplayNames: { vx_aaaaaaaaaaaaaa1111: "Ana", vx_bbbbbbbbbbbbbb2222: "Ana", vx_cccccccccccccc3333: '<img src=x onerror=alert(1)>' } };
  const html = renderFairplayRequests(state);
  assert.match(html, /Ana \(…1111\) pede para entrar/);
  assert.match(html, /Ana \(…2222\) pede para entrar/);
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;img"));
  assert.match(renderFairplayRequests({ fairplayPendingPeers: ["vx_dddddddddddddd4444"] }), /vx_ddd…4444 pede para entrar/);
});
