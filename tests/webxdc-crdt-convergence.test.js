import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createIdLookupStore } from "../client/js/webxdc-crdt.js";

// PRNG determinístico linear congruente (LCG) para reprodutibilidade estrita
function createSeededRandom(seed = 123456789) {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function shuffleArray(arr, rng) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

test("webxdc-crdt - convergência estrita entre réplicas sob entrega fora de ordem (harness aleatório)", () => {
  const rng = createSeededRandom(20261105);
  const peers = ["alice", "bob", "carol", "dave"];
  const operations = [];

  const baseTs = 1730000000;
  // Gera 60 operações distribuídas com empates intencionais e cenários de conflito
  for (let i = 0; i < 60; i++) {
    const itemId = `item_${(i % 12) + 1}`;
    const peer = peers[i % peers.length];
    const opType = i % 5 === 0 ? "remove" : "set";
    // Timestamps com empates propositais para testar o tie-breaking lexicográfico de sender
    const ts = baseTs + Math.floor(i / 3) * 10;

    if (opType === "set") {
      operations.push({
        type: "set",
        id: itemId,
        data: { name: `Produto ${itemId}`, version: i, sender: peer },
        ts,
        sender: peer,
        serial: i + 1,
      });
    } else {
      operations.push({
        type: "remove",
        id: itemId,
        ts,
        sender: peer,
        serial: i + 1,
      });
    }
  }

  // 1. Réplica A: ordem natural
  const replicaA = createIdLookupStore();
  for (const op of operations) {
    replicaA.applyRemoteUpdate(op);
  }

  // 2. Réplica B: ordem estritamente invertida
  const replicaB = createIdLookupStore();
  const reversedOps = [...operations].reverse();
  for (const op of reversedOps) {
    replicaB.applyRemoteUpdate(op);
  }

  // 3. Réplica C: permutação embaralhada aleatória
  const replicaC = createIdLookupStore();
  const shuffledOps = shuffleArray(operations, rng);
  for (const op of shuffledOps) {
    replicaC.applyRemoteUpdate(op);
  }

  // 4. Réplica D: sincronização híbrida via snapshot + cauda delta
  const replicaD = createIdLookupStore();
  const firstHalf = operations.slice(0, 30);
  const secondHalf = operations.slice(30);

  // Instância intermediária gera snapshot da 1ª metade
  const intermediate = createIdLookupStore();
  for (const op of firstHalf) {
    intermediate.applyRemoteUpdate(op);
  }
  const snapshotHalf = intermediate.getStateSnapshot();

  // D inicializa via mergeSnapshot e aplica a 2ª metade embaralhada
  replicaD.mergeSnapshot(snapshotHalf);
  const shuffledSecondHalf = shuffleArray(secondHalf, rng);
  for (const op of shuffledSecondHalf) {
    replicaD.applyRemoteUpdate(op);
  }

  // Asserção matemática de convergência estrita:
  // Todos os itens finais devem ser idênticos campo a campo
  const itemsA = replicaA.getStateSnapshot().items;
  const itemsB = replicaB.getStateSnapshot().items;
  const itemsC = replicaC.getStateSnapshot().items;
  const itemsD = replicaD.getStateSnapshot().items;

  assert.deepEqual(itemsA, itemsB, "Réplica A e B divergiram!");
  assert.deepEqual(itemsA, itemsC, "Réplica A e C divergiram!");
  assert.deepEqual(itemsA, itemsD, "Réplica A e D divergiram!");

  // Tombstones também devem convergir
  const tombstonesA = replicaA.getStateSnapshot().tombstones;
  const tombstonesB = replicaB.getStateSnapshot().tombstones;
  const tombstonesC = replicaC.getStateSnapshot().tombstones;
  const tombstonesD = replicaD.getStateSnapshot().tombstones;

  assert.deepEqual(tombstonesA, tombstonesB);
  assert.deepEqual(tombstonesA, tombstonesC);
  assert.deepEqual(tombstonesA, tombstonesD);

  // getItems() deve retornar exatamente a mesma lista
  assert.deepEqual(replicaA.getItems(), replicaB.getItems());
  assert.deepEqual(replicaA.getItems(), replicaC.getItems());
  assert.deepEqual(replicaA.getItems(), replicaD.getItems());
});
