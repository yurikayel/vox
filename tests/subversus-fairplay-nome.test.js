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
import { duplicatePeerIds, fairplayPeerLabel, peerFingerprint, sanitizeDisplayName, shortRouteId } from "../client/js/dungeon/vtt-fairplay-nome.js";
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

const cp = (...n) => String.fromCodePoint(...n);
const UNSAFE_CASES = {
  "controle C0/C1": `a${cp(7)}${cp(0x85)}b`,
  "separador de linha U+2028": `a${cp(0x2028)}b`,
  "separador de parágrafo U+2029": `a${cp(0x2029)}b`,
  "marca de direção U+202E": `a${cp(0x202e)}b`,
  "marca de árabe U+061C": `a${cp(0x61c)}b`,
  "hífen suave U+00AD": `a${cp(0xad)}b`,
  "preenchimento hangul U+3164": `a${cp(0x3164)}b`,
  "preenchimento hangul U+FFA0": `a${cp(0xffa0)}b`,
  "junção de grafema U+034F": `a${cp(0x34f)}b`,
  "khmer U+17B4": `a${cp(0x17b4)}b`,
  "khmer U+17B5": `a${cp(0x17b5)}b`,
  "mongol U+180E": `a${cp(0x180e)}b`,
  "seletor de variação U+FE0F": `a${cp(0xfe0f)}b`,
  "seletor de variação U+E0100": `a${cp(0xe0100)}b`,
  "caractere de tag U+E0041": `a${cp(0xe0041)}b`,
  "formatador Cf fora do ignorável U+0600": `a${cp(0x600)}b`,
  "largura zero U+200B": `a${cp(0x200b)}b`,
  "braille vazio U+2800": `a${cp(0x2800)}b`,
};
for (const [label, raw] of Object.entries(UNSAFE_CASES)) {
  test(`sanitizeDisplayName: ${label} não sobra no nome`, () => {
    const out = sanitizeDisplayName(raw);
    assert.match(out, /^a ?b$/);
    assert.ok(!/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}\u2800]/u.test(out));
  });
}

test("sanitizeDisplayName: nome só de invisíveis fica vazio e o rótulo cai no identificador", () => {
  const nome = `${cp(0x2800)}${cp(0x3164)}${cp(0xe0041)}`;
  assert.equal(sanitizeDisplayName(nome), "");
  assert.equal(fairplayPeerLabel("vx_0123456789abcdef0001", nome), "vx_… abcde f0001");
});

test("sanitizeDisplayName: no máximo 2 marcas combinantes por base (zalgo)", () => {
  const zalgo = `x${cp(0x301).repeat(6)}b${cp(0x300, 0x301)}`;
  assert.equal(sanitizeDisplayName(zalgo), `x${cp(0x301, 0x301)}b${cp(0x300, 0x301)}`);
});

test("sanitizeDisplayName: normaliza para NFC", () => {
  assert.equal(sanitizeDisplayName(`e${cp(0x301)}`), cp(0xe9));
});

test("sanitizeDisplayName: corta por caractere, espaços colapsam, só texto", () => {
  assert.equal(sanitizeDisplayName("a\n\tb"), "a b");
  assert.equal(sanitizeDisplayName(42), "");
  assert.equal(sanitizeDisplayName("😀".repeat(40)), "😀".repeat(32));
  assert.equal(sanitizeDisplayName("   "), "");
});

const A = "vx_0123456789abcdef0001";
const B = "vx_0123456789abcdef0002";

test("identificador tem 10 hex em dois grupos de 5, a partir do fim do routeId", () => {
  assert.equal(peerFingerprint(A), "abcde f0001");
  assert.equal(fairplayPeerLabel(A, "Ana"), "Ana [abcde f0001]");
});

test("dois pares com o mesmo nome e routeIds diferentes: rótulos distintos e aviso visível", () => {
  assert.notEqual(fairplayPeerLabel(A, "Ana"), fairplayPeerLabel(B, "Ana"));
  const state = { fairplayPendingPeers: [A, B], fairplayNames: { [A]: "Ana", [B]: "ana" } };
  const html = renderFairplayRequests(state);
  assert.equal((html.match(/role="alert"/g) || []).length, 2);
  assert.match(html, /Ana \[abcde f0001\] pede para entrar/);
  assert.match(html, /ana \[abcde f0002\] pede para entrar/);
});

test("mesmo identificador exibido (prefixo diferente) também avisa; sem repetição, sem aviso", () => {
  const C = "vx_ffffffffffabcdef0001";
  const html = renderFairplayRequests({ fairplayPendingPeers: [A, C], fairplayNames: { [A]: "Ana", [C]: "Bia" } });
  assert.equal((html.match(/role="alert"/g) || []).length, 2);
  assert.doesNotMatch(renderFairplayRequests({ fairplayPendingPeers: [A, B], fairplayNames: { [A]: "Ana", [B]: "Bia" } }), /role="alert"/);
});

test("par já admitido com o mesmo nome também dispara o aviso do pendente", () => {
  const state = { fairplayPendingPeers: [B], fairplayNames: { [A]: "Ana", [B]: "Ana" }, campaign: { fairplay: { admitted: { [A]: 1 } } } };
  assert.deepEqual([...duplicatePeerIds([B, A], state.fairplayNames)].sort(), [A, B]);
  assert.match(renderFairplayRequests(state), /role="alert"/);
});

test("lista de admissão: nome escapado e sem nome mostra o identificador", () => {
  const html = renderFairplayRequests({ fairplayPendingPeers: [A, B], fairplayNames: { [A]: "<img src=x onerror=alert(1)>" } });
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;img"));
  assert.match(html, /vx_… abcde f0002 pede para entrar/);
});

test("enquanto pendente vale o nome do primeiro HELLO; recusar limpa o nome", async () => {
  const [gm, player] = [await generateVttKeypair(), await generateVttKeypair()];
  const hub = createInMemorySyncHub();
  const roomKey = generateRoomKey();
  const gmStore = makeStore();
  await gmStore.saveCampaign(createCampaign({ id: ID, name: "Mesa", gmRouteId: gm.routeId }));
  const gmPeer = createVttSyncPeer({ role: "gm", campaignId: ID, keypair: gm, store: gmStore, transport: hub.connect(gm.routeId), roomKey, storage: FLAG_ON });
  const wire = hub.connect(player.routeId);
  wire.send(gm.routeId, { kind: "HELLO_SYNC", roomKey, name: "Ana" });
  await settlePeers(gmPeer);
  wire.send(gm.routeId, { kind: "HELLO_SYNC", roomKey, name: "Outra" });
  await settlePeers(gmPeer);
  assert.deepEqual(gmPeer.getPeerNames(), { [player.routeId]: "Ana" });
  assert.equal(await gmPeer.refuseFairplayPeer(player.routeId), true);
  assert.deepEqual(gmPeer.getPeerNames(), {});
  gmPeer.close();
});

async function gmWithHello(name) {
  const [gm, player] = [await generateVttKeypair(), await generateVttKeypair()];
  const hub = createInMemorySyncHub();
  const roomKey = generateRoomKey();
  const store = makeStore();
  await store.saveCampaign(createCampaign({ id: ID, name: "Mesa", gmRouteId: gm.routeId }));
  const gmPeer = createVttSyncPeer({ role: "gm", campaignId: ID, keypair: gm, store, transport: hub.connect(gm.routeId), roomKey, storage: FLAG_ON });
  const hello = async () => { hub.connect(player.routeId).send(gm.routeId, { kind: "HELLO_SYNC", roomKey, name }); await settlePeers(gmPeer); };
  await hello();
  return { gmPeer, id: player.routeId, hello };
}

test("admitir e depois revogar: o nome some de getPeerNames", async () => {
  const { gmPeer, id } = await gmWithHello("Ana");
  assert.equal(await gmPeer.approveFairplayPeer(id), true);
  assert.deepEqual(gmPeer.getPeerNames(), { [id]: "Ana" });
  assert.equal(await gmPeer.revokeFairplayPeer(id), true);
  assert.deepEqual(gmPeer.getPeerNames(), {});
  gmPeer.close();
});

test("par recusado que manda novo HELLO com nome não volta a ter nome guardado", async () => {
  const { gmPeer, id, hello } = await gmWithHello("Ana");
  await gmPeer.refuseFairplayPeer(id);
  await hello();
  assert.deepEqual(gmPeer.getPeerNames(), {});
  gmPeer.close();
});
