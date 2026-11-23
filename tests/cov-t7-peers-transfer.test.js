/**
 * @file Cobertura T7 de `peers-transfer.js`: escopo "só minhas comunidades", resposta WANT→BLOB,
 * recebimento de BLOB e a ordem de pedidos (afinidade, WebRTC, outras abas) com canais falsos.
 */
import "./setup.js";
import test, { beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import * as transfer from "../client/js/peers-transfer.js";
import * as cacheNode from "../client/js/cache-node.js";
import * as account from "../client/js/identity/index.js";
import * as settings from "../client/js/peers-settings.js";
import * as affinity from "../client/js/peers-blob-affinity.js";
import { setBroadcastChannel } from "../client/js/peers-transport.js";
import { peerConnections } from "../client/js/webrtc-peer-state.js";
import { myPeerId } from "../client/js/peers-base.js";
import { FakeChannel } from "./helpers/cov-t7-rtc-fakes.mjs";

const TX = "tx-abc-123";
let routeId;

beforeEach(async () => {
  localStorage.clear();
  await cacheNode.clearCache();
  await cacheNode.clearLocalPosts();
  affinity.clearAffinity();
  routeId = (await account.ensureLocalAccount()).routeId;
});
afterEach(() => {
  setBroadcastChannel(null);
  peerConnections.clear();
  affinity.setBlobPeerSoftPriorityEnabled(false);
  mock.timers.reset();
});

/** Deixa microtarefas pendentes terminarem. @returns {Promise<void>} */
const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
  await new Promise((r) => setImmediate(r));
};

/**
 * Registra um par WebRTC cujo canal responde a WANT com o BLOB dado.
 * @param {string} id Id do par.
 * @param {object|null} data Dado devolvido (`null` = o par não responde).
 * @returns {FakeChannel} Canal aberto do par.
 */
function addAnsweringPeer(id, data) {
  const dc = new FakeChannel("vox-peer-v0");
  dc.readyState = "open";
  dc.send = (payload) => {
    dc.sent.push(payload);
    const want = JSON.parse(payload);
    if (data && want.type === "WANT") queueMicrotask(() => transfer.handleBlobMessage({ type: "BLOB", txId: want.txId, data, fromPeer: id }));
  };
  peerConnections.set(id, { dc });
  return dc;
}

test("collectUserCommunityIds - junta comunidades que a pessoa é membro ou dona", async () => {
  await cacheNode.saveLocalPost({ id: "m1", type: "membership", author: routeId, communityId: "c-membro", ts: 1 });
  await cacheNode.saveLocalPost({ id: "m2", type: "membership", author: "outro", communityId: "c-alheia", ts: 1 });
  await cacheNode.saveLocalPost({ id: "c_c-dona", type: "community", author: routeId, communityId: "c-dona", title: "Minha", ts: 1 });
  await cacheNode.saveLocalPost({ id: "c_c-outro", type: "community", author: "outro", communityId: "c-outro", title: "Deles", ts: 1 });
  assert.deepEqual([...(await transfer.collectUserCommunityIds())].sort(), ["c-dona", "c-membro"]);
});

test("isTxInUserCommunityScope - usa o dado em cache, o post local ou o post respondido", async () => {
  assert.equal(await transfer.isTxInUserCommunityScope(TX, { communityId: "c1" }), false);
  await cacheNode.saveLocalPost({ id: "m1", type: "membership", author: routeId, communityId: "c1", ts: 1 });
  assert.equal(await transfer.isTxInUserCommunityScope(TX, { communityId: "c1" }), true);
  assert.equal(await transfer.isTxInUserCommunityScope(TX, { communityId: "c2" }), false);
  await cacheNode.saveLocalPost({ id: "p1", type: "topic", communityId: "c1", ts: 1 });
  assert.equal(await transfer.isTxInUserCommunityScope("p1", "texto"), true);
  await cacheNode.saveLocalPost({ id: "r1", type: "reply", replyTo: "p1", ts: 2 });
  assert.equal(await transfer.isTxInUserCommunityScope("r1"), true);
  assert.equal(await transfer.isTxInUserCommunityScope("sem-comunidade"), false);
});

test("handleWantMessage - responde com BLOB, conta métricas e usa o canal de origem", async () => {
  await cacheNode.setCachedTx(TX, { body: "oi" });
  const replies = [];
  await transfer.handleWantMessage({ txId: TX }, (r) => replies.push(r), settings.getPeerSettings(), "rtc");
  assert.deepEqual(replies, [{ type: "BLOB", txId: TX, data: { body: "oi" }, fromPeer: myPeerId }]);
  await transfer.handleWantMessage({ txId: TX }, (r) => replies.push(r), settings.getPeerSettings(), "broadcast");
  const m = settings.getPeerMetrics();
  assert.deepEqual([m.blobsServed, m.blobsServedRtc], [2, 1]);
  assert.equal(m.bytesServed, 2 * JSON.stringify({ body: "oi" }).length);
});

test("handleWantMessage - ignora pedido inválido, próprio, sem cache, sem função de resposta ou fora do teto", async () => {
  await cacheNode.setCachedTx(TX, { body: "oi" });
  const replies = [];
  const reply = (r) => replies.push(r);
  const cfg = settings.getPeerSettings();
  await transfer.handleWantMessage({ txId: "!!" }, reply, cfg, "rtc");
  await transfer.handleWantMessage({ txId: TX, fromPeer: myPeerId }, reply, cfg, "rtc");
  await transfer.handleWantMessage({ txId: "sem-cache-1" }, reply, cfg, "rtc");
  await transfer.handleWantMessage({ txId: TX }, null, cfg, "rtc");
  await transfer.handleWantMessage({ txId: TX }, reply, { ...cfg, dailyCapMb: -1 }, "rtc");
  assert.deepEqual(replies, []);
  assert.equal(settings.getPeerMetrics().blobsServed, 0);
});

test("handleWantMessage - com commOnly só serve transação de comunidade da pessoa", async () => {
  await cacheNode.setCachedTx("tx-dentro", { communityId: "c1" });
  await cacheNode.setCachedTx("tx-fora", { communityId: "c9" });
  await cacheNode.saveLocalPost({ id: "m1", type: "membership", author: routeId, communityId: "c1", ts: 1 });
  const replies = [];
  const cfg = { ...settings.getPeerSettings(), commOnly: true };
  await transfer.handleWantMessage({ txId: "tx-dentro" }, (r) => replies.push(r.txId), cfg, "rtc");
  await transfer.handleWantMessage({ txId: "tx-fora" }, (r) => replies.push(r.txId), cfg, "rtc");
  assert.deepEqual(replies, ["tx-dentro"]);
});

test("handleBlobMessage - sem pedido pendente ou com dado inválido é ignorado", () => {
  transfer.handleBlobMessage({ txId: "!!", data: {} });
  transfer.handleBlobMessage({ txId: TX });
  transfer.handleBlobMessage({ txId: TX, data: { a: 1 } });
  assert.equal(settings.getPeerMetrics().blobsReceived, 0);
});

test("requestTxFromPeers - malha desligada devolve null sem pedir nada", async () => {
  const posted = [];
  setBroadcastChannel({ postMessage: (p) => posted.push(p) });
  settings.savePeerSettings({ ...settings.getPeerSettings(), enabled: false });
  assert.equal(await transfer.requestTxFromPeers(TX), null);
  assert.deepEqual(posted, []);
});

test("requestTxFromPeers - outra aba responde ao WANT pelo BroadcastChannel", async () => {
  const posted = [];
  setBroadcastChannel({ postMessage: (p) => posted.push(p) });
  const pending = transfer.requestTxFromPeers(TX);
  await flush();
  assert.deepEqual(posted, [{ type: "WANT", txId: TX, fromPeer: myPeerId }]);
  transfer.handleBlobMessage({ type: "BLOB", txId: TX, data: { body: "da aba" }, fromPeer: "outra" });
  assert.deepEqual(await pending, { body: "da aba" });
  assert.equal(settings.getPeerMetrics().blobsReceived, 1);
});

test("requestTxFromPeers - ninguém responde: expira em null e remove o pedido pendente", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  setBroadcastChannel({ postMessage() { throw new Error("canal quebrado"); } });
  const pending = transfer.requestTxFromPeers(TX);
  await flush();
  mock.timers.tick(600);
  assert.equal(await pending, null);
  transfer.handleBlobMessage({ type: "BLOB", txId: TX, data: { tarde: true } });
  assert.equal(settings.getPeerMetrics().blobsReceived, 0);
});

test("requestTxFromPeers - item prioritário vai primeiro por WebRTC", async () => {
  const dc = addAnsweringPeer("peer-r", { body: "via rtc" });
  const posted = [];
  setBroadcastChannel({ postMessage: (p) => posted.push(p) });
  const got = await transfer.requestTxFromPeers(TX, { priority: true });
  assert.deepEqual(got, { body: "via rtc" });
  assert.equal(JSON.parse(dc.sent[0]).type, "WANT");
  assert.deepEqual(posted, []);
});

test("requestTxFromPeers - sem prioridade tenta as abas e, se falham, cai no WebRTC", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  addAnsweringPeer("peer-r", { body: "fallback rtc" });
  const posted = [];
  setBroadcastChannel({ postMessage: (p) => posted.push(p) });
  const pending = transfer.requestTxFromPeers(TX);
  await flush();
  mock.timers.tick(600);
  assert.deepEqual(await pending, { body: "fallback rtc" });
  assert.equal(posted.length, 1);
});

test("requestTxFromPeers - afinidade consulta o par mais bem ranqueado primeiro e reforça a afinidade", async () => {
  affinity.setBlobPeerSoftPriorityEnabled(true);
  const silent = addAnsweringPeer("peer-mudo", null);
  addAnsweringPeer("peer-bom", { body: "do bom" });
  affinity.bumpAffinity("peer-bom");
  affinity.bumpAffinity("peer-bom");
  const got = await transfer.requestTxFromPeers(TX);
  assert.deepEqual(got, { body: "do bom" });
  assert.deepEqual(silent.sent, []);
  assert.ok(affinity.getPeerAffinity("peer-bom") > 0);
});

test("requestTxFromPeers - afinidade sem resposta segue para o próximo par e depois para as abas", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  affinity.setBlobPeerSoftPriorityEnabled(true);
  addAnsweringPeer("peer-a", null);
  const posted = [];
  setBroadcastChannel({ postMessage: (p) => posted.push(p) });
  const pending = transfer.requestTxFromPeers(TX);
  await flush();
  mock.timers.tick(450);
  await flush();
  mock.timers.tick(600);
  await flush();
  mock.timers.tick(2000);
  assert.equal(await pending, null);
  assert.equal(posted.length, 1);
});
