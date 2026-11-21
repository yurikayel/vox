import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createIdLookupStore } from "../client/js/labs/parado/webxdc-crdt.js";

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

function generateTestCrdtOperations() {
  const peers = ["alice", "bob", "carol", "dave"];
  const operations = [];
  const baseTs = 1730000000;
  for (let i = 0; i < 60; i++) {
    const itemId = `item_${(i % 12) + 1}`;
    const peer = peers[i % peers.length];
    const opType = i % 5 === 0 ? "remove" : "set";
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
  return operations;
}

function assertReplicasConverged(replicaA, replicaB, replicaC, replicaD) {
  const itemsA = replicaA.getStateSnapshot().items;
  assert.deepEqual(itemsA, replicaB.getStateSnapshot().items, "Réplica A e B divergiram!");
  assert.deepEqual(itemsA, replicaC.getStateSnapshot().items, "Réplica A e C divergiram!");
  assert.deepEqual(itemsA, replicaD.getStateSnapshot().items, "Réplica A e D divergiram!");

  const tombstonesA = replicaA.getStateSnapshot().tombstones;
  assert.deepEqual(tombstonesA, replicaB.getStateSnapshot().tombstones);
  assert.deepEqual(tombstonesA, replicaC.getStateSnapshot().tombstones);
  assert.deepEqual(tombstonesA, replicaD.getStateSnapshot().tombstones);

  assert.deepEqual(replicaA.getItems(), replicaB.getItems());
  assert.deepEqual(replicaA.getItems(), replicaC.getItems());
  assert.deepEqual(replicaA.getItems(), replicaD.getItems());
}

test("webxdc-crdt - convergência estrita entre réplicas sob entrega fora de ordem (harness aleatório)", () => {
  const rng = createSeededRandom(20261105);
  const operations = generateTestCrdtOperations();

  // 1. Réplica A: ordem natural
  const replicaA = createIdLookupStore();
  for (const op of operations) {
    replicaA.applyRemoteUpdate(op);
  }

  // 2. Réplica B: ordem estritamente invertida
  const replicaB = createIdLookupStore();
  for (const op of [...operations].reverse()) {
    replicaB.applyRemoteUpdate(op);
  }

  // 3. Réplica C: permutação embaralhada aleatória
  const replicaC = createIdLookupStore();
  for (const op of shuffleArray(operations, rng)) {
    replicaC.applyRemoteUpdate(op);
  }

  // 4. Réplica D: sincronização híbrida via snapshot + cauda delta
  const replicaD = createIdLookupStore();
  const intermediate = createIdLookupStore();
  for (const op of operations.slice(0, 30)) {
    intermediate.applyRemoteUpdate(op);
  }
  replicaD.mergeSnapshot(intermediate.getStateSnapshot());
  for (const op of shuffleArray(operations.slice(30), rng)) {
    replicaD.applyRemoteUpdate(op);
  }

  assertReplicasConverged(replicaA, replicaB, replicaC, replicaD);
});
