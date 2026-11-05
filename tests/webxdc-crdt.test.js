import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  createIdLookupStore,
  createEpochCompactor,
  coldBootFetch,
  isNewer,
  validateStoreId,
  validateTimestamp,
  MAX_CLOCK_DRIFT_MS,
  MAX_SNAPSHOT_BYTES,
} from "../client/js/webxdc-crdt.js";

test("webxdc-crdt - isNewer implementa desempate determinístico (tie-breaking)", () => {
  // Maior timestamp sempre ganha
  assert.equal(isNewer(2000, "alice", 1000, "bob"), true);
  assert.equal(isNewer(1000, "alice", 2000, "bob"), false);

  // Timestamps idênticos desempatam lexicograficamente por sender
  assert.equal(isNewer(1000, "carol", 1000, "bob"), true);
  assert.equal(isNewer(1000, "alice", 1000, "bob"), false);

  // Mesmo timestamp e mesmo sender: operação idêntica
  assert.equal(isNewer(1000, "alice", 1000, "alice"), false);
});

test("webxdc-crdt - validação rejeita poluição de protótipo e deriva de relógio", () => {
  // Rejeita IDs reservados de protótipo
  assert.throws(() => validateStoreId("__proto__"), /reservado/);
  assert.throws(() => validateStoreId("constructor"), /reservado/);
  assert.throws(() => validateStoreId("prototype"), /reservado/);
  assert.throws(() => validateStoreId("   "), /string não vazia/);
  assert.equal(validateStoreId("item_123"), "item_123");

  // Rejeita timestamps no futuro além da tolerância de 10 min
  const now = Date.now();
  assert.throws(() => validateTimestamp(now + MAX_CLOCK_DRIFT_MS + 5000), /tolerância de deriva/);
  assert.throws(() => validateTimestamp(-10), /número finito positivo/);
  assert.equal(validateTimestamp(now), now);
});

test("webxdc-crdt - getItems preserva chave canônica id contra sobrescrita maliciosa", () => {
  const store = createIdLookupStore();
  // Payload com campo 'id' malicioso tentando sequestrar a chave
  store.setItem("chave_real", { id: "chave_falsa", nome: "Produto" }, 1000, "alice");

  const item = store.getItem("chave_real");
  assert.equal(item.id, "chave_real");
  assert.equal(item.nome, "Produto");

  const items = store.getItems();
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "chave_real");
});

test("webxdc-crdt - reconciliação de order no mergeSnapshot", () => {
  const store = createIdLookupStore();
  store.setItem("local_a", { v: 1 }, 1000, "peer1");
  store.setItem("local_b", { v: 2 }, 1010, "peer1");

  const remoteSnapshot = {
    items: {
      rem_x: { data: { v: 10 }, updatedAt: 1050, sender: "peer2" },
      local_a: { data: { v: 1.5 }, updatedAt: 1060, sender: "peer2" },
    },
    order: ["rem_x", "local_a"],
    tombstones: {},
    coveredSerial: 42,
  };

  store.mergeSnapshot(remoteSnapshot);

  // Ordem determinística reconciliada respeitando os ranks determinísticos
  assert.deepEqual(store.getOrder(), ["local_b", "rem_x", "local_a"]);
  assert.equal(store.getCoveredSerial(), 42);
});

test("webxdc-crdt - lote (batch) notifica apenas uma vez e previne estouro de pilha", () => {
  const store = createIdLookupStore();
  let notifyCount = 0;
  store.subscribe(() => {
    notifyCount += 1;
  });

  const batch = {
    type: "batch",
    serial: 10,
    operations: [
      { type: "set", id: "t1", data: { v: 1 }, ts: 1000, sender: "a" },
      { type: "set", id: "t2", data: { v: 2 }, ts: 1005, sender: "a" },
      { type: "move", id: "t2", targetIndex: 0 },
    ],
  };

  store.applyRemoteUpdate(batch);
  assert.equal(notifyCount, 1);
  assert.deepEqual(store.getOrder(), ["t2", "t1"]);
  assert.equal(store.getCoveredSerial(), 10);

  // Recursão ultra-aninhada é limitada e não estoura a pilha
  const deeplyNested = {
    payload: {
      payload: {
        payload: {
          payload: { type: "set", id: "deep", data: {}, ts: 1000 },
        },
      },
    },
  };
  assert.equal(store.applyRemoteUpdate(deeplyNested), false);
});

test("webxdc-crdt - coldBootFetch propaga erros de rede e distingue 404 legítimo", async () => {
  // 1. Caso 404: canal novo, retorna vazio legítimo sem estourar erro
  const mock404Fetch = async () => ({ status: 404, ok: false });
  const mockEnvFetch = async () => ({ ok: true, json: async () => [] });

  const fetchRouter1 = async (url) => {
    if (url.includes("/snapshot/")) return mock404Fetch();
    return mockEnvFetch();
  };

  const res1 = await coldBootFetch({
    channelId: "canal_novo",
    relayUrl: "http://127.0.0.1:3920",
    fetchImpl: fetchRouter1,
  });
  assert.equal(res1.baseSnapshot, null);
  assert.equal(res1.coveredSerial, 0);

  // 2. Caso 500 / Erro de Rede: DEVE lançar erro para não sobrescrever estado existente!
  const mock500Fetch = async () => ({ status: 500, ok: false });
  await assert.rejects(
    () =>
      coldBootFetch({
        channelId: "canal_existente",
        relayUrl: "http://127.0.0.1:3920",
        fetchImpl: mock500Fetch,
      }),
    /Relay retornou HTTP 500/
  );

  // 3. Caso Falha de Conexão: DEVE lançar erro
  const networkErrorFetch = async () => {
    throw new Error("ECONNREFUSED");
  };
  await assert.rejects(
    () =>
      coldBootFetch({
        channelId: "canal_existente",
        relayUrl: "http://127.0.0.1:3920",
        fetchImpl: networkErrorFetch,
      }),
    /Falha de conexão/
  );
});

test("webxdc-crdt - createEpochCompactor usa coveredSerial e assinatura", async () => {
  let posted = null;
  const mockFetch = async (_url, opts) => {
    posted = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ status: "ok" }) };
  };

  const store = createIdLookupStore();
  const mockSigner = {
    sign: async (payload) => `ed25519_sig_for_${payload.channelId}`,
  };

  const compactor = createEpochCompactor({
    channelId: "bairro_centro",
    relayUrl: "http://127.0.0.1:3920",
    selfAddr: "vx_ed25519_alice",
    threshold: 50,
    store,
    signer: mockSigner,
    fetchImpl: mockFetch,
  });

  // Update no marco 50
  const update50 = {
    serial: 50,
    sender: "vx_ed25519_alice",
    type: "set",
    id: "item_50",
    data: { ok: true },
    ts: 1000,
  };

  await compactor.handleIncomingUpdate(update50);
  assert.ok(posted);
  assert.equal(posted.channelId, "bairro_centro");
  assert.equal(posted.author, "vx_ed25519_alice");
  assert.equal(posted.coveredSerial, 50);
  assert.equal(posted.sig, "ed25519_sig_for_bairro_centro");
});
