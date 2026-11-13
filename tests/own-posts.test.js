/**
 * PM-72 — "Baixar meus posts": o arquivo leva a forma assinada e a mídia; voltar passa pelas conferências da malha.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as cacheNode from "../client/js/cache-node.js";
import * as localAccount from "../client/js/local-account.js";
import * as mediaBlob from "../client/js/media-blob.js";
import * as ownPosts from "../client/js/own-posts.js";
import { person } from "./signer.js";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const OTHER = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function clearDevicePosts() {
  await cacheNode.clearLocalPosts();
  mediaBlob.defaultBlobStorage.clear();
}

async function publish(fields) {
  const { detachedPost, mediaBlob: blob } = await mediaBlob.detachMedia({ type: "topic", communityId: "geral", ...fields });
  const signed = await localAccount.signPayload(detachedPost);
  await cacheNode.saveLocalPost(mediaBlob.withLocalMedia(signed, blob));
  return signed;
}

async function exportedFile() {
  return JSON.parse((await ownPosts.exportOwnPosts()).text);
}

test("PM-72: baixar e restaurar devolve o post assinado, com a foto", async () => {
  await clearDevicePosts();
  await publish({ id: "t_pm72_foto", title: "Mutirão", body: "Domingo", image: PNG });
  const file = await ownPosts.exportOwnPosts();
  assert.equal(file.count, 1);
  assert.match(file.name, /^vox-meus-posts-\d{4}-\d{2}-\d{2}\.json$/);
  const body = JSON.parse(file.text);
  assert.equal(body.type, ownPosts.OWN_POSTS_TYPE);
  assert.equal(await localAccount.verifyPayload(body.entries[0].post), true, "o arquivo leva a forma que confere");
  assert.equal(body.entries[0].blob.data, PNG);

  await clearDevicePosts();
  assert.deepEqual(await ownPosts.importOwnPosts(file.text), { restored: 1, skipped: 0 });
  const back = await cacheNode.getLocalPost("t_pm72_foto");
  assert.equal(back.title, "Mutirão");
  assert.equal(back.image, PNG);
  const [wire] = await cacheNode.getWirePosts();
  assert.equal(await localAccount.verifyPayload(wire), true, "o post volta podendo seguir pela malha");
});

test("PM-72: posts de outra pessoa não vão no arquivo e não entram na volta", async () => {
  await clearDevicePosts();
  const ana = await person();
  const alheio = await ana.sign({ id: "t_pm72_ana", type: "topic", title: "Da Ana", ts: Date.now() });
  await cacheNode.saveLocalPost(alheio);
  await publish({ id: "t_pm72_meu", title: "Meu" });
  const body = await exportedFile();
  assert.deepEqual(body.entries.map((e) => e.post.id), ["t_pm72_meu"]);

  await clearDevicePosts();
  body.entries.push({ post: alheio, blob: null });
  assert.deepEqual(await ownPosts.importOwnPosts(JSON.stringify(body)), { restored: 1, skipped: 1 });
  assert.equal(await cacheNode.getLocalPost("t_pm72_ana"), null);

  const daAna = { ...body, author: ana.routeId };
  await assert.rejects(ownPosts.importOwnPosts(JSON.stringify(daAna)), /outra conta/);
});

test("PM-72: post mexido no arquivo fica de fora", async () => {
  await clearDevicePosts();
  await publish({ id: "t_pm72_mexido", title: "Original" });
  const body = await exportedFile();
  body.entries[0].post.title = "Trocado no arquivo";
  await clearDevicePosts();
  assert.deepEqual(await ownPosts.importOwnPosts(JSON.stringify(body)), { restored: 0, skipped: 1 });
  assert.equal(await cacheNode.getLocalPost("t_pm72_mexido"), null);
});

test("PM-72: versão antiga não passa por cima da editada nem de um post apagado", async () => {
  await clearDevicePosts();
  const now = Date.now();
  await publish({ id: "t_pm72_edit", title: "Antes", ts: now - 5000 });
  await publish({ id: "t_pm72_lapide", title: "Vai sumir", ts: now - 5000 });
  const old = await exportedFile();
  await publish({ id: "t_pm72_edit", title: "Depois", ts: now - 5000, editedAt: now });
  await cacheNode.saveTombstone({ id: "t_pm72_lapide", author: await localAccount.getRouteId(), ts: now, editedAt: now, deleted: true });

  assert.deepEqual(await ownPosts.importOwnPosts(JSON.stringify(old)), { restored: 0, skipped: 2 });
  assert.equal((await cacheNode.getLocalPost("t_pm72_edit")).title, "Depois");
});

test("PM-72: mídia trocada no arquivo não entra; o post volta sem ela", async () => {
  await clearDevicePosts();
  await publish({ id: "t_pm72_midia", title: "Com foto", image: PNG });
  const body = await exportedFile();
  body.entries[0].blob.data = OTHER;
  await clearDevicePosts();
  assert.deepEqual(await ownPosts.importOwnPosts(JSON.stringify(body)), { restored: 1, skipped: 0 });
  assert.ok(!(await cacheNode.getLocalPost("t_pm72_midia")).image, "a foto trocada não bate com o hash assinado");
  assert.equal(mediaBlob.defaultBlobStorage.has(body.entries[0].post.mediaHash), false);
});

test("PM-72: arquivo que não é de posts do Vox é recusado com mensagem", () => {
  for (const text of ["", "não é json", "{}", JSON.stringify({ type: "vox-meus-posts", author: "vx_a" })]) {
    assert.throws(() => ownPosts.parseOwnPostsFile(text), /não é um arquivo de posts do Vox/);
  }
});
