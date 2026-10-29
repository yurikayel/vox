import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as idbStore from "../client/js/idb-store.js";

test("idb-store - enfileira e lista itens no outbox com status pending", async () => {
  await idbStore.clearStore(idbStore.STORES.OUTBOX);

  const payload = { title: "Meu post offline", body: "Texto gravado no bolso" };
  const item = await idbStore.enqueueOutboxItem({
    action: "create-topic",
    payload,
    target: "arweave",
    meta: { tags: [{ name: "Type", value: "topic" }] },
  });

  assert.ok(item.id.startsWith("out_"));
  assert.equal(item.action, "create-topic");
  assert.equal(item.status, idbStore.OUTBOX_STATUS.PENDING);
  assert.deepEqual(item.payload, payload);

  const allItems = await idbStore.listOutboxItems();
  assert.equal(allItems.length, 1);
  assert.equal(allItems[0].id, item.id);

  const pendingItems = await idbStore.listOutboxItems(idbStore.OUTBOX_STATUS.PENDING);
  assert.equal(pendingItems.length, 1);

  const deliveredItems = await idbStore.listOutboxItems(idbStore.OUTBOX_STATUS.DELIVERED);
  assert.equal(deliveredItems.length, 0);
});

test("idb-store - atualiza status do item no outbox e remove após entrega", async () => {
  const item = await idbStore.enqueueOutboxItem({
    action: "create-reply",
    payload: { replyTo: "tx_123", body: "Comentário" },
  });

  const updated = await idbStore.updateOutboxItem(item.id, {
    status: idbStore.OUTBOX_STATUS.SYNCING,
    attempts: 1,
  });
  assert.equal(updated.status, idbStore.OUTBOX_STATUS.SYNCING);
  assert.equal(updated.attempts, 1);

  const retrieved = await idbStore.getOutboxItem(item.id);
  assert.equal(retrieved.status, idbStore.OUTBOX_STATUS.SYNCING);

  const removed = await idbStore.removeOutboxItem(item.id);
  assert.equal(removed, true);

  const afterDelete = await idbStore.getOutboxItem(item.id);
  assert.equal(afterDelete, null);
});

test("idb-store - armazena e recupera blobs binários", async () => {
  await idbStore.clearStore(idbStore.STORES.BLOBS);

  const blobId = "blob_photo_456";
  const content = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
  const entry = await idbStore.putBlob(blobId, content, "image/jpeg");

  assert.equal(entry.id, blobId);
  assert.equal(entry.mimeType, "image/jpeg");
  assert.equal(entry.size, content.length);

  const fetched = await idbStore.getBlob(blobId);
  assert.ok(fetched);
  assert.equal(fetched.data, content);
  assert.equal(fetched.mimeType, "image/jpeg");

  assert.equal(await idbStore.getBlob("inexistente"), null);
});

test("idb-store - armazena e recupera pares chave-valor assíncronos", async () => {
  await idbStore.clearStore(idbStore.STORES.KV);

  await idbStore.setKeyValue("last_sync_timestamp", 1729000000000);
  const val = await idbStore.getKeyValue("last_sync_timestamp");
  assert.equal(val, 1729000000000);

  await idbStore.setKeyValue("user_prefs", { theme: "carbon", sound: false });
  const prefs = await idbStore.getKeyValue("user_prefs");
  assert.deepEqual(prefs, { theme: "carbon", sound: false });

  assert.equal(await idbStore.getKeyValue("chave_inexistente"), null);
});

test("idb-store - validações de parâmetros obrigatórios", async () => {
  await assert.rejects(async () => {
    await idbStore.enqueueOutboxItem({});
  }, /payload/);

  await assert.rejects(async () => {
    await idbStore.putBlob(null, "dados");
  }, /putBlob/);

  await assert.rejects(async () => {
    await idbStore.setKeyValue(null, "val");
  }, /key/);
});
