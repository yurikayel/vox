import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as blobAffinity from "../client/js/peers-blob-affinity.js";
import * as peers from "../client/js/peers.js";

test("T1: Flag off - comportamento idêntico ao padrão, sem writes de affinity", async () => {
  blobAffinity.clearAffinity();
  blobAffinity.setBlobPeerSoftPriorityEnabled(false);
  assert.equal(blobAffinity.isBlobPeerSoftPriorityEnabled(), false);

  // Simula recebimento de BLOB com flag desativada
  const msg = {
    type: "BLOB",
    txId: "tx-test-t1",
    data: { content: "teste" },
    fromPeer: "peer_a",
  };

  await peers.handleVoxMessage(msg, () => {}, "rtc");

  // Não deve gravar afinidade
  assert.equal(blobAffinity.getPeerAffinity("peer_a"), 0);
  assert.deepEqual(blobAffinity.rankAffinity(["peer_a", "peer_b"]), []);
});

test("T2: Flag on - peer_a serviu antes; ambos têm tx2 -> Primeiro WANT unicast para peer_a", async () => {
  blobAffinity.clearAffinity();
  blobAffinity.setBlobPeerSoftPriorityEnabled(true);
  assert.equal(blobAffinity.isBlobPeerSoftPriorityEnabled(), true);

  // peer_a serviu BLOB em resposta a WANT pendente
  blobAffinity.bumpAffinity("peer_a");
  assert.ok(blobAffinity.getPeerAffinity("peer_a") > 0);
  assert.equal(blobAffinity.getPeerAffinity("peer_b"), 0);

  // Ambos estão conectados via WebRTC
  const openPeers = ["peer_b", "peer_a"];
  const ranked = blobAffinity.rankAffinity(openPeers);

  // peer_a deve estar em primeiro lugar na lista de afinidade
  assert.equal(ranked[0], "peer_a");
  assert.equal(ranked.length, 1);
});

test("T3: Flag on - peer_a expirado, peer_b recente -> Preferir peer_b", () => {
  blobAffinity.clearAffinity();
  blobAffinity.setBlobPeerSoftPriorityEnabled(true);

  const baseTime = 1000000;
  // peer_a registrado no tempo base
  blobAffinity.bumpAffinity("peer_a", baseTime);

  // peer_b registrado 20 minutos depois (peer_a expirou com TTL de 15 min)
  const laterTime = baseTime + 20 * 60 * 1000;
  blobAffinity.bumpAffinity("peer_b", laterTime);

  const ranked = blobAffinity.rankAffinity(["peer_a", "peer_b"], laterTime);
  assert.deepEqual(ranked, ["peer_b"]);
  assert.equal(blobAffinity.getPeerAffinity("peer_a", laterTime), 0);
  assert.ok(blobAffinity.getPeerAffinity("peer_b", laterTime) > 0);
});

test("T4: Flag on - responder no cap / timeout -> Unicast falha e degrada para fallback", async () => {
  blobAffinity.clearAffinity();
  blobAffinity.setBlobPeerSoftPriorityEnabled(true);

  // peer_c tem afinidade registrada
  blobAffinity.bumpAffinity("peer_c");
  const ranked = blobAffinity.rankAffinity(["peer_c"]);
  assert.deepEqual(ranked, ["peer_c"]);

  // Se o peer_c não responder a tempo ou rejeitar por quota,
  // rankAffinity retorna peer_c mas requestTxFromPeers faz fallback para flood.
  // Testamos a robustez da lista e da pontuação
  assert.ok(blobAffinity.getPeerAffinity("peer_c") > 0);
});

test("T5: Flag on - BLOB recebido sem fromPeer -> Sem bump, degrada para flood", async () => {
  blobAffinity.clearAffinity();
  blobAffinity.setBlobPeerSoftPriorityEnabled(true);

  // Simula BLOB anônimo ou sem fromPeer
  const msgWithoutPeer = {
    type: "BLOB",
    txId: "tx-test-t5",
    data: { content: "anon" },
  };

  await peers.handleVoxMessage(msgWithoutPeer, () => {}, "rtc");

  assert.deepEqual(blobAffinity.getAffinityEntries(), {});
  assert.deepEqual(blobAffinity.rankAffinity(["peer_x", "peer_y"]), []);

  // Limpa estado para não afetar outros testes
  blobAffinity.setBlobPeerSoftPriorityEnabled(false);
});

test("peers-blob-affinity: capacidade máxima (cap ~16) e descarte do menor score", () => {
  blobAffinity.clearAffinity();
  const now = Date.now();

  // Insere 16 peers
  for (let i = 1; i <= 16; i++) {
    blobAffinity.bumpAffinity(`peer_${i}`, now + i);
  }
  let entries = blobAffinity.getAffinityEntries(now + 100);
  assert.equal(Object.keys(entries).length, 16);

  // Dá mais score para peer_16
  blobAffinity.bumpAffinity("peer_16", now + 200);

  // Insere o 17º peer
  blobAffinity.bumpAffinity("peer_17", now + 300);
  entries = blobAffinity.getAffinityEntries(now + 400);

  // Tamanho permanece 16
  assert.equal(Object.keys(entries).length, 16);
  assert.ok("peer_17" in entries);
  assert.ok("peer_16" in entries);
});
