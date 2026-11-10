import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const localAccount = await import("../client/js/local-account.js");
const cacheNode = await import("../client/js/cache-node.js");
const postWire = await import("../client/js/post-wire.js");
const peerSync = await import("../client/js/peer-sync.js");

await localAccount.ensureLocalAccount();
const topic = (id) => localAccount.signPayload({ id, type: "topic", communityId: "bairro", title: "Feira #sabado", body: "Na praça" });

test("post guardado - o que a rede recebe de volta ainda bate com a assinatura", async () => {
  const signed = await topic("wire_t1");
  await cacheNode.saveLocalPost(signed);
  const [wire] = (await cacheNode.getWirePosts()).filter((p) => p.id === "wire_t1");
  assert.deepEqual(wire, signed, "exatamente o que foi assinado");
  assert.equal(await localAccount.verifyPayload(wire), true);
  const shared = await peerSync.defaultPeerSyncDeps("p1").loadShared();
  const synced = shared.posts.find((p) => p.id === "wire_t1");
  assert.equal(await localAccount.verifyPayload(synced), true, "a sincronização ao conectar manda a forma assinada");
});

test("post guardado - a tela continua lendo com padrões, hashtags e isLocalP2p", async () => {
  await cacheNode.saveLocalPost(await topic("wire_t2"));
  const read = await cacheNode.getLocalPost("wire_t2");
  assert.equal(read.replyTo, "");
  assert.deepEqual(read.tags, ["sabado"]);
  assert.equal(read.isLocalP2p, true);
  assert.equal(read[postWire.WIRE_MARK], undefined, "a marca não vaza para a tela");
  assert.ok((await cacheNode.getLocalPosts({ type: "topic", replyTo: "" })).some((p) => p.id === "wire_t2"));
});

test("post guardado - editar a partir da leitura e remover continuam verificáveis", async () => {
  await cacheNode.saveLocalPost(await topic("wire_t3"));
  const { sig: _s, pubKey: _p, ...rest } = await cacheNode.getLocalPost("wire_t3");
  const edited = await localAccount.signPayload({ ...rest, body: "Mudou", editedAt: Date.now() });
  await cacheNode.saveLocalPost(edited);
  assert.equal(await localAccount.verifyPayload(await cacheNode.getPostRecord("wire_t3")), true);
  const tomb = await localAccount.signPayload({ kind: "post-tombstone", type: "tombstone", id: "wire_t3", authorDisplay: "Ana", editedAt: Date.now() + 1 });
  await cacheNode.saveTombstone(tomb);
  const [stored] = (await cacheNode.getAllTombstones()).filter((t) => t.id === "wire_t3");
  assert.equal(await localAccount.verifyPayload(stored), true, "remoção guarda os campos assinados (inclusive authorDisplay)");
});

test("post guardado - registro antigo, com padrões misturados, recupera a forma assinada", async () => {
  const signed = await topic("wire_t4");
  const legacy = { ...postWire.LOCAL_POST_DEFAULTS, ...signed, tags: ["sabado"], isLocalP2p: true };
  assert.equal(await localAccount.verifyPayload(legacy), false, "o bug: o registro antigo não verificava");
  assert.equal(await localAccount.verifyPayload(postWire.toWireForm(legacy)), true);
});
