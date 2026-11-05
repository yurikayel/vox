import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  createIdLookupStore,
  createEpochCompactor,
  coldBootFetch,
  EPOCH_COMPACT_THRESHOLD,
} from "../client/js/webxdc-crdt.js";

test("webxdc-crdt - setItem, getItem, getItems e getOrder com LWW", () => {
  const store = createIdLookupStore();

  assert.equal(store.setItem("item_1", { name: "Tomate", preco: 5.0 }, 1000, "alice"), true);
  assert.equal(store.setItem("item_2", { name: "Cebola", preco: 3.5 }, 1050, "bob"), true);

  const item1 = store.getItem("item_1");
  assert.equal(item1.name, "Tomate");
  assert.equal(item1.preco, 5.0);
  assert.equal(item1._updatedAt, 1000);
  assert.equal(item1._sender, "alice");

  assert.deepEqual(store.getOrder(), ["item_1", "item_2"]);

  // Update com timestamp mais recente sobrescreve
  assert.equal(store.setItem("item_1", { preco: 5.5 }, 1100, "alice"), true);
  assert.equal(store.getItem("item_1").preco, 5.5);
  assert.equal(store.getItem("item_1").name, "Tomate"); // merge preserva nome

  // Update com timestamp antigo é rejeitado por LWW
  assert.equal(store.setItem("item_1", { preco: 4.0 }, 900, "charlie"), false);
  assert.equal(store.getItem("item_1").preco, 5.5);

  const items = store.getItems();
  assert.equal(items.length, 2);
  assert.equal(items[0].id, "item_1");
  assert.equal(items[1].id, "item_2");
});

test("webxdc-crdt - removeItem e tombstones com LWW", () => {
  const store = createIdLookupStore();
  store.setItem("prod_a", { title: "Pão Caseiro" }, 1000);

  // Remoção com timestamp antigo é rejeitada se o item for mais novo
  assert.equal(store.removeItem("prod_a", 900), false);
  assert.ok(store.getItem("prod_a"));

  // Remoção legítima com timestamp mais recente
  assert.equal(store.removeItem("prod_a", 1100), true);
  assert.equal(store.getItem("prod_a"), null);
  assert.deepEqual(store.getOrder(), []);

  // Update com timestamp anterior à remoção é bloqueado pelo tombstone
  assert.equal(store.setItem("prod_a", { title: "Pão Velho" }, 1050), false);
  assert.equal(store.getItem("prod_a"), null);

  // Update com timestamp mais novo que a remoção ressuscita o item
  assert.equal(store.setItem("prod_a", { title: "Pão Fresco" }, 1200), true);
  assert.equal(store.getItem("prod_a").title, "Pão Fresco");
  assert.deepEqual(store.getOrder(), ["prod_a"]);
});

test("webxdc-crdt - moveItem reposiciona no vetor determinístico order", () => {
  const store = createIdLookupStore();
  store.setItem("a", { v: 1 });
  store.setItem("b", { v: 2 });
  store.setItem("c", { v: 3 });

  assert.deepEqual(store.getOrder(), ["a", "b", "c"]);

  // Move "c" para o início (índice 0)
  assert.equal(store.moveItem("c", 0), true);
  assert.deepEqual(store.getOrder(), ["c", "a", "b"]);

  // Move "a" para o final (índice 2)
  assert.equal(store.moveItem("a", 2), true);
  assert.deepEqual(store.getOrder(), ["c", "b", "a"]);

  // Item inexistente retorna false
  assert.equal(store.moveItem("inexistente", 0), false);
});

test("webxdc-crdt - mergeSnapshot reconcilia estado base e tombstones", () => {
  const store = createIdLookupStore();
  store.setItem("loc_1", { name: "Local Recente" }, 2000);
  store.setItem("loc_2", { name: "Local Velho" }, 500);

  const remoteSnapshot = {
    items: {
      rem_1: { data: { name: "Remoto 1" }, updatedAt: 1500, sender: "peer_x" },
      loc_2: { data: { name: "Remoto Atualizado" }, updatedAt: 800, sender: "peer_y" },
    },
    order: ["rem_1", "loc_2"],
    tombstones: {
      loc_1: 1000, // Tombstone remoto mais antigo que o item local (não deve deletar loc_1)
    },
  };

  assert.equal(store.mergeSnapshot(remoteSnapshot), true);

  // loc_1 sobreviveu porque ts local (2000) > tombstone (1000)
  assert.ok(store.getItem("loc_1"));

  // loc_2 foi atualizado para a versão remota mais nova (800 > 500)
  assert.equal(store.getItem("loc_2").name, "Remoto Atualizado");

  // rem_1 foi adicionado
  assert.equal(store.getItem("rem_1").name, "Remoto 1");
});

test("webxdc-crdt - applyRemoteUpdate processa set, remove, move e batch", () => {
  const store = createIdLookupStore();

  assert.equal(
    store.applyRemoteUpdate({
      type: "set",
      id: "task_1",
      data: { title: "Organizar feira", done: false },
      ts: 1000,
      sender: "maria",
    }),
    true
  );
  assert.equal(store.getItem("task_1").title, "Organizar feira");

  // Batch
  const batchUpdate = {
    type: "batch",
    operations: [
      { type: "set", id: "task_2", data: { title: "Montar barracas" }, ts: 1010 },
      { type: "move", id: "task_2", targetIndex: 0 },
    ],
  };
  assert.equal(store.applyRemoteUpdate(batchUpdate), true);
  assert.deepEqual(store.getOrder(), ["task_2", "task_1"]);

  // Payload embalado estilo Webxdc
  assert.equal(
    store.applyRemoteUpdate({
      payload: { type: "remove", id: "task_1", ts: 1020 },
    }),
    true
  );
  assert.equal(store.getItem("task_1"), null);
});

test("webxdc-crdt - createEpochCompactor previne concorrência e tempestade de rede", async () => {
  let postCount = 0;
  let postedPayload = null;

  const mockFetch = async (url, opts) => {
    if (opts?.method === "POST") {
      postCount += 1;
      postedPayload = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ status: "ok", id: "snap_1" }) };
    }
    return { ok: false, status: 404 };
  };

  const store = createIdLookupStore();
  const compactor = createEpochCompactor({
    channelId: "feira-livre-do-bairro",
    relayUrl: "http://127.0.0.1:3921",
    selfAddr: "vx_ed25519_alice",
    threshold: 50,
    store,
    fetchImpl: mockFetch,
  });

  // Update no milestone 50 enviado por OUTRO nó (bob) -> alice NÃO deve emitir
  const otherNodeMilestone = { serial: 50, sender: "vx_ed25519_bob" };
  assert.equal(compactor.shouldEmitSnapshot(otherNodeMilestone), false);
  const res1 = await compactor.handleIncomingUpdate(otherNodeMilestone);
  assert.equal(res1, null);
  assert.equal(postCount, 0);

  // Update no milestone 50 enviado pelo PRÓPRIO nó (alice) -> alice DEVE emitir
  const selfMilestone = { serial: 50, sender: "vx_ed25519_alice" };
  assert.equal(compactor.shouldEmitSnapshot(selfMilestone), true);
  const res2 = await compactor.handleIncomingUpdate(selfMilestone);
  assert.ok(res2);
  assert.equal(postCount, 1);
  assert.equal(postedPayload.channelId, "feira-livre-do-bairro");
  assert.equal(postedPayload.author, "vx_ed25519_alice");
  assert.equal(postedPayload.epoch, 1);
  assert.equal(compactor.getEpoch(), 2);
});

test("webxdc-crdt - coldBootFetch executa fluxo em 2 passos (snapshot base + deltas)", async () => {
  const mockRelayResponses = {
    "http://127.0.0.1:3921/relay/snapshot/sindicato_trabalho": {
      ok: true,
      data: {
        snapshot: { items: { ata_1: { data: { title: "Ata Preliminar" } } }, order: ["ata_1"], tombstones: {} },
        timestamp: 1730000000,
        epoch: 3,
      },
    },
    "http://127.0.0.1:3921/relay/envelope/sindicato_trabalho?since=1730000000": {
      ok: true,
      data: [
        { sender: "vx_worker_1", timestamp: 1730000050, sig: "sig_abc" },
        { sender: "vx_worker_2", timestamp: 1730000100, sig: "sig_def" },
      ],
    },
  };

  const mockFetch = async (url) => {
    const entry = mockRelayResponses[url];
    if (entry) {
      return { ok: entry.ok, json: async () => entry.data };
    }
    return { ok: false, status: 404 };
  };

  const result = await coldBootFetch({
    channelId: "sindicato_trabalho",
    relayUrl: "http://127.0.0.1:3921",
    fetchImpl: mockFetch,
  });

  assert.ok(result.baseSnapshot);
  assert.equal(result.snapshotTimestamp, 1730000000);
  assert.equal(result.epoch, 3);
  assert.equal(result.incrementalEnvelopes.length, 2);
  assert.equal(result.incrementalEnvelopes[0].sender, "vx_worker_1");
});
