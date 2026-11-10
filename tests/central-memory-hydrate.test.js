import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { person } from "./signer.js";

const cacheNode = await import("../client/js/cache-node.js");
const hydrate = await import("../client/js/central-memory-hydrate.js");
const mediaBlob = await import("../client/js/media-blob.js");
const { verifyPayload } = await import("../client/js/local-account.js");

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const wireOf = async (id) => (await cacheNode.getWirePosts()).find((p) => p.id === id);
const topic = (id, extra = {}) => ({ id, type: "topic", communityId: "bairro", title: "Feira", body: "Sábado", ts: 1000, ...extra });

test("memória central - post sem assinatura, adulterado ou com campo local não entra", async () => {
  const ana = await person();
  const good = await ana.sign(topic("mc_ok"));
  const posts = [
    topic("mc_unsigned", { author: ana.routeId }),
    { ...(await ana.sign(topic("mc_tampered"))), body: "Mudou no nó" },
    await ana.sign(topic("mc_local_key", { _media: { image: PNG } })),
    good,
  ];
  assert.equal(await hydrate.hydratePosts(posts), 1);
  for (const id of ["mc_unsigned", "mc_tampered", "mc_local_key"]) assert.equal(await cacheNode.getLocalPost(id), null, id);
  assert.deepEqual(await wireOf("mc_ok"), good, "o aparelho repassa exatamente o que foi assinado");
});

test("memória central - outra pessoa não sobrescreve post nem remove post alheio", async () => {
  const [ana, bia] = [await person(), await person()];
  await hydrate.hydratePosts([await ana.sign(topic("mc_owned"))]);
  assert.equal(await hydrate.hydratePosts([await bia.sign(topic("mc_owned", { body: "Sequestro", ts: 2000 }))]), 0);
  assert.equal((await cacheNode.getLocalPost("mc_owned")).author, ana.routeId);
  const tomb = (who) => who.sign({ id: "mc_owned", type: "tombstone", kind: "post-tombstone", editedAt: 3000 });
  assert.equal(await hydrate.hydrateTombstones([await tomb(bia), { id: "mc_owned", editedAt: 3000 }]), 0);
  assert.equal(await hydrate.hydrateTombstones([await tomb(ana)]), 1);
  assert.equal(await verifyPayload((await cacheNode.getAllTombstones()).find((t) => t.id === "mc_owned")), true);
});

test("memória central - edição da comunidade só de quem a criou ou modera (PM-09)", async () => {
  const [dona, intruso] = [await person(), await person()];
  await hydrate.hydratePosts([await dona.sign({ id: "c_horta", type: "community", communityId: "horta", title: "Horta", ts: 1000 })]);
  const update = (who, id) => who.sign({ id, type: "community_update", communityId: "horta", description: "Nova", ts: 2000 });
  assert.equal(await hydrate.hydratePosts([await update(intruso, "cu_intruso")]), 0);
  assert.equal(await hydrate.hydratePosts([await update(dona, "cu_dona")]), 1);
});

test("memória central - mídia do mediaRef aparece na tela e fica fora da assinatura", async () => {
  const ana = await person();
  const { detachedPost, mediaBlob: blob } = await mediaBlob.detachMedia(topic("mc_media", { image: PNG }));
  const { author: _a, ...unsigned } = detachedPost;
  const signed = await ana.sign(unsigned);
  const blobs = await hydrate.hydrateBlobs([blob, { ...blob, hash: "f".repeat(64) }]);
  assert.deepEqual([...blobs.keys()], [blob.hash], "blob com hash que não bate fica de fora");
  assert.equal(await hydrate.hydratePosts([signed], blobs), 1);
  assert.equal((await cacheNode.getLocalPost("mc_media")).image, PNG);
  const wire = await wireOf("mc_media");
  assert.equal(wire.image, null);
  assert.equal(await verifyPayload(wire), true);
});
