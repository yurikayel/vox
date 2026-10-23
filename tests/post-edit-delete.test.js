import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { mockStores } from "../tests/setup.js";
import * as cacheNode from "../client/js/cache-node.js";
import * as postOwnership from "../client/js/post-ownership.js";
import * as localAccount from "../client/js/local-account.js";

test("post-ownership - só posts assinados pelo autor ativo são mutáveis", () => {
  const me = "vx_abc123";
  const signed = { id: "p1", author: me, sig: "sig1" };
  const tour = { id: "demo-post-helena", author: "vx_demo_helena", isLocalP2p: true };
  const foreign = { id: "p2", author: "vx_other", sig: "sig2" };

  assert.equal(postOwnership.canMutateLocalPost(signed, me), true);
  assert.equal(postOwnership.canMutateLocalPost(tour, me), false);
  assert.equal(postOwnership.canMutateLocalPost(foreign, me), false);
  assert.equal(postOwnership.canMutateLocalPost(signed, ""), false);

  const flagged = postOwnership.withOwnLocalFlag(signed, me);
  assert.equal(flagged.isOwnLocalPost, true);
});

test("cache-node - deleteLocalPost remove do IndexedDB e saveLocalPost sobrescreve por id", async () => {
  await cacheNode.clearLocalPosts();
  const store = mockStores.get("local-posts");

  await cacheNode.saveLocalPost({
    id: "top_edit_1",
    type: "topic",
    title: "Original",
    body: "Corpo",
    author: "vx_test",
    sig: "s1",
    ts: 1000,
  });
  assert.ok(store?.map.has("top_edit_1"));

  await cacheNode.saveLocalPost({
    id: "top_edit_1",
    type: "topic",
    title: "Editado",
    body: "Novo corpo",
    author: "vx_test",
    sig: "s2",
    ts: 1000,
    editedAt: 2000,
  });
  const updated = await cacheNode.getLocalPost("top_edit_1");
  assert.equal(updated.title, "Editado");
  assert.equal(updated.editedAt, 2000);

  await cacheNode.deleteLocalPost("top_edit_1");
  assert.equal(store?.map.has("top_edit_1"), false);
  assert.equal(await cacheNode.getLocalPost("top_edit_1"), null);
});

test("local-account - signPayload preserva id e ts na reedição", async () => {
  localStorage.clear();
  const signed = await localAccount.signPayload({
    id: "top_keep_id",
    type: "topic",
    title: "A",
    body: "B",
    ts: 4242,
  });
  assert.equal(signed.id, "top_keep_id");
  assert.equal(signed.ts, 4242);
  assert.ok(signed.sig);
  assert.ok(signed.author.startsWith("vx_"));

  const resigned = await localAccount.signPayload({
    ...signed,
    title: "A2",
    body: "B2",
    ts: signed.ts,
    editedAt: 9999,
  });
  assert.equal(resigned.id, "top_keep_id");
  assert.equal(resigned.ts, 4242);
  assert.equal(resigned.editedAt, 9999);
  assert.notEqual(resigned.sig, signed.sig);
});
