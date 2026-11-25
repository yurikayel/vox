import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";
import {
  buildRoomInviteHref,
  createBlobAssembler,
  generateRoomKey,
  generateVttKeypair,
  parseRoomInviteHref,
  signVttOp,
  splitBlobIntoChunks,
  verifyVttOpSignature,
} from "../client/js/dungeon/vtt-sync-codec.js";
import { createInMemorySyncHub, createVttSyncPeer } from "../client/js/dungeon/vtt-sync.js";
import { sha256Hex } from "../client/js/rpg-crypto-table.js";
import { settlePeers, waitUntil } from "./helpers/wait-until.js";

function makeStore() {
  return createVttStore(createMemoryVttBackend(), {
    requestPersistenceFn: async () => ({ persisted: true, isSupported: true }),
    estimateStorageFn: async () => ({ quota: 100000, usage: 100, percentage: 0.1, isSupported: true }),
    checkPersistenceFn: async () => true,
  });
}

test("vtt-sync-codec: convites #k=, assinatura ECDSA P-256 anti-spoof e chunking SHA-256 de blobs", async () => {
  const key = generateRoomKey();
  const href = buildRoomInviteHref({ tableId: "mesa-cripta", gmRouteId: "vx_gm123", roomKey: key });
  assert.deepEqual(parseRoomInviteHref(href), { tableId: "mesa-cripta", gmRouteId: "vx_gm123", roomKey: key });
  assert.equal(parseRoomInviteHref("#/dungeon/entrar/../bad?gm=x#k=123"), null);

  const kp = await generateVttKeypair();
  const op = createVttOp({ type: "TOKEN_MOVE", payload: { tokenId: "tok-1", x: 4, y: 5 }, lamport: 1 });
  const signed = await signVttOp(op, kp);
  assert.equal(await verifyVttOpSignature(signed), true);
  assert.equal(await verifyVttOpSignature({ ...signed, payload: { tokenId: "tok-1", x: 9, y: 9 } }), false);
  assert.equal(await verifyVttOpSignature({ ...signed, actor: "vx_spoofed" }), false);

  const blob = new Uint8Array(40000);
  for (let i = 0; i < blob.length; i += 1) blob[i] = i & 0xff;
  const hash = await sha256Hex(blob);
  const chunks = splitBlobIntoChunks(hash, blob);
  assert.equal(chunks.length, 3);
  const asm = createBlobAssembler();
  let finalRes = null;
  for (const ch of chunks) finalRes = await asm.pushChunk(ch);
  assert.equal(finalRes.complete, true);
  assert.deepEqual(finalRes.bytes, blob);

  const badAsm = createBlobAssembler();
  const tampered = { ...chunks[0], dataB64: chunks[0].dataB64.replace(/^./, chunks[0].dataB64[0] === "A" ? "B" : "A") };
  await badAsm.pushChunk(tampered);
  await badAsm.pushChunk(chunks[1]);
  const badRes = await badAsm.pushChunk(chunks[2]);
  assert.equal(badRes.complete, false);
  assert.match(badRes.error, /SHA-256/);
});

async function setupP2pTable() {
  const gmKeys = await generateVttKeypair();
  const p1Keys = await generateVttKeypair();
  const roomKey = generateRoomKey();
  const gmStore = makeStore();
  const p1Store = makeStore();
  const mapBytes = new Uint8Array(36000).fill(7);
  const secretAvatar = new Uint8Array(512).fill(9);
  const { sha256: mapHash } = await gmStore.putBlob(mapBytes, "image/png");
  const { sha256: secretHash } = await gmStore.putBlob(secretAvatar, "image/png");
  const camp = createCampaign({ id: "mesa-p2p", name: "Torre", gmRouteId: gmKeys.routeId });
  camp.scenesById["sc-cripta"].floors[0].mapBlobHash = mapHash;
  camp.scenesById["sc-cripta"].tokens = [
    { tokenId: "tok-p1", ownerRouteId: p1Keys.routeId, name: "Lyra", initials: "LY", color: "#78d6cf", floorZ: 0, x: 1, y: 1, sizeCells: 1, layer: "player", hpVisible: "exact", hpCurrent: 24, hpMax: 24 },
    { tokenId: "tok-boss", ownerRouteId: gmKeys.routeId, name: "Lich", initials: "LC", color: "#ff6666", floorZ: 0, x: 5, y: 5, sizeCells: 1, layer: "player", hpVisible: "status", hpCurrent: 12, hpMax: 40 },
    { tokenId: "tok-hidden", ownerRouteId: gmKeys.routeId, name: "Emboscada", initials: "EM", color: "#e7c26b", avatarBlobHash: secretHash, floorZ: 0, x: 6, y: 6, sizeCells: 1, layer: "gm", hpVisible: "status", hpCurrent: 20, hpMax: 20 },
  ];
  camp.notesById.n1 = { id: "n1", title: "Pista", publicMarkdown: "Porta sul", gmSecretMarkdown: "ARMADILHA_OCULTA", tags: [], links: [], updatedAt: 1 };
  await gmStore.saveCampaign(camp);
  return { gmKeys, p1Keys, roomKey, gmStore, p1Store, mapBytes, mapHash, secretHash };
}

test("vtt-sync: mesa P2P 2 pares com Zero-Spoiler, WANT_BLOB, bloqueio de op não autorizada e revelação GM", async () => {
  const { gmKeys, p1Keys, roomKey, gmStore, p1Store, mapBytes, mapHash, secretHash } = await setupP2pTable();
  const hub = createInMemorySyncHub();
  const rejected = [];
  const gmPeer = createVttSyncPeer({ role: "gm", campaignId: "mesa-p2p", keypair: gmKeys, store: gmStore, transport: hub.connect(gmKeys.routeId), roomKey });
  const p1Transport = hub.connect(p1Keys.routeId);
  const p1Peer = createVttSyncPeer({ role: "player", campaignId: "mesa-p2p", keypair: p1Keys, store: p1Store, transport: p1Transport, roomKey, gmRouteId: gmKeys.routeId, onRejected: (m) => rejected.push(m) });

  p1Peer.join();
  await waitUntil(async () => (await p1Store.loadCampaign("mesa-p2p")) && (await p1Store.getBlob(mapHash)));
  const p1Camp = await p1Store.loadCampaign("mesa-p2p");
  assert.equal(p1Camp.scenesById["sc-cripta"].tokens.some((t) => t.tokenId === "tok-hidden"), false);
  assert.equal(p1Camp.notesById.n1.gmSecretMarkdown, "");
  const bossView = p1Camp.scenesById["sc-cripta"].tokens.find((t) => t.tokenId === "tok-boss");
  assert.equal(bossView.hpCurrent, null);
  assert.equal(bossView.hpStatus, "Ferido");
  assert.deepEqual(await p1Store.getBlob(mapHash), mapBytes);

  p1Transport.send(gmKeys.routeId, { kind: "WANT_BLOB", roomKey, sha256: secretHash });
  await settlePeers(gmPeer, p1Peer); // filas vazias: o pedido foi tratado e nada mais virá
  assert.equal(await p1Store.getBlob(secretHash), null, "GM não pode servir blob de token oculto");

  await p1Peer.dispatchOp({ type: "TOKEN_MOVE", payload: { sceneId: "sc-cripta", tokenId: "tok-boss", x: 0, y: 0 } });
  await p1Peer.dispatchOp({ type: "TOKEN_MOVE", payload: { sceneId: "sc-cripta", tokenId: "tok-p1", x: 3, y: 4 } });
  const tokenOf = async (store, id) => (await store.loadCampaign("mesa-p2p")).scenesById["sc-cripta"].tokens.find((t) => t.tokenId === id);
  await waitUntil(async () => rejected.length >= 1 && (await tokenOf(gmStore, "tok-p1")).x === 3 && (await tokenOf(p1Store, "tok-p1")).y === 4);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason, "unauthorized");
  assert.equal((await gmStore.loadCampaign("mesa-p2p")).scenesById["sc-cripta"].tokens.find((t) => t.tokenId === "tok-p1").x, 3);
  assert.equal((await p1Store.loadCampaign("mesa-p2p")).scenesById["sc-cripta"].tokens.find((t) => t.tokenId === "tok-p1").y, 4);

  await gmPeer.dispatchOp({ type: "TOKEN_LAYER_SET", payload: { sceneId: "sc-cripta", tokenId: "tok-hidden", layer: "player" } });
  await waitUntil(async () => await tokenOf(p1Store, "tok-hidden"));
  assert.equal((await p1Store.loadCampaign("mesa-p2p")).scenesById["sc-cripta"].tokens.some((t) => t.tokenId === "tok-hidden"), true);
  gmPeer.close();
  p1Peer.close();
});
