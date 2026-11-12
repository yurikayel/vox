/**
 * Gênese na malha P2P: aparelho em versão antiga ainda manda posts de conta de teste e posts anteriores à
 * gênese; quem recebe não guarda nem repassa. Um post assinado e recente continua entrando.
 */
import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as cacheNode from "../client/js/cache-node.js";
import * as localAccount from "../client/js/local-account.js";
import * as peers from "../client/js/peers.js";
import { GENESIS_MS } from "../client/js/genesis.js";
import { TEST_ROUTE_IDS } from "../client/js/data/test-route-ids.js";

async function signedTopic(id, ts) {
  const author = await localAccount.getRouteId();
  return localAccount.signPayload({ id, type: "topic", communityId: "geral", title: "t", author, ts });
}

test("gênese na malha: post de conta de teste não é guardado", async () => {
  await cacheNode.clearLocalPosts();
  const item = { id: "top_conta_teste", type: "topic", title: "t", author: TEST_ROUTE_IDS[0], ts: Date.now(), sig: "x" };
  await peers.handleVoxMessage({ type: "GOSSIP", item }, () => {}, "rtc");
  assert.equal(await cacheNode.getLocalPost("top_conta_teste"), null);
});

test("gênese na malha: post assinado de antes da gênese não entra; o recente entra", async () => {
  localStorage.clear();
  await cacheNode.clearLocalPosts();
  const old = await signedTopic("top_pre_genese", GENESIS_MS - 60_000);
  const fresh = await signedTopic("top_rede_viva", Date.now());
  await peers.handleVoxMessage({ type: "GOSSIP", item: old }, () => {}, "rtc");
  await peers.handleVoxMessage({ type: "GOSSIP", item: fresh }, () => {}, "rtc");
  assert.equal(await cacheNode.getLocalPost("top_pre_genese"), null);
  assert.ok(await cacheNode.getLocalPost("top_rede_viva"), "o post da rede viva continua entrando");
});
